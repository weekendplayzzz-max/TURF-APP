'use client';

import { useState } from 'react';
import { TEAM_COLORS, TEAM_LIGHT_BG, TEAM_TEXT_COLORS } from './AssignPlayersSheet';
import type { Team } from './AssignPlayersSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoalScorer {
  teamId: string;
  playerId: string;
  playerName: string;
  goals: number;
}

interface GoalScorerSectionProps {
  teams: Team[];
  goalScorers: GoalScorer[];
  onChange: (updated: GoalScorer[]) => void;
  disabled?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GoalScorerSection({
  teams,
  goalScorers,
  onChange,
  disabled = false,
}: GoalScorerSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  // ─── Add or increment a player's goal count
  const handleAddGoal = (teamId: string, playerId: string, playerName: string) => {
    const existing = goalScorers.find(g => g.playerId === playerId);
    if (existing) {
      // Increment
      onChange(
        goalScorers.map(g =>
          g.playerId === playerId ? { ...g, goals: g.goals + 1 } : g
        )
      );
    } else {
      // Add new entry
      onChange([...goalScorers, { teamId, playerId, playerName, goals: 1 }]);
    }
  };

  // ─── Decrement or remove
  const handleRemoveGoal = (playerId: string) => {
    const existing = goalScorers.find(g => g.playerId === playerId);
    if (!existing) return;
    if (existing.goals <= 1) {
      onChange(goalScorers.filter(g => g.playerId !== playerId));
    } else {
      onChange(
        goalScorers.map(g =>
          g.playerId === playerId ? { ...g, goals: g.goals - 1 } : g
        )
      );
    }
  };

  // ─── Remove entirely
  const handleRemoveAll = (playerId: string) => {
    onChange(goalScorers.filter(g => g.playerId !== playerId));
  };

  const totalGoals = goalScorers.reduce((s, g) => s + g.goals, 0);

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">

      {/* ── Collapsible header ── */}
      <button
        onClick={() => setIsOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3.5 cursor-pointer active:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {/* Football icon */}
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 3c0 0 2 3 2 9s-2 9-2 9M12 3c0 0-2 3-2 9s2 9 2 9M3.6 9h16.8M3.6 15h16.8" />
          </svg>
          <p className="text-sm font-bold text-gray-900">Goal Scorers</p>
          <span className="text-[10px] font-black text-gray-300 uppercase tracking-wide">Optional</span>
          {totalGoals > 0 && (
            <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-black rounded-full">
              {totalGoals} goal{totalGoals !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Expanded content ── */}
      {isOpen && (
        <div className="border-t border-gray-100 animate-fadeIn">

          {/* Already added scorers */}
          {goalScorers.length > 0 && (
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                Scorers
              </p>
              <div className="space-y-2">
                {goalScorers
                  .slice()
                  .sort((a, b) => b.goals - a.goals)
                  .map(gs => {
                    const teamIndex = teams.findIndex(t => t.teamId === gs.teamId);
                    const team = teams[teamIndex];
                    return (
                      <div
                        key={gs.playerId}
                        className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50 rounded-2xl border border-gray-100"
                      >
                        {/* Team color dot */}
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${TEAM_COLORS[teamIndex] ?? 'bg-gray-400'}`} />

                        {/* Name + team */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{gs.playerName}</p>
                          <p className="text-[10px] text-gray-400 font-semibold">{team?.teamName}</p>
                        </div>

                        {/* Goal stepper */}
                        {!disabled && (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => handleRemoveGoal(gs.playerId)}
                              className="w-7 h-7 rounded-xl bg-gray-200 hover:bg-red-100 active:bg-red-200 flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                              </svg>
                            </button>
                            <div className="w-8 text-center">
                              <span className="text-base font-black text-gray-900">{gs.goals}</span>
                            </div>
                            <button
                              onClick={() => handleAddGoal(gs.teamId, gs.playerId, gs.playerName)}
                              className="w-7 h-7 rounded-xl bg-gray-200 hover:bg-red-100 active:bg-red-200 flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </div>
                        )}

                        {/* Goal count badge (read-only) */}
                        {disabled && (
                          <span className="flex-shrink-0 px-2.5 py-1 bg-red-50 border border-red-200 rounded-xl text-xs font-black text-red-600">
                            ⚽ {gs.goals}
                          </span>
                        )}

                        {/* Remove entirely */}
                        {!disabled && (
                          <button
                            onClick={() => handleRemoveAll(gs.playerId)}
                            className="w-6 h-6 rounded-lg bg-gray-200 hover:bg-red-100 active:bg-red-200 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ml-1"
                          >
                            <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Add scorers per team */}
          {!disabled && (
            <div className="px-4 pt-3 pb-5 space-y-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Tap player to add goal
              </p>
              {teams.map((t, i) => {
                if (t.players.length === 0) return null;
                return (
                  <div key={t.teamId}>
                    {/* Team label */}
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-2 ${TEAM_LIGHT_BG[i] ?? 'bg-gray-100'}`}>
                      <div className={`w-2 h-2 rounded-sm ${TEAM_COLORS[i] ?? 'bg-gray-400'}`} />
                      <p className={`text-[10px] font-black uppercase tracking-wide ${TEAM_TEXT_COLORS[i] ?? 'text-gray-600'}`}>
                        {t.teamName}
                      </p>
                    </div>

                    {/* Player chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {t.players.map(p => {
                        const scorerEntry = goalScorers.find(g => g.playerId === p.playerId);
                        const goalCount = scorerEntry?.goals ?? 0;
                        return (
                          <button
                            key={p.playerId}
                            onClick={() => handleAddGoal(t.teamId, p.playerId, p.playerName)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                              goalCount > 0
                                ? `${TEAM_LIGHT_BG[i] ?? 'bg-gray-100'} ${TEAM_TEXT_COLORS[i] ?? 'text-gray-600'} border border-current/20 font-bold`
                                : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-600'
                            }`}
                          >
                            {goalCount > 0 && (
                              <span className="font-black">⚽ {goalCount}</span>
                            )}
                            {p.playerName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state when disabled + no scorers */}
          {disabled && goalScorers.length === 0 && (
            <div className="px-4 pb-5 text-center">
              <p className="text-xs text-gray-400 font-semibold">No goal scorers recorded</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}