'use client';

import { useState } from 'react';
import { resolveName } from '@/lib/resolvePlayerNames';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerStat {
  playerId: string;
  playerName: string;
  matchesPlayed: number;
  matchesWon: number;
  matchesDrawn: number;
  matchesLost: number;
  goalsScored: number;
}

type SortKey = 'played' | 'won' | 'drawn' | 'lost' | 'goals';

interface SortOption {
  key: SortKey;
  label: string;
  icon: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SORT_OPTIONS: SortOption[] = [
  { key: 'played', label: 'Most Played', icon: '🏟️' },
  { key: 'goals',  label: 'Top Scorers', icon: '⚽' },
  { key: 'won',    label: 'Most Won',    icon: '🏆' },
  { key: 'drawn',  label: 'Most Drawn',  icon: '🤝' },
  { key: 'lost',   label: 'Most Lost',   icon: '📉' },
];

// ─── Sort Logic ───────────────────────────────────────────────────────────────

function sortStats(data: PlayerStat[], key: SortKey): PlayerStat[] {
  return [...data].sort((a, b) => {
    switch (key) {
      case 'played':
        if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
        return b.goalsScored - a.goalsScored;
      case 'goals':
        if (b.goalsScored !== a.goalsScored) return b.goalsScored - a.goalsScored;
        return b.matchesPlayed - a.matchesPlayed;
      case 'won':
        if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
        return b.goalsScored - a.goalsScored;
      case 'drawn':
        if (b.matchesDrawn !== a.matchesDrawn) return b.matchesDrawn - a.matchesDrawn;
        return b.goalsScored - a.goalsScored;
      case 'lost':
        if (b.matchesLost !== a.matchesLost) return b.matchesLost - a.matchesLost;
        return b.goalsScored - a.goalsScored;
      default:
        return 0;
    }
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PlayerStatsTableProps {
  stats: PlayerStat[];
  loading: boolean;
  nameMap?: Map<string, string>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlayerStatsTable({
  stats,
  loading,
  nameMap = new Map(),
}: PlayerStatsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('played');

  const sorted = sortStats(stats, sortKey);

  const topValue = (() => {
    if (sorted.length === 0) return 0;
    switch (sortKey) {
      case 'played': return sorted[0].matchesPlayed;
      case 'goals':  return sorted[0].goalsScored;
      case 'won':    return sorted[0].matchesWon;
      case 'drawn':  return sorted[0].matchesDrawn;
      case 'lost':   return sorted[0].matchesLost;
    }
  })();

  const getActiveValue = (p: PlayerStat) => {
    switch (sortKey) {
      case 'played': return p.matchesPlayed;
      case 'goals':  return p.goalsScored;
      case 'won':    return p.matchesWon;
      case 'drawn':  return p.matchesDrawn;
      case 'lost':   return p.matchesLost;
    }
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SORT_OPTIONS.map(o => (
            <div key={o.key} className="h-7 w-24 bg-gray-100 rounded-full animate-pulse flex-shrink-0" />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-2 px-1 py-1.5">
            <div className="w-5 h-5 bg-gray-100 rounded-md animate-pulse flex-shrink-0" />
            <div className="flex-1 h-3.5 bg-gray-100 rounded animate-pulse" />
            {[...Array(5)].map((_, j) => (
              <div key={j} className="w-6 h-3.5 bg-gray-100 rounded animate-pulse flex-shrink-0" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (stats.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 3c0 0 2.5 3.5 2.5 9S12 21 12 21M12 3c0 0-2.5 3.5-2.5 9S12 21 12 21M3.6 9h16.8M3.6 15h16.8" />
          </svg>
        </div>
        <p className="text-sm font-bold text-gray-400">No stats yet</p>
        <p className="text-xs text-gray-300 mt-1">Stats will appear once matches are played</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">

      {/* ── Sort Pills ── */}
      <div className="px-3 pt-3 pb-2.5 border-b border-gray-100">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
          Sort By
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {SORT_OPTIONS.map(option => (
            <button
              key={option.key}
              onClick={() => setSortKey(option.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap flex-shrink-0 transition-colors cursor-pointer ${
                sortKey === option.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 active:bg-gray-200'
              }`}
            >
              <span className="text-[11px]">{option.icon}</span>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <table className="w-full table-fixed">
        <colgroup>
          <col style={{ width: '36px' }} />
          <col />
          <col style={{ width: '32px' }} />
          <col style={{ width: '28px' }} />
          <col style={{ width: '28px' }} />
          <col style={{ width: '28px' }} />
          <col style={{ width: '38px' }} />
        </colgroup>

        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left pl-3 pr-1 py-2 text-[9px] font-black text-gray-400 uppercase tracking-wide">
              #
            </th>
            <th className="text-left px-1 py-2 text-[9px] font-black text-gray-400 uppercase tracking-wide">
              Name
            </th>
            <th className={`text-center px-0.5 py-2 text-[9px] font-black uppercase tracking-wide ${
              sortKey === 'played' ? 'text-gray-900' : 'text-gray-400'
            }`}>
              MP
            </th>
            <th className={`text-center px-0.5 py-2 text-[9px] font-black uppercase tracking-wide ${
              sortKey === 'won' ? 'text-gray-900' : 'text-gray-400'
            }`}>
              W
            </th>
            <th className={`text-center px-0.5 py-2 text-[9px] font-black uppercase tracking-wide ${
              sortKey === 'drawn' ? 'text-gray-900' : 'text-gray-400'
            }`}>
              D
            </th>
            <th className={`text-center px-0.5 py-2 text-[9px] font-black uppercase tracking-wide ${
              sortKey === 'lost' ? 'text-gray-900' : 'text-gray-400'
            }`}>
              L
            </th>
            <th className={`text-center pr-3 pl-0.5 py-2 text-[9px] font-black uppercase tracking-wide ${
              sortKey === 'goals' ? 'text-gray-900' : 'text-gray-400'
            }`}>
              G
            </th>
          </tr>
        </thead>

        <tbody>
          {sorted.map((player, idx) => {
            const isTopRank = getActiveValue(player) === topValue && topValue > 0;
            const isEven = idx % 2 === 0;
            const displayName = resolveName(player.playerId, player.playerName, nameMap);

            return (
              <tr
                key={player.playerId}
                className={`border-b border-gray-50 last:border-0 ${
                  isEven ? 'bg-white' : 'bg-gray-50/40'
                }`}
              >
                {/* Rank */}
                <td className="pl-3 pr-1 py-2.5">
                  {isTopRank ? (
                    <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black bg-red-600 text-white">
                      {idx + 1}
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black bg-gray-100 text-gray-400">
                      {idx + 1}
                    </div>
                  )}
                </td>

                {/* Name */}
                <td className="px-1 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {isTopRank && (
                      <div className="w-0.5 h-4 bg-red-500 rounded-full flex-shrink-0" />
                    )}
                    <p className={`text-xs font-bold truncate ${
                      isTopRank ? 'text-gray-900' : 'text-gray-600'
                    }`}>
                      {displayName}
                    </p>
                  </div>
                </td>

                {/* MP */}
                <td className="px-0.5 py-2.5 text-center">
                  <span className={`text-xs tabular-nums ${
                    sortKey === 'played'
                      ? 'font-black text-gray-900'
                      : 'font-semibold text-gray-400'
                  }`}>
                    {player.matchesPlayed}
                  </span>
                </td>

                {/* W */}
                <td className="px-0.5 py-2.5 text-center">
                  <span className={`text-xs tabular-nums ${
                    sortKey === 'won'
                      ? 'font-black text-gray-900'
                      : 'font-semibold text-gray-400'
                  }`}>
                    {player.matchesWon}
                  </span>
                </td>

                {/* D */}
                <td className="px-0.5 py-2.5 text-center">
                  <span className={`text-xs tabular-nums ${
                    sortKey === 'drawn'
                      ? 'font-black text-gray-900'
                      : 'font-semibold text-gray-400'
                  }`}>
                    {player.matchesDrawn}
                  </span>
                </td>

                {/* L */}
                <td className="px-0.5 py-2.5 text-center">
                  <span className={`text-xs tabular-nums ${
                    sortKey === 'lost'
                      ? 'font-black text-gray-900'
                      : 'font-semibold text-gray-400'
                  }`}>
                    {player.matchesLost}
                  </span>
                </td>

                {/* Goals */}
                <td className="pr-3 pl-0.5 py-2.5 text-center">
                  {player.goalsScored > 0 ? (
                    <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums ${
                      sortKey === 'goals'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {player.goalsScored}
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-300 font-semibold">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Footer ── */}
      <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50">
        <p className="text-[9px] font-semibold text-gray-400 text-center">
          {stats.length} player{stats.length !== 1 ? 's' : ''} · {SORT_OPTIONS.find(o => o.key === sortKey)?.label}
        </p>
      </div>
    </div>
  );
}