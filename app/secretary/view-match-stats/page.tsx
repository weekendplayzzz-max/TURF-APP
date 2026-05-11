'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, query,
  orderBy, Timestamp,
} from 'firebase/firestore';
import MatchScoreCard from '@/components/match-stats/MatchScoreCard';
import PlayerStatsTable from '@/components/match-stats/PlayerStatsTable';
import type { PlayerStat } from '@/components/match-stats/PlayerStatsTable';
import MatchDetailView from '@/components/match-stats/MatchDetailView';
import type { MatchDetail } from '@/components/match-stats/MatchDetailView';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'match';

// ─── Spinner ──────────────────────────────────────────────────────────────────

function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
        <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

function InlineSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
        <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MatchStatsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // ── Overview tab data
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [recentMatch, setRecentMatch] = useState<MatchDetail | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // ── Match tab data
  const [matches, setMatches] = useState<MatchDetail[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchesFetched, setMatchesFetched] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchDetail | null>(null);

  // ─── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  // ─── Fetch overview data (playerStats + most recent match) ─────────────────
  useEffect(() => {
    if (!user) return;

    const fetchOverview = async () => {
      try {
        // Fetch player stats
        const statsSnap = await getDocs(collection(db, 'playerStats'));
        const statsList: PlayerStat[] = [];
        statsSnap.forEach(d => {
          const data = d.data();
          statsList.push({
            playerId:      data.playerId,
            playerName:    data.playerName,
            matchesPlayed: data.matchesPlayed ?? 0,
            matchesWon:    data.matchesWon    ?? 0,
            matchesDrawn:  data.matchesDrawn  ?? 0,
            matchesLost:   data.matchesLost   ?? 0,
            goalsScored:   data.goalsScored   ?? 0,
          });
        });
        setPlayerStats(statsList);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingStats(false);
      }
    };

    const fetchRecentMatch = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'matches'), orderBy('createdAt', 'desc'))
        );
        if (!snap.empty) {
          const d = snap.docs[0];
          const data = d.data();
          setRecentMatch({
            id:          d.id,
            eventTitle:  data.eventTitle,
            matchNumber: data.matchNumber ?? 1,
            createdAt:   data.createdAt,
            teams:       data.teams ?? [],
            result:      data.result ?? null,
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingRecent(false);
      }
    };

    fetchOverview();
    fetchRecentMatch();
  }, [user]);

  // ─── Fetch all matches (match tab — lazy) ──────────────────────────────────
  const fetchMatches = useCallback(async () => {
    try {
      setLoadingMatches(true);
      const snap = await getDocs(
        query(collection(db, 'matches'), orderBy('createdAt', 'desc'))
      );
      const list: MatchDetail[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({
          id:          d.id,
          eventTitle:  data.eventTitle,
          matchNumber: data.matchNumber ?? 1,
          createdAt:   data.createdAt,
          teams:       data.teams ?? [],
          result:      data.result ?? null,
        });
      });
      setMatches(list);
      setMatchesFetched(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  const handleOpenDropdown = () => {
    if (!matchesFetched) fetchMatches();
    setDropdownOpen(p => !p);
  };

  // ─── Guard ─────────────────────────────────────────────────────────────────
  if (loading || !user) return <PageSpinner />;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ══════════════ STICKY HEADER ══════════════ */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4">

          {/* Top row */}
          <div className="flex items-center gap-3 py-3">
            <button
              onClick={() => router.back()}
              className="p-2.5 rounded-xl bg-gray-100 active:bg-gray-200 cursor-pointer flex-shrink-0"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

            <div className="w-7 h-7 flex-shrink-0">
              <Image src="/logo.png" alt="Logo" width={28} height={28} className="w-full h-full object-contain" />
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-black text-gray-900 leading-tight">Match Stats</h1>
              <p className="text-xs text-gray-400">
                {activeTab === 'overview' ? 'Player standings & records' : 'Browse individual matches'}
              </p>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer border-b-2 -mb-px ${
                activeTab === 'overview'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Overview
            </button>

            <button
              onClick={() => setActiveTab('match')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer border-b-2 -mb-px ${
                activeTab === 'match'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" strokeWidth={2} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 3c0 0 2.5 3.5 2.5 9S12 21 12 21M12 3c0 0-2.5 3.5-2.5 9S12 21 12 21M3.6 9h16.8M3.6 15h16.8" />
              </svg>
              Match Based
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════ CONTENT ══════════════ */}
      <div className="max-w-lg mx-auto px-3 py-4 pb-24 space-y-4">

        {/* ────────────────────────────────────────────────────────────────
            TAB 1 — OVERVIEW
        ──────────────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="animate-fadeIn space-y-4">

            {/* Recent match score card */}
            {loadingRecent ? (
              <div className="h-48 bg-gray-900/10 rounded-2xl animate-pulse" />
            ) : recentMatch ? (
              <MatchScoreCard
                eventTitle={recentMatch.eventTitle}
                matchNumber={recentMatch.matchNumber}
                createdAt={recentMatch.createdAt}
                teams={recentMatch.teams}
                result={recentMatch.result}
                label="Most Recent Match"
              />
            ) : (
              <div className="relative overflow-hidden bg-gray-900 rounded-2xl p-5 text-white">
                <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border-[20px] border-red-600/20 pointer-events-none" />
                <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">Most Recent Match</p>
                <p className="text-sm font-bold text-gray-500">No matches played yet</p>
              </div>
            )}

            {/* Player stats table */}
            <div>
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1 mb-2">
                Player Standings
              </p>
              <PlayerStatsTable
                stats={playerStats}
                loading={loadingStats}
              />
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────
            TAB 2 — MATCH BASED
        ──────────────────────────────────────────────────────────────── */}
        {activeTab === 'match' && (
          <div className="animate-fadeIn space-y-4">

            {/* Match dropdown */}
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

                {/* Dropdown */}
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
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        {matches.map(m => {
                          const label = m.matchNumber > 1
                            ? `${m.eventTitle} – Match ${m.matchNumber}`
                            : m.eventTitle;
                          return (
                            <button
                              key={m.id}
                              onClick={() => { setSelectedMatch(m); setDropdownOpen(false); }}
                              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer text-left border-b border-gray-50 last:border-0"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">{label}</p>
                                <p className="text-xs text-gray-400">
                                  {m.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  {' · '}{m.teams.reduce((s, t) => s + t.players.length, 0)} players
                                </p>
                              </div>
                              <span className={`flex-shrink-0 ml-3 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                                m.result ? 'bg-gray-900 text-white' : 'bg-yellow-100 text-yellow-700'
                              }`}>
                                {m.result ? 'Done' : 'Pending'}
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

            {/* Match detail */}
            {selectedMatch ? (
              <MatchDetailView match={selectedMatch} />
            ) : (
              <div className="text-center py-12">
                <div className="w-14 h-14 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" strokeWidth={2} />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 3c0 0 2.5 3.5 2.5 9S12 21 12 21M12 3c0 0-2.5 3.5-2.5 9S12 21 12 21M3.6 9h16.8M3.6 15h16.8" />
                  </svg>
                </div>
                <p className="text-sm font-bold text-gray-400">Select a match above</p>
                <p className="text-xs text-gray-300 mt-1">View detailed stats for any match</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Animations ── */}
      <style jsx>{`
        @keyframes fadeIn    { from { opacity: 0 }                              to { opacity: 1 } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        .animate-fadeIn    { animation: fadeIn    0.2s  ease-out; }
        .animate-slideDown { animation: slideDown 0.2s  ease-out; }
      `}</style>
    </div>
  );
}