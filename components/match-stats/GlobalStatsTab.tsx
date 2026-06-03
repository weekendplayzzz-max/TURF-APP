"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import PlayerStatsTable from "./PlayerStatsTable";

type Position = "GK" | "DEF" | "MID" | "FORWARD";

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
  fullName: string;
  position: Position;
  guestProfiles?: GuestProfile[];
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

function getWinPercentage(player: PlayerStat) {
  if (!player.matchesPlayed) return 0;
  return player.matchesWon / player.matchesPlayed;
}

function getGoalRatio(player: PlayerStat) {
  if (!player.matchesPlayed) return 0;
  return player.goalsScored / player.matchesPlayed;
}

function StatBadge({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "red" | "blue" | "green";
}) {
  const toneClass =
    tone === "red"
      ? "bg-red-50 text-red-600 border-red-100"
      : tone === "blue"
      ? "bg-blue-50 text-blue-600 border-blue-100"
      : tone === "green"
      ? "bg-green-50 text-green-600 border-green-100"
      : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-500 font-semibold">{label}</span>
      <span
        className={`px-2.5 py-1 rounded-xl border text-xs sm:text-sm font-black tabular-nums ${toneClass}`}
      >
        {value}
      </span>
    </div>
  );
}

function LeaderCard({
  title,
  subtitle,
  player,
  accent = "red",
  showWinRate = false,
}: {
  title: string;
  subtitle: string;
  player: PlayerStat | null;
  accent?: "red" | "blue";
  showWinRate?: boolean;
}) {
  const accentClasses =
    accent === "red"
      ? {
          ring: "from-red-500 to-red-600",
          soft: "bg-red-50 border-red-100",
          dot: "bg-red-500",
          iconBg: "bg-red-100",
          iconText: "text-red-600",
        }
      : {
          ring: "from-blue-500 to-blue-600",
          soft: "bg-blue-50 border-blue-100",
          dot: "bg-blue-500",
          iconBg: "bg-blue-100",
          iconText: "text-blue-600",
        };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className={`h-1.5 w-full bg-gradient-to-r ${accentClasses.ring}`} />

      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-4">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${accentClasses.iconBg}`}
          >
            {accent === "red" ? (
              <svg
                className={`w-5 h-5 ${accentClasses.iconText}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.2}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.02 3.138a1 1 0 00.95.69h3.3c.969 0 1.371 1.24.588 1.81l-2.67 1.94a1 1 0 00-.363 1.118l1.02 3.138c.3.921-.755 1.688-1.538 1.118l-2.67-1.94a1 1 0 00-1.176 0l-2.67 1.94c-.783.57-1.838-.197-1.539-1.118l1.02-3.138a1 1 0 00-.363-1.118l-2.67-1.94c-.783-.57-.38-1.81.588-1.81h3.3a1 1 0 00.95-.69l1.02-3.138z"
                />
              </svg>
            ) : (
              <svg
                className={`w-5 h-5 ${accentClasses.iconText}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-11px font-black text-gray-400 uppercase tracking-widest mb-1">
              {title}
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">{subtitle}</p>
          </div>
        </div>

        {player ? (
          <div className="space-y-4">
            <div className={`rounded-2xl border p-3.5 ${accentClasses.soft}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${accentClasses.dot}`} />
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-black text-gray-900 truncate">
                    {player.playerName}
                  </p>
                  <p className="text-xs text-gray-500 font-semibold">
                    Current all-time leader
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              {accent === "red" ? (
                <>
                  <StatBadge label="Goals" value={player.goalsScored} tone="red" />
                  <StatBadge
                    label="GPG Ratio"
                    value={getGoalRatio(player).toFixed(2)}
                    tone="red"
                  />
                  <StatBadge label="Matches" value={player.matchesPlayed} />
                  <StatBadge label="Wins" value={player.matchesWon} tone="green" />
                </>
              ) : (
                <>
                  <StatBadge label="Wins" value={player.matchesWon} tone="blue" />
                  {showWinRate && (
                    <StatBadge
                      label="Win Rate"
                      value={`${(getWinPercentage(player) * 100).toFixed(1)}%`}
                      tone="blue"
                    />
                  )}
                  <StatBadge label="Goals" value={player.goalsScored} />
                  <StatBadge label="Matches" value={player.matchesPlayed} />
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white border border-gray-200 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"
                />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-400">No stats yet</p>
            <p className="text-xs text-gray-300 mt-1">
              This section will update once match results are saved.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GlobalStatsTab() {
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [positionMap, setPositionMap] = useState<Record<string, Position>>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const [statsSnap, profilesSnap] = await Promise.all([
          getDocs(collection(db, "playerStats")),
          getDocs(collection(db, "userProfiles")),
        ]);

        const statsList: PlayerStat[] = [];
        statsSnap.forEach((docSnap) => {
          const data = docSnap.data();
          statsList.push({
            playerId: data.playerId,
            playerName: data.playerName,
            matchesPlayed: data.matchesPlayed ?? 0,
            matchesWon: data.matchesWon ?? 0,
            matchesDrawn: data.matchesDrawn ?? 0,
            matchesLost: data.matchesLost ?? 0,
            goalsScored: data.goalsScored ?? 0,
          });
        });

        const positions: Record<string, Position> = {};
        profilesSnap.forEach((docSnap) => {
          const data = docSnap.data() as UserProfile;

          if (data.userId && data.position) {
            positions[data.userId] = data.position;
          }

          (data.guestProfiles ?? []).forEach((guest) => {
            if (guest.guestId && guest.position) {
              positions[guest.guestId] = guest.position;
            }
          });
        });

        setStats(statsList);
        setPositionMap(positions);
      } catch (error) {
        console.error("Failed to load global stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const topScorer = useMemo(() => {
    if (!stats.length) return null;

    return [...stats].sort((a, b) => {
      if (b.goalsScored !== a.goalsScored) return b.goalsScored - a.goalsScored;
      if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
      return b.matchesPlayed - a.matchesPlayed;
    })[0];
  }, [stats]);

  const bestDefender = useMemo(() => {
    const defenders = stats.filter((player) => {
      const position = positionMap[player.playerId];
      return position === "DEF" || position === "GK";
    });

    if (!defenders.length) return null;

    return [...defenders].sort((a, b) => {
      if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;

      const winPctDiff = getWinPercentage(b) - getWinPercentage(a);
      if (winPctDiff !== 0) return winPctDiff;

      if (b.goalsScored !== a.goalsScored) return b.goalsScored - a.goalsScored;

      return b.matchesPlayed - a.matchesPlayed;
    })[0];
  }, [stats, positionMap]);

  if (loading) {
    return <Spinner />;
  }

  return (
    <div className="space-y-4 sm:space-y-5 animate-fadeIn">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <LeaderCard
          title="Top Scorer"
          subtitle="Highest goals scored across all recorded matches."
          player={topScorer}
          accent="red"
        />

        <LeaderCard
          title="Best Defender"
          subtitle="Top defender or goalkeeper based on total wins."
          player={bestDefender}
          accent="blue"
          showWinRate
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-11px font-black text-gray-400 uppercase tracking-widest mb-1">
              Leaderboard
            </p>
            <h3 className="text-base sm:text-lg font-black text-gray-900">
              Player Rankings
            </h3>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-bold text-gray-500">
              Live overall stats
            </span>
          </div>
        </div>

        <PlayerStatsTable stats={stats} loading={false} />
      </div>
    </div>
  );
}