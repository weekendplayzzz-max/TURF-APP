'use client';

import { useState, useEffect } from 'react';
import {
  getAllSeasons,
  getSeasonPlayerStats,
  SeasonDoc,
  SeasonPlayerStat,
} from '@/lib/seasonManager';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { buildPlayerNameMap, resolveName } from '@/lib/resolvePlayerNames';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AwardWinner {
  playerId: string;
  playerName: string;
  value: number;
  isLive: boolean;
}

interface SeasonAwards {
  seasonId: string;
  seasonNumber: number;
  status: 'active' | 'completed';
  bestForward: AwardWinner | null;
  bestDefender: AwardWinner | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildPositionMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const snap = await getDocs(collection(db, 'userProfiles'));

  snap.forEach((d) => {
    const data = d.data();
    if (!data.profileCompleted) return;

    map.set(data.userId, data.position);

    if (Array.isArray(data.guestProfiles)) {
      data.guestProfiles.forEach((g: any) => {
        if (g.guestId && g.position) map.set(g.guestId, g.position);
      });
    }
  });

  return map;
}

function computeLiveAwards(
  stats: SeasonPlayerStat[],
  positionMap: Map<string, string>
): { bestForward: AwardWinner | null; bestDefender: AwardWinner | null } {
  const forwardPos = new Set(['FORWARD', 'MID']);
  const defenderPos = new Set(['DEF', 'GK']);

  const forwards = stats.filter((s) => forwardPos.has(positionMap.get(s.playerId) ?? ''));
  const defenders = stats.filter((s) => defenderPos.has(positionMap.get(s.playerId) ?? ''));

  forwards.sort(
    (a, b) => b.goalsScored - a.goalsScored || b.matchesPlayed - a.matchesPlayed
  );
  defenders.sort(
    (a, b) => b.matchesWon - a.matchesWon || b.matchesPlayed - a.matchesPlayed
  );

  return {
    bestForward: forwards[0]
      ? {
          playerId: forwards[0].playerId,
          playerName: forwards[0].playerName,
          value: forwards[0].goalsScored,
          isLive: true,
        }
      : null,
    bestDefender: defenders[0]
      ? {
          playerId: defenders[0].playerId,
          playerName: defenders[0].playerName,
          value: defenders[0].matchesWon,
          isLive: true,
        }
      : null,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AwardCard({
  type,
  winner,
  isLive,
}: {
  type: 'forward' | 'defender';
  winner: AwardWinner | null;
  isLive: boolean;
}) {
  const isForward = type === 'forward';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-sm ${
        isForward
          ? 'bg-gradient-to-br from-red-600 via-red-700 to-red-900 border-red-500/40'
          : 'bg-gradient-to-br from-gray-800 via-gray-900 to-black border-white/10'
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_35%)] pointer-events-none" />
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full border-[16px] border-white/10 pointer-events-none" />
      <div className="absolute right-3 sm:right-4 -bottom-8 w-20 h-20 rounded-full border-[12px] border-white/5 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/12 backdrop-blur-sm border border-white/10 flex items-center justify-center flex-shrink-0">
              <span className="text-lg sm:text-xl">{isForward ? '⚽' : '🛡️'}</span>
            </div>

            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-black text-white/65 uppercase tracking-[0.18em]">
                {isForward ? 'Best Forward' : 'Best Defender'}
              </p>
              <p className="text-[11px] sm:text-xs text-white/50 font-semibold mt-0.5">
                {isForward ? 'Top scorer of the season' : 'Most wins in defense'}
              </p>
            </div>
          </div>

          {isLive && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/15 rounded-full border border-white/10 flex-shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] font-black text-white uppercase tracking-wide">
                Live
              </span>
            </div>
          )}
        </div>

        {winner ? (
          <>
            <p className="text-lg sm:text-xl font-black text-white leading-tight break-words">
              {winner.playerName}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/12 border border-white/10 text-[11px] sm:text-xs font-bold text-white">
                {isForward
                  ? `${winner.value} goal${winner.value !== 1 ? 's' : ''}`
                  : `${winner.value} win${winner.value !== 1 ? 's' : ''}`}
              </span>

              <span className="text-[11px] sm:text-xs text-white/60 font-semibold">
                {isLive ? 'Current season leader' : 'Season winner'}
              </span>
            </div>
          </>
        ) : (
          <div className="rounded-2xl bg-white/8 border border-white/10 px-3 py-3">
            <p className="text-sm font-semibold text-white/55 italic">
              No eligible players yet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AwardCardSkeleton() {
  return (
    <div className="rounded-2xl sm:rounded-3xl bg-gray-100 animate-pulse h-40 sm:h-44" />
  );
}

function PastSeasonRow({
  awards,
  isExpanded,
  onToggle,
}: {
  awards: SeasonAwards;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={onToggle}
        className={`w-full px-3.5 sm:px-4 py-3.5 sm:py-4 text-left transition-colors cursor-pointer active:bg-gray-50 ${
          isExpanded ? 'bg-gray-50/70' : 'hover:bg-gray-50'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-100 to-yellow-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-black text-amber-700">
                S{awards.seasonNumber}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm sm:text-[15px] font-black text-gray-900">
                  Season {awards.seasonNumber}
                </p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-wide">
                  Completed
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {awards.bestForward && (
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-red-50 border border-red-100 px-2 py-1 text-[10px] font-bold text-red-700">
                    <span>⚽</span>
                    <span className="truncate max-w-[100px] sm:max-w-[140px]">
                      {awards.bestForward.playerName}
                    </span>
                  </span>
                )}

                {awards.bestDefender && (
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-700">
                    <span>🛡️</span>
                    <span className="truncate max-w-[100px] sm:max-w-[140px]">
                      {awards.bestDefender.playerName}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="w-9 h-9 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center flex-shrink-0">
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-3.5 sm:px-4 pb-4 sm:pb-5 animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="bg-gradient-to-br from-red-50 to-white rounded-2xl p-3.5 border border-red-100 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm">⚽</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                    Best Forward
                  </p>
                  <p className="text-[11px] text-red-400 font-semibold">Goals leader</p>
                </div>
              </div>

              {awards.bestForward ? (
                <>
                  <p className="text-sm sm:text-[15px] font-black text-gray-900 leading-tight break-words">
                    {awards.bestForward.playerName}
                  </p>
                  <p className="text-[11px] text-gray-500 font-semibold mt-1">
                    {awards.bestForward.value} goal
                    {awards.bestForward.value !== 1 ? 's' : ''}
                  </p>
                </>
              ) : (
                <p className="text-xs text-gray-400 font-semibold italic">No data</p>
              )}
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-3.5 border border-gray-200 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm">🛡️</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    Best Defender
                  </p>
                  <p className="text-[11px] text-gray-400 font-semibold">Wins leader</p>
                </div>
              </div>

              {awards.bestDefender ? (
                <>
                  <p className="text-sm sm:text-[15px] font-black text-gray-900 leading-tight break-words">
                    {awards.bestDefender.playerName}
                  </p>
                  <p className="text-[11px] text-gray-500 font-semibold mt-1">
                    {awards.bestDefender.value} win
                    {awards.bestDefender.value !== 1 ? 's' : ''}
                  </p>
                </>
              ) : (
                <p className="text-xs text-gray-400 font-semibold italic">No data</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AwardsTab() {
  const [loading, setLoading] = useState(true);
  const [currentAwards, setCurrentAwards] = useState<SeasonAwards | null>(null);
  const [pastAwards, setPastAwards] = useState<SeasonAwards[]>([]);
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);

  useEffect(() => {
    loadAwards();
  }, []);

  const loadAwards = async () => {
    try {
      setLoading(true);

      const [allSeasons, positionMap, nameMap] = await Promise.all([
        getAllSeasons(),
        buildPositionMap(),
        buildPlayerNameMap(),
      ]);

      const past: SeasonAwards[] = [];
      let current: SeasonAwards | null = null;

      for (const season of allSeasons) {
        if (season.status === 'completed') {
          past.push({
            seasonId: season.seasonId,
            seasonNumber: season.seasonNumber,
            status: 'completed',
            bestForward: season.bestForward
              ? {
                  ...season.bestForward,
                  playerName: resolveName(
                    season.bestForward.playerId,
                    season.bestForward.playerName,
                    nameMap
                  ),
                  value: season.bestForward.goalsScored ?? 0,
                  isLive: false,
                }
              : null,
            bestDefender: season.bestDefender
              ? {
                  ...season.bestDefender,
                  playerName: resolveName(
                    season.bestDefender.playerId,
                    season.bestDefender.playerName,
                    nameMap
                  ),
                  value: season.bestDefender.matchesWon ?? 0,
                  isLive: false,
                }
              : null,
          });
        } else {
          const stats = await getSeasonPlayerStats(season.seasonId);
          const { bestForward, bestDefender } = computeLiveAwards(stats, positionMap);

          current = {
            seasonId: season.seasonId,
            seasonNumber: season.seasonNumber,
            status: 'active',
            bestForward: bestForward
              ? {
                  ...bestForward,
                  playerName: resolveName(bestForward.playerId, bestForward.playerName, nameMap),
                }
              : null,
            bestDefender: bestDefender
              ? {
                  ...bestDefender,
                  playerName: resolveName(bestDefender.playerId, bestDefender.playerName, nameMap),
                }
              : null,
          };
        }
      }

      setCurrentAwards(current);
      setPastAwards([...past].reverse());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (seasonId: string) => {
    setExpandedSeason((p) => (p === seasonId ? null : seasonId));
  };

  if (loading) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="h-3 w-40 bg-gray-100 rounded animate-pulse" />
        <AwardCardSkeleton />
        <AwardCardSkeleton />

        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm p-3 sm:p-4 space-y-3">
          {Array(3)
            .fill(0)
            .map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {currentAwards && (
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                Current leaders
              </p>
              <p className="text-sm sm:text-base font-black text-gray-900 mt-1">
                Season {currentAwards.seasonNumber}
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 border border-green-100 rounded-full flex-shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-black text-green-700 uppercase tracking-wide">
                Live
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <AwardCard type="forward" winner={currentAwards.bestForward} isLive />
            <AwardCard type="defender" winner={currentAwards.bestDefender} isLive />
          </div>
        </div>
      )}

      {!currentAwards && pastAwards.length === 0 && (
        <div className="text-center py-14 sm:py-16 px-4">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-amber-50 to-yellow-100 border border-amber-100 rounded-full flex items-center justify-center shadow-sm">
            <span className="text-2xl">🏆</span>
          </div>
          <p className="text-sm font-black text-gray-500">No awards yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Awards appear after 15 matches are played
          </p>
        </div>
      )}

      {pastAwards.length > 0 && (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-3.5 sm:px-4 py-3.5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                <span className="text-base">🏆</span>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                  Past season winners
                </p>
                <p className="text-xs text-gray-500 font-semibold mt-0.5">
                  Tap a season to view award details
                </p>
              </div>
            </div>
          </div>

          {pastAwards.map((awards) => (
            <PastSeasonRow
              key={awards.seasonId}
              awards={awards}
              isExpanded={expandedSeason === awards.seasonId}
              onToggle={() => toggleExpanded(awards.seasonId)}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.18s ease-out;
        }
      `}</style>
    </div>
  );
}