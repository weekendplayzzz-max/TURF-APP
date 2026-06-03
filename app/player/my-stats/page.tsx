'use client';

import { useAuth } from '@/context/AuthContext';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

type Position = 'GK' | 'DEF' | 'MID' | 'FORWARD';

interface PlayerStat {
  playerId: string;
  playerName: string;
  matchesPlayed: number;
  matchesWon: number;
  matchesDrawn: number;
  matchesLost: number;
  goalsScored: number;
}

interface GuestProfile {
  guestId: string;
  guestName?: string;
  fullName?: string;
  jerseyNumber?: number | null;
  position: Position;
}

interface UserProfile {
  userId: string;
  email?: string;
  fullName: string;
  jerseyNumber?: number | null;
  position: Position;
  guestProfiles?: GuestProfile[];
}

interface PlayerStatCard extends PlayerStat {
  roleLabel: string;
  position?: Position;
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

function StatPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'red' | 'green' | 'blue';
}) {
  const toneClass =
    tone === 'red'
      ? 'bg-red-50 text-red-600 border-red-100'
      : tone === 'green'
      ? 'bg-green-50 text-green-600 border-green-100'
      : tone === 'blue'
      ? 'bg-blue-50 text-blue-600 border-blue-100'
      : 'bg-gray-50 text-gray-700 border-gray-200';

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-500 font-semibold">{label}</span>
      <span className={`px-2.5 py-1 rounded-xl border text-xs sm:text-sm font-black tabular-nums ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

function getGoalRatio(player: PlayerStat) {
  if (!player.matchesPlayed) return 0;
  return player.goalsScored / player.matchesPlayed;
}

function getWinRate(player: PlayerStat) {
  if (!player.matchesPlayed) return 0;
  return (player.matchesWon / player.matchesPlayed) * 100;
}

function PlayerStatPanel({ player }: { player: PlayerStatCard }) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-red-600" />
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">
              {player.roleLabel}
            </p>
            <h2 className="text-lg sm:text-xl font-black text-gray-900 truncate">
              {player.playerName}
            </h2>
            <p className="text-xs text-gray-500 font-semibold">
              {player.position ?? 'Player'}
            </p>
          </div>

          <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M7 20V10m5 10V4m5 16v-7" />
            </svg>
          </div>
        </div>

        <div className="space-y-2.5">
          <StatPill label="Matches" value={player.matchesPlayed} />
          <StatPill label="Wins" value={player.matchesWon} tone="green" />
          <StatPill label="Draws" value={player.matchesDrawn} tone="blue" />
          <StatPill label="Losses" value={player.matchesLost} />
          <StatPill label="Goals" value={player.goalsScored} tone="red" />
          <StatPill label="Goals / Match" value={getGoalRatio(player).toFixed(2)} tone="red" />
          <StatPill label="Win Rate" value={`${getWinRate(player).toFixed(1)}%`} tone="blue" />
        </div>
      </div>
    </div>
  );
}

export default function MyStatsPage() {
  const { user, role, loading } = useAuth();
  const [stats, setStats] = useState<PlayerStatCard[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    const fetchMyStats = async () => {
      if (!user?.uid) return;

      try {
        setPageLoading(true);

        const profileRef = doc(db, 'userProfiles', user.uid);
        const profileSnap = await getDoc(profileRef);
        const profile = profileSnap.exists() ? (profileSnap.data() as UserProfile) : null;

        const entries: PlayerStatCard[] = [];

        const myStatsRef = doc(db, 'playerStats', user.uid);
        const myStatsSnap = await getDoc(myStatsRef);

        entries.push({
          playerId: user.uid,
          playerName:
            profile?.fullName || user.displayName || user.email?.split('@')[0] || 'Player',
          matchesPlayed: myStatsSnap.exists() ? myStatsSnap.data().matchesPlayed ?? 0 : 0,
          matchesWon: myStatsSnap.exists() ? myStatsSnap.data().matchesWon ?? 0 : 0,
          matchesDrawn: myStatsSnap.exists() ? myStatsSnap.data().matchesDrawn ?? 0 : 0,
          matchesLost: myStatsSnap.exists() ? myStatsSnap.data().matchesLost ?? 0 : 0,
          goalsScored: myStatsSnap.exists() ? myStatsSnap.data().goalsScored ?? 0 : 0,
          roleLabel: 'My Stats',
          position: profile?.position,
        });

        const guests = profile?.guestProfiles ?? [];

        const guestResults = await Promise.all(
          guests.map(async (guest) => {
            const guestRef = doc(db, 'playerStats', guest.guestId);
            const guestSnap = await getDoc(guestRef);

            return {
              playerId: guest.guestId,
              playerName: guest.fullName || guest.guestName || 'Guest Player',
              matchesPlayed: guestSnap.exists() ? guestSnap.data().matchesPlayed ?? 0 : 0,
              matchesWon: guestSnap.exists() ? guestSnap.data().matchesWon ?? 0 : 0,
              matchesDrawn: guestSnap.exists() ? guestSnap.data().matchesDrawn ?? 0 : 0,
              matchesLost: guestSnap.exists() ? guestSnap.data().matchesLost ?? 0 : 0,
              goalsScored: guestSnap.exists() ? guestSnap.data().goalsScored ?? 0 : 0,
              roleLabel: 'Linked Guest',
              position: guest.position,
            } as PlayerStatCard;
          })
        );

        setStats([...entries, ...guestResults]);
      } catch (error) {
        console.error('Failed to load my stats:', error);
      } finally {
        setPageLoading(false);
      }
    };

    if (!loading && user && role === 'player') {
      fetchMyStats();
    }
  }, [user, role, loading]);

  const totals = useMemo(() => {
    return stats.reduce(
      (acc, player) => {
        acc.matches += player.matchesPlayed;
        acc.wins += player.matchesWon;
        acc.goals += player.goalsScored;
        return acc;
      },
      { matches: 0, wins: 0, goals: 0 }
    );
  }, [stats]);

  if (loading || pageLoading) {
    return <Spinner />;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-5">
        <div>
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">
            My Stats
          </p>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">
            Personal player statistics
          </h1>
          <p className="text-sm sm:text-base text-gray-500 mt-2 max-w-2xl">
            This page shows only your player stats and any linked guest stats.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide">Profiles</p>
            <p className="text-xl sm:text-2xl font-black text-gray-900 mt-1">{stats.length}</p>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide">Matches</p>
            <p className="text-xl sm:text-2xl font-black text-gray-900 mt-1">{totals.matches}</p>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide">Goals</p>
            <p className="text-xl sm:text-2xl font-black text-gray-900 mt-1">{totals.goals}</p>
          </div>
        </div>

        {stats.length === 0 ? (
          <div className="rounded-3xl border border-gray-100 bg-white shadow-sm p-10 text-center">
            <p className="text-sm font-bold text-gray-400">No stats found</p>
            <p className="text-xs text-gray-300 mt-1">
              Stats will appear after match results are saved.
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {stats.map((player) => (
              <PlayerStatPanel key={player.playerId} player={player} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}