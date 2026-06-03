import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import {
  SEASON_MATCH_LIMIT,
  makeSeasonId,
  applySeasonStatDelta,
  endSeason,
  SeasonDoc,
} from '@/lib/seasonManager';
import {
  doc,
  setDoc,
  getDoc,
} from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface MatchDoc {
  id: string;
  teams: Team[];
  result: MatchResult | null;
  createdAt: Timestamp;
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

/**
 * One-time backfill function.
 *
 * Reads all existing completed matches (those with a saved result),
 * groups them into seasons of SEASON_MATCH_LIMIT (15),
 * writes seasonPlayerStats for each player per season,
 * creates season docs for completed seasons,
 * and creates the current active season doc with the correct matchCount.
 *
 * Safe to call multiple times — checks if seasons already exist and skips
 * if backfill has already been run.
 *
 * Returns a summary string for display in the admin UI.
 */
export async function backfillSeasons(): Promise<string> {

  // ── Guard: check if any season doc already exists ─────────────────────────
  // If Season 1 exists, backfill has already run — bail out.
  const season1Ref = doc(db, 'seasons', makeSeasonId(1));
  const season1Snap = await getDoc(season1Ref);
  if (season1Snap.exists()) {
    return 'Backfill already completed. Season 1 already exists — skipping.';
  }

  // ── Step 1: Fetch all matches ordered by createdAt ────────────────────────
  const matchSnap = await getDocs(
    query(collection(db, 'matches'), orderBy('createdAt', 'asc'))
  );

  const allMatches: MatchDoc[] = [];
  matchSnap.forEach(d => {
    const data = d.data();
    // Only include matches that have a saved result
    if (data.result && data.result.savedAt) {
      allMatches.push({
        id: d.id,
        teams: data.teams ?? [],
        result: data.result,
        createdAt: data.createdAt,
      });
    }
  });

  if (allMatches.length === 0) {
    // No completed matches yet — just create Season 1 as active with 0 matches
    const newSeason: SeasonDoc = {
      seasonId: makeSeasonId(1),
      seasonNumber: 1,
      status: 'active',
      matchCount: 0,
      startedAt: Timestamp.now(),
      completedAt: null,
      bestForward: null,
      bestDefender: null,
    };
    await setDoc(doc(db, 'seasons', makeSeasonId(1)), newSeason);
    return 'No completed matches found. Created Season 1 as active with 0 matches.';
  }

  // ── Step 2: Group matches into seasons of SEASON_MATCH_LIMIT ─────────────
  const seasonGroups: MatchDoc[][] = [];
  for (let i = 0; i < allMatches.length; i += SEASON_MATCH_LIMIT) {
    seasonGroups.push(allMatches.slice(i, i + SEASON_MATCH_LIMIT));
  }

  let totalSeasons = seasonGroups.length;
  let completedSeasons = 0;

  // ── Step 3: Process each season group ────────────────────────────────────
  for (let seasonIndex = 0; seasonIndex < seasonGroups.length; seasonIndex++) {
    const seasonNumber = seasonIndex + 1;
    const seasonId     = makeSeasonId(seasonNumber);
    const matches      = seasonGroups[seasonIndex];
    const isLast       = seasonIndex === seasonGroups.length - 1;
    const isComplete   = matches.length === SEASON_MATCH_LIMIT;

    // Create season doc first (active, will be updated if completed)
    const seasonDoc: SeasonDoc = {
      seasonId,
      seasonNumber,
      status: isComplete ? 'completed' : 'active',
      matchCount: matches.length,
      startedAt: matches[0].createdAt,
      completedAt: isComplete ? matches[matches.length - 1].createdAt : null,
      bestForward: null,
      bestDefender: null,
    };
    await setDoc(doc(db, 'seasons', seasonId), seasonDoc);

    // Write seasonPlayerStats for each match in this season
    for (const match of matches) {
      if (!match.result) continue;

      const { teams, result } = match;

      // Build goal map for this match
      const goalMap: Record<string, number> = {};
      result.goalScorers.forEach(gs => {
        goalMap[gs.playerId] = (goalMap[gs.playerId] ?? 0) + gs.goals;
      });

      // Apply delta for each player in this match
      for (const team of teams) {
        for (const player of team.players) {
          const isWin  = result.winner !== 'draw' && result.winner === team.teamId;
          const isDraw = result.winner === 'draw';
          const isLoss = result.winner !== 'draw'
            && result.winner !== team.teamId
            && result.winner !== null;
          const goals = goalMap[player.playerId] ?? 0;

          await applySeasonStatDelta(seasonId, player.playerId, player.playerName, {
            matchesPlayed: 1,
            matchesWon:    isWin  ? 1 : 0,
            matchesDrawn:  isDraw ? 1 : 0,
            matchesLost:   isLoss ? 1 : 0,
            goalsScored:   goals,
          });
        }
      }
    }

    // If this season is complete, compute awards and update the season doc
    if (isComplete) {
      // endSeason handles award computation, updating the season doc,
      // creating next season, and writing notification.
      // But since we're backfilling, we DON'T want to create a notification
      // or a next season doc (we'll create it in the next loop iteration).
      // So we call our own award computation here directly.
      await finalizeCompletedSeasonBackfill(seasonDoc);
      completedSeasons++;
    }
  }

  // ── Step 4: Make sure the last season is active if incomplete ─────────────
  const lastGroup = seasonGroups[seasonGroups.length - 1];
  const lastSeasonNumber = seasonGroups.length;
  const lastSeasonId     = makeSeasonId(lastSeasonNumber);

  if (lastGroup.length < SEASON_MATCH_LIMIT) {
    // Already created as active above — nothing more needed
  } else {
    // All seasons were complete — create a fresh active season for new matches
    const nextNumber  = lastSeasonNumber + 1;
    const nextSeasonId = makeSeasonId(nextNumber);
    const nextSeason: SeasonDoc = {
      seasonId: nextSeasonId,
      seasonNumber: nextNumber,
      status: 'active',
      matchCount: 0,
      startedAt: Timestamp.now(),
      completedAt: null,
      bestForward: null,
      bestDefender: null,
    };
    await setDoc(doc(db, 'seasons', nextSeasonId), nextSeason);
    totalSeasons = nextNumber;
  }

  return `Backfill complete. ${allMatches.length} matches processed across ${totalSeasons} seasons (${completedSeasons} completed).`;
}

// ─── Finalize Completed Season (Backfill Only) ────────────────────────────────
// Like endSeason() but without creating a next season or writing a notification,
// since backfill handles season creation in its own loop.

async function finalizeCompletedSeasonBackfill(season: SeasonDoc): Promise<void> {
  const { collection, getDocs, query, where } = await import('firebase/firestore');

  // Get season player stats
  const snap = await getDocs(
    query(
      collection(db, 'seasonPlayerStats'),
      where('seasonId', '==', season.seasonId)
    )
  );
  const stats = snap.docs.map(d => d.data());

  // Build position map from userProfiles
  const positionMap = new Map<string, string>();
  const profileSnap = await getDocs(collection(db, 'userProfiles'));
  profileSnap.forEach(d => {
    const data = d.data();
    if (!data.profileCompleted) return;
    positionMap.set(data.userId, data.position);
    if (Array.isArray(data.guestProfiles)) {
      data.guestProfiles.forEach((g: any) => {
        if (g.guestId && g.position) positionMap.set(g.guestId, g.position);
      });
    }
  });

  const forwardPositions  = new Set(['FORWARD', 'MID']);
  const defenderPositions = new Set(['DEF', 'GK']);

  const forwards  = stats.filter(s => forwardPositions.has(positionMap.get(s.playerId)  ?? ''));
  const defenders = stats.filter(s => defenderPositions.has(positionMap.get(s.playerId) ?? ''));

  forwards.sort((a, b)  => b.goalsScored - a.goalsScored   || b.matchesPlayed - a.matchesPlayed);
  defenders.sort((a, b) => b.matchesWon  - a.matchesWon    || b.matchesPlayed - a.matchesPlayed);

  const bestForward  = forwards[0]
    ? { playerId: forwards[0].playerId,  playerName: forwards[0].playerName,  goalsScored: forwards[0].goalsScored }
    : null;
  const bestDefender = defenders[0]
    ? { playerId: defenders[0].playerId, playerName: defenders[0].playerName, matchesWon: defenders[0].matchesWon }
    : null;

  await setDoc(
    doc(db, 'seasons', season.seasonId),
    { ...season, status: 'completed', bestForward, bestDefender },
  );
}