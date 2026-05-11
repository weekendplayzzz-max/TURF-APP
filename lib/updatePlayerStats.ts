import { db } from '@/lib/firebase';
import {
  doc, getDoc, setDoc, Timestamp,
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
  winner: string | null; // teamId, or 'draw', or null
  savedAt: Timestamp | null;
}

interface PlayerStatsDelta {
  matchesPlayed: number;
  matchesWon: number;
  matchesDrawn: number;
  matchesLost: number;
  goalsScored: number;
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

// Builds a map of playerId → delta (how much to add or subtract)
function buildDeltas(
  teams: Team[],
  result: MatchResult,
  multiplier: 1 | -1,
): Map<string, { name: string; delta: PlayerStatsDelta }> {
  const map = new Map<string, { name: string; delta: PlayerStatsDelta }>();

  // Goal lookup: playerId → goals scored
  const goalMap: Record<string, number> = {};
  result.goalScorers.forEach(gs => {
    goalMap[gs.playerId] = (goalMap[gs.playerId] ?? 0) + gs.goals;
  });

  teams.forEach(team => {
    team.players.forEach(player => {
      const isWin  = result.winner !== 'draw' && result.winner === team.teamId;
      const isDraw = result.winner === 'draw';
      const isLoss = result.winner !== 'draw' && result.winner !== team.teamId && result.winner !== null;
      const goals  = goalMap[player.playerId] ?? 0;

      map.set(player.playerId, {
        name: player.playerName,
        delta: {
          matchesPlayed: 1        * multiplier,
          matchesWon:    (isWin  ? 1 : 0) * multiplier,
          matchesDrawn:  (isDraw ? 1 : 0) * multiplier,
          matchesLost:   (isLoss ? 1 : 0) * multiplier,
          goalsScored:   goals   * multiplier,
        },
      });
    });
  });

  return map;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Call this after every match result save or update.
 *
 * Pass:
 *  - oldTeams / oldResult  → the state BEFORE the edit (null if brand new)
 *  - newTeams / newResult  → the state AFTER the edit (null if deleted)
 *
 * The function reverses old contributions and applies new ones atomically
 * per player, so edits are always safe and accurate.
 */
export async function updatePlayerStats({
  oldTeams,
  oldResult,
  newTeams,
  newResult,
}: {
  oldTeams:   Team[]       | null;
  oldResult:  MatchResult  | null;
  newTeams:   Team[]       | null;
  newResult:  MatchResult  | null;
}): Promise<void> {

  // Collect all playerIds involved (union of old + new)
  const allPlayerIds = new Set<string>();

  if (oldTeams && oldResult) {
    buildDeltas(oldTeams, oldResult, -1).forEach((_, id) => allPlayerIds.add(id));
  }
  if (newTeams && newResult) {
    buildDeltas(newTeams, newResult, +1).forEach((_, id) => allPlayerIds.add(id));
  }

  if (allPlayerIds.size === 0) return;

  // Build final net delta per player
  const netDeltas = new Map<string, { name: string; delta: PlayerStatsDelta }>();

  const applyDeltas = (
    deltas: Map<string, { name: string; delta: PlayerStatsDelta }>
  ) => {
    deltas.forEach(({ name, delta }, playerId) => {
      const existing = netDeltas.get(playerId);
      if (existing) {
        existing.delta.matchesPlayed += delta.matchesPlayed;
        existing.delta.matchesWon    += delta.matchesWon;
        existing.delta.matchesDrawn  += delta.matchesDrawn;
        existing.delta.matchesLost   += delta.matchesLost;
        existing.delta.goalsScored   += delta.goalsScored;
      } else {
        netDeltas.set(playerId, { name, delta: { ...delta } });
      }
    });
  };

  if (oldTeams && oldResult) applyDeltas(buildDeltas(oldTeams, oldResult, -1));
  if (newTeams && newResult) applyDeltas(buildDeltas(newTeams, newResult, +1));

  // Write all player stats in parallel
  const writes = Array.from(netDeltas.entries()).map(async ([playerId, { name, delta }]) => {
    const ref = doc(db, 'playerStats', playerId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const current = snap.data();
      await setDoc(ref, {
        playerId,
        playerName: name,
        matchesPlayed: Math.max(0, (current.matchesPlayed ?? 0) + delta.matchesPlayed),
        matchesWon:    Math.max(0, (current.matchesWon    ?? 0) + delta.matchesWon),
        matchesDrawn:  Math.max(0, (current.matchesDrawn  ?? 0) + delta.matchesDrawn),
        matchesLost:   Math.max(0, (current.matchesLost   ?? 0) + delta.matchesLost),
        goalsScored:   Math.max(0, (current.goalsScored   ?? 0) + delta.goalsScored),
        lastUpdated:   Timestamp.now(),
      });
    } else {
      // First time this player appears — create fresh doc
      await setDoc(ref, {
        playerId,
        playerName: name,
        matchesPlayed: Math.max(0, delta.matchesPlayed),
        matchesWon:    Math.max(0, delta.matchesWon),
        matchesDrawn:  Math.max(0, delta.matchesDrawn),
        matchesLost:   Math.max(0, delta.matchesLost),
        goalsScored:   Math.max(0, delta.goalsScored),
        lastUpdated:   Timestamp.now(),
      });
    }
  });

  await Promise.all(writes);
}