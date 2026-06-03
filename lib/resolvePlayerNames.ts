import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

/**
 * Builds a map of playerId → resolved display name.
 *
 * Priority:
 *  1. userProfiles.fullName (if profileCompleted and fullName is non-empty)
 *  2. fallback to the playerName stored in stats docs
 *
 * Also handles guest players via guestProfiles array inside each userProfile doc.
 * Guests don't have a fullName — they fall through to the stats fallback.
 */
export async function buildPlayerNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const snap = await getDocs(collection(db, 'userProfiles'));
  snap.forEach(d => {
    const data = d.data();

    // Registered player — use fullName if present
    if (data.profileCompleted && data.fullName?.trim()) {
      map.set(data.userId, data.fullName.trim());
    }

    // Guest players nested inside this profile — no fullName, skip
    // They will fall back to playerName from stats
  });

  return map;
}

/**
 * Resolves a single player's display name.
 *
 * @param playerId  - the player's UID or guest ID
 * @param fallback  - the playerName stored in the stats doc
 * @param nameMap   - pre-built map from buildPlayerNameMap()
 */
export function resolveName(
  playerId: string,
  fallback: string,
  nameMap: Map<string, string>
): string {
  return nameMap.get(playerId) || fallback;
}