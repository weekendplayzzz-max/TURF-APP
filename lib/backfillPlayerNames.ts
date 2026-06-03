import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';

type NameMap = Map<string, string>;

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function buildCanonicalNameMap(): Promise<NameMap> {
  const map = new Map<string, string>();
  const snap = await getDocs(collection(db, 'userProfiles'));

  snap.forEach((docSnap) => {
    const data = docSnap.data();

    // Regular player
    if (data.userId) {
      const fullName =
        normalize(data.fullName) ||
        normalize(data.displayName) ||
        normalize(data.name);

      if (fullName) {
        map.set(data.userId, fullName);
      }
    }

    // Guest players nested under the user profile
    if (Array.isArray(data.guestProfiles)) {
      data.guestProfiles.forEach((guest: any) => {
        if (!guest?.guestId) return;

        const guestName =
          normalize(guest.fullName) ||
          normalize(guest.guestName) ||
          normalize(guest.playerName) ||
          normalize(guest.name);

        if (guestName) {
          map.set(guest.guestId, guestName);
        }
      });
    }
  });

  return map;
}

export async function backfillPlayerNames(): Promise<string> {
  const nameMap = await buildCanonicalNameMap();

  if (nameMap.size === 0) {
    return 'No names found in userProfiles. Nothing updated.';
  }

  let updatedPlayerStats = 0;
  let updatedSeasonPlayerStats = 0;
  let updatedSeasonAwards = 0;

  // ── playerStats ────────────────────────────────────────────────────────────
  {
    const snap = await getDocs(collection(db, 'playerStats'));
    let batch = writeBatch(db);
    let ops = 0;

    for (const d of snap.docs) {
      const data = d.data();
      const mappedName = nameMap.get(data.playerId);
      if (!mappedName) continue;
      if (mappedName === data.playerName) continue;

      batch.update(d.ref, {
        playerName: mappedName,
      });
      ops++;
      updatedPlayerStats++;

      if (ops === 450) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }

    if (ops > 0) {
      await batch.commit();
    }
  }

  // ── seasonPlayerStats ──────────────────────────────────────────────────────
  {
    const snap = await getDocs(collection(db, 'seasonPlayerStats'));
    let batch = writeBatch(db);
    let ops = 0;

    for (const d of snap.docs) {
      const data = d.data();
      const mappedName = nameMap.get(data.playerId);
      if (!mappedName) continue;
      if (mappedName === data.playerName) continue;

      batch.update(d.ref, {
        playerName: mappedName,
      });
      ops++;
      updatedSeasonPlayerStats++;

      if (ops === 450) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }

    if (ops > 0) {
      await batch.commit();
    }
  }

  // ── seasons awards snapshot names ─────────────────────────────────────────
  {
    const snap = await getDocs(collection(db, 'seasons'));
    let batch = writeBatch(db);
    let ops = 0;

    for (const d of snap.docs) {
      const data = d.data();
      const updates: Record<string, string> = {};

      if (data.bestForward?.playerId) {
        const mappedForward = nameMap.get(data.bestForward.playerId);
        if (mappedForward && mappedForward !== data.bestForward.playerName) {
          updates['bestForward.playerName'] = mappedForward;
        }
      }

      if (data.bestDefender?.playerId) {
        const mappedDefender = nameMap.get(data.bestDefender.playerId);
        if (mappedDefender && mappedDefender !== data.bestDefender.playerName) {
          updates['bestDefender.playerName'] = mappedDefender;
        }
      }

      if (Object.keys(updates).length === 0) continue;

      batch.update(d.ref, updates);
      ops++;
      updatedSeasonAwards++;

      if (ops === 450) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }

    if (ops > 0) {
      await batch.commit();
    }
  }

  return [
    'Player name backfill complete.',
    `playerStats updated: ${updatedPlayerStats}`,
    `seasonPlayerStats updated: ${updatedSeasonPlayerStats}`,
    `season award docs updated: ${updatedSeasonAwards}`,
  ].join(' ');
}