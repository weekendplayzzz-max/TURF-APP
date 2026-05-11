'use client';

import { Timestamp } from 'firebase/firestore';
import MatchScoreCard from './MatchScoreCard';
import { TEAM_COLORS, TEAM_LIGHT_BG, TEAM_TEXT_COLORS } from '@/app/treasurer/manage-match/components/AssignPlayersSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Player {
  playerId: string;
  playerName: string;
  playerType?: string;
}

interface Team {
  teamId: string;
  teamName: string;
  players: Player[];
}

interface GoalScorer {
  teamId: string;
  playerId: string;
  playerName: string;
  goals: number;
}

interface MatchResult {
  scores: Record<string, number>;
  goalScorers: GoalScorer[];
  winner: string | null;
  savedAt: Timestamp | null;
}

export interface MatchDetail {
  id: string;
  eventTitle: string;
  matchNumber: number;
  createdAt: Timestamp;
  teams: Team[];
  result: MatchResult | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MatchDetailView({ match }: { match: MatchDetail }) {
  const { teams, result } = match;

  // Top scorers — sorted desc, all tied top scorers highlighted
  const topScorers = [...(result?.goalScorers ?? [])]
    .filter(g => g.goals > 0)
    .sort((a, b) => b.goals - a.goals);
  const topGoalCount = topScorers[0]?.goals ?? 0;

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Scoreboard card ── */}
      <MatchScoreCard
        eventTitle={match.eventTitle}
        matchNumber={match.matchNumber}
        createdAt={match.createdAt}
        teams={teams}
        result={result}
        label="Selected Match"
      />

      {/* ── Top Scorers ── */}
      {topScorers.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
            Top Scorers
          </p>
          <div className="space-y-2">
            {topScorers.map((gs, idx) => {
              const teamIndex = teams.findIndex(t => t.teamId === gs.teamId);
              const team = teams[teamIndex];
              const isTop = gs.goals === topGoalCount;
              return (
                <div
                  key={gs.playerId}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl ${
                    isTop ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                  }`}
                >
                  {/* Rank badge */}
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black ${
                    isTop ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {isTop ? '1' : idx + 1}
                  </div>
                  {/* Name + team */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{gs.playerName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className={`w-2 h-2 rounded-full ${TEAM_COLORS[teamIndex] ?? 'bg-gray-400'}`} />
                      <p className="text-[10px] text-gray-400 font-semibold">{team?.teamName}</p>
                    </div>
                  </div>
                  {/* Goals pill */}
                  <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl flex-shrink-0 ${
                    isTop ? 'bg-yellow-100' : 'bg-gray-200'
                  }`}>
                    <span className="text-sm">⚽</span>
                    <span className={`text-sm font-black ${isTop ? 'text-yellow-700' : 'text-gray-600'}`}>
                      {gs.goals}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Team Rosters ── */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
          Team Rosters
        </p>
        <div className="space-y-3">
          {teams.map((team, i) => (
            <details key={team.teamId} className="group">
              <summary className="flex items-center gap-2.5 cursor-pointer select-none list-none py-1">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 ${TEAM_COLORS[i] ?? 'bg-gray-400'}`}>
                  {team.teamId}
                </div>
                <p className="flex-1 text-sm font-bold text-gray-900">{team.teamName}</p>
                <span className="text-xs font-semibold text-gray-400">
                  {team.players.length} players
                </span>
                <svg
                  className="w-4 h-4 text-gray-300 group-open:rotate-180 transition-transform duration-200 flex-shrink-0"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="mt-2 space-y-1.5 pl-8">
                {team.players.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">No players</p>
                ) : (
                  team.players.map(p => {
                    const scorerEntry = result?.goalScorers.find(g => g.playerId === p.playerId);
                    return (
                      <div
                        key={p.playerId}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl"
                      >
                        <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <p className="flex-1 text-sm font-semibold text-gray-800 truncate">
                          {p.playerName}
                        </p>
                        {scorerEntry && (
                          <span className="text-[10px] font-black text-yellow-600 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded-lg flex-shrink-0">
                            ⚽ {scorerEntry.goals}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* ── Match Meta ── */}
      <div className="text-center pb-2">
        <p className="text-[10px] text-gray-300 font-semibold">
          Match ID #{match.id.slice(-8).toUpperCase()}
          {result?.savedAt
            ? ` · Result saved ${result.savedAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : ' · Result pending'}
        </p>
      </div>
    </div>
  );
}