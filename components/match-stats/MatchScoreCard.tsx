'use client';

import { Timestamp } from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Player {
  playerId: string;
  playerName: string;
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

export interface MatchScoreCardProps {
  eventTitle: string;
  matchNumber: number;
  createdAt: Timestamp;
  teams: Team[];
  result: MatchResult | null;
  label?: string; // e.g. "Most Recent Match", "Selected Match"
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MatchScoreCard({
  eventTitle,
  matchNumber,
  createdAt,
  teams,
  result,
  label = 'Most Recent Match',
}: MatchScoreCardProps) {
  const totalGoals = result?.goalScorers.reduce((s, g) => s + g.goals, 0) ?? 0;
  const totalPlayers = teams.reduce((s, t) => s + t.players.length, 0);
  const dateStr = createdAt.toDate().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const getWinnerName = () => {
    if (!result?.winner) return null;
    if (result.winner === 'draw') return null;
    return teams.find(t => t.teamId === result.winner)?.teamName ?? null;
  };

  const winnerName = getWinnerName();
  const isDraw = result?.winner === 'draw';

  return (
    <div className="relative overflow-hidden bg-gray-900 rounded-2xl p-4 sm:p-5 text-white shadow-sm">
      {/* ── Decorative circles (same as reference) ── */}
      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border-[20px] border-red-600/20 pointer-events-none" />
      <div className="absolute right-4 -bottom-10 w-24 h-24 rounded-full border-[16px] border-red-600/10 pointer-events-none" />

      {/* ── Header ── */}
      <div className="relative flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0 pr-3">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">
            {label}
          </p>
          <p className="text-sm font-bold text-white truncate">
            {eventTitle}
            {matchNumber > 1 && (
              <span className="ml-1.5 text-xs font-semibold text-gray-400">
                Match {matchNumber}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{dateStr}</p>
        </div>
        {/* Football icon */}
        <div className="w-10 h-10 bg-red-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 3c0 0 2.5 3.5 2.5 9S12 21 12 21M12 3c0 0-2.5 3.5-2.5 9S12 21 12 21M3.6 9h16.8M3.6 15h16.8" />
          </svg>
        </div>
      </div>

      {/* ── Scoreboard ── */}
      <div className="relative mb-4">
        {teams.length === 2 ? (
          // ── Classic 2-team layout
          <div className="flex items-center gap-2">
            {/* Team A */}
            <div className="flex-1 text-center">
              <p className="text-xs text-gray-400 font-semibold mb-1 truncate">
                {teams[0].teamName}
              </p>
              <p className="text-5xl font-black text-white leading-none">
                {result?.scores[teams[0].teamId] ?? '–'}
              </p>
            </div>

            {/* VS + winner */}
            <div className="flex flex-col items-center gap-1 px-2 flex-shrink-0">
              <div className="w-px h-5 bg-white/10" />
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">vs</span>
              <div className="w-px h-5 bg-white/10" />
            </div>

            {/* Team B */}
            <div className="flex-1 text-center">
              <p className="text-xs text-gray-400 font-semibold mb-1 truncate">
                {teams[1].teamName}
              </p>
              <p className="text-5xl font-black text-white leading-none">
                {result?.scores[teams[1].teamId] ?? '–'}
              </p>
            </div>
          </div>
        ) : (
          // ── Multi-team grid
          <div className="grid grid-cols-2 gap-2">
            {teams.map(t => (
              <div key={t.teamId} className="bg-white/8 rounded-xl px-3 py-2.5 border border-white/10 text-center">
                <p className="text-xs text-gray-400 font-semibold mb-1 truncate">{t.teamName}</p>
                <p className="text-3xl font-black text-white">
                  {result?.scores[t.teamId] ?? '–'}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Winner / Draw banner */}
        {result && (
          <div className="mt-3 text-center">
            {isDraw ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-xs font-black text-gray-300">
                🤝 Draw
              </span>
            ) : winnerName ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-600/20 border border-red-600/30 rounded-full text-xs font-black text-red-300">
                🏆 {winnerName} Won
              </span>
            ) : null}
          </div>
        )}

        {!result && (
          <p className="text-center text-xs text-gray-600 font-semibold mt-2">
            Result pending
          </p>
        )}
      </div>

      {/* ── Stats row (same as reference Total In / Total Out) ── */}
      <div className="grid grid-cols-2 gap-2 relative">
        <div className="bg-white/8 rounded-xl px-3 py-2.5 border border-white/10">
          <p className="text-xs text-gray-400 mb-0.5">Total Goals</p>
          <p className="text-sm font-bold">⚽ {totalGoals}</p>
        </div>
        <div className="bg-white/8 rounded-xl px-3 py-2.5 border border-white/10">
          <p className="text-xs text-gray-400 mb-0.5">Players</p>
          <p className="text-sm font-bold">👥 {totalPlayers}</p>
        </div>
      </div>
    </div>
  );
}