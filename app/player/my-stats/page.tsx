'use client';

import { useAuth } from '@/context/AuthContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import {
  type EnrichedPlayerCard,
  type MatchDetail,
  type StatsTab,
  type UserProfile,
  cn,
  enrichPlayerStats,
  formatOverallWinRate,
  getGoalRatio,
  getInitials,
  getPointsFromResults,
  getPositionTone,
  getRatingTone,
  getStatsTotals,
  getUnbeatenRate,
  getWinRate,
} from '@/lib/stats';

function AnimatedNumber({
  value,
  decimals = 0,
  suffix = '',
}: {
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;

    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / 900, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value]);

  return (
    <span>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
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
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
        <div className="grid min-w-[320px] grid-cols-4 gap-1">
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

function getPerformanceLabel(player: EnrichedPlayerCard) {
  const winRate = getWinRate(player);
  const gpg = getGoalRatio(player);
  const unbeaten = getUnbeatenRate(player);

  if (player.matchesPlayed === 0) return 'Ready to start';
  if (winRate >= 70 && gpg >= 1) return 'Match winner';
  if (winRate >= 60) return 'Strong form';
  if (unbeaten >= 70) return 'Hard to beat';
  if (gpg >= 1) return 'Goal threat';
  if (winRate >= 45) return 'Solid contributor';
  return 'Building momentum';
}

function getPerformanceInsight(player: EnrichedPlayerCard) {
  const winRate = getWinRate(player);
  const gpg = getGoalRatio(player);
  const points = getPointsFromResults(player);

  if (player.matchesPlayed === 0) {
    return 'Your season story starts here. Once match results are saved, this page will turn into your personal performance dashboard.';
  }

  if (winRate >= 70 && gpg >= 1) {
    return `You are delivering elite output with ${winRate.toFixed(1)}% wins and ${gpg.toFixed(2)} goals per match.`;
  }

  if (winRate >= 60) {
    return `You are helping your side get results consistently, earning ${points} points from ${player.matchesPlayed} matches.`;
  }

  if (gpg >= 1) {
    return `You are making a direct scoring impact with ${player.goalsScored} goals in ${player.matchesPlayed} matches.`;
  }

  if (getUnbeatenRate(player) >= 70) {
    return `Your profile shows resilience, staying unbeaten in ${getUnbeatenRate(player).toFixed(1)}% of matches.`;
  }

  return `Every match adds to your progress. Right now you have ${player.goalsScored} goals and ${points} points contributing to your season.`;
}

function ProgressMiniBar({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold text-gray-500">{label}</p>
        <p className="text-[11px] font-black text-gray-700">{value}%</p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={cn('h-full rounded-full transition-all duration-700', colorClass)}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function HeroCard({
  player,
  teamWinRate,
}: {
  player: EnrichedPlayerCard;
  teamWinRate: string;
}) {
  const winRate = getWinRate(player);
  const unbeatenRate = getUnbeatenRate(player);
  const goalRatio = getGoalRatio(player);

  return (
    <section className="overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-sm">
      <div className="h-1.5 w-full bg-gradient-to-r from-red-600 via-red-500 to-orange-400" />

      <div className="bg-gradient-to-br from-gray-950 via-gray-900 to-red-950 p-4 text-white sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {player.jerseyNumber ? (
                <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-[11px] font-black text-white/90">
                  #{player.jerseyNumber}
                </span>
              ) : null}

              <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/90">
                {player.position ?? 'PLAYER'}
              </span>

              <span className="inline-flex rounded-full border border-red-300/20 bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-100">
                {getPerformanceLabel(player)}
              </span>
            </div>

            <h2 className="mt-3 text-[26px] font-black leading-[0.96] tracking-[-0.03em] text-white sm:text-[40px]">
              {player.playerName}
            </h2>

            <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-white/70 sm:text-[15px]">
              {getPerformanceInsight(player)}
            </p>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/10 px-4 py-3 text-right shadow-sm backdrop-blur">
            <p className="text-3xl font-black leading-none tabular-nums text-white sm:text-[34px]">
              {player.ovr !== null && player.ovr > 0 ? (
                <AnimatedNumber value={player.ovr} />
              ) : (
                '—'
              )}
            </p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-white/50">
              OVR
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Win Rate</p>
            <p className="mt-1 text-lg font-black text-white tabular-nums">
              <AnimatedNumber value={winRate} decimals={1} suffix="%" />
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Goals / Match</p>
            <p className="mt-1 text-lg font-black text-white tabular-nums">
              <AnimatedNumber value={goalRatio} decimals={2} />
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Unbeaten</p>
            <p className="mt-1 text-lg font-black text-white tabular-nums">
              <AnimatedNumber value={unbeatenRate} decimals={1} suffix="%" />
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Team Rate</p>
            <p className="mt-1 text-lg font-black text-white tabular-nums">{teamWinRate}</p>
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
  accent = 'default',
}: {
  label: string;
  value: string;
  caption: string;
  accent?: 'default' | 'red' | 'green' | 'blue' | 'dark';
}) {
  const accentClass =
    accent === 'red'
      ? 'bg-red-50 border-red-100'
      : accent === 'green'
      ? 'bg-emerald-50 border-emerald-100'
      : accent === 'blue'
      ? 'bg-blue-50 border-blue-100'
      : accent === 'dark'
      ? 'bg-gray-900 border-gray-900 text-white'
      : 'bg-gray-50/70 border-gray-100';

  const labelClass = accent === 'dark' ? 'text-white/45' : 'text-gray-400';
  const valueClass = accent === 'dark' ? 'text-white' : 'text-gray-900';
  const captionClass = accent === 'dark' ? 'text-white/65' : 'text-gray-500';

  return (
    <div className={cn('rounded-2xl border px-3.5 py-3.5', accentClass)}>
      <p className={cn('text-[10px] font-black uppercase tracking-[0.18em]', labelClass)}>
        {label}
      </p>
      <p className={cn('mt-2 text-lg font-black tabular-nums', valueClass)}>{value}</p>
      <p className={cn('mt-1 text-[11px] font-medium', captionClass)}>{caption}</p>
    </div>
  );
}

function HighlightStrip({ player }: { player: EnrichedPlayerCard }) {
  const winRate = getWinRate(player);
  const goalRatio = getGoalRatio(player);
  const unbeaten = getUnbeatenRate(player);
  const ppm = player.matchesPlayed ? getPointsFromResults(player) / player.matchesPlayed : 0;

  const highlights = [
    {
      label: 'Best Signal',
      value:
        winRate >= goalRatio * 100
          ? `${winRate.toFixed(1)}% Win Rate`
          : `${goalRatio.toFixed(2)} Goals / Match`,
      tone: 'red',
    },
    {
      label: 'Resilience',
      value: `${unbeaten.toFixed(1)}% Unbeaten`,
      tone: 'blue',
    },
    {
      label: 'Points / Match',
      value: ppm.toFixed(2),
      tone: 'green',
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {highlights.map((item) => (
        <div
          key={item.label}
          className={cn(
            'rounded-2xl border px-4 py-4',
            item.tone === 'red' && 'border-red-100 bg-red-50',
            item.tone === 'blue' && 'border-blue-100 bg-blue-50',
            item.tone === 'green' && 'border-emerald-100 bg-emerald-50'
          )}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">
            {item.label}
          </p>
          <p className="mt-2 text-base font-black text-gray-900">{item.value}</p>
        </div>
      ))}
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

  if (!total) {
    return <div className="h-2.5 w-full rounded-full bg-gray-100" />;
  }

  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="flex h-full w-full">
        <div className="bg-emerald-500" style={{ width: `${(wins / total) * 100}%` }} />
        <div className="bg-blue-400" style={{ width: `${(draws / total) * 100}%` }} />
        <div className="bg-red-400" style={{ width: `${(losses / total) * 100}%` }} />
      </div>
    </div>
  );
}

function MatchRatingList({
  ratings,
}: {
  ratings: EnrichedPlayerCard['matchRatings'];
}) {
  if (ratings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
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

            <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-700">
              {getPerformanceLabel(player)}
            </span>
          </div>

          <h3 className="mt-1 truncate text-lg font-black text-gray-900">
            {player.playerName}
          </h3>

          <p className="mt-1 text-xs font-medium text-gray-500">{getPerformanceInsight(player)}</p>
        </div>

        <div className="rounded-2xl bg-gray-50 px-3 py-2 text-center">
          <p className="text-lg font-black leading-none text-gray-900 tabular-nums">
            {player.ovr !== null && player.ovr > 0 ? (
              <AnimatedNumber value={player.ovr} />
            ) : (
              '—'
            )}
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
        Once match results and ratings are added, this page will show your complete performance story.
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

        const myStatsRef = doc(db, 'playerStats', user.uid);
        const myStatsSnap = await getDoc(myStatsRef);
        const myStatsData = myStatsSnap.exists()
          ? (myStatsSnap.data() as Record<string, unknown>)
          : null;

        const basePlayers = [
          {
            playerId: user.uid,
            playerName:
              profile?.fullName ||
              user.displayName ||
              user.email?.split('@')[0] ||
              'Player',
            matchesPlayed: Number(myStatsData?.matchesPlayed ?? 0),
            matchesWon: Number(myStatsData?.matchesWon ?? 0),
            matchesDrawn: Number(myStatsData?.matchesDrawn ?? 0),
            matchesLost: Number(myStatsData?.matchesLost ?? 0),
            goalsScored: Number(myStatsData?.goalsScored ?? 0),
            roleLabel: 'My Stats',
            position: profile?.position,
            jerseyNumber: profile?.jerseyNumber ?? null,
          },
        ];

        const guests = profile?.guestProfiles ?? [];

        const guestEntries = await Promise.all(
          guests.map(async (guest) => {
            const guestSnap = await getDoc(doc(db, 'playerStats', guest.guestId));
            const guestStatsData = guestSnap.exists()
              ? (guestSnap.data() as Record<string, unknown>)
              : null;

            return {
              playerId: guest.guestId,
              playerName: guest.fullName || guest.guestName || 'Guest Player',
              matchesPlayed: Number(guestStatsData?.matchesPlayed ?? 0),
              matchesWon: Number(guestStatsData?.matchesWon ?? 0),
              matchesDrawn: Number(guestStatsData?.matchesDrawn ?? 0),
              matchesLost: Number(guestStatsData?.matchesLost ?? 0),
              goalsScored: Number(guestStatsData?.goalsScored ?? 0),
              roleLabel: 'Linked Guest',
              position: guest.position,
              jerseyNumber: guest.jerseyNumber ?? null,
            };
          })
        );

        const allBasePlayers = [...basePlayers, ...guestEntries];

        const matchesSnap = await getDocs(collection(db, 'matches'));
        const allMatches: MatchDetail[] = matchesSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<MatchDetail, 'id'>),
        }));

        const enrichedPlayers = enrichPlayerStats(allBasePlayers, allMatches);
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

  const totals = useMemo(() => getStatsTotals(stats), [stats]);
  const overallWinRate = useMemo(() => formatOverallWinRate(stats), [stats]);

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
                <HeroCard player={myProfile} teamWinRate={overallWinRate} />

                <SectionCard
                  title="Highlights"
                  subtitle="A quick read on the parts of your game that stand out most."
                >
                  <HighlightStrip player={myProfile} />
                </SectionCard>

                <SectionCard
                  title="Overview"
                  subtitle="Only the numbers that help players understand impact fast."
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      label="Avg Rating"
                      value={myProfile.avgMatchRating ? myProfile.avgMatchRating.toFixed(2) : '—'}
                      caption="Average match rating"
                      accent="dark"
                    />
                    <StatCard
                      label="Win Rate"
                      value={`${getWinRate(myProfile).toFixed(1)}%`}
                      caption="Matches won"
                      accent="green"
                    />
                    <StatCard
                      label="Goals / Match"
                      value={getGoalRatio(myProfile).toFixed(2)}
                      caption="Scoring consistency"
                      accent="red"
                    />
                    <StatCard
                      label="Points"
                      value={String(getPointsFromResults(myProfile))}
                      caption="From wins and draws"
                      accent="blue"
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <StatCard
                      label="Matches"
                      value={String(myProfile.matchesPlayed)}
                      caption="Total appearances"
                    />
                    <StatCard
                      label="Wins"
                      value={String(myProfile.matchesWon)}
                      caption="Matches won"
                    />
                    <StatCard
                      label="Draws"
                      value={String(myProfile.matchesDrawn)}
                      caption="Matches drawn"
                    />
                    <StatCard
                      label="Losses"
                      value={String(myProfile.matchesLost)}
                      caption="Matches lost"
                    />
                    <StatCard
                      label="Unbeaten"
                      value={`${getUnbeatenRate(myProfile).toFixed(1)}%`}
                      caption="Matches not lost"
                    />
                  </div>

                  <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                          Performance Shape
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-600">
                          A simple breakdown of how your results are trending.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <ProgressMiniBar
                        label="Winning strength"
                        value={Number(getWinRate(myProfile).toFixed(1))}
                        colorClass="bg-emerald-500"
                      />
                      <ProgressMiniBar
                        label="Unbeaten control"
                        value={Number(getUnbeatenRate(myProfile).toFixed(1))}
                        colorClass="bg-blue-500"
                      />
                      <ProgressMiniBar
                        label="Scoring output"
                        value={Math.min(100, Number((getGoalRatio(myProfile) * 100).toFixed(1)))}
                        colorClass="bg-red-500"
                      />
                    </div>
                  </div>
                </SectionCard>
              </div>
            )}

            {activeTab === 'ratings' && myProfile && (
              <div className="space-y-4">
                <SectionCard
                  title="Ratings"
                  subtitle="A clean view of how your match performances are being scored."
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      label="Avg Rating"
                      value={myProfile.avgMatchRating ? myProfile.avgMatchRating.toFixed(2) : '—'}
                      caption="Average match rating"
                      accent="dark"
                    />
                    <StatCard
                      label="Latest"
                      value={
                        myProfile.latestMatchRating !== null && myProfile.latestMatchRating !== undefined
                          ? myProfile.latestMatchRating.toFixed(1)
                          : '—'
                      }
                      caption="Most recent match"
                      accent="blue"
                    />
                    <StatCard
                      label="OVR"
                      value={myProfile.ovr !== null ? String(myProfile.ovr) : '—'}
                      caption="Overall player value"
                      accent="red"
                    />
                    <StatCard
                      label="Form"
                      value={myProfile.formLabel}
                      caption="Current player tier"
                      accent="green"
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Match Ratings"
                  subtitle="Every rated performance, with result and goals shown together."
                >
                  <MatchRatingList ratings={myProfile.matchRatings} />
                </SectionCard>
              </div>
            )}

            {activeTab === 'matches' && myProfile && (
              <div className="space-y-4">
                <SectionCard
                  title="Match Results"
                  subtitle="Outcome breakdown and match-derived contribution."
                >
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                          Results Profile
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-600">
                          {getWinRate(myProfile).toFixed(1)}% personal win rate
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
                      accent="green"
                    />
                    <StatCard
                      label="Matches Lost"
                      value={String(myProfile.matchesLost)}
                      caption="Total losses"
                      accent="red"
                    />
                    <StatCard
                      label="Matches Drawn"
                      value={String(myProfile.matchesDrawn)}
                      caption="Total draws"
                      accent="blue"
                    />
                    <StatCard
                      label="Points"
                      value={String(getPointsFromResults(myProfile))}
                      caption="From wins and draws"
                      accent="dark"
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Scoring Impact"
                  subtitle="Goal output, consistency, and overall profile context."
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      label="Goals Scored"
                      value={String(myProfile.goalsScored)}
                      caption="Across all matches"
                      accent="red"
                    />
                    <StatCard
                      label="Goals / Match"
                      value={getGoalRatio(myProfile).toFixed(2)}
                      caption="Scoring frequency"
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
                      accent="blue"
                    />
                  </div>

                  <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                      Team Snapshot
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <StatCard
                        label="Profiles"
                        value={String(stats.length)}
                        caption="You + guests"
                      />
                      <StatCard
                        label="All Matches"
                        value={String(totals.matches)}
                        caption="Across profiles"
                      />
                      <StatCard
                        label="All Wins"
                        value={String(totals.wins)}
                        caption="Combined"
                      />
                      <StatCard
                        label="All Goals"
                        value={String(totals.goals)}
                        caption="Combined output"
                      />
                      <StatCard
                        label="All Win Rate"
                        value={overallWinRate}
                        caption="Combined record"
                      />
                    </div>
                  </div>
                </SectionCard>
              </div>
            )}

            {activeTab === 'guests' && (
              <div className="space-y-4">
                {guestProfiles.length > 0 ? (
                  <SectionCard
                    title="Guest Profiles"
                    subtitle="Linked guest players and their enriched performance view."
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