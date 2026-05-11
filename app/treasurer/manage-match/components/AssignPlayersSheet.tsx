'use client';

import { useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Participant {
  playerId: string;
  playerName: string;
  playerType: 'regular' | 'guest';
  parentId?: string;
}

export interface Team {
  teamId: string;
  teamName: string;
  players: Participant[];
}

interface AssignPlayersSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (updatedTeams: Team[]) => void;
  targetTeam: Team;
  allTeams: Team[];
  participants: Participant[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const TEAM_COLORS = [
  'bg-red-500',
  'bg-gray-700',
  'bg-blue-500',
  'bg-green-500',
];

export const TEAM_TEXT_COLORS = [
  'text-red-600',
  'text-gray-700',
  'text-blue-600',
  'text-green-600',
];

export const TEAM_LIGHT_BG = [
  'bg-red-50',
  'bg-gray-100',
  'bg-blue-50',
  'bg-green-50',
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AssignPlayersSheet({
  isOpen,
  onClose,
  onConfirm,
  targetTeam,
  allTeams,
  participants,
}: AssignPlayersSheetProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Pre-check players already in this team when sheet opens
  useEffect(() => {
    if (isOpen) {
      setChecked(new Set(targetTeam.players.map(p => p.playerId)));
    }
  }, [isOpen, targetTeam]);

  // Build a map: playerId → teamId (for players in OTHER teams)
  const otherTeamMap: Record<string, string> = {};
  allTeams.forEach(t => {
    if (t.teamId !== targetTeam.teamId) {
      t.players.forEach(p => { otherTeamMap[p.playerId] = t.teamId; });
    }
  });

  const togglePlayer = (playerId: string) => {
    if (otherTeamMap[playerId]) return; // blocked — in another team
    const s = new Set(checked);
    s.has(playerId) ? s.delete(playerId) : s.add(playerId);
    setChecked(s);
  };

  const handleConfirm = () => {
    // Build updated teams array:
    // 1. targetTeam gets the checked players
    // 2. other teams lose any player that was just checked into targetTeam
    const selectedPlayers = participants.filter(p => checked.has(p.playerId));

    const updatedTeams = allTeams.map(t => {
      if (t.teamId === targetTeam.teamId) {
        return { ...t, players: selectedPlayers };
      }
      // Remove from other teams if now assigned to targetTeam
      return {
        ...t,
        players: t.players.filter(p => !checked.has(p.playerId)),
      };
    });

    onConfirm(updatedTeams);
    onClose();
  };

  const handleClose = () => {
    setChecked(new Set());
    onClose();
  };

  const targetTeamIndex = allTeams.findIndex(t => t.teamId === targetTeam.teamId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-t-3xl shadow-2xl animate-slideUp max-h-[85vh] flex flex-col">

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 ${TEAM_COLORS[targetTeamIndex] ?? 'bg-gray-400'}`}>
              {targetTeam.teamId}
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900">
                Assign to {targetTeam.teamName}
              </h3>
              <p className="text-xs text-gray-400">
                {participants.length} players · {checked.size} selected
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable player list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {participants.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm font-bold text-gray-400">No participants found for this event</p>
            </div>
          ) : (
            participants.map(p => {
              const blockedByTeamId = otherTeamMap[p.playerId];
              const blockedByTeamName = blockedByTeamId
                ? allTeams.find(t => t.teamId === blockedByTeamId)?.teamName
                : null;
              const isChecked = checked.has(p.playerId);
              const isBlocked = !!blockedByTeamId;

              return (
                <div
                  key={p.playerId}
                  onClick={() => togglePlayer(p.playerId)}
                  className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all select-none ${
                    isBlocked
                      ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                      : isChecked
                        ? 'border-red-500 bg-red-50 cursor-pointer'
                        : 'border-gray-200 bg-white cursor-pointer active:bg-gray-50'
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    isBlocked
                      ? 'border-gray-200 bg-gray-100'
                      : isChecked
                        ? 'bg-red-600 border-red-600'
                        : 'border-gray-300'
                  }`}>
                    {isChecked && !isBlocked && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>

                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{p.playerName}</p>
                    {p.playerType === 'guest' && (
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Guest</p>
                    )}
                  </div>

                  {/* Blocked badge — already in another team */}
                  {blockedByTeamName && (
                    <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">
                      {blockedByTeamName}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pt-3 pb-6 border-t border-gray-100 space-y-2 flex-shrink-0">
          <button
            onClick={handleConfirm}
            className="w-full py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm"
          >
            Assign {checked.size} Player{checked.size !== 1 ? 's' : ''} to {targetTeam.teamName}
          </button>
          <button
            onClick={handleClose}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-bold rounded-2xl transition-colors cursor-pointer text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}