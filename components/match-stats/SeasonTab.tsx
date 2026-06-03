'use client';

import { useState, useEffect } from 'react';
import {
  getAllSeasons,
  getSeasonPlayerStats,
  SeasonDoc,
  SeasonPlayerStat,
} from '@/lib/seasonManager';
import PlayerStatsTable from './PlayerStatsTable';
import { buildPlayerNameMap, resolveName } from '@/lib/resolvePlayerNames';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seasonLabel(season: SeasonDoc): string {
  return season.status === 'active'
    ? `Season ${season.seasonNumber} (Current)`
    : `Season ${season.seasonNumber}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SeasonTab() {
  const [seasons, setSeasons] = useState<SeasonDoc[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<SeasonDoc | null>(null);
  const [stats, setStats] = useState<SeasonPlayerStat[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetchSeasons();
  }, []);

  const fetchSeasons = async () => {
    try {
      setLoadingSeasons(true);
      const [all, nm] = await Promise.all([getAllSeasons(), buildPlayerNameMap()]);
      setNameMap(nm);
      setSeasons(all);

      const active = all.find((s) => s.status === 'active') ?? all[all.length - 1] ?? null;

      if (active) {
        setSelectedSeason(active);
        fetchStats(active.seasonId);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSeasons(false);
    }
  };

  const fetchStats = async (seasonId: string) => {
    try {
      setLoadingStats(true);
      const data = await getSeasonPlayerStats(seasonId);
      setStats(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleSelectSeason = (season: SeasonDoc) => {
    setSelectedSeason(season);
    setDropdownOpen(false);
    fetchStats(season.seasonId);
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loadingSeasons) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm p-3 sm:p-4">
          <div className="h-3 w-24 bg-gray-100 rounded animate-pulse mb-3" />
          <div className="h-12 sm:h-13 bg-gray-100 rounded-xl sm:rounded-2xl animate-pulse" />
        </div>

        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm p-3 sm:p-4 space-y-3">
          {Array(5)
            .fill(0)
            .map((_, i) => (
              <div key={i} className="flex items-center gap-2 sm:gap-3">
                <div className="w-5 h-5 bg-gray-100 rounded-md animate-pulse flex-shrink-0" />
                <div className="flex-1 h-3.5 bg-gray-100 rounded animate-pulse min-w-0" />
                {Array(3)
                  .fill(0)
                  .map((_, j) => (
                    <div
                      key={j}
                      className="w-5 sm:w-6 h-3.5 bg-gray-100 rounded animate-pulse flex-shrink-0"
                    />
                  ))}
              </div>
            ))}
        </div>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (seasons.length === 0) {
    return (
      <div className="text-center py-14 sm:py-16 px-4">
        <div className="w-14 h-14 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
          <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <p className="text-sm font-bold text-gray-400">No seasons yet</p>
        <p className="text-xs text-gray-300 mt-1">Seasons appear once matches are played</p>
      </div>
    );
  }

  // ── Resolve award names using nameMap ─────────────────────────────────────
  const forwardName = selectedSeason?.bestForward
    ? resolveName(
        selectedSeason.bestForward.playerId,
        selectedSeason.bestForward.playerName,
        nameMap
      )
    : null;

  const defenderName = selectedSeason?.bestDefender
    ? resolveName(
        selectedSeason.bestDefender.playerId,
        selectedSeason.bestDefender.playerName,
        nameMap
      )
    : null;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ── Season Selector ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm p-3 sm:p-4">
        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
          Select Season
        </p>

        <div className="relative">
          <button
            onClick={() => setDropdownOpen((p) => !p)}
            className={`w-full flex items-start sm:items-center justify-between gap-3 px-3.5 sm:px-4 py-3.5 sm:py-3.5 rounded-xl sm:rounded-2xl border-2 transition-colors cursor-pointer text-left min-h-[52px] ${
              dropdownOpen
                ? 'border-red-500 bg-red-50'
                : 'border-gray-200 bg-gray-50 active:bg-gray-100'
            }`}
          >
            <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 sm:mt-0 ${
                  selectedSeason?.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
              <div className="min-w-0">
                <span className="block text-sm sm:text-[15px] font-semibold text-gray-900 leading-tight break-words">
                  {selectedSeason ? seasonLabel(selectedSeason) : '-- Select a season --'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 self-center">
              {selectedSeason && (
                <span className="hidden xs:inline text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {selectedSeason.matchCount}/
                  {selectedSeason.status === 'active' ? '15' : selectedSeason.matchCount} matches
                </span>
              )}
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {selectedSeason && (
            <div className="mt-2 xs:hidden">
              <span className="inline-flex text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                {selectedSeason.matchCount}/
                {selectedSeason.status === 'active' ? '15' : selectedSeason.matchCount} matches
              </span>
            </div>
          )}

          {dropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-200 shadow-lg z-20 overflow-hidden">
              <div className="max-h-72 overflow-y-auto">
                {[...seasons].reverse().map((season) => (
                  <button
                    key={season.seasonId}
                    onClick={() => handleSelectSeason(season)}
                    className={`w-full flex items-start justify-between gap-3 px-3.5 sm:px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer text-left border-b border-gray-50 last:border-0 min-h-[56px] ${
                      selectedSeason?.seasonId === season.seasonId ? 'bg-red-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                          season.status === 'active' ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 leading-tight break-words">
                          {seasonLabel(season)}
                        </p>
                        {season.completedAt && (
                          <p className="text-[10px] text-gray-400 font-semibold mt-1 leading-tight">
                            Ended{' '}
                            {season.completedAt.toDate().toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="hidden sm:inline text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {season.matchCount} matches
                      </span>
                      {selectedSeason?.seasonId === season.seasonId && (
                        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Season Meta Card ────────────────────────────────────────────────── */}
      {selectedSeason && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 text-center">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Season</p>
            <p className="text-xl sm:text-2xl font-black text-gray-900">{selectedSeason.seasonNumber}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 text-center">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Matches</p>
            <p className="text-xl sm:text-2xl font-black text-gray-900">{selectedSeason.matchCount}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 text-center col-span-2 sm:col-span-1">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black ${
                selectedSeason.status === 'active'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  selectedSeason.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
              {selectedSeason.status === 'active' ? 'Live' : 'Done'}
            </span>
          </div>
        </div>
      )}

      {/* ── Progress Bar (active season only) ──────────────────────────────── */}
      {selectedSeason?.status === 'active' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3.5 sm:px-4 py-3">
          <div className="flex items-start sm:items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Season Progress
            </p>
            <p className="text-[10px] font-black text-gray-500 text-right">
              {selectedSeason.matchCount} / 15 matches
            </p>
          </div>

          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-600 rounded-full transition-all duration-500"
              style={{ width: `${(selectedSeason.matchCount / 15) * 100}%` }}
            />
          </div>

          <p className="text-[10px] text-gray-400 font-semibold mt-1.5 text-right leading-tight">
            {15 - selectedSeason.matchCount} match
            {15 - selectedSeason.matchCount !== 1 ? 'es' : ''} until season end
          </p>
        </div>
      )}

      {/* ── Awards Summary (completed season only) ─────────────────────────── */}
      {selectedSeason?.status === 'completed' &&
        (selectedSeason.bestForward || selectedSeason.bestDefender) && (
          <div className="bg-gray-900 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 space-y-3">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Season {selectedSeason.seasonNumber} Awards
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectedSeason.bestForward && forwardName && (
                <div className="bg-white/8 rounded-2xl p-3 border border-white/10 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-base">⚽</span>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide">
                      Best Forward
                    </p>
                  </div>
                  <p className="text-sm font-black text-white leading-tight break-words">
                    {forwardName}
                  </p>
                  <p className="text-[10px] text-gray-400 font-semibold mt-1 leading-tight">
                    {selectedSeason.bestForward.goalsScored} goal
                    {selectedSeason.bestForward.goalsScored !== 1 ? 's' : ''}
                  </p>
                </div>
              )}

              {selectedSeason.bestDefender && defenderName && (
                <div className="bg-white/8 rounded-2xl p-3 border border-white/10 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-base">🛡️</span>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide">
                      Best Defender
                    </p>
                  </div>
                  <p className="text-sm font-black text-white leading-tight break-words">
                    {defenderName}
                  </p>
                  <p className="text-[10px] text-gray-400 font-semibold mt-1 leading-tight">
                    {selectedSeason.bestDefender.matchesWon} win
                    {selectedSeason.bestDefender.matchesWon !== 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

      {/* ── Stats Table ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden">
        <PlayerStatsTable stats={stats} loading={loadingStats} />
      </div>
    </div>
  );
}