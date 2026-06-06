import { Timestamp } from 'firebase/firestore';

export type Position = 'GK' | 'DEF' | 'MID' | 'FORWARD';
export type StatsTab = 'overview' | 'ratings' | 'matches' | 'guests';

export interface PlayerStat {
  playerId: string;
  playerName: string;
  matchesPlayed: number;
  matchesWon: number;
  matchesDrawn: number;
  matchesLost: number;
  goalsScored: number;
}

export interface GuestProfile {
  guestId: string;
  guestName?: string;
  fullName?: string;
  jerseyNumber?: number | null;
  position: Position;
}

export interface UserProfile {
  userId: string;
  email?: string;
  fullName: string;
  jerseyNumber?: number | null;
  position: Position;
  guestProfiles?: GuestProfile[];
}

export interface PlayerStatCard extends PlayerStat {
  roleLabel: string;
  position?: Position;
  jerseyNumber?: number | null;
}

export interface Player {
  playerId: string;
  playerName: string;
  playerType?: string;
}

export interface Team {
  teamId: string;
  teamName: string;
  players: Player[];
}

export interface GoalScorer {
  teamId: string;
  playerId: string;
  playerName: string;
  goals: number;
}

export interface MatchResult {
  scores: Record<string, number>;
  goalScorers: GoalScorer[];
  winner: string | null;
  savedAt: Timestamp | null;
}

export interface MatchDetail {
  id: string;
  eventTitle: string;
  matchNumber: number;
  createdAt: Timestamp;
  teams: Team[];
  result: MatchResult | null;
}

export interface MatchRatingEntry {
  matchId: string;
  eventTitle: string;
  matchNumber: number;
  date: Date | null;
  resultLabel: 'Win' | 'Draw' | 'Loss';
  goals: number;
  rating: number;
  streakBonusApplied: boolean;
  winStreakBonusApplied: boolean;
  topScorerBonusApplied: boolean;
}

export interface EnrichedPlayerCard extends PlayerStatCard {
  matchRatings: MatchRatingEntry[];
  avgMatchRating: number;
  latestMatchRating: number | null;
  ovr: number;
  pointsFromGoals: number;
  formLabel: string;
  insight: string;
}

export interface StatsTotals {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function safeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function getStatValue(
  source: Record<string, unknown> | undefined | null,
  key: string,
  fallback = 0
) {
  return safeNumber(source?.[key], fallback);
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

function getCreatedAtTime(match: MatchDetail) {
  return toDateSafe(match.createdAt)?.getTime() ?? 0;
}

function getSafeTeams(match: MatchDetail) {
  return Array.isArray(match.teams) ? match.teams : [];
}

function getSafeGoalScorers(result: MatchResult | null | undefined) {
  return Array.isArray(result?.goalScorers) ? result.goalScorers : [];
}

function getPlayerTeam(match: MatchDetail, playerId: string) {
  return getSafeTeams(match).find((team) =>
    (team.players ?? []).some((player) => player.playerId === playerId)
  );
}

function getPlayedMatchesForPlayer(playerId: string, matches: MatchDetail[]) {
  return matches.filter((match) => {
    if (!match.result) return false;
    return getSafeTeams(match).some((team) =>
      (team.players ?? []).some((player) => player.playerId === playerId)
    );
  });
}

export function getWinRate(player: Pick<PlayerStat, 'matchesPlayed' | 'matchesWon'>) {
  if (!player.matchesPlayed) return 0;
  return (player.matchesWon / player.matchesPlayed) * 100;
}

export function getGoalRatio(player: Pick<PlayerStat, 'matchesPlayed' | 'goalsScored'>) {
  if (!player.matchesPlayed) return 0;
  return player.goalsScored / player.matchesPlayed;
}

export function getUnbeatenRate(
  player: Pick<PlayerStat, 'matchesPlayed' | 'matchesWon' | 'matchesDrawn'>
) {
  if (!player.matchesPlayed) return 0;
  return ((player.matchesWon + player.matchesDrawn) / player.matchesPlayed) * 100;
}

export function getLossRate(player: Pick<PlayerStat, 'matchesPlayed' | 'matchesLost'>) {
  if (!player.matchesPlayed) return 0;
  return (player.matchesLost / player.matchesPlayed) * 100;
}

export function getDrawRate(player: Pick<PlayerStat, 'matchesPlayed' | 'matchesDrawn'>) {
  if (!player.matchesPlayed) return 0;
  return (player.matchesDrawn / player.matchesPlayed) * 100;
}

export function getPointsFromGoals(goals: number) {
  return Number((safeNumber(goals) * 0.6).toFixed(1));
}

export function getPointsFromResults(
  player: Pick<PlayerStat, 'matchesWon' | 'matchesDrawn'>
) {
  return player.matchesWon * 3 + player.matchesDrawn;
}

export function getTeamScore(result: MatchResult, teamId: string) {
  return Number(result?.scores?.[teamId] ?? 0);
}

export function hasGoalScoringStreak(previousGoalMatches: boolean[], currentGoals: number) {
  if (currentGoals <= 0) return false;
  if (previousGoalMatches.length === 0) return false;
  return previousGoalMatches[previousGoalMatches.length - 1] === true;
}

export function hasPreviousWinStreak(
  previousResults: Array<'Win' | 'Draw' | 'Loss'>,
  streak = 2
) {
  if (previousResults.length < streak) return false;
  return previousResults.slice(-streak).every((result) => result === 'Win');
}

export function getPreviousFiveWinRate(previousResults: Array<'Win' | 'Draw' | 'Loss'>) {
  if (previousResults.length === 0) return 0;
  const lastFive = previousResults.slice(-5);
  const wins = lastFive.filter((result) => result === 'Win').length;
  return (wins / lastFive.length) * 100;
}

export function getAttackerPositiveGoalBonus(goals: number) {
  let bonus = 0;
  for (let i = 1; i <= goals; i += 1) {
    if (i === 1) bonus += 0.5;
    else if (i === 2) bonus += 0.8;
    else bonus += 1.5;
  }
  return bonus;
}

export function getAttackerLossGoalBonus(goals: number) {
  let bonus = 0;
  for (let i = 1; i <= goals; i += 1) {
    if (i === 1) bonus += 0.5;
    else if (i === 2) bonus += 0.8;
    else bonus += 1.5;
  }
  return bonus;
}

export function getRatingTone(rating: number) {
  if (rating >= 8.5) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (rating >= 7.0) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (rating >= 6.0) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

export function getPositionTone(position?: Position) {
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

export function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: number, min: number, max: number) {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

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
  return normalize(weightedAverage, 5.5, 9.2);
}

function getConsistencyScore(matchRatings: MatchRatingEntry[]) {
  if (matchRatings.length <= 1) return 0.35;

  const ratings = matchRatings.map((entry) => entry.rating);
  const avg = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
  const variance =
    ratings.reduce((sum, value) => sum + (value - avg) ** 2, 0) / ratings.length;
  const stdDev = Math.sqrt(variance);

  return clamp(1 - stdDev / 2.5, 0, 1);
}

function getExperienceFactor(matchesPlayed: number) {
  if (matchesPlayed <= 0) return 0;
  if (matchesPlayed === 1) return 0.12;
  if (matchesPlayed === 2) return 0.17;
  if (matchesPlayed === 3) return 0.23;
  if (matchesPlayed <= 5) return 0.32;
  if (matchesPlayed <= 8) return 0.44;
  if (matchesPlayed <= 12) return 0.56;
  if (matchesPlayed <= 18) return 0.68;
  if (matchesPlayed <= 25) return 0.79;
  if (matchesPlayed <= 35) return 0.88;
  if (matchesPlayed <= 50) return 0.95;
  return 1;
}

function getExperienceCap(matchesPlayed: number) {
  if (matchesPlayed <= 0) return 40;
  if (matchesPlayed === 1) return 46;
  if (matchesPlayed === 2) return 49;
  if (matchesPlayed === 3) return 53;
  if (matchesPlayed <= 5) return 58;
  if (matchesPlayed <= 8) return 64;
  if (matchesPlayed <= 12) return 70;
  if (matchesPlayed <= 18) return 76;
  if (matchesPlayed <= 25) return 82;
  if (matchesPlayed <= 35) return 87;
  if (matchesPlayed <= 50) return 91;
  return 94;
}

function getGoalContributionScore(player: PlayerStatCard) {
  const goalRatio = getGoalRatio(player);

  if (player.position === 'FORWARD') {
    return normalize(Math.min(goalRatio, 2.2), 0, 1.4);
  }

  if (player.position === 'MID') {
    return normalize(Math.min(goalRatio, 1.6), 0, 0.95);
  }

  if (player.position === 'DEF') {
    return normalize(Math.min(goalRatio, 0.75), 0, 0.35);
  }

  if (player.position === 'GK') {
    return normalize(Math.min(goalRatio, 0.35), 0, 0.12);
  }

  return normalize(Math.min(goalRatio, 1.5), 0, 1);
}

function getResultImpactScore(player: PlayerStatCard) {
  const winRate = getWinRate(player);
  const unbeatenRate = getUnbeatenRate(player);
  const drawRate = getDrawRate(player);

  if (player.position === 'GK') {
    return clamp(
      normalize(winRate, 35, 80) * 0.3 +
        normalize(unbeatenRate, 45, 90) * 0.55 +
        normalize(drawRate, 0, 35) * 0.15,
      0,
      1
    );
  }

  if (player.position === 'DEF') {
    return clamp(
      normalize(winRate, 35, 80) * 0.32 +
        normalize(unbeatenRate, 45, 88) * 0.52 +
        normalize(drawRate, 0, 35) * 0.16,
      0,
      1
    );
  }

  if (player.position === 'MID') {
    return clamp(
      normalize(winRate, 30, 78) * 0.42 +
        normalize(unbeatenRate, 40, 86) * 0.34 +
        normalize(drawRate, 0, 35) * 0.24,
      0,
      1
    );
  }

  return clamp(
    normalize(winRate, 30, 75) * 0.46 +
      normalize(unbeatenRate, 38, 82) * 0.26 +
      normalize(drawRate, 0, 35) * 0.1,
    0,
    1
  );
}

function getRatingCoreScore(avgRating: number) {
  return normalize(avgRating, 5.8, 8.9);
}

function getPlayerGoalsInMatch(match: MatchDetail, playerId: string) {
  const result = match.result;
  if (!result) return 0;

  return getSafeGoalScorers(result)
    .filter((goal) => goal.playerId === playerId)
    .reduce((sum, goal) => sum + safeNumber(goal.goals), 0);
}

function getTopScorerIdsFromTotals(goalTotals: Map<string, number>) {
  let topGoals = 0;

  goalTotals.forEach((goals) => {
    if (goals > topGoals) topGoals = goals;
  });

  if (topGoals <= 0) return new Set<string>();

  const leaders = new Set<string>();
  goalTotals.forEach((goals, playerId) => {
    if (goals === topGoals) leaders.add(playerId);
  });

  return leaders;
}

function getTopScorerLeadershipScore(player: PlayerStatCard, allPlayers: PlayerStatCard[]) {
  if (!player.matchesPlayed || allPlayers.length === 0) return 0;

  const highestGoals = Math.max(...allPlayers.map((item) => item.goalsScored), 0);
  if (highestGoals <= 0) return 0;

  const isTopScorer = player.goalsScored === highestGoals;
  const gapRatio = player.goalsScored / highestGoals;
  const goalRatio = getGoalRatio(player);

  if (player.position === 'FORWARD') {
    return clamp(
      (isTopScorer ? 0.45 : 0) +
        normalize(gapRatio, 0.45, 1) * 0.3 +
        normalize(goalRatio, 0.25, 1.2) * 0.18,
      0,
      1
    );
  }

  if (player.position === 'MID') {
    return clamp(
      (isTopScorer ? 0.34 : 0) +
        normalize(gapRatio, 0.4, 1) * 0.28 +
        normalize(goalRatio, 0.15, 0.85) * 0.2,
      0,
      1
    );
  }

  if (player.position === 'DEF') {
    return clamp(
      (isTopScorer ? 0.12 : 0) +
        normalize(gapRatio, 0.35, 1) * 0.18 +
        normalize(goalRatio, 0.05, 0.35) * 0.14,
      0,
      1
    );
  }

  if (player.position === 'GK') {
    return clamp(
      (isTopScorer ? 0.06 : 0) +
        normalize(gapRatio, 0.3, 1) * 0.12 +
        normalize(goalRatio, 0.02, 0.15) * 0.08,
      0,
      1
    );
  }

  return clamp(
    (isTopScorer ? 0.3 : 0) +
      normalize(gapRatio, 0.4, 1) * 0.25 +
      normalize(goalRatio, 0.15, 1) * 0.18,
    0,
    1
  );
}

function getCleanSheetRateForPlayer(
  playerId: string,
  position: Position | undefined,
  matches: MatchDetail[]
) {
  if (position !== 'GK' && position !== 'DEF') return 0;

  const playedMatches = getPlayedMatchesForPlayer(playerId, matches);

  if (playedMatches.length === 0) return 0;

  let cleanSheets = 0;

  playedMatches.forEach((match) => {
    const result = match.result;
    if (!result) return;

    const playerTeam = getPlayerTeam(match, playerId);
    if (!playerTeam) return;

    const opponents = getSafeTeams(match).filter((team) => team.teamId !== playerTeam.teamId);
    const opponentGoals = opponents.reduce(
      (sum, team) => sum + getTeamScore(result, team.teamId),
      0
    );

    if (opponentGoals === 0) cleanSheets += 1;
  });

  return (cleanSheets / playedMatches.length) * 100;
}

function getDefensiveAnchorScore(player: PlayerStatCard, matches: MatchDetail[]) {
  if (player.position !== 'GK' && player.position !== 'DEF') return 0;

  const cleanSheetRate = getCleanSheetRateForPlayer(
    player.playerId,
    player.position,
    matches
  );
  const unbeatenRate = getUnbeatenRate(player);
  const lossRate = getLossRate(player);
  const winRate = getWinRate(player);

  if (player.position === 'GK') {
    return clamp(
      normalize(cleanSheetRate, 10, 55) * 0.5 +
        normalize(unbeatenRate, 40, 88) * 0.24 +
        normalize(winRate, 30, 78) * 0.1 +
        (1 - normalize(lossRate, 15, 60)) * 0.16,
      0,
      1
    );
  }

  return clamp(
    normalize(cleanSheetRate, 8, 50) * 0.42 +
      normalize(unbeatenRate, 40, 86) * 0.26 +
      normalize(winRate, 30, 76) * 0.12 +
      (1 - normalize(lossRate, 18, 62)) * 0.2,
    0,
    1
  );
}

function getSmallSamplePenalty(player: PlayerStatCard, avgRating: number) {
  const matchesPlayed = player.matchesPlayed;
  const goalRatio = getGoalRatio(player);

  let penalty = 0;

  if (matchesPlayed < 10) {
    penalty += (10 - matchesPlayed) * 0.55;
  }

  if (matchesPlayed < 6 && avgRating >= 8.5) {
    penalty += 2.2;
  }

  if (
    matchesPlayed < 6 &&
    (player.position === 'FORWARD' || player.position === 'MID') &&
    goalRatio >= 1.5
  ) {
    penalty += 1.8;
  }

  return penalty;
}

function getRoleBonus(
  player: PlayerStatCard,
  topScorerImpact: number,
  defensiveAnchor: number
) {
  let bonus = 0;

  if (
    (player.position === 'FORWARD' || player.position === 'MID') &&
    player.matchesPlayed >= 5 &&
    topScorerImpact >= 0.72
  ) {
    bonus += 1.5;
  }

  if (
    (player.position === 'GK' || player.position === 'DEF') &&
    player.matchesPlayed >= 5 &&
    defensiveAnchor >= 0.72
  ) {
    bonus += 1.5;
  }

  return bonus;
}

export function getOVR(
  avgRating: number,
  matchRatings: MatchRatingEntry[],
  player: PlayerStatCard,
  allPlayers: PlayerStatCard[] = [],
  matches: MatchDetail[] = []
) {
  if (!player.matchesPlayed) return 0;

  const BASE_OVR = 40;
  const matchesPlayed = player.matchesPlayed;

  const experienceFactor = getExperienceFactor(matchesPlayed);
  const experienceCap = getExperienceCap(matchesPlayed);

  const ratingCore = getRatingCoreScore(avgRating);
  const recentForm = getRecentFormScore(matchRatings);
  const consistency = getConsistencyScore(matchRatings);
  const resultImpact = getResultImpactScore(player);
  const goalImpact = getGoalContributionScore(player);
  const topScorerImpact = getTopScorerLeadershipScore(player, allPlayers);
  const defensiveAnchor = getDefensiveAnchorScore(player, matches);

  let blendedPerformance = 0;

  switch (player.position) {
    case 'GK':
      blendedPerformance =
        ratingCore * 0.24 +
        recentForm * 0.12 +
        consistency * 0.15 +
        resultImpact * 0.22 +
        defensiveAnchor * 0.24 +
        topScorerImpact * 0.01 +
        goalImpact * 0.02;
      break;

    case 'DEF':
      blendedPerformance =
        ratingCore * 0.24 +
        recentForm * 0.12 +
        consistency * 0.15 +
        resultImpact * 0.21 +
        defensiveAnchor * 0.21 +
        topScorerImpact * 0.02 +
        goalImpact * 0.05;
      break;

    case 'MID':
      blendedPerformance =
        ratingCore * 0.25 +
        recentForm * 0.17 +
        consistency * 0.14 +
        resultImpact * 0.18 +
        goalImpact * 0.16 +
        topScorerImpact * 0.1;
      break;

    case 'FORWARD':
    default:
      blendedPerformance =
        ratingCore * 0.23 +
        recentForm * 0.18 +
        consistency * 0.12 +
        resultImpact * 0.14 +
        goalImpact * 0.23 +
        topScorerImpact * 0.1;
      break;
  }

  const rawGrowth = blendedPerformance * 54;
  const experienceAdjustedGrowth = rawGrowth * experienceFactor;

  let ovr = BASE_OVR + experienceAdjustedGrowth;
  ovr -= getSmallSamplePenalty(player, avgRating);
  ovr += getRoleBonus(player, topScorerImpact, defensiveAnchor);

  ovr = Math.min(ovr, experienceCap);
  ovr = clamp(Math.round(ovr), 40, 99);

  return ovr;
}

export function getOVRLabel(ovr: number) {
  if (ovr >= 90) return 'Elite';
  if (ovr >= 80) return 'Strong';
  if (ovr >= 68) return 'Solid';
  if (ovr >= 55) return 'Developing';
  return 'Rising';
}

export function getPlayerInsight(player: EnrichedPlayerCard) {
  if (!player.matchesPlayed) return 'No recorded matches yet.';

  const goalRatio = getGoalRatio(player);
  const winRate = getWinRate(player);
  const unbeatenRate = getUnbeatenRate(player);

  if (player.position === 'FORWARD' || player.position === 'MID') {
    if (player.avgMatchRating >= 8.3 && goalRatio >= 1) {
      return 'High-impact attacking output with strong ratings.';
    }
    if (goalRatio >= 1.2) {
      return 'Scoring output is driving overall value.';
    }
    if (player.latestMatchRating && player.latestMatchRating >= 8) {
      return 'Recent attacking form is trending upward.';
    }
    return 'Building attacking influence match by match.';
  }

  if (player.position === 'DEF' || player.position === 'GK') {
    if (unbeatenRate >= 75 && winRate >= 55) {
      return 'Defensive stability is strongly lifting the profile.';
    }
    if (player.latestMatchRating && player.latestMatchRating >= 8) {
      return 'Recent defensive performances look sharp.';
    }
    return 'Defensive contribution is improving steadily.';
  }

  if (player.avgMatchRating >= 7.5 && winRate >= 50) {
    return 'Reliable match influence with solid results.';
  }

  return 'Steady development across recent matches.';
}

export function calculateMatchRatingsForPlayer(
  playerId: string,
  position: Position | undefined,
  matches: MatchDetail[]
): MatchRatingEntry[] {
  const sortedMatches = [...matches]
    .filter((match) => match.result && match.result.savedAt)
    .sort((a, b) => getCreatedAtTime(a) - getCreatedAtTime(b));

  const ratings: MatchRatingEntry[] = [];
  const previousResults: Array<'Win' | 'Draw' | 'Loss'> = [];
  const previousGoalMatches: boolean[] = [];
  const cumulativeGoalTotals = new Map<string, number>();

  for (const match of sortedMatches) {
    const result = match.result;
    if (!result) continue;

    const teams = getSafeTeams(match);
    const team = getPlayerTeam(match, playerId);
    const topScorerIdsBeforeMatch = getTopScorerIdsFromTotals(cumulativeGoalTotals);

    if (!team) {
      teams.forEach((teamItem) => {
        (teamItem.players ?? []).forEach((teamPlayer) => {
          const goalsInMatch = getPlayerGoalsInMatch(match, teamPlayer.playerId);
          if (goalsInMatch > 0) {
            cumulativeGoalTotals.set(
              teamPlayer.playerId,
              (cumulativeGoalTotals.get(teamPlayer.playerId) ?? 0) + goalsInMatch
            );
          }
        });
      });
      continue;
    }

    const currentDate = toDateSafe(match.createdAt);
    const playerGoals = getPlayerGoalsInMatch(match, playerId);

    const isDraw = result.winner === null || result.winner === 'draw';
    const isWin = result.winner === team.teamId;
    const isLoss = !isDraw && !isWin;

    let resultLabel: 'Win' | 'Draw' | 'Loss' = 'Draw';
    if (isWin) resultLabel = 'Win';
    if (isLoss) resultLabel = 'Loss';

    let rating = 6;
    let streakBonusApplied = false;
    let winStreakBonusApplied = false;
    let topScorerBonusApplied = false;

    if (isWin) rating += 2;
    if (isDraw) rating += 1;
    if (isLoss) rating -= 1;

    const isDefensiveRole = position === 'DEF' || position === 'GK';
    const isAttackingRole = position === 'MID' || position === 'FORWARD';

    const hasScoringStreak = hasGoalScoringStreak(previousGoalMatches, playerGoals);
    const hadPreviousTwoWinStreak = hasPreviousWinStreak(previousResults, 2);

    if (topScorerIdsBeforeMatch.has(playerId) && playerGoals > 0) {
      rating += 0.8;
      topScorerBonusApplied = true;
    }

    if (isAttackingRole) {
      if (isWin || isDraw) {
        rating += getAttackerPositiveGoalBonus(playerGoals);

        if (hasScoringStreak) {
          rating += 1;
          streakBonusApplied = true;
        }
      }

      if (isLoss && playerGoals > 0) {
        if (playerGoals >= 4) {
          rating = 10;
        } else {
          rating += getAttackerLossGoalBonus(playerGoals);

          if (hasScoringStreak) {
            rating += 1;
            streakBonusApplied = true;
          }

          if (playerGoals >= 3) {
            rating = Math.max(rating, 8.5);
          } else if (playerGoals >= 2) {
            rating = Math.max(rating, 7.5);
          }
        }
      }
    }

    if (isDefensiveRole) {
      if (isWin) {
        rating += 1.2;

        if (position === 'DEF') {
          rating += 1;
        }

        if (hadPreviousTwoWinStreak) {
          rating += 0.3;
          winStreakBonusApplied = true;
        }

        if (playerGoals > 0) {
          rating = 10;
        }
      }

      if (isLoss) {
        if (hadPreviousTwoWinStreak) {
          rating += 0.6;
          winStreakBonusApplied = true;
        }

        if (playerGoals > 0) {
          rating += playerGoals * 0.8;
        }
      }

      if (isDraw && playerGoals > 0) {
        rating = 10;
      }
    }

    if (position === 'GK') {
      const opponent = teams.find((teamItem) => teamItem.teamId !== team.teamId);
      const opponentScore = opponent ? getTeamScore(result, opponent.teamId) : 0;
      const hasCleanSheet = opponentScore === 0;

      if (hasCleanSheet && !isLoss) {
        rating += 1.25;
      }
    }

    rating = clamp(Number(rating.toFixed(2)), 0, 10);

    ratings.push({
      matchId: match.id,
      eventTitle: match.eventTitle,
      matchNumber: match.matchNumber,
      date: currentDate,
      resultLabel,
      goals: playerGoals,
      rating,
      streakBonusApplied,
      winStreakBonusApplied,
      topScorerBonusApplied,
    });

    previousResults.push(resultLabel);
    previousGoalMatches.push(playerGoals > 0);

    teams.forEach((teamItem) => {
      (teamItem.players ?? []).forEach((teamPlayer) => {
        const goalsInMatch = getPlayerGoalsInMatch(match, teamPlayer.playerId);
        if (goalsInMatch > 0) {
          cumulativeGoalTotals.set(
            teamPlayer.playerId,
            (cumulativeGoalTotals.get(teamPlayer.playerId) ?? 0) + goalsInMatch
          );
        }
      });
    });
  }

  return ratings.reverse();
}

export function getAverageMatchRating(matchRatings: MatchRatingEntry[]) {
  if (matchRatings.length === 0) return 0;
  return Number(
    (
      matchRatings.reduce((sum, entry) => sum + entry.rating, 0) / matchRatings.length
    ).toFixed(2)
  );
}

export function getLatestMatchRating(matchRatings: MatchRatingEntry[]) {
  return matchRatings.length > 0 ? matchRatings[0].rating : null;
}

export function enrichPlayerStats(
  players: PlayerStatCard[],
  matches: MatchDetail[]
): EnrichedPlayerCard[] {
  return players.map((player) => {
    const matchRatings = calculateMatchRatingsForPlayer(
      player.playerId,
      player.position,
      matches
    );

    const avgMatchRating = getAverageMatchRating(matchRatings);
    const latestMatchRating = getLatestMatchRating(matchRatings);
    const ovr = getOVR(avgMatchRating, matchRatings, player, players, matches);

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
}

export function getStatsTotals(players: PlayerStat[]) {
  return players.reduce<StatsTotals>(
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
}

export function getOverallWinRate(players: PlayerStat[]) {
  const totals = getStatsTotals(players);
  if (!totals.matches) return 0;
  return (totals.wins / totals.matches) * 100;
}

export function formatOverallWinRate(players: PlayerStat[]) {
  const value = getOverallWinRate(players);
  return value ? `${value.toFixed(1)}%` : '—';
}

export function sortPlayersByOVR(players: EnrichedPlayerCard[]) {
  return [...players].sort((a, b) => b.ovr - a.ovr);
}

export function sortPlayersByAvgRating(players: EnrichedPlayerCard[]) {
  return [...players].sort((a, b) => b.avgMatchRating - a.avgMatchRating);
}

export function sortPlayersByGoals(players: EnrichedPlayerCard[]) {
  return [...players].sort((a, b) => b.goalsScored - a.goalsScored);
}

export function sortPlayersByWinRate(players: EnrichedPlayerCard[]) {
  return [...players].sort((a, b) => getWinRate(b) - getWinRate(a));
}

export function buildPlayerStatCard(params: {
  playerId: string;
  playerName: string;
  matchesPlayed?: number;
  matchesWon?: number;
  matchesDrawn?: number;
  matchesLost?: number;
  goalsScored?: number;
  roleLabel: string;
  position?: Position;
  jerseyNumber?: number | null;
}): PlayerStatCard {
  return {
    playerId: params.playerId,
    playerName: params.playerName,
    matchesPlayed: params.matchesPlayed ?? 0,
    matchesWon: params.matchesWon ?? 0,
    matchesDrawn: params.matchesDrawn ?? 0,
    matchesLost: params.matchesLost ?? 0,
    goalsScored: params.goalsScored ?? 0,
    roleLabel: params.roleLabel,
    position: params.position,
    jerseyNumber: params.jerseyNumber ?? null,
  };
}

export function buildPlayerStatCardFromFirestore(params: {
  playerId: string;
  playerName: string;
  statsData?: Record<string, unknown> | null;
  roleLabel: string;
  position?: Position;
  jerseyNumber?: number | null;
}): PlayerStatCard {
  const statsData = params.statsData ?? {};

  return buildPlayerStatCard({
    playerId: params.playerId,
    playerName: params.playerName,
    matchesPlayed: getStatValue(statsData, 'matchesPlayed'),
    matchesWon: getStatValue(statsData, 'matchesWon'),
    matchesDrawn: getStatValue(statsData, 'matchesDrawn'),
    matchesLost: getStatValue(statsData, 'matchesLost'),
    goalsScored: getStatValue(statsData, 'goalsScored'),
    roleLabel: params.roleLabel,
    position: params.position,
    jerseyNumber: params.jerseyNumber ?? null,
  });
}

export function buildUserAndGuestBasePlayers(params: {
  userId: string;
  userName: string;
  userProfile?: UserProfile | null;
  userStatsData?: Record<string, unknown> | null;
  guestStatsMap?: Record<string, Record<string, unknown> | null | undefined>;
}): PlayerStatCard[] {
  const {
    userId,
    userName,
    userProfile,
    userStatsData,
    guestStatsMap = {},
  } = params;

  const basePlayers: PlayerStatCard[] = [
    buildPlayerStatCardFromFirestore({
      playerId: userId,
      playerName: userName,
      statsData: userStatsData,
      roleLabel: 'My Stats',
      position: userProfile?.position,
      jerseyNumber: userProfile?.jerseyNumber ?? null,
    }),
  ];

  const guests = userProfile?.guestProfiles ?? [];

  const guestPlayers = guests.map((guest) =>
    buildPlayerStatCardFromFirestore({
      playerId: guest.guestId,
      playerName: guest.fullName || guest.guestName || 'Guest Player',
      statsData: guestStatsMap[guest.guestId],
      roleLabel: 'Linked Guest',
      position: guest.position,
      jerseyNumber: guest.jerseyNumber ?? null,
    })
  );

  return [...basePlayers, ...guestPlayers];
}