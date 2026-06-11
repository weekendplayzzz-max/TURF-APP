'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore';

type Position = 'GK' | 'DEF' | 'MID' | 'FORWARD';

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

interface TeamPlayer {
  playerId: string;
  playerName: string;
  playerType?: string;
}

interface Team {
  teamId: string;
  teamName: string;
  players: TeamPlayer[];
}

interface MatchEntry {
  id: string;
  eventTitle: string;
  matchNumber: number;
  createdAt: Timestamp;
  teams: Team[];
  result: MatchResult | null;
}

interface UserProfileDoc {
  fullName?: string;
  email?: string;
  jerseyNumber?: number | null;
  position?: Position;
  guestProfiles?: Array<{
    guestId: string;
    guestName?: string;
    fullName?: string;
    jerseyNumber?: number | null;
    position: Position;
  }>;
}

interface PlayerStatDoc {
  matchesPlayed?: number;
  matchesWon?: number;
  matchesDrawn?: number;
  matchesLost?: number;
  goalsScored?: number;
}

interface GlobalPlayer {
  playerId: string;
  playerName: string;
  position?: Position;
  jerseyNumber?: number | null;
  matchesPlayed: number;
  matchesWon: number;
  matchesDrawn: number;
  matchesLost: number;
  goalsScored: number;
  avgMatchRating: number;
  ovr: number | null;
  mvpScore: number;
}

interface MatchRatingEntry {
  rating: number;
  resultLabel: 'Win' | 'Draw' | 'Loss';
  goals: number;
}

const PAGE_SIZE = 12;
const POSITION_FILTERS: Array<'ALL' | Position> = ['ALL', 'GK', 'DEF', 'MID', 'FORWARD'];

// ─── UI helpers ──────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-4 border-red-600/15" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    </div>
  );
}

function CompactStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-3 py-2.5 sm:px-3.5 sm:py-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
      <p className="mt-1 text-sm sm:text-base font-black text-gray-900 leading-none">{value}</p>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-wide transition-colors ${
        active
          ? 'border-red-600 bg-red-600 text-white'
          : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 active:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );
}

// ─── Pure math helpers ────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: number, min: number, max: number) {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: () => Date }).toDate === 'function'
  ) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
}

function getCreatedAtTime(match: MatchEntry) {
  return toDateSafe(match.createdAt)?.getTime() ?? 0;
}

function getSafeTeams(match: MatchEntry) {
  return Array.isArray(match.teams) ? match.teams : [];
}

function getSafeGoalScorers(result: MatchResult | null | undefined) {
  return Array.isArray(result?.goalScorers) ? result.goalScorers : [];
}

function getPlayerTeam(match: MatchEntry, playerId: string) {
  return getSafeTeams(match).find((team) =>
    (team.players ?? []).some((p) => p.playerId === playerId)
  );
}

function getPlayedMatchesForPlayer(playerId: string, matches: MatchEntry[]) {
  return matches.filter((match) => {
    if (!match.result) return false;
    return getSafeTeams(match).some((team) =>
      (team.players ?? []).some((p) => p.playerId === playerId)
    );
  });
}

function getWinRate(player: Pick<GlobalPlayer, 'matchesPlayed' | 'matchesWon'>) {
  if (!player.matchesPlayed) return 0;
  return (player.matchesWon / player.matchesPlayed) * 100;
}

function getGoalRatio(player: Pick<GlobalPlayer, 'matchesPlayed' | 'goalsScored'>) {
  if (!player.matchesPlayed) return 0;
  return player.goalsScored / player.matchesPlayed;
}

function getUnbeatenRate(
  player: Pick<GlobalPlayer, 'matchesPlayed' | 'matchesWon' | 'matchesDrawn'>
) {
  if (!player.matchesPlayed) return 0;
  return ((player.matchesWon + player.matchesDrawn) / player.matchesPlayed) * 100;
}

function getLossRate(player: Pick<GlobalPlayer, 'matchesPlayed' | 'matchesLost'>) {
  if (!player.matchesPlayed) return 0;
  return (player.matchesLost / player.matchesPlayed) * 100;
}

function getDrawRate(player: Pick<GlobalPlayer, 'matchesPlayed' | 'matchesDrawn'>) {
  if (!player.matchesPlayed) return 0;
  return (player.matchesDrawn / player.matchesPlayed) * 100;
}

function getTeamScore(result: MatchResult, teamId: string) {
  return Number(result?.scores?.[teamId] ?? 0);
}

function getPlayerGoalsInMatch(match: MatchEntry, playerId: string) {
  const result = match.result;
  if (!result) return 0;
  return getSafeGoalScorers(result)
    .filter((g) => g.playerId === playerId)
    .reduce((sum, g) => sum + safeNumber(g.goals), 0);
}

function hasGoalScoringStreak(previousGoalMatches: boolean[], currentGoals: number) {
  if (currentGoals <= 0) return false;
  if (previousGoalMatches.length === 0) return false;
  return previousGoalMatches[previousGoalMatches.length - 1] === true;
}

function getCurrentWinStreak(previousResults: Array<'Win' | 'Draw' | 'Loss'>): number {
  let streak = 0;
  for (let i = previousResults.length - 1; i >= 0; i--) {
    if (previousResults[i] === 'Win') streak += 1;
    else break;
  }
  return streak;
}

function getWinStreakBonus(streak: number): number {
  if (streak <= 0) return 0;
  if (streak === 1) return 0.5;
  if (streak === 2) return 1.0;
  return Number((1.0 + (streak - 2) * 0.2).toFixed(2));
}

function getTopScorerIdsFromTotals(goalTotals: Map<string, number>) {
  let topGoals = 0;
  goalTotals.forEach((goals) => { if (goals > topGoals) topGoals = goals; });
  if (topGoals <= 0) return new Set<string>();
  const leaders = new Set<string>();
  goalTotals.forEach((goals, id) => { if (goals === topGoals) leaders.add(id); });
  return leaders;
}

function getAttackerPositiveGoalBonus(goals: number) {
  let bonus = 0;
  for (let i = 1; i <= goals; i++) {
    if (i === 1) bonus += 0.5;
    else if (i === 2) bonus += 0.8;
    else bonus += 1.5;
  }
  return bonus;
}

function getAttackerLossGoalBonus(goals: number) {
  let bonus = 0;
  for (let i = 1; i <= goals; i++) {
    if (i === 1) bonus += 0.5;
    else if (i === 2) bonus += 0.8;
    else bonus += 1.5;
  }
  return bonus;
}

// ─── OVR sub-scores (mirrored from stats.ts) ─────────────────────────────────

function getRecentFormScore(matchRatings: MatchRatingEntry[]) {
  if (matchRatings.length === 0) return 0;
  const latestFive = matchRatings.slice(0, 5);
  const weights = [1.35, 1.2, 1.05, 0.9, 0.75];
  let weightedSum = 0;
  let totalWeight = 0;
  latestFive.forEach((entry, index) => {
    const weight = weights[index] ?? 0.7;
    weightedSum += entry.rating * weight;
    totalWeight += weight;
  });
  const weightedAverage = totalWeight ? weightedSum / totalWeight : 0;
  return normalize(weightedAverage, 5.5, 9.5);
}

function getConsistencyScore(matchRatings: MatchRatingEntry[]) {
  if (matchRatings.length <= 1) return 0.35;
  const ratings = matchRatings.map((e) => e.rating);
  const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
  const variance = ratings.reduce((s, v) => s + (v - avg) ** 2, 0) / ratings.length;
  return clamp(1 - Math.sqrt(variance) / 2.5, 0, 1);
}

function getExperienceFactor(mp: number) {
  if (mp <= 0) return 0;
  if (mp === 1) return 0.15;
  if (mp === 2) return 0.22;
  if (mp === 3) return 0.28;
  if (mp === 4) return 0.34;
  if (mp === 5) return 0.40;
  if (mp === 6) return 0.46;
  if (mp <= 8) return 0.50;
  if (mp <= 10) return 0.57;
  if (mp <= 12) return 0.63;
  if (mp <= 15) return 0.70;
  if (mp <= 18) return 0.76;
  if (mp <= 22) return 0.82;
  if (mp <= 27) return 0.87;
  if (mp <= 35) return 0.92;
  if (mp <= 50) return 0.96;
  return 1;
}

function getExperienceCap(mp: number) {
  if (mp <= 0) return 0;
  if (mp === 1) return 44;
  if (mp === 2) return 47;
  if (mp === 3) return 50;
  if (mp === 4) return 53;
  if (mp === 5) return 56;
  if (mp === 6) return 59;
  if (mp <= 8) return 63;
  if (mp <= 10) return 67;
  if (mp <= 12) return 71;
  if (mp <= 15) return 74;
  if (mp <= 18) return 78;
  if (mp <= 22) return 82;
  if (mp <= 27) return 85;
  if (mp <= 35) return 89;
  if (mp <= 50) return 93;
  return 96;
}

function getGoalContributionScore(player: GlobalPlayer) {
  const gr = getGoalRatio(player);
  if (player.position === 'FORWARD') return normalize(Math.min(gr, 2.2), 0, 1.4);
  if (player.position === 'MID') return normalize(Math.min(gr, 1.6), 0, 0.95);
  if (player.position === 'DEF') return normalize(Math.min(gr, 0.75), 0, 0.35);
  if (player.position === 'GK') return normalize(Math.min(gr, 0.35), 0, 0.12);
  return normalize(Math.min(gr, 1.5), 0, 1);
}

function getResultImpactScore(player: GlobalPlayer) {
  const wr = getWinRate(player);
  const ubr = getUnbeatenRate(player);
  const dr = getDrawRate(player);
  if (player.position === 'GK')
    return clamp(normalize(wr, 35, 80) * 0.3 + normalize(ubr, 45, 90) * 0.55 + normalize(dr, 0, 35) * 0.15, 0, 1);
  if (player.position === 'DEF')
    return clamp(normalize(wr, 35, 80) * 0.32 + normalize(ubr, 45, 88) * 0.52 + normalize(dr, 0, 35) * 0.16, 0, 1);
  if (player.position === 'MID')
    return clamp(normalize(wr, 30, 78) * 0.42 + normalize(ubr, 40, 86) * 0.34 + normalize(dr, 0, 35) * 0.24, 0, 1);
  return clamp(normalize(wr, 30, 75) * 0.46 + normalize(ubr, 38, 82) * 0.26 + normalize(dr, 0, 35) * 0.1, 0, 1);
}

function getRatingCoreScore(avgRating: number) {
  return normalize(avgRating, 5.8, 8.9);
}

function getCleanSheetRateForPlayer(
  playerId: string,
  position: Position | undefined,
  matches: MatchEntry[]
) {
  if (position !== 'GK' && position !== 'DEF') return 0;
  const played = getPlayedMatchesForPlayer(playerId, matches);
  if (played.length === 0) return 0;
  let cleanSheets = 0;
  played.forEach((match) => {
    const result = match.result;
    if (!result) return;
    const playerTeam = getPlayerTeam(match, playerId);
    if (!playerTeam) return;
    const opponents = getSafeTeams(match).filter((t) => t.teamId !== playerTeam.teamId);
    const opponentGoals = opponents.reduce((sum, t) => sum + getTeamScore(result, t.teamId), 0);
    if (opponentGoals === 0) cleanSheets += 1;
  });
  return (cleanSheets / played.length) * 100;
}

function getDefensiveAnchorScore(player: GlobalPlayer, matches: MatchEntry[]) {
  if (player.position !== 'GK' && player.position !== 'DEF') return 0;
  const csr = getCleanSheetRateForPlayer(player.playerId, player.position, matches);
  const ubr = getUnbeatenRate(player);
  const lr = getLossRate(player);
  const wr = getWinRate(player);
  if (player.position === 'GK') {
    return clamp(
      normalize(csr, 10, 55) * 0.5 + normalize(ubr, 40, 88) * 0.24 +
      normalize(wr, 30, 78) * 0.1 + (1 - normalize(lr, 15, 60)) * 0.16,
      0, 1
    );
  }
  return clamp(
    normalize(csr, 8, 50) * 0.42 + normalize(ubr, 40, 86) * 0.26 +
    normalize(wr, 30, 76) * 0.12 + (1 - normalize(lr, 18, 62)) * 0.2,
    0, 1
  );
}

function getTopScorerLeadershipScore(player: GlobalPlayer, allPlayers: GlobalPlayer[]) {
  if (!player.matchesPlayed || allPlayers.length === 0) return 0;
  const highestGoals = Math.max(...allPlayers.map((p) => p.goalsScored), 0);
  if (highestGoals <= 0) return 0;
  const isTopScorer = player.goalsScored === highestGoals;
  const gapRatio = player.goalsScored / highestGoals;
  const gr = getGoalRatio(player);
  if (player.position === 'FORWARD')
    return clamp((isTopScorer ? 0.45 : 0) + normalize(gapRatio, 0.45, 1) * 0.3 + normalize(gr, 0.25, 1.2) * 0.18, 0, 1);
  if (player.position === 'MID')
    return clamp((isTopScorer ? 0.34 : 0) + normalize(gapRatio, 0.4, 1) * 0.28 + normalize(gr, 0.15, 0.85) * 0.2, 0, 1);
  if (player.position === 'DEF')
    return clamp((isTopScorer ? 0.12 : 0) + normalize(gapRatio, 0.35, 1) * 0.18 + normalize(gr, 0.05, 0.35) * 0.14, 0, 1);
  if (player.position === 'GK')
    return clamp((isTopScorer ? 0.06 : 0) + normalize(gapRatio, 0.3, 1) * 0.12 + normalize(gr, 0.02, 0.15) * 0.08, 0, 1);
  return clamp((isTopScorer ? 0.3 : 0) + normalize(gapRatio, 0.4, 1) * 0.25 + normalize(gr, 0.15, 1) * 0.18, 0, 1);
}

function getSmallSamplePenalty(matchesPlayed: number) {
  if (matchesPlayed >= 10) return 0;
  return (10 - matchesPlayed) * 0.65;
}

function getRoleBonus(player: GlobalPlayer, topScorerImpact: number, defensiveAnchor: number) {
  let bonus = 0;
  if (
    (player.position === 'FORWARD' || player.position === 'MID') &&
    player.matchesPlayed >= 10 &&
    topScorerImpact >= 0.72
  ) bonus += 1.5;
  if (
    (player.position === 'GK' || player.position === 'DEF') &&
    player.matchesPlayed >= 5 &&
    defensiveAnchor >= 0.72
  ) bonus += 1.5;
  return bonus;
}

function getOVR(
  avgRating: number,
  matchRatings: MatchRatingEntry[],
  player: GlobalPlayer,
  allPlayers: GlobalPlayer[],
  matches: MatchEntry[]
): number | null {
  if (!player.matchesPlayed) return null;

  const mp = player.matchesPlayed;
  const expFactor = getExperienceFactor(mp);
  const expCap = getExperienceCap(mp);

  const ratingCore = getRatingCoreScore(avgRating);
  const recentForm = getRecentFormScore(matchRatings);
  const consistency = getConsistencyScore(matchRatings);
  const resultImpact = getResultImpactScore(player);
  const goalImpact = getGoalContributionScore(player);
  const topScorerImpact = getTopScorerLeadershipScore(player, allPlayers);
  const defensiveAnchor = getDefensiveAnchorScore(player, matches);

  let blended = 0;
  switch (player.position) {
    case 'GK':
      blended = ratingCore * 0.24 + recentForm * 0.12 + consistency * 0.15 +
        resultImpact * 0.22 + defensiveAnchor * 0.24 + topScorerImpact * 0.01 + goalImpact * 0.02;
      break;
    case 'DEF':
      blended = ratingCore * 0.24 + recentForm * 0.12 + consistency * 0.15 +
        resultImpact * 0.21 + defensiveAnchor * 0.21 + topScorerImpact * 0.02 + goalImpact * 0.05;
      break;
    case 'MID':
      blended = ratingCore * 0.25 + recentForm * 0.17 + consistency * 0.14 +
        resultImpact * 0.18 + goalImpact * 0.16 + topScorerImpact * 0.1;
      break;
    case 'FORWARD':
    default:
      blended = ratingCore * 0.23 + recentForm * 0.18 + consistency * 0.12 +
        resultImpact * 0.14 + goalImpact * 0.23 + topScorerImpact * 0.1;
      break;
  }

  let ovr = 40 + blended * 54 * expFactor;
  ovr -= getSmallSamplePenalty(mp);
  ovr += getRoleBonus(player, topScorerImpact, defensiveAnchor);
  ovr = Math.min(ovr, expCap);
  return clamp(Math.round(ovr), 40, 99);
}

function getOVRLabel(ovr: number | null): string {
  if (ovr === null) return '—';
  if (ovr >= 90) return 'Elite';
  if (ovr >= 80) return 'Strong';
  if (ovr >= 68) return 'Solid';
  if (ovr >= 55) return 'Developing';
  return 'Rising';
}

// ─── Match rating engine (mirrored from stats.ts) ────────────────────────────

function calculateMatchRatingsForPlayer(
  playerId: string,
  position: Position | undefined,
  matches: MatchEntry[]
): MatchRatingEntry[] {
  const sortedMatches = [...matches]
    .filter((m) => m.result && m.result.savedAt)
    .sort((a, b) => getCreatedAtTime(a) - getCreatedAtTime(b));

  const ratings: MatchRatingEntry[] = [];
  const previousResults: Array<'Win' | 'Draw' | 'Loss'> = [];
  const previousGoalMatches: boolean[] = [];
  const cumulativeGoalTotals = new Map<string, number>();
  let isFirstMatchForPlayer = true;

  for (const match of sortedMatches) {
    const result = match.result;
    if (!result) continue;

    const teams = getSafeTeams(match);
    const team = getPlayerTeam(match, playerId);
    const topScorerIdsBeforeMatch = getTopScorerIdsFromTotals(cumulativeGoalTotals);

    if (!team) {
      teams.forEach((teamItem) => {
        (teamItem.players ?? []).forEach((tp) => {
          const g = getPlayerGoalsInMatch(match, tp.playerId);
          if (g > 0)
            cumulativeGoalTotals.set(tp.playerId, (cumulativeGoalTotals.get(tp.playerId) ?? 0) + g);
        });
      });
      continue;
    }

    const playerGoals = getPlayerGoalsInMatch(match, playerId);
    const isDraw = result.winner === null || result.winner === 'draw';
    const isWin = result.winner === team.teamId;
    const isLoss = !isDraw && !isWin;

    let resultLabel: 'Win' | 'Draw' | 'Loss' = 'Draw';
    if (isWin) resultLabel = 'Win';
    if (isLoss) resultLabel = 'Loss';

    const isDefensiveRole = position === 'DEF' || position === 'GK';
    const isAttackingRole = position === 'MID' || position === 'FORWARD';

    // Step 1: result base
    let rating = 6;
    if (isWin) rating += 2;
    if (isDraw) rating += 1;
    if (isLoss) rating -= 1;

    // Step 2: attacking role
    if (isAttackingRole) {
      const hasScoringStreak = hasGoalScoringStreak(previousGoalMatches, playerGoals);

      if (topScorerIdsBeforeMatch.has(playerId) && playerGoals > 0) {
        rating += 0.8;
      }

      if (isWin || isDraw) {
        rating += getAttackerPositiveGoalBonus(playerGoals);
        if (hasScoringStreak) rating += 1;
      }

      if (isLoss && playerGoals > 0) {
        if (playerGoals >= 4) {
          rating = 10;
        } else {
          rating += getAttackerLossGoalBonus(playerGoals);
          if (hasScoringStreak) rating += 1;
          if (playerGoals >= 3) rating = Math.max(rating, 8.5);
          else if (playerGoals >= 2) rating = Math.max(rating, 7.5);
        }
      }
    }

    // Step 3: defensive role
    if (isDefensiveRole) {
      if (isWin) {
        if (isFirstMatchForPlayer) rating += 0.5;
        rating += 1.0;
        if (position === 'GK') rating += 1.0;

        const streak = getCurrentWinStreak(previousResults);
        if (streak >= 1) rating += getWinStreakBonus(streak);

        if (position === 'DEF' && playerGoals > 0) rating = 10;
        if (position === 'GK' && playerGoals > 0) rating = 10;
      }

      if (isDraw && playerGoals > 0) rating = 10;

      if (isLoss && playerGoals > 0) rating += playerGoals * 0.8;

      // GK clean sheet bonus
      if (position === 'GK') {
        const opp = teams.find((t) => t.teamId !== team.teamId);
        const oppScore = opp ? getTeamScore(result, opp.teamId) : 0;
        if (oppScore === 0 && !isLoss) rating += 1.25;
      }

      // Team efficiency bonus
      const teamScore = getTeamScore(result, team.teamId);
      const oppTeam = teams.find((t) => t.teamId !== team.teamId);
      const oppScore = oppTeam ? getTeamScore(result, oppTeam.teamId) : 0;
      if (teamScore > 0 && oppScore < teamScore / 2) rating += 0.6;
    }

    rating = clamp(Number(rating.toFixed(2)), 0, 10);

    ratings.push({ rating, resultLabel, goals: playerGoals });
    previousResults.push(resultLabel);
    previousGoalMatches.push(playerGoals > 0);
    isFirstMatchForPlayer = false;

    teams.forEach((teamItem) => {
      (teamItem.players ?? []).forEach((tp) => {
        const g = getPlayerGoalsInMatch(match, tp.playerId);
        if (g > 0)
          cumulativeGoalTotals.set(tp.playerId, (cumulativeGoalTotals.get(tp.playerId) ?? 0) + g);
      });
    });
  }

  return ratings.reverse();
}

function getAverageMatchRating(matchRatings: MatchRatingEntry[]) {
  if (matchRatings.length === 0) return 0;
  return Number(
    (matchRatings.reduce((s, e) => s + e.rating, 0) / matchRatings.length).toFixed(2)
  );
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function getMvpScore(player: GlobalPlayer) {
  const score =
    (player.ovr ?? 40) * 0.58 +
    normalize(getWinRate(player), 30, 90) * 18 +
    normalize(getGoalRatio(player), 0, 1.8) * 14 +
    normalize(getUnbeatenRate(player), 40, 95) * 10;
  return Number(score.toFixed(2));
}

function getMvpTag(topPlayer: GlobalPlayer | null) {
  if (!topPlayer) return 'No MVP yet';
  const ovr = topPlayer.ovr ?? 0;
  if (ovr >= 85) return 'Elite MVP';
  if (ovr >= 75) return 'Top MVP';
  if (ovr >= 65) return 'Current MVP';
  return 'Leading Player';
}

function getSecondaryHighlight(player: GlobalPlayer | null) {
  if (!player) return { label: 'Win %', value: '0%' };
  if (player.position === 'FORWARD' || player.position === 'MID')
    return { label: 'Goals', value: player.goalsScored };
  return { label: 'Win %', value: `${getWinRate(player).toFixed(0)}%` };
}

function getPositionShort(position?: Position) {
  return position ?? 'PLY';
}

function getPositionBadge(position?: Position) {
  if (position === 'GK') return 'bg-gray-100 text-gray-600';
  if (position === 'DEF') return 'bg-blue-50 text-blue-700';
  if (position === 'MID') return 'bg-amber-50 text-amber-700';
  if (position === 'FORWARD') return 'bg-red-50 text-red-700';
  return 'bg-gray-100 text-gray-600';
}

function getRankTone(rank: number) {
  if (rank === 1) return 'bg-red-600 text-white';
  if (rank === 2) return 'bg-red-100 text-red-700';
  if (rank === 3) return 'bg-gray-200 text-gray-700';
  return 'bg-gray-100 text-gray-500';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GlobalOvrLeaderboard() {
  const router = useRouter();
  const [players, setPlayers] = useState<GlobalPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<'ALL' | Position>('ALL');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const loadGlobalLeaderboard = async () => {
      try {
        setLoading(true);

        const [profilesSnap, statsSnap, matchesSnap] = await Promise.all([
          getDocs(collection(db, 'userProfiles')),
          getDocs(collection(db, 'playerStats')),
          getDocs(query(collection(db, 'matches'), orderBy('createdAt', 'desc'))),
        ]);

        const statsMap = new Map<string, PlayerStatDoc>();
        statsSnap.forEach((docSnap) => {
          statsMap.set(docSnap.id, docSnap.data() as PlayerStatDoc);
        });

        const matches: MatchEntry[] = [];
        matchesSnap.forEach((docSnap) => {
          const data = docSnap.data();
          matches.push({
            id: docSnap.id,
            eventTitle: data.eventTitle ?? 'Match',
            matchNumber: safeNumber(data.matchNumber, 1),
            createdAt: data.createdAt,
            teams: Array.isArray(data.teams) ? data.teams : [],
            result: data.result ?? null,
          });
        });

        const globalPlayersMap = new Map<string, GlobalPlayer>();

        profilesSnap.forEach((docSnap) => {
          const profile = docSnap.data() as UserProfileDoc;
          const userId = docSnap.id;
          const userStats = statsMap.get(userId);
          const playerName = profile.fullName || profile.email?.split('@')[0] || 'Player';

          globalPlayersMap.set(userId, {
            playerId: userId,
            playerName,
            position: profile.position,
            jerseyNumber: profile.jerseyNumber ?? null,
            matchesPlayed: safeNumber(userStats?.matchesPlayed),
            matchesWon: safeNumber(userStats?.matchesWon),
            matchesDrawn: safeNumber(userStats?.matchesDrawn),
            matchesLost: safeNumber(userStats?.matchesLost),
            goalsScored: safeNumber(userStats?.goalsScored),
            avgMatchRating: 0,
            ovr: null,
            mvpScore: 0,
          });

          const guests = Array.isArray(profile.guestProfiles) ? profile.guestProfiles : [];
          for (const guest of guests) {
            const guestStats = statsMap.get(guest.guestId);
            globalPlayersMap.set(guest.guestId, {
              playerId: guest.guestId,
              playerName: guest.fullName || guest.guestName || 'Guest Player',
              position: guest.position,
              jerseyNumber: guest.jerseyNumber ?? null,
              matchesPlayed: safeNumber(guestStats?.matchesPlayed),
              matchesWon: safeNumber(guestStats?.matchesWon),
              matchesDrawn: safeNumber(guestStats?.matchesDrawn),
              matchesLost: safeNumber(guestStats?.matchesLost),
              goalsScored: safeNumber(guestStats?.goalsScored),
              avgMatchRating: 0,
              ovr: null,
              mvpScore: 0,
            });
          }
        });

        const basePlayers = Array.from(globalPlayersMap.values());

        const computedPlayers = basePlayers.map((player) => {
          const matchRatings = calculateMatchRatingsForPlayer(
            player.playerId,
            player.position,
            matches
          );
          const avgMatchRating = getAverageMatchRating(matchRatings);
          const ovr = getOVR(avgMatchRating, matchRatings, player, basePlayers, matches);
          return { ...player, avgMatchRating, ovr, mvpScore: 0 };
        });

        const withMvp = computedPlayers.map((player) => ({
          ...player,
          mvpScore: getMvpScore(player),
        }));

        // Default sort: OVR desc, then mvpScore, then avgRating, then name
        // null OVR (0 matches) always goes to bottom
        withMvp.sort((a, b) => {
          const aOvr = a.ovr ?? -1;
          const bOvr = b.ovr ?? -1;
          if (bOvr !== aOvr) return bOvr - aOvr;
          if (b.mvpScore !== a.mvpScore) return b.mvpScore - a.mvpScore;
          if (b.avgMatchRating !== a.avgMatchRating) return b.avgMatchRating - a.avgMatchRating;
          return a.playerName.localeCompare(b.playerName);
        });

        setPlayers(withMvp);
      } catch (error) {
        console.error('Failed to load global OVR leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };

    loadGlobalLeaderboard();
  }, []);

  const filteredPlayers = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    return players.filter((player) => {
      const matchesSearch =
        !queryText ||
        player.playerName.toLowerCase().includes(queryText) ||
        (player.jerseyNumber ? String(player.jerseyNumber).includes(queryText) : false);
      const matchesPosition =
        positionFilter === 'ALL' ? true : player.position === positionFilter;
      return matchesSearch && matchesPosition;
    });
  }, [players, search, positionFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / PAGE_SIZE));

  const paginatedPlayers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredPlayers.slice(start, start + PAGE_SIZE);
  }, [filteredPlayers, page]);

  useEffect(() => { setPage(1); }, [search, positionFilter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const topPlayer = filteredPlayers[0] ?? players[0] ?? null;
  const topMvpScore = topPlayer ? topPlayer.mvpScore.toFixed(1) : '0.0';
  const secondaryHighlight = getSecondaryHighlight(topPlayer);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6">
        <div className="mx-auto max-w-5xl">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:space-y-5 sm:px-6 sm:py-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
            aria-label="Go back"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gray-400">Global OVR</p>
            <h1 className="truncate text-xl font-black text-gray-900 sm:text-2xl">Player rankings</h1>
          </div>
        </div>

        {/* Top player card */}
        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-red-600" />
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-red-600">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-600" />
                  {getMvpTag(topPlayer)}
                </div>
                <h2 className="truncate text-lg font-black text-gray-900 sm:text-xl">
                  {topPlayer?.playerName ?? 'No player yet'}
                </h2>
                <p className="mt-1 text-xs font-semibold text-gray-500 sm:text-sm">
                  {topPlayer?.position ?? 'Player'}
                  {topPlayer?.jerseyNumber ? ` • Jersey #${topPlayer.jerseyNumber}` : ''}
                </p>
              </div>
              <div className="flex-shrink-0 rounded-2xl bg-gray-900 px-3 py-2.5 text-center text-white shadow-sm sm:px-4 sm:py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/60">OVR</p>
                <p className="mt-1 text-2xl font-black leading-none sm:text-3xl">
                  {topPlayer?.ovr ?? '—'}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
              <CompactStat label="Wins" value={topPlayer?.matchesWon ?? 0} />
              <CompactStat label={secondaryHighlight.label} value={secondaryHighlight.value} />
              <CompactStat label="MVP Score" value={topMvpScore} />
            </div>
          </div>
        </div>

        {/* Search + position filters (sort buttons removed) */}
        <div className="rounded-3xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
                d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player or jersey"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:border-red-400 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {POSITION_FILTERS.map((item) => (
              <FilterChip
                key={item}
                active={positionFilter === item}
                label={item}
                onClick={() => setPositionFilter(item)}
              />
            ))}
          </div>
        </div>

        {/* Leaderboard list */}
        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Leaderboard</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-gray-500 sm:text-sm">
                {filteredPlayers.length} player{filteredPlayers.length !== 1 ? 's' : ''} found
              </p>
            </div>
            <div className="flex-shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-gray-500">
              Page {page}/{totalPages}
            </div>
          </div>

          {paginatedPlayers.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <svg className="h-6 w-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-gray-400">No players found</p>
              <p className="mt-1 text-xs font-semibold text-gray-300">Try changing search or filter.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {paginatedPlayers.map((player, index) => {
                const absoluteRank = (page - 1) * PAGE_SIZE + index + 1;
                const isTop = absoluteRank === 1;
                const isSecond = absoluteRank === 2;
                const isThird = absoluteRank === 3;
                const ovrLabel = getOVRLabel(player.ovr);

                return (
                  <div
                    key={player.playerId}
                    className={`px-2.5 py-2.5 transition-colors sm:px-3 sm:py-3 ${isTop ? 'bg-red-50/40' : 'bg-white'}`}
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-xs font-black shadow-sm sm:h-9 sm:w-9 ${getRankTone(absoluteRank)}`}>
                        {absoluteRank}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <h3 className="truncate text-[15px] font-black leading-tight text-gray-900 sm:text-base">
                            {player.playerName}
                          </h3>
                          {isTop && (
                            <span className="flex-shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                              MVP
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${getPositionBadge(player.position)}`}>
                            {getPositionShort(player.position)}
                          </span>
                          {player.jerseyNumber ? (
                            <span className="text-[11px] font-bold text-gray-400">#{player.jerseyNumber}</span>
                          ) : null}
                          {player.position === 'FORWARD' || player.position === 'MID' ? (
                            <span className="text-[11px] font-semibold text-gray-500">{player.goalsScored} goals</span>
                          ) : (
                            <span className="text-[11px] font-semibold text-gray-500">{getWinRate(player).toFixed(0)}% win</span>
                          )}
                          <span className="text-[11px] font-semibold text-gray-400">
                            • {player.avgMatchRating ? player.avgMatchRating.toFixed(2) : '0.00'} rtg
                          </span>
                          <span className="text-[11px] font-semibold text-gray-400">
                            • {ovrLabel}
                          </span>
                        </div>

                        {(isSecond || isThird) && (
                          <div className="mt-1.5">
                            <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-gray-500">
                              {isSecond ? 'Top 2' : 'Top 3'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex-shrink-0">
                        <div className="min-w-[60px] rounded-[18px] border border-gray-200 bg-gradient-to-b from-gray-900 to-gray-800 px-2.5 py-2 text-center shadow-[0_6px_16px_rgba(17,24,39,0.10)] sm:min-w-[66px]">
                          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/55">OVR</p>
                          <p className="mt-0.5 text-xl font-black leading-none tabular-nums text-white sm:text-2xl">
                            {player.ovr ?? '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filteredPlayers.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 py-3 sm:px-4">
              <button
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
                className="rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
              >
                Prev
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }).slice(0, 5).map((_, index) => {
                  const pageNumber = index + 1;
                  const active = page === pageNumber;
                  return (
                    <button
                      key={pageNumber}
                      onClick={() => setPage(pageNumber)}
                      className={`h-8 min-w-8 rounded-xl px-2 text-[11px] font-black transition-colors ${
                        active ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 active:bg-gray-300'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
                {totalPages > 5 && (
                  <span className="px-1 text-xs font-black text-gray-300">...</span>
                )}
              </div>

              <button
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
                className="rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
              >
                Next
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}