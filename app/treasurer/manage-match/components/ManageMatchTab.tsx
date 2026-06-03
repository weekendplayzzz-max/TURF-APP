'use client';

import { useState, useCallback, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { updatePlayerStats } from '@/lib/updatePlayerStats';
import {
  collection, getDocs, updateDoc, doc,
  query, where, orderBy, Timestamp,
} from 'firebase/firestore';
import AssignPlayersSheet, {
  TEAM_COLORS, TEAM_LIGHT_BG, TEAM_TEXT_COLORS,
} from './AssignPlayersSheet';
import type { Participant, Team } from './AssignPlayersSheet';
import GoalScorerSection from './GoalScorerSection';
import type { GoalScorer } from './GoalScorerSection';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchEntry {
  id: string;
  eventId: string;
  eventTitle: string;
  matchNumber: number;
  teams: Team[];
  isLocked: boolean;
  createdAt: Timestamp;
  result: null | {
    scores: Record<string, number>;
    goalScorers: GoalScorer[];
    winner: string | null;
    savedAt: Timestamp | null;
  };
}

type EditMode = 'none' | 'score' | 'teams';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ManageMatchTabProps {
  shouldRefresh: boolean;
  onRefreshDone: () => void;
  showToast: (msg: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
        <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ManageMatchTab({
  shouldRefresh,
  onRefreshDone,
  showToast,
}: ManageMatchTabProps) {

  // ── Match list + dropdown
  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchesFetched, setMatchesFetched] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchEntry | null>(null);

  // ── Local editable state (populated from selectedMatch)
  const [teams, setTeams] = useState<Team[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [goalScorers, setGoalScorers] = useState<GoalScorer[]>([]);

  // ── Edit modes
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [assignTarget, setAssignTarget] = useState<Team | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  // ── Saving
  const [saving, setSaving] = useState(false);

  // ─── Fetch all matches ────────────────────────────────────────────────────
  const fetchMatches = useCallback(async () => {
    try {
      setLoadingMatches(true);
      const snap = await getDocs(
        query(collection(db, 'matches'), orderBy('createdAt', 'desc'))
      );
      const list: MatchEntry[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({
          id: d.id,
          eventId: data.eventId,
          eventTitle: data.eventTitle,
          matchNumber: data.matchNumber ?? 1,
          teams: data.teams ?? [],
          isLocked: data.isLocked ?? false,
          createdAt: data.createdAt,
          result: data.result ?? null,
        });
      });
      setMatches(list);
      setMatchesFetched(true);
    } catch (e) {
      console.error(e);
      showToast('Failed to load matches');
    } finally {
      setLoadingMatches(false);
    }
  }, [showToast]);

  // Open dropdown
  const handleOpenDropdown = () => {
    if (!matchesFetched) fetchMatches();
    setDropdownOpen(p => !p);
  };

  // ── Refresh trigger from NewMatchTab (via page.tsx)
  useEffect(() => {
    if (shouldRefresh) {
      setMatchesFetched(false);
      setMatches([]);
      fetchMatches();
      onRefreshDone();
    }
  }, [shouldRefresh, fetchMatches, onRefreshDone]);

  // ─── Select a match → populate local state ─────────────────────────────────
  const selectMatch = (match: MatchEntry) => {
    setSelectedMatch(match);
    setTeams(match.teams.map(t => ({ ...t, players: [...t.players] })));
    setScores(
      match.result
        ? Object.fromEntries(Object.entries(match.result.scores).map(([k, v]) => [k, String(v)]))
        : Object.fromEntries(match.teams.map(t => [t.teamId, '']))
    );
    setGoalScorers(match.result?.goalScorers ?? []);
    setEditMode('none');
    setDropdownOpen(false);
  };

  // ─── Fetch participants for team editing ───────────────────────────────────
  const fetchParticipants = useCallback(async (eventId: string) => {
    try {
      setLoadingParticipants(true);
      const snap = await getDocs(query(
        collection(db, 'eventParticipants'),
        where('eventId', '==', eventId),
        where('currentStatus', '==', 'joined'),
      ));
      const list: Participant[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({
          playerId: data.playerId,
          playerName: data.playerName,
          playerType: data.playerType || 'regular',
          ...(data.parentId ? { parentId: data.parentId } : {}),
        });
      });
      setParticipants(list);
    } catch (e) {
      console.error(e);
      showToast('Failed to load participants');
    } finally {
      setLoadingParticipants(false);
    }
  }, [showToast]);

  // ─── Save all changes ──────────────────────────────────────────────────────
  const handleSave = async () => {
  if (!selectedMatch) return;
  try {
    setSaving(true);

    const numericScores: Record<string, number> = {};
    teams.forEach(t => { numericScores[t.teamId] = parseInt(scores[t.teamId] || '0', 10); });

    const max = Math.max(...Object.values(numericScores));
    const winners = Object.entries(numericScores)
      .filter(([, v]) => v === max).map(([k]) => k);
    const winner = winners.length > 1 ? 'draw' : winners[0];

    const cleanTeams = teams.map(t => ({
      teamId: t.teamId,
      teamName: t.teamName,
      players: t.players.map(p => ({
        playerId: p.playerId,
        playerName: p.playerName,
        playerType: p.playerType,
        ...(p.parentId ? { parentId: p.parentId } : {}),
      })),
    }));

    const newResult = {
      scores: numericScores,
      goalScorers,
      winner,
      savedAt: Timestamp.now(),
    };

    // ── 1. Save match to Firestore
    await updateDoc(doc(db, 'matches', selectedMatch.id), {
      teams: cleanTeams,
      result: newResult,
    });

    // ── 2. Update player stats
    //    Pass old state to reverse previous contribution,
    //    and new state to apply updated contribution
    await updatePlayerStats({
      oldTeams:  selectedMatch.result ? selectedMatch.teams : null,
      oldResult: selectedMatch.result ?? null,
      newTeams:  cleanTeams,
      newResult,
      isNewResult: !selectedMatch.result,
    });

    // ── 3. Refresh local state
    const updated: MatchEntry = {
      ...selectedMatch,
      teams,
      result: newResult,
    };
    setSelectedMatch(updated);
    setMatches(prev => prev.map(m => m.id === updated.id ? updated : m));
    setEditMode('none');
    showToast('Match updated successfully ✓');
  } catch (e) {
    console.error(e);
    showToast('Failed to save changes');
  } finally {
    setSaving(false);
  }
};

  // ─── Derived: top scorers ──────────────────────────────────────────────────
const topScorers = [...goalScorers]
  .filter(g => g.goals > 0)
  .sort((a, b) => b.goals - a.goals);

const topGoalCount = topScorers.length > 0 ? topScorers[0].goals : 0;

  // ─── Derived: winner info ──────────────────────────────────────────────────
  const getWinnerInfo = () => {
    if (!selectedMatch?.result) return null;
    const { scores: sc, winner } = selectedMatch.result;
    if (!winner) return null;
    if (winner === 'draw') return { isDraw: true, teamName: null, teamIndex: -1 };
    const idx = teams.findIndex(t => t.teamId === winner);
    return { isDraw: false, teamName: teams[idx]?.teamName ?? winner, teamIndex: idx };
  };

  const winnerInfo = getWinnerInfo();
  const hasResult = !!selectedMatch?.result;
  const hasAnyScore = teams.some(t => scores[t.teamId] !== '' && scores[t.teamId] !== undefined);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ══════════════ ASSIGN PLAYERS SHEET ══════════════ */}
      {assignTarget && (
        <AssignPlayersSheet
          isOpen={!!assignTarget}
          onClose={() => setAssignTarget(null)}
          onConfirm={setTeams}
          targetTeam={assignTarget}
          allTeams={teams}
          participants={participants}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          DROPDOWN — SELECT MATCH
      ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
          Select Match
        </p>

        <div className="relative">
          {/* Trigger */}
          <button
            onClick={handleOpenDropdown}
            className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 transition-colors cursor-pointer text-left ${
              dropdownOpen ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50 active:bg-gray-100'
            }`}
          >
            <span className={`text-sm font-semibold truncate pr-2 ${selectedMatch ? 'text-gray-900' : 'text-gray-400'}`}>
              {selectedMatch
                ? `${selectedMatch.eventTitle}${selectedMatch.matchNumber > 1 ? ` – Match ${selectedMatch.matchNumber}` : ''}`
                : '-- Choose a match --'}
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${dropdownOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown list */}
          {dropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-200 shadow-lg z-20 overflow-hidden animate-slideDown">
              {loadingMatches ? (
                <div className="py-6 flex justify-center">
                  <div className="relative w-6 h-6">
                    <div className="absolute inset-0 border-2 border-red-600/20 rounded-full" />
                    <div className="absolute inset-0 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                </div>
              ) : matches.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <p className="text-sm font-bold text-gray-400">No matches yet</p>
                  <p className="text-xs text-gray-300 mt-0.5">Create a match in the New Match tab</p>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  {matches.map(match => {
                    const d = match.createdAt?.toDate();
                    const label = match.matchNumber > 1
                      ? `${match.eventTitle} – Match ${match.matchNumber}`
                      : match.eventTitle;
                    return (
                      <button
                        key={match.id}
                        onClick={() => selectMatch(match)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer text-left border-b border-gray-50 last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{label}</p>
                          <p className="text-xs text-gray-400">
                            {d?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {' · '}
                            {match.teams.reduce((s, t) => s + t.players.length, 0)} players
                          </p>
                        </div>
                        <span className={`flex-shrink-0 ml-3 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          match.result
                            ? 'bg-gray-900 text-white'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {match.result ? 'Done' : 'Pending'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MATCH DASHBOARD
      ══════════════════════════════════════════════════════════════════ */}
      {selectedMatch && (
        <div className="space-y-4 animate-fadeIn">

          {/* ── SCOREBOARD ── */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Winner banner */}
            {winnerInfo && (
              <div className={`px-4 py-2.5 text-center text-xs font-black uppercase tracking-widest ${
                winnerInfo.isDraw
                  ? 'bg-gray-100 text-gray-500'
                  : `${TEAM_LIGHT_BG[winnerInfo.teamIndex] ?? 'bg-gray-50'} ${TEAM_TEXT_COLORS[winnerInfo.teamIndex] ?? 'text-gray-700'}`
              }`}>
                {winnerInfo.isDraw ? '🤝 Draw' : `🏆 ${winnerInfo.teamName} Won`}
              </div>
            )}

            {/* Score row */}
            <div className="px-4 pt-4 pb-5">
              {teams.length === 2 ? (
                // ── Classic 2-team scoreboard
                <div className="flex items-center gap-3">
                  {/* Team A */}
                  <div className="flex-1 text-center">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-2 ${TEAM_LIGHT_BG[0]}`}>
                      <div className={`w-2.5 h-2.5 rounded-sm ${TEAM_COLORS[0]}`} />
                      <p className={`text-xs font-black ${TEAM_TEXT_COLORS[0]}`}>{teams[0].teamName}</p>
                    </div>
                    <p className="text-5xl font-black text-gray-900">
                      {selectedMatch.result?.scores[teams[0].teamId] ?? '–'}
                    </p>
                    <p className="text-[10px] font-bold text-gray-400 mt-1">
                      {teams[0].players.length} players
                    </p>
                  </div>

                  {/* VS divider */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div className="w-px h-8 bg-gray-200" />
                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">vs</span>
                    <div className="w-px h-8 bg-gray-200" />
                  </div>

                  {/* Team B */}
                  <div className="flex-1 text-center">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-2 ${TEAM_LIGHT_BG[1]}`}>
                      <div className={`w-2.5 h-2.5 rounded-sm ${TEAM_COLORS[1]}`} />
                      <p className={`text-xs font-black ${TEAM_TEXT_COLORS[1]}`}>{teams[1].teamName}</p>
                    </div>
                    <p className="text-5xl font-black text-gray-900">
                      {selectedMatch.result?.scores[teams[1].teamId] ?? '–'}
                    </p>
                    <p className="text-[10px] font-bold text-gray-400 mt-1">
                      {teams[1].players.length} players
                    </p>
                  </div>
                </div>
              ) : (
                // ── Multi-team scoreboard (3 or 4 teams)
                <div className="grid grid-cols-2 gap-3">
                  {teams.map((t, i) => (
                    <div key={t.teamId} className={`rounded-2xl p-3 text-center ${TEAM_LIGHT_BG[i] ?? 'bg-gray-50'}`}>
                      <div className="flex items-center justify-center gap-1.5 mb-1.5">
                        <div className={`w-2.5 h-2.5 rounded-sm ${TEAM_COLORS[i]}`} />
                        <p className={`text-xs font-black truncate ${TEAM_TEXT_COLORS[i] ?? 'text-gray-700'}`}>{t.teamName}</p>
                      </div>
                      <p className="text-4xl font-black text-gray-900">
                        {selectedMatch.result?.scores[t.teamId] ?? '–'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {!hasResult && (
                <p className="text-center text-xs text-gray-400 font-semibold mt-3">No result recorded yet</p>
              )}
            </div>
          </div>

          {/* ── TOP SCORERS ── */}
          {topScorers.length > 0 && (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
                Top Scorers
              </p>
              <div className="space-y-2">
                {topScorers.map((gs, idx) => {
  const teamIndex = teams.findIndex(t => t.teamId === gs.teamId);
  const team = teams[teamIndex];
  const isFirst = gs.goals === topGoalCount; // ← was: idx === 0
                  return (
                    <div
                      key={gs.playerId}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl ${
                        isFirst ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                      }`}
                    >
                      {/* Rank */}
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black ${
                        isFirst ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {idx + 1}
                      </div>
                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{gs.playerName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className={`w-2 h-2 rounded-full ${TEAM_COLORS[teamIndex] ?? 'bg-gray-400'}`} />
                          <p className="text-[10px] text-gray-400 font-semibold">{team?.teamName}</p>
                        </div>
                      </div>
                      {/* Goals */}
                      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl flex-shrink-0 ${
                        isFirst ? 'bg-yellow-100' : 'bg-gray-200'
                      }`}>
                        <span className="text-sm">⚽</span>
                        <span className={`text-sm font-black ${isFirst ? 'text-yellow-700' : 'text-gray-600'}`}>
                          {gs.goals}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── TEAM ROSTERS ── */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
              Team Rosters
            </p>
            <div className="space-y-3">
              {teams.map((team, i) => (
                <details key={team.teamId} className="group">
                  <summary className="flex items-center gap-2.5 cursor-pointer select-none list-none py-1">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 ${TEAM_COLORS[i]}`}>
                      {team.teamId}
                    </div>
                    <p className="flex-1 text-sm font-bold text-gray-900">{team.teamName}</p>
                    <span className="text-xs font-semibold text-gray-400">
                      {team.players.length} players
                    </span>
                    <svg className="w-4 h-4 text-gray-300 group-open:rotate-180 transition-transform duration-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <div className="mt-2 space-y-1.5 pl-8">
                    {team.players.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">No players in this team</p>
                    ) : (
                      team.players.map(p => (
                        <div key={p.playerId} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                          <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <p className="flex-1 text-sm font-semibold text-gray-800 truncate">{p.playerName}</p>
                          {p.playerType === 'guest' && (
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Guest</span>
                          )}
                          {/* goal count badge if scorer */}
                          {(() => {
                            const sc = goalScorers.find(g => g.playerId === p.playerId);
                            return sc ? (
                              <span className="text-[10px] font-black text-yellow-600 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded-lg">
                                ⚽ {sc.goals}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      ))
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>

          {/* ── EDIT OPTIONS ── */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
              Edit Options
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setEditMode(editMode === 'score' ? 'none' : 'score')}
                className={`flex items-center gap-2 px-3 py-3 rounded-2xl font-bold text-sm transition-colors cursor-pointer ${
                  editMode === 'score'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700'
                }`}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Score
              </button>
              <button
                onClick={async () => {
                  const next = editMode === 'teams' ? 'none' : 'teams';
                  setEditMode(next);
                  if (next === 'teams' && participants.length === 0) {
                    await fetchParticipants(selectedMatch.eventId);
                  }
                }}
                className={`flex items-center gap-2 px-3 py-3 rounded-2xl font-bold text-sm transition-colors cursor-pointer ${
                  editMode === 'teams'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700'
                }`}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Edit Teams
              </button>
            </div>
          </div>

          {/* ── EDIT SCORE (inline) ── */}
          {editMode === 'score' && (
            <div className="bg-white rounded-3xl border border-red-200 shadow-sm p-4 animate-fadeIn">
              <p className="text-[11px] font-black text-red-400 uppercase tracking-widest mb-3">
                Edit Score
              </p>
              <div className={`grid gap-3 ${teams.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                {teams.map((t, i) => (
                  <div key={t.teamId} className="text-center">
                    <div className={`inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full ${TEAM_LIGHT_BG[i]}`}>
                      <div className={`w-2.5 h-2.5 rounded-sm ${TEAM_COLORS[i]}`} />
                      <p className="text-xs font-bold text-gray-700 truncate max-w-[80px]">{t.teamName}</p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={scores[t.teamId] ?? ''}
                      onChange={e => setScores(prev => ({ ...prev, [t.teamId]: e.target.value }))}
                      placeholder="0"
                      className="w-full text-center text-4xl font-black text-gray-900 bg-gray-50 border-2 border-gray-200 focus:border-red-400 focus:outline-none rounded-2xl py-5 transition-colors"
                    />
                  </div>
                ))}
              </div>

              {/* Live preview */}
              {hasAnyScore && (() => {
                const ns: Record<string, number> = {};
                teams.forEach(t => { ns[t.teamId] = parseInt(scores[t.teamId] || '0', 10); });
                const max = Math.max(...Object.values(ns));
                const winners = Object.entries(ns).filter(([, v]) => v === max).map(([k]) => k);
                const isDraw = winners.length > 1;
                const winTeam = !isDraw ? teams.find(t => t.teamId === winners[0]) : null;
                return (
                  <div className={`mt-3 px-4 py-2.5 rounded-xl text-center text-sm font-black ${
                    isDraw ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {isDraw ? '🤝 Draw' : `🏆 ${winTeam?.teamName} leads`}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── EDIT TEAMS (inline) ── */}
          {editMode === 'teams' && (
            <div className="bg-white rounded-3xl border border-red-200 shadow-sm p-4 animate-fadeIn space-y-3">
              <p className="text-[11px] font-black text-red-400 uppercase tracking-widest">
                Edit Teams
              </p>
              {loadingParticipants ? <Spinner /> : (
                teams.map((team, i) => (
                  <div key={team.teamId} className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
                    <div className={`h-1 w-full ${TEAM_COLORS[i]}`} />
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white ${TEAM_COLORS[i]}`}>
                            {team.teamId}
                          </div>
                          <p className="text-sm font-black text-gray-900">{team.teamName}</p>
                          <span className="text-xs text-gray-400 font-semibold">{team.players.length}p</span>
                        </div>
                        <button
                          onClick={() => setAssignTarget(team)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-red-200 text-red-600 font-bold rounded-xl text-xs cursor-pointer hover:bg-red-50 active:bg-red-100 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                          </svg>
                          Assign
                        </button>
                      </div>
                      {team.players.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">No players</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {team.players.map(p => (
                            <div key={p.playerId} className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-xl">
                              <span className="text-xs font-semibold text-gray-700">{p.playerName}</span>
                              <button
                                onClick={() => setTeams(prev => prev.map(t =>
                                  t.teamId === team.teamId
                                    ? { ...t, players: t.players.filter(pl => pl.playerId !== p.playerId) }
                                    : t
                                ))}
                                className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── GOAL SCORERS (always visible when match selected) ── */}
          <GoalScorerSection
            teams={teams}
            goalScorers={goalScorers}
            onChange={setGoalScorers}
            disabled={false}
          />

          {/* ── SAVE BUTTON ── */}
          {(editMode !== 'none' || hasResult) && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm animate-slideUp"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}

          {/* ── Match meta ── */}
          <div className="text-center pb-2">
            <p className="text-[10px] text-gray-300 font-semibold">
              Match ID #{selectedMatch.id.slice(-8).toUpperCase()}
              {selectedMatch.result?.savedAt
                ? ` · Last saved ${selectedMatch.result.savedAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!selectedMatch && !loadingMatches && matchesFetched && matches.length === 0 && (
        <div className="text-center py-12">
          <div className="w-14 h-14 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-sm font-bold text-gray-400">No matches yet</p>
          <p className="text-xs text-gray-300 mt-1">Switch to New Match tab to create one</p>
        </div>
      )}
    </div>
  );
}