'use client';

import { useEffect, useMemo, useState } from 'react';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeName(name: unknown) {
  const value = typeof name === 'string' ? name.trim() : '';
  return value || 'Unnamed Player';
}

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

  useEffect(() => {
    if (isOpen) {
      setChecked(new Set(targetTeam.players.map((p) => p.playerId)));
    }
  }, [isOpen, targetTeam]);

  const normalizedParticipants = useMemo(
    () =>
      participants.map((p) => ({
        ...p,
        playerName: safeName(p.playerName),
      })),
    [participants]
  );

  const otherTeamMap = useMemo(() => {
    const map: Record<string, string> = {};

    allTeams.forEach((team) => {
      if (team.teamId !== targetTeam.teamId) {
        team.players.forEach((player) => {
          map[player.playerId] = team.teamId;
        });
      }
    });

    return map;
  }, [allTeams, targetTeam.teamId]);

  const targetTeamIndex = useMemo(
    () => allTeams.findIndex((t) => t.teamId === targetTeam.teamId),
    [allTeams, targetTeam.teamId]
  );

  const togglePlayer = (playerId: string) => {
    if (otherTeamMap[playerId]) return;

    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const selectedPlayers = normalizedParticipants.filter((p) => checked.has(p.playerId));

    const updatedTeams = allTeams.map((team) => {
      if (team.teamId === targetTeam.teamId) {
        return {
          ...team,
          players: selectedPlayers,
        };
      }

      return {
        ...team,
        players: team.players.filter((player) => !checked.has(player.playerId)),
      };
    });

    onConfirm(updatedTeams);
    handleClose();
  };

  const handleClose = () => {
    setChecked(new Set());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-t-3xl shadow-2xl animate-slideUp max-h-[85vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pt-2 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 ${
                TEAM_COLORS[targetTeamIndex] ?? 'bg-gray-400'
              }`}
            >
              {targetTeam.teamId}
            </div>

            <div className="min-w-0">
              <h3 className="text-base font-black text-gray-900 truncate">
                Assign to {targetTeam.teamName}
              </h3>
              <p className="text-xs text-gray-400 font-medium">
                {normalizedParticipants.length} players · {checked.size} selected
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {normalizedParticipants.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm font-bold text-gray-400">
                No participants found for this event
              </p>
            </div>
          ) : (
            normalizedParticipants.map((player) => {
              const blockedByTeamId = otherTeamMap[player.playerId];
              const blockedByTeamName = blockedByTeamId
                ? allTeams.find((t) => t.teamId === blockedByTeamId)?.teamName
                : null;

              const isChecked = checked.has(player.playerId);
              const isBlocked = !!blockedByTeamId;

              return (
                <button
                  key={player.playerId}
                  type="button"
                  onClick={() => togglePlayer(player.playerId)}
                  disabled={isBlocked}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left min-h-[56px] ${
                    isBlocked
                      ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                      : isChecked
                      ? 'border-red-500 bg-red-50 cursor-pointer'
                      : 'border-gray-200 bg-white cursor-pointer active:bg-gray-50'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      isBlocked
                        ? 'border-gray-200 bg-gray-100'
                        : isChecked
                        ? 'bg-red-600 border-red-600'
                        : 'border-gray-300'
                    }`}
                  >
                    {isChecked && !isBlocked && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {player.playerName}
                    </p>

                    <div className="flex items-center gap-2 mt-0.5">
                      {player.playerType === 'guest' && (
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide">
                          Guest
                        </p>
                      )}

                      {blockedByTeamName && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">
                          In {blockedByTeamName}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-5 pt-3 pb-6 border-t border-gray-100 space-y-2 flex-shrink-0">
          <button
            onClick={handleConfirm}
            className="w-full min-h-[48px] py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm"
          >
            Assign {checked.size} Player{checked.size !== 1 ? 's' : ''} to {targetTeam.teamName}
          </button>

          <button
            onClick={handleClose}
            className="w-full min-h-[48px] py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-bold rounded-2xl transition-colors cursor-pointer text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}