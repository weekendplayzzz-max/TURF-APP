'use client';

import { useAuth } from '@/context/AuthContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  Timestamp,
} from 'firebase/firestore';

type Position = 'GK' | 'DEF' | 'MID' | 'FORWARD';
type StatsTab = 'overview' | 'ratings' | 'matches' | 'guests';

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
  jerseyNumber?: number | null;
}

interface Player {
  playerId: string;
  playerName: string;
  playerType?: string;
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

interface MatchDetail {
  id: string;
  eventTitle: string;
  matchNumber: number;
  createdAt: Timestamp;
  teams: Team[];
  result: MatchResult | null;
}

interface MatchRatingEntry {
  matchId: string;
  eventTitle: string;
  matchNumber: number;
  date: Date | null;
  resultLabel: 'Win' | 'Draw' | 'Loss';
  goals: number;
  rating: number;
  streakBonusApplied: boolean;
}

interface EnrichedPlayerCard extends PlayerStatCard {
  matchRatings: MatchRatingEntry[];
  avgMatchRating: number;
  latestMatchRating: number | null;
  ovr: number;
  pointsFromGoals: number;
  formLabel: string;
  insight: string;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function getWinRate(player: PlayerStat) {
  if (!player.matchesPlayed) return 0;
  return (player.matchesWon / player.matchesPlayed) * 100;
}

function getGoalRatio(player: PlayerStat) {
  if (!player.matchesPlayed) return 0;
  return player.goalsScored / player.matchesPlayed;
}

function getUnbeatenRate(player: PlayerStat) {
  if (!player.matchesPlayed) return 0;
  return ((player.matchesWon + player.matchesDrawn) / player.matchesPlayed) * 100;
}

function getPointsFromGoals(goals: number) {
  return Number((goals * 0.6).toFixed(1));
}

function getPointsFromResults(player: PlayerStat) {
  return player.matchesWon * 3 + player.matchesDrawn;
}

function getOVR(avgRating: number, player: PlayerStatCard) {
  if (!player.matchesPlayed) return 0;

  const winRate = getWinRate(player);
  const goalRatio = Math.min(getGoalRatio(player), 2);
  const experience = Math.min(player.matchesPlayed / 15, 1) * 100;

  const score =
    avgRating * 7.2 +
    winRate * 0.12 +
    goalRatio * 8 +
    experience * 0.08;

  return Math.max(0, Math.min(99, Math.round(score)));
}

function getOVRLabel(ovr: number) {
  if (ovr >= 88) return 'Elite';
  if (ovr >= 75) return 'Strong';
  if (ovr >= 60) return 'Solid';
  return 'Developing';
}

function getPositionTone(position?: Position) {
  switch (position) {
    case 'GK':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    case 'DEF':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'MID':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'FORWARD':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function getRatingTone(rating: number) {
  if (rating >= 8.5) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (rating >= 7.0) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (rating >= 6.0) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

function getPlayerInsight(player: EnrichedPlayerCard) {
  if (!player.matchesPlayed) return 'No recorded matches yet.';
  if (player.avgMatchRating >= 8.2 && getGoalRatio(player) >= 1) {
    return 'High-impact performances with strong scoring output.';
  }
  if (player.avgMatchRating >= 7.5 && getWinRate(player) >= 50) {
    return 'Reliable match influence with solid results.';
  }
  if (player.latestMatchRating && player.latestMatchRating >= 8) {
    return 'Recent form is trending upward.';
  }
  if (getGoalRatio(player) >= 0.8) {
    return 'Scoring efficiency is driving the profile.';
  }
  return 'Steady development across recent matches.';
}

function calculateMatchRatingsForPlayer(
  playerId: string,
  position: Position | undefined,
  matches: MatchDetail[]
): MatchRatingEntry[] {
  const sortedMatches = [...matches]
    .filter((match) => match.result && match.result.savedAt)
    .sort((a, b) => {
      const aTime = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
      const bTime = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
      return aTime - bTime;
    });

  let consecutiveWinStreak = 0;
  const ratings: MatchRatingEntry[] = [];

  for (const match of sortedMatches) {
    const result = match.result;
    if (!result) continue;

    const team = match.teams.find((team) =>
      team.players.some((p) => p.playerId === playerId)
    );

    if (!team) continue;

    const playerGoals =
      result.goalScorers
        ?.filter((g) => g.playerId === playerId)
        .reduce((sum, g) => sum + (g.goals ?? 0), 0) ?? 0;

    let rating = 6;
    let resultLabel: 'Win' | 'Draw' | 'Loss' = 'Draw';
    let streakBonusApplied = false;

    const isDraw = result.winner === null;

    if (isDraw) {
      rating += 1;
      resultLabel = 'Draw';
      consecutiveWinStreak = 0;
    } else if (result.winner === team.teamId) {
      rating += 2;
      resultLabel = 'Win';

      if (position === 'DEF') {
        rating += 0.4;
      }

      if (consecutiveWinStreak >= 1) {
        rating += 0.5;
        streakBonusApplied = true;
      }

      consecutiveWinStreak += 1;
    } else {
      rating -= 1;
      resultLabel = 'Loss';
      consecutiveWinStreak = 0;
    }

    rating += playerGoals * 0.6;
    rating = Math.max(0, Math.min(10, Number(rating.toFixed(1))));

    ratings.push({
      matchId: match.id,
      eventTitle: match.eventTitle,
      matchNumber: match.matchNumber,
      date: match.createdAt?.toDate?.() ?? null,
      resultLabel,
      goals: playerGoals,
      rating,
      streakBonusApplied,
    });
  }

  return ratings.reverse();
}

function AnimatedNumber({
  value,
  decimals = 0,
}: {
  value: number;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;

    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / 800, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);

      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value]);

  return <span>{display.toFixed(decimals)}</span>;
}

function Spinner() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-4 border-red-100" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    </div>
  );
}

function TopBar({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="sticky top-0 z-30 bg-gray-50/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80">
      <div className="pb-3 pt-2">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-700 shadow-sm transition active:scale-[0.98]"
            aria-label="Go back"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">
              My Performance
            </p>
            <h1 className="truncate text-xl font-black text-gray-900 sm:text-2xl">
              {title}
            </h1>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBar({
  activeTab,
  setActiveTab,
}: {
  activeTab: StatsTab;
  setActiveTab: (tab: StatsTab) => void;
}) {
  const tabs: { key: StatsTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'ratings', label: 'Ratings' },
    { key: 'matches', label: 'Matches' },
    { key: 'guests', label: 'Guests' },
  ];

  return (
    <div className="sticky top-[72px] z-20 bg-gray-50/95 pb-3 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80">
      <div className="rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
        <div className="grid grid-cols-4 gap-1">
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'min-h-[44px] rounded-xl px-2 py-2.5 text-[13px] font-bold transition',
                  active
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-50 active:scale-[0.99]'
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HeroCard({ player }: { player: EnrichedPlayerCard }) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-sm">
      <div className="h-1.5 w-full bg-gradient-to-r from-red-600 via-red-500 to-orange-400" />

      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {player.jerseyNumber ? (
                <span className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-[11px] font-black text-red-600">
                  #{player.jerseyNumber}
                </span>
              ) : null}

              <span
                className={cn(
                  'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold',
                  getPositionTone(player.position)
                )}
              >
                {player.position ?? 'PLAYER'}
              </span>

              <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-bold text-gray-700">
                {player.formLabel}
              </span>
            </div>

            <h2 className="mt-3 text-[25px] font-black leading-[0.95] tracking-[-0.03em] text-gray-900 sm:text-[38px]">
              {player.playerName}
            </h2>

            <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-gray-500 sm:text-[15px]">
              {player.insight}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 self-start">
            <div className="rounded-2xl bg-gray-900 px-4 py-3 text-right text-white shadow-sm">
              <p className="text-3xl font-black leading-none tabular-nums sm:text-[34px]">
                {player.ovr > 0 ? <AnimatedNumber value={player.ovr} /> : '—'}
              </p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                OVR
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-400">
          {title}
        </p>
        {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 px-3.5 py-3.5">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-lg font-black text-gray-900 tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-gray-500">{caption}</p>
    </div>
  );
}

function ResultBar({
  wins,
  draws,
  losses,
}: {
  wins: number;
  draws: number;
  losses: number;
}) {
  const total = wins + draws + losses;
  if (!total) return <div className="h-2 w-full rounded-full bg-gray-100" />;

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="flex h-full w-full">
        <div className="bg-emerald-500" style={{ width: `${(wins / total) * 100}%` }} />
        <div className="bg-blue-400" style={{ width: `${(draws / total) * 100}%` }} />
        <div className="bg-red-400" style={{ width: `${(losses / total) * 100}%` }} />
      </div>
    </div>
  );
}

function MatchRatingList({ ratings }: { ratings: MatchRatingEntry[] }) {
  if (ratings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-4 text-center">
        <p className="text-sm font-semibold text-gray-500">No match ratings yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {ratings.map((match) => (
        <div
          key={match.matchId}
          className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3 py-3"
        >
          <div
            className={cn(
              'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border text-sm font-black tabular-nums',
              getRatingTone(match.rating)
            )}
          >
            {match.rating.toFixed(1)}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-gray-900">
              {match.eventTitle || `Match ${match.matchNumber}`}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-gray-400">
              Match #{match.matchNumber}
              {match.date
                ? ` · ${match.date.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })}`
                : ''}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-black',
                match.resultLabel === 'Win'
                  ? 'bg-emerald-50 text-emerald-700'
                  : match.resultLabel === 'Draw'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-red-50 text-red-700'
              )}
            >
              {match.resultLabel}
            </span>

            <span className="text-[10px] font-semibold text-gray-400">
              ⚽ {match.goals}
              {match.streakBonusApplied ? ' · streak' : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function GuestCompactCard({ player }: { player: EnrichedPlayerCard }) {
  return (
    <article className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-900 text-sm font-black text-white">
          {player.jerseyNumber ? `#${player.jerseyNumber}` : getInitials(player.playerName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold',
                getPositionTone(player.position)
              )}
            >
              {player.position ?? 'PLAYER'}
            </span>
          </div>

          <h3 className="mt-1 truncate text-lg font-black text-gray-900">
            {player.playerName}
          </h3>

          <p className="mt-1 text-xs font-medium text-gray-500">{player.insight}</p>
        </div>

        <div className="rounded-2xl bg-gray-50 px-3 py-2 text-center">
          <p className="text-lg font-black leading-none text-gray-900 tabular-nums">
            {player.ovr > 0 ? <AnimatedNumber value={player.ovr} /> : '—'}
          </p>
          <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">
            OVR
          </p>
        </div>
      </div>
    </article>
  );
}

function EmptyState({ message = 'No stats recorded yet' }: { message?: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl">
        ⚽
      </div>
      <p className="mt-4 text-base font-black text-gray-700">{message}</p>
      <p className="mx-auto mt-2 max-w-xs text-sm text-gray-400">
        The content for this section will appear once enough match data is available.
      </p>
    </div>
  );
}

export default function MyStatsPage() {
  const { user, role, loading } = useAuth();
  const [stats, setStats] = useState<EnrichedPlayerCard[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<StatsTab>('overview');

  useEffect(() => {
    const fetchMyStats = async () => {
      if (!user?.uid) return;

      try {
        setPageLoading(true);

        const profileRef = doc(db, 'userProfiles', user.uid);
        const profileSnap = await getDoc(profileRef);
        const profile = profileSnap.exists() ? (profileSnap.data() as UserProfile) : null;

        const pick = (snap: Awaited<ReturnType<typeof getDoc>>, key: string) => {
          if (!snap.exists()) return 0;
          const data = snap.data() as Record<string, any> | undefined;
          return data?.[key] ?? 0;
        };

        const myStatsRef = doc(db, 'playerStats', user.uid);
        const myStatsSnap = await getDoc(myStatsRef);

        const basePlayers: PlayerStatCard[] = [
          {
            playerId: user.uid,
            playerName:
              profile?.fullName ||
              user.displayName ||
              user.email?.split('@')[0] ||
              'Player',
            matchesPlayed: pick(myStatsSnap, 'matchesPlayed'),
            matchesWon: pick(myStatsSnap, 'matchesWon'),
            matchesDrawn: pick(myStatsSnap, 'matchesDrawn'),
            matchesLost: pick(myStatsSnap, 'matchesLost'),
            goalsScored: pick(myStatsSnap, 'goalsScored'),
            roleLabel: 'My Stats',
            position: profile?.position,
            jerseyNumber: profile?.jerseyNumber ?? null,
          },
        ];

        const guests = profile?.guestProfiles ?? [];

        const guestEntries = await Promise.all(
          guests.map(async (guest) => {
            const guestSnap = await getDoc(doc(db, 'playerStats', guest.guestId));

            return {
              playerId: guest.guestId,
              playerName: guest.fullName || guest.guestName || 'Guest Player',
              matchesPlayed: pick(guestSnap, 'matchesPlayed'),
              matchesWon: pick(guestSnap, 'matchesWon'),
              matchesDrawn: pick(guestSnap, 'matchesDrawn'),
              matchesLost: pick(guestSnap, 'matchesLost'),
              goalsScored: pick(guestSnap, 'goalsScored'),
              roleLabel: 'Linked Guest',
              position: guest.position,
              jerseyNumber: guest.jerseyNumber ?? null,
            } as PlayerStatCard;
          })
        );

        const allBasePlayers = [...basePlayers, ...guestEntries];

        const matchesSnap = await getDocs(collection(db, 'matches'));
        const allMatches: MatchDetail[] = matchesSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<MatchDetail, 'id'>),
        }));

        const enrichedPlayers: EnrichedPlayerCard[] = allBasePlayers.map((player) => {
          const matchRatings = calculateMatchRatingsForPlayer(
            player.playerId,
            player.position,
            allMatches
          );

          const avgMatchRating =
            matchRatings.length > 0
              ? Number(
                  (
                    matchRatings.reduce((sum, entry) => sum + entry.rating, 0) /
                    matchRatings.length
                  ).toFixed(2)
                )
              : 0;

          const latestMatchRating =
            matchRatings.length > 0 ? matchRatings[0].rating : null;

          const ovr = getOVR(avgMatchRating, player);

          const enriched: EnrichedPlayerCard = {
            ...player,
            matchRatings,
            avgMatchRating,
            latestMatchRating,
            ovr,
            pointsFromGoals: getPointsFromGoals(player.goalsScored),
            formLabel: getOVRLabel(ovr),
            insight: '',
          };

          enriched.insight = getPlayerInsight(enriched);
          return enriched;
        });

        setStats(enrichedPlayers);
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
        acc.draws += player.matchesDrawn;
        acc.losses += player.matchesLost;
        acc.goals += player.goalsScored;
        return acc;
      },
      { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0 }
    );
  }, [stats]);

  const overallWinRate =
    totals.matches > 0 ? `${((totals.wins / totals.matches) * 100).toFixed(1)}%` : '—';

  const myProfile = stats[0];
  const guestProfiles = stats.slice(1);

  if (loading || pageLoading) {
    return <Spinner />;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="mx-auto max-w-5xl px-4 py-2 sm:px-6 sm:py-4">
        <TopBar
          title="Player Statistics"
          onBack={() => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              window.history.back();
            }
          }}
        />

        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />

        {stats.length === 0 ? (
          <div className="mt-4">
            <EmptyState />
          </div>
        ) : (
          <div className="mt-4">
            {activeTab === 'overview' && myProfile && (
              <div className="space-y-4">
                <HeroCard player={myProfile} />

                <SectionCard
                  title="Overview"
                  subtitle="Only the top-level numbers that matter most."
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
  <StatCard
    label="Avg Rating"
    value={myProfile.avgMatchRating ? myProfile.avgMatchRating.toFixed(2) : '—'}
    caption="Average match rating"
  />
  <StatCard
    label="Win Rate"
    value={`${getWinRate(myProfile).toFixed(1)}%`}
    caption="Matches won"
  />
  <StatCard
    label="GPG Ratio"
    value={getGoalRatio(myProfile).toFixed(2)}
    caption="Goals per game"
  />
  <StatCard
    label="Goals Scored"
    value={String(myProfile.goalsScored)}
    caption="Total goals"
  />
</div>
                </SectionCard>
              </div>
            )}

            {activeTab === 'ratings' && myProfile && (
              <div className="space-y-4">
                <SectionCard
                  title="Ratings"
                  subtitle="Focused only on rating metrics and recent rated matches."
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      label="Avg Rating"
                      value={myProfile.avgMatchRating ? myProfile.avgMatchRating.toFixed(2) : '—'}
                      caption="Average match rating"
                    />
                    <StatCard
                      label="Latest"
                      value={myProfile.latestMatchRating ? myProfile.latestMatchRating.toFixed(1) : '—'}
                      caption="Most recent match"
                    />
                    <StatCard
                      label="OVR"
                      value={String(myProfile.ovr)}
                      caption="Overall player value"
                    />
                    <StatCard
                      label="Form"
                      value={myProfile.formLabel}
                      caption="Current player tier"
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Match Based Rating"
                  subtitle="Per-match ratings calculated from your custom rules."
                >
                  <MatchRatingList ratings={myProfile.matchRatings} />
                </SectionCard>
              </div>
            )}

            {activeTab === 'matches' && myProfile && (
              <div className="space-y-4">
                <SectionCard
                  title="Match Results"
                  subtitle="Outcome breakdown and match-derived performance stats."
                >
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                          Results Profile
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-600">
                          One visual summary of wins, draws, and losses.
                        </p>
                      </div>
                      <p className="text-xs font-bold text-gray-400">
                        {myProfile.matchesPlayed} matches
                      </p>
                    </div>

                    <div className="mt-4">
                      <ResultBar
                        wins={myProfile.matchesWon}
                        draws={myProfile.matchesDrawn}
                        losses={myProfile.matchesLost}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-bold text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        {myProfile.matchesWon} wins
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-blue-400" />
                        {myProfile.matchesDrawn} draws
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-red-400" />
                        {myProfile.matchesLost} losses
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      label="Matches Won"
                      value={String(myProfile.matchesWon)}
                      caption="Total wins"
                    />
                    <StatCard
                      label="Matches Lost"
                      value={String(myProfile.matchesLost)}
                      caption="Total losses"
                    />
                    <StatCard
                      label="Matches Drawn"
                      value={String(myProfile.matchesDrawn)}
                      caption="Total draws"
                    />
                    <StatCard
                      label="Points"
                      value={String(getPointsFromResults(myProfile))}
                      caption="From wins and draws"
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Scoring Impact"
                  subtitle="Goals and goal-based contribution."
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      label="Goals Scored"
                      value={String(myProfile.goalsScored)}
                      caption="All matches"
                    />
                    <StatCard
                      label="GPG Ratio"
                      value={getGoalRatio(myProfile).toFixed(2)}
                      caption="Goals per game"
                    />
                    <StatCard
                      label="Goal Points"
                      value={myProfile.pointsFromGoals.toFixed(1)}
                      caption="0.6 per goal"
                    />
                    <StatCard
                      label="Unbeaten"
                      value={`${getUnbeatenRate(myProfile).toFixed(1)}%`}
                      caption="Matches not lost"
                    />
                  </div>
                </SectionCard>
              </div>
            )}

            {activeTab === 'guests' && (
              <div className="space-y-4">
                {guestProfiles.length > 0 ? (
                  <SectionCard
                    title="Guest Profiles"
                    subtitle="Linked guest players and their ratings."
                  >
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {guestProfiles.map((player) => (
                        <GuestCompactCard key={player.playerId} player={player} />
                      ))}
                    </div>
                  </SectionCard>
                ) : (
                  <EmptyState message="No linked guest profiles yet" />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}