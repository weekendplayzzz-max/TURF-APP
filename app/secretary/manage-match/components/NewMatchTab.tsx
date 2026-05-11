'use client';

import { useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { updatePlayerStats } from '@/lib/updatePlayerStats';

import {
  collection, getDocs, addDoc, updateDoc, doc,
  query, where, orderBy, Timestamp,
} from 'firebase/firestore';
import AssignPlayersSheet, {
  TEAM_COLORS, TEAM_LIGHT_BG, TEAM_TEXT_COLORS,
} from './AssignPlayersSheet';
import type { Participant, Team } from './AssignPlayersSheet';
import GoalScorerSection from './GoalScorerSection';
import type { GoalScorer } from './GoalScorerSection';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TurfEvent {
  id: string;
  title: string;
  date: Timestamp;
  time: string;
  status: string;
  participantCount: number;
}

type Step = 'select' | 'setup' | 'builder' | 'result';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEAM_LABELS = ['A', 'B', 'C', 'D'];

function generateTeams(count: number): Team[] {
  return Array.from({ length: count }, (_, i) => ({
    teamId: TEAM_LABELS[i],
    teamName: `Team ${TEAM_LABELS[i]}`,
    players: [],
  }));
}

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface NewMatchTabProps {
  userId: string;
  onMatchCreated: () => void; // tells parent to refresh Tab 2's event list
  showToast: (msg: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewMatchTab({ userId, onMatchCreated, showToast }: NewMatchTabProps) {

  // ── Step
  const [step, setStep] = useState<Step>('select');

  // ── Step 1: Event
  const [events, setEvents] = useState<TurfEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<TurfEvent | null>(null);
  const [eventsFetched, setEventsFetched] = useState(false);

  // ── Step 2: Setup
  const [teamCount, setTeamCount] = useState(2);
  const [teams, setTeams] = useState<Team[]>(generateTeams(2));
  const [allowMultiple, setAllowMultiple] = useState(false);

  // ── Step 3: Builder
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Team | null>(null);

  // ── Step 4: Result
  const [scores, setScores] = useState<Record<string, string>>({});
  const [goalScorers, setGoalScorers] = useState<GoalScorer[]>([]);
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [resultSaved, setResultSaved] = useState(false);

  // ── Dialogs
  const [showLockDialog, setShowLockDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // ─── Fetch events without a match ──────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    try {
      setLoadingEvents(true);
      const [eventSnap, matchSnap] = await Promise.all([
        getDocs(query(collection(db, 'events'), orderBy('date', 'desc'))),
        getDocs(collection(db, 'matches')),
      ]);

      const matchedEventIds = new Set<string>();
      matchSnap.forEach(d => matchedEventIds.add(d.data().eventId));

      const list: TurfEvent[] = [];
      eventSnap.forEach(d => {
        const data = d.data();
        if (
          (data.status === 'closed' || data.status === 'locked') &&
          !matchedEventIds.has(d.id)
        ) {
          list.push({
            id: d.id,
            title: data.title,
            date: data.date,
            time: data.time,
            status: data.status,
            participantCount: data.participantCount || 0,
          });
        }
      });
      setEvents(list);
      setEventsFetched(true);
    } catch (e) {
      console.error(e);
      showToast('Failed to load events');
    } finally {
      setLoadingEvents(false);
    }
  }, [showToast]);

  // Open dropdown — fetch on first open
  const handleOpenDropdown = () => {
    if (!eventsFetched) fetchEvents();
    setDropdownOpen(p => !p);
  };

  // ─── Fetch participants ────────────────────────────────────────────────────
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

  // ─── Derived ───────────────────────────────────────────────────────────────
  const assignedCount = teams.reduce((s, t) => s + t.players.length, 0);
  const unassignedCount = participants.length - assignedCount;

  // ─── Lock & Submit ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedEvent) return;
    try {
      setSubmitting(true);
      setShowLockDialog(false);

      let matchNumber = 1;
      if (allowMultiple) {
        const existing = await getDocs(query(
          collection(db, 'matches'),
          where('eventId', '==', selectedEvent.id),
        ));
        matchNumber = existing.size + 1;
      }

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

      const ref = await addDoc(collection(db, 'matches'), {
        eventId: selectedEvent.id,
        eventTitle: selectedEvent.title,
        matchNumber,
        teams: cleanTeams,
        isLocked: true,
        createdBy: userId,
        createdAt: Timestamp.now(),
        result: null,
      });

      setSavedMatchId(ref.id);
      const sc: Record<string, string> = {};
      teams.forEach(t => { sc[t.teamId] = ''; });
      setScores(sc);
      setStep('result');
      onMatchCreated(); // refresh Tab 2
    } catch (e) {
      console.error(e);
      showToast('Failed to save match. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Save Result ───────────────────────────────────────────────────────────
  const handleSaveResult = async () => {
  if (!savedMatchId) return;
  try {
    setSavingResult(true);

    const numericScores: Record<string, number> = {};
    teams.forEach(t => { numericScores[t.teamId] = parseInt(scores[t.teamId] || '0', 10); });

    const max = Math.max(...Object.values(numericScores));
    const winners = Object.entries(numericScores)
      .filter(([, v]) => v === max).map(([k]) => k);
    const winner = winners.length > 1 ? 'draw' : winners[0];

    const newResult = {
      scores: numericScores,
      goalScorers,
      winner,
      savedAt: Timestamp.now(),
    };

    // ── 1. Save result to Firestore
    await updateDoc(doc(db, 'matches', savedMatchId), {
      result: newResult,
    });

    // ── 2. Update player stats
    //    Brand new result — no old state to reverse
    await updatePlayerStats({
      oldTeams:  null,
      oldResult: null,
      newTeams:  teams,
      newResult,
    });

    // ── 3. Show success
    const winTeam = winner !== 'draw' ? teams.find(t => t.teamId === winner) : null;
    setSuccessMessage(
      winner === 'draw'
        ? `Match saved! It's a Draw 🤝`
        : `Match saved! ${winTeam?.teamName} wins 🏆`
    );
    setShowSuccessDialog(true);
    setResultSaved(true);
  } catch (e) {
    console.error(e);
    showToast('Failed to save result. Try again.');
  } finally {
    setSavingResult(false);
  }
};

  // ─── Reset ─────────────────────────────────────────────────────────────────
  const resetAll = () => {
    setStep('select');
    setSelectedEvent(null);
    setDropdownOpen(false);
    setEventsFetched(false);
    setEvents([]);
    setTeamCount(2);
    setTeams(generateTeams(2));
    setAllowMultiple(false);
    setParticipants([]);
    setSavedMatchId(null);
    setScores({});
    setGoalScorers([]);
    setResultSaved(false);
    setShowSuccessDialog(false);
  };

  // ─── Step back ─────────────────────────────────────────────────────────────
  const goBack = () => {
    if (step === 'setup') setStep('select');
    else if (step === 'builder') setStep('setup');
    else if (step === 'result' && !resultSaved) setStep('builder');
  };

  const canGoBack = step !== 'select' && !(step === 'result' && resultSaved);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ══════════════ SUCCESS DIALOG ══════════════ */}
      {showSuccessDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slideUp px-5 pt-6 pb-6">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-black text-gray-900 text-center">Done!</h3>
            <p className="text-sm text-gray-500 text-center mt-1">{successMessage}</p>
            <div className="mt-5 space-y-2">
              <button
                onClick={resetAll}
                className="w-full py-3 bg-gray-900 hover:bg-gray-800 active:bg-gray-700 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm"
              >
                Create Another Match
              </button>
              <button
                onClick={() => setShowSuccessDialog(false)}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-bold rounded-2xl transition-colors cursor-pointer text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ LOCK CONFIRMATION DIALOG ══════════════ */}
      {showLockDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slideUp px-5 pt-6 pb-6">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-black text-gray-900 text-center">Lock Teams?</h3>
            <p className="text-sm text-gray-500 text-center mt-1 mb-4">
              Teams will be saved. You can still edit everything later in Manage Match.
            </p>
            <div className="space-y-2 mb-4">
              {teams.map((t, i) => (
                <div key={t.teamId} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-sm ${TEAM_COLORS[i]}`} />
                    <span className="text-sm font-bold text-gray-900">{t.teamName}</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-500">{t.players.length} players</span>
                </div>
              ))}
              {unassignedCount > 0 && (
                <div className="flex items-center justify-between px-3 py-2.5 bg-yellow-50 rounded-xl border border-yellow-200">
                  <span className="text-sm font-semibold text-yellow-700">Unassigned (absent)</span>
                  <span className="text-xs font-semibold text-yellow-600">{unassignedCount} players</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Lock & Submit'}
              </button>
              <button
                onClick={() => setShowLockDialog(false)}
                disabled={submitting}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-bold rounded-2xl transition-colors cursor-pointer text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ══════════════ STEP INDICATOR + BACK ══════════════ */}
      {step !== 'select' && (
        <div className="flex items-center gap-3 animate-fadeIn">
          {canGoBack && (
            <button
              onClick={goBack}
              className="p-2 rounded-xl bg-gray-100 active:bg-gray-200 cursor-pointer flex-shrink-0"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          )}
          <div className="flex-1 flex items-center gap-1.5">
            {(['select', 'setup', 'builder', 'result'] as Step[]).map(s => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step ? 'flex-1 bg-red-600' : 'w-4 bg-gray-200'
                }`}
              />
            ))}
          </div>
          <span className="text-xs font-bold text-gray-400 flex-shrink-0">
            {step === 'setup' && 'Configure'}
            {step === 'builder' && 'Assign Players'}
            {step === 'result' && 'Enter Result'}
          </span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 1 — SELECT EVENT (DROPDOWN)
      ══════════════════════════════════════════════════════════════════ */}
      {step === 'select' && (
        <div className="animate-fadeIn space-y-4">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
              Select Event
            </p>

            {/* Dropdown trigger */}
            <div className="relative">
              <button
                onClick={handleOpenDropdown}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 transition-colors cursor-pointer text-left ${
                  dropdownOpen ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50 active:bg-gray-100'
                }`}
              >
                <span className={`text-sm font-semibold ${selectedEvent ? 'text-gray-900' : 'text-gray-400'}`}>
                  {selectedEvent ? selectedEvent.title : '-- Choose an event --'}
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
                  {loadingEvents ? (
                    <div className="py-6 flex justify-center">
                      <div className="relative w-6 h-6">
                        <div className="absolute inset-0 border-2 border-red-600/20 rounded-full" />
                        <div className="absolute inset-0 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    </div>
                  ) : events.length === 0 ? (
                    <div className="px-4 py-5 text-center">
                      <p className="text-sm font-bold text-gray-400">No events available</p>
                      <p className="text-xs text-gray-300 mt-0.5">All closed events already have a match</p>
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto">
                      {events.map(event => {
                        const d = event.date.toDate();
                        return (
                          <button
                            key={event.id}
                            onClick={() => {
                              setSelectedEvent(event);
                              setDropdownOpen(false);
                            }}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer text-left border-b border-gray-50 last:border-0"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{event.title}</p>
                              <p className="text-xs text-gray-400">
                                {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {event.time} · {event.participantCount} players
                              </p>
                            </div>
                            <span className={`flex-shrink-0 ml-3 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              event.status === 'locked'
                                ? 'bg-gray-100 text-gray-500'
                                : 'bg-red-50 text-red-600'
                            }`}>
                              {event.status}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected event detail chip */}
            {selectedEvent && (
              <div className="mt-3 flex items-center gap-2.5 px-3 py-2.5 bg-gray-50 rounded-2xl border border-gray-100 animate-slideDown">
                <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{selectedEvent.title}</p>
                  <p className="text-xs text-gray-400">
                    {selectedEvent.date.toDate().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}{selectedEvent.participantCount} players
                  </p>
                </div>
              </div>
            )}
          </div>

          {selectedEvent && (
            <button
              onClick={() => setStep('setup')}
              className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm animate-slideUp"
            >
              Set Up Teams →
            </button>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 2 — SETUP
      ══════════════════════════════════════════════════════════════════ */}
      {step === 'setup' && (
        <div className="animate-fadeIn space-y-4">

          {/* Event chip */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{selectedEvent?.title}</p>
              <p className="text-xs text-gray-400">{selectedEvent?.participantCount} registered players</p>
            </div>
            <button onClick={() => setStep('select')} className="text-xs font-bold text-red-600 cursor-pointer flex-shrink-0">
              Change
            </button>
          </div>

          {/* Team count */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">Number of Teams</p>
            <div className="grid grid-cols-3 gap-2">
              {[2, 3, 4].map(n => (
                <button
                  key={n}
                  onClick={() => { setTeamCount(n); setTeams(generateTeams(n)); }}
                  className={`py-4 rounded-2xl font-black text-2xl transition-all cursor-pointer ${
                    teamCount === n ? 'bg-red-600 text-white shadow-sm' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 active:bg-gray-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2.5 text-center">
              ~{Math.floor((selectedEvent?.participantCount ?? 0) / teamCount)} players per team
            </p>
          </div>

          {/* Team names */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">Team Names</p>
            <div className="space-y-2.5">
              {teams.map((t, i) => (
                <div key={t.teamId} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black text-white ${TEAM_COLORS[i]}`}>
                    {t.teamId}
                  </div>
                  <input
                    type="text"
                    value={t.teamName}
                    onChange={e => setTeams(prev => prev.map(tm =>
                      tm.teamId === t.teamId ? { ...tm, teamName: e.target.value } : tm
                    ))}
                    className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-red-400 focus:bg-white transition-colors"
                    placeholder={`Team ${t.teamId}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Multiple matches toggle */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-4">
                <p className="text-sm font-bold text-gray-900">Allow Multiple Matches</p>
                <p className="text-xs text-gray-400 mt-0.5">Create more than one match for this event</p>
              </div>
              <button
                onClick={() => setAllowMultiple(p => !p)}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer relative flex-shrink-0 ${allowMultiple ? 'bg-red-600' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${allowMultiple ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          <button
            onClick={async () => {
              await fetchParticipants(selectedEvent!.id);
              setStep('builder');
            }}
            className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm"
          >
            Assign Players →
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 3 — TEAM BUILDER
      ══════════════════════════════════════════════════════════════════ */}
      {step === 'builder' && (
        <div className="animate-fadeIn space-y-4">
          {loadingParticipants ? <Spinner /> : (
            <>
              {/* Unassigned banner */}
              {unassignedCount > 0 ? (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-yellow-50 rounded-2xl border border-yellow-200">
                  <svg className="w-4 h-4 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-xs font-semibold text-yellow-700">
                    <span className="font-black">{unassignedCount}</span> player{unassignedCount !== 1 ? 's' : ''} unassigned — will be marked absent
                  </p>
                </div>
              ) : participants.length > 0 ? (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200">
                  <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-xs font-semibold text-gray-500">All {participants.length} players assigned</p>
                </div>
              ) : null}

              {/* Team cards */}
              {teams.map((team, i) => (
                <div key={team.teamId} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className={`h-1.5 w-full ${TEAM_COLORS[i]}`} />
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white ${TEAM_COLORS[i]}`}>
                          {team.teamId}
                        </div>
                        <p className="text-sm font-black text-gray-900">{team.teamName}</p>
                        <span className="text-xs font-semibold text-gray-400">{team.players.length} players</span>
                      </div>
                      <button
                        onClick={() => setAssignTarget(team)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        Assign
                      </button>
                    </div>

                    {team.players.length === 0 ? (
                      <div
                        onClick={() => setAssignTarget(team)}
                        className="text-center py-6 rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-red-300 hover:bg-red-50/30 active:bg-red-50/50 transition-colors"
                      >
                        <p className="text-xs text-gray-400 font-semibold">No players assigned</p>
                        <p className="text-xs text-red-500 font-bold mt-0.5">Tap to assign →</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {team.players.map(p => (
                          <div key={p.playerId} className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 rounded-xl">
                            <div className="w-6 h-6 bg-white border border-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                            <p className="flex-1 text-sm font-semibold text-gray-800 truncate">{p.playerName}</p>
                            {p.playerType === 'guest' && (
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Guest</span>
                            )}
                            <button
                              onClick={() => setTeams(prev => prev.map(t =>
                                t.teamId === team.teamId
                                  ? { ...t, players: t.players.filter(pl => pl.playerId !== p.playerId) }
                                  : t
                              ))}
                              className="w-5 h-5 rounded-md bg-gray-200 hover:bg-red-100 active:bg-red-200 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer"
                            >
                              <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <button
                onClick={() => setShowLockDialog(true)}
                disabled={teams.every(t => t.players.length === 0)}
                className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Lock Teams & Continue
              </button>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 4 — RESULT
      ══════════════════════════════════════════════════════════════════ */}
      {step === 'result' && (
        <div className="animate-fadeIn space-y-4">

          {/* Teams locked summary */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <p className="text-sm font-black text-gray-900">Teams Locked</p>
              {savedMatchId && (
                <span className="ml-auto text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                  #{savedMatchId.slice(-6).toUpperCase()}
                </span>
              )}
            </div>
            <div className={`grid gap-2 ${teams.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
              {teams.map((t, i) => (
                <div key={t.teamId} className="bg-gray-50 rounded-2xl px-3 py-2.5 border border-gray-100">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className={`w-3 h-3 rounded-sm flex-shrink-0 ${TEAM_COLORS[i]}`} />
                    <p className="text-xs font-black text-gray-900 truncate">{t.teamName}</p>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    {t.players.length === 0 ? 'No players' : t.players.map(p => p.playerName).join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Score entry */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">Final Score</p>
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
                    disabled={resultSaved}
                    placeholder="0"
                    className="w-full text-center text-4xl font-black text-gray-900 bg-gray-50 border-2 border-gray-200 focus:border-red-400 focus:outline-none rounded-2xl py-5 transition-colors disabled:opacity-60"
                  />
                </div>
              ))}
            </div>

            {/* Live winner preview */}
            {teams.some(t => scores[t.teamId] !== '' && scores[t.teamId] !== undefined) && (() => {
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
                  {isDraw ? '🤝 It\'s a Draw' : `🏆 ${winTeam?.teamName} is leading`}
                </div>
              );
            })()}
          </div>

          {/* Goal scorers */}
          <GoalScorerSection
            teams={teams}
            goalScorers={goalScorers}
            onChange={setGoalScorers}
            disabled={resultSaved}
          />

          {/* Save / Done */}
          {!resultSaved ? (
            <button
              onClick={handleSaveResult}
              disabled={savingResult || teams.every(t => !scores[t.teamId])}
              className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm"
            >
              {savingResult ? 'Saving...' : 'Save Match Result'}
            </button>
          ) : (
            <div className="w-full py-3.5 bg-gray-100 text-gray-400 font-bold rounded-2xl text-sm text-center">
              ✓ Result Saved
            </div>
          )}

          <button
            onClick={resetAll}
            className="w-full py-3 bg-white border border-gray-200 hover:bg-gray-50 active:bg-gray-100 text-gray-600 font-bold rounded-2xl transition-colors cursor-pointer text-sm"
          >
            Create Another Match
          </button>
        </div>
      )}
    </div>
  );
}