import {
  db
} from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  where,
  Timestamp,
} from 'firebase/firestore';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SEASON_MATCH_LIMIT = 15;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SeasonAwardEntry {
  playerId: string;
  playerName: string;
  goalsScored?: number;
  matchesWon?: number;
}

export interface SeasonDoc {
  seasonId: string;
  seasonNumber: number;
  status: 'active' | 'completed';
  matchCount: number;
  startedAt: Timestamp;
  completedAt: Timestamp | null;
  bestForward: SeasonAwardEntry | null;
  bestDefender: SeasonAwardEntry | null;
}

export interface SeasonPlayerStat {
  seasonId: string;
  playerId: string;
  playerName: string;
  matchesPlayed: number;
  matchesWon: number;
  matchesDrawn: number;
  matchesLost: number;
  goalsScored: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function makeSeasonId(seasonNumber: number): string {
  return `season_${seasonNumber}`;
}

export function makeSeasonStatId(seasonId: string, playerId: string): string {
  return `${seasonId}_${playerId}`;
}

// ─── Get Active Season ────────────────────────────────────────────────────────
// Returns the current active season doc, or null if none exists yet.

export async function getActiveSeason(): Promise<SeasonDoc | null> {
  const snap = await getDocs(
    query(
      collection(db, 'seasons'),
      where('status', '==', 'active'),
      orderBy('seasonNumber', 'desc')
    )
  );
  if (snap.empty) return null;
  return snap.docs[0].data() as SeasonDoc;
}

// ─── Get Or Create Active Season ─────────────────────────────────────────────
// If no active season exists, creates Season 1. Always returns an active season.

export async function getOrCreateActiveSeason(): Promise<SeasonDoc> {
  const existing = await getActiveSeason();
  if (existing) return existing;

  // No season exists yet — create Season 1
  const seasonId = makeSeasonId(1);
  const newSeason: SeasonDoc = {
    seasonId,
    seasonNumber: 1,
    status: 'active',
    matchCount: 0,
    startedAt: Timestamp.now(),
    completedAt: null,
    bestForward: null,
    bestDefender: null,
  };
  await setDoc(doc(db, 'seasons', seasonId), newSeason);
  return newSeason;
}

// ─── Get All Seasons ──────────────────────────────────────────────────────────

export async function getAllSeasons(): Promise<SeasonDoc[]> {
  const snap = await getDocs(
    query(collection(db, 'seasons'), orderBy('seasonNumber', 'asc'))
  );
  return snap.docs.map(d => d.data() as SeasonDoc);
}

// ─── Get Season Player Stats ──────────────────────────────────────────────────

export async function getSeasonPlayerStats(
  seasonId: string
): Promise<SeasonPlayerStat[]> {
  const snap = await getDocs(
    query(
      collection(db, 'seasonPlayerStats'),
      where('seasonId', '==', seasonId)
    )
  );
  return snap.docs.map(d => d.data() as SeasonPlayerStat);
}

// ─── Write Season Player Stat Delta ──────────────────────────────────────────
// Same delta pattern as updatePlayerStats, but scoped to a seasonId.

export async function applySeasonStatDelta(
  seasonId: string,
  playerId: string,
  playerName: string,
  delta: {
    matchesPlayed: number;
    matchesWon: number;
    matchesDrawn: number;
    matchesLost: number;
    goalsScored: number;
  }
): Promise<void> {
  const statId = makeSeasonStatId(seasonId, playerId);
  const ref = doc(db, 'seasonPlayerStats', statId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const cur = snap.data() as SeasonPlayerStat;
    await setDoc(ref, {
      ...cur,
      playerName, // keep name fresh
      matchesPlayed: Math.max(0, cur.matchesPlayed + delta.matchesPlayed),
      matchesWon:    Math.max(0, cur.matchesWon    + delta.matchesWon),
      matchesDrawn:  Math.max(0, cur.matchesDrawn  + delta.matchesDrawn),
      matchesLost:   Math.max(0, cur.matchesLost   + delta.matchesLost),
      goalsScored:   Math.max(0, cur.goalsScored   + delta.goalsScored),
    });
  } else {
    await setDoc(ref, {
      seasonId,
      playerId,
      playerName,
      matchesPlayed: Math.max(0, delta.matchesPlayed),
      matchesWon:    Math.max(0, delta.matchesWon),
      matchesDrawn:  Math.max(0, delta.matchesDrawn),
      matchesLost:   Math.max(0, delta.matchesLost),
      goalsScored:   Math.max(0, delta.goalsScored),
    });
  }
}

// ─── Compute Awards From Season Stats ────────────────────────────────────────
// Reads userProfiles once, builds a position map, then finds:
// Best Forward = top goalsScored among FORWARD + MID (profile completed)
// Best Defender = top matchesWon among DEF + GK (profile completed)

async function computeSeasonAwards(
  seasonId: string
): Promise<{ bestForward: SeasonAwardEntry | null; bestDefender: SeasonAwardEntry | null }> {

  // 1. Build position map from all userProfiles
  const positionMap = new Map<string, string>(); // playerId → position
  const profileSnap = await getDocs(collection(db, 'userProfiles'));

  profileSnap.forEach(d => {
    const data = d.data();
    // Only include completed profiles
    if (!data.profileCompleted) return;

    // Regular user
    positionMap.set(data.userId, data.position);

    // Guest profiles inside this user
    if (Array.isArray(data.guestProfiles)) {
      data.guestProfiles.forEach((g: any) => {
        if (g.guestId && g.position) {
          positionMap.set(g.guestId, g.position);
        }
      });
    }
  });

  // 2. Get all season stats for this season
  const stats = await getSeasonPlayerStats(seasonId);

  // 3. Filter by position category
  const forwardPositions = new Set(['FORWARD', 'MID']);
  const defenderPositions = new Set(['DEF', 'GK']);

  const forwards  = stats.filter(s => forwardPositions.has(positionMap.get(s.playerId) ?? ''));
  const defenders = stats.filter(s => defenderPositions.has(positionMap.get(s.playerId) ?? ''));

  // 4. Pick winners
  forwards.sort((a, b)  => b.goalsScored - a.goalsScored   || b.matchesPlayed - a.matchesPlayed);
  defenders.sort((a, b) => b.matchesWon  - a.matchesWon    || b.matchesPlayed - a.matchesPlayed);

  const bestForward: SeasonAwardEntry | null = forwards[0]
    ? { playerId: forwards[0].playerId,  playerName: forwards[0].playerName,  goalsScored: forwards[0].goalsScored }
    : null;

  const bestDefender: SeasonAwardEntry | null = defenders[0]
    ? { playerId: defenders[0].playerId, playerName: defenders[0].playerName, matchesWon: defenders[0].matchesWon }
    : null;

  return { bestForward, bestDefender };
}

// ─── End Season ───────────────────────────────────────────────────────────────
// Called automatically when matchCount hits SEASON_MATCH_LIMIT.
// 1. Computes awards
// 2. Marks season as completed
// 3. Creates next season
// 4. Writes global notification for popup

export async function endSeason(currentSeason: SeasonDoc): Promise<void> {
  const { bestForward, bestDefender } = await computeSeasonAwards(currentSeason.seasonId);

  // 1. Mark current season completed
  await updateDoc(doc(db, 'seasons', currentSeason.seasonId), {
    status: 'completed',
    completedAt: Timestamp.now(),
    bestForward:  bestForward  ?? null,
    bestDefender: bestDefender ?? null,
  });

  // 2. Create next season
  const nextNumber = currentSeason.seasonNumber + 1;
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

  // 3. Write global notification for popup
  await setDoc(doc(db, 'appConfig', 'seasonEndNotification'), {
    type: 'season_end',
    seasonId: currentSeason.seasonId,
    seasonNumber: currentSeason.seasonNumber,
    bestForward:  bestForward  ?? null,
    bestDefender: bestDefender ?? null,
    createdAt: Timestamp.now(),
  });
}

// ─── Increment Season Match Count ─────────────────────────────────────────────
// Called after every match save. Increments count and triggers endSeason if limit hit.

export async function checkAndMaybeEndSeason(): Promise<void> {
  const season = await getOrCreateActiveSeason();
  const newCount = season.matchCount + 1;

  // Update count first
  await updateDoc(doc(db, 'seasons', season.seasonId), {
    matchCount: newCount,
  });

  // Check if season is over
  if (newCount >= SEASON_MATCH_LIMIT) {
    await endSeason({ ...season, matchCount: newCount });
  }
}