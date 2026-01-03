import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  setDoc, 
  deleteDoc, 
  Timestamp 
} from 'firebase/firestore';

interface EventEditHistory {
  action: 'title_updated' | 'amount_updated' | 'duration_updated' | 'player_added';
  oldValue: string | number;
  newValue: string | number;
  editedBy: string;
  editedByRole: string;
  editedAt: Timestamp;
  recalculationTriggered: boolean;
}

interface Event {
  id: string;
  title: string;
  date: Timestamp;
  time: string;
  totalAmount: number;
  durationHours: number;
  deadline: Timestamp;
  status: 'open' | 'closed' | 'locked';
  participantCount: number;
  teamFund: number;
  createdBy: string;
  createdByRole: string;
  createdAt: Timestamp;
  editHistory?: EventEditHistory[]; // ✅ FIXED!
}
export function calculatePerPlayerAmount(totalAmount: number, playerCount: number): number {
  if (playerCount === 0) return 0;
  const rawAmount = totalAmount / playerCount;
  if (rawAmount < 100) return 100;
  const rounded = Math.round(rawAmount / 10) * 10;
  return Math.max(rounded, 100);
}

export async function createEventPayments(eventId: string, event: Event, participantCount: number) {
  if (participantCount === 0) return;

  try {
    const perPlayerAmount = calculatePerPlayerAmount(event.totalAmount, participantCount);
    const participantsRef = collection(db, 'eventParticipants');
    const participantsSnapshot = await getDocs(participantsRef);

    const promises = participantsSnapshot.docs.map(async (docSnap) => {
      const data = docSnap.data();
      if (data.eventId === eventId && data.currentStatus === 'joined') {
        const paymentRef = doc(collection(db, 'eventPayments'));
        await setDoc(paymentRef, {
          eventId,
          eventTitle: event.title,
          eventDate: event.date,
          eventTime: event.time,
          playerId: data.playerId,
          playerName: data.playerName,
          originalAmountDue: perPlayerAmount,
          currentAmountDue: perPlayerAmount,
          totalPaid: 0,
          paymentStatus: 'pending',
          paidAt: null,
          markedPaidBy: null,
          markedPaidByName: null,
          addedAfterClose: false,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error('Error creating payments:', error);
  }
}

export async function closeEventHelper(eventId: string, events: Event[]) {
  const eventDoc = doc(db, 'events', eventId);
  const event = events.find((e) => e.id === eventId);
  if (!event) throw new Error('Event not found');

  const participantsRef = collection(db, 'eventParticipants');
  const participantsSnapshot = await getDocs(participantsRef);
  let count = 0;
  
  participantsSnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.eventId === eventId && data.currentStatus === 'joined') {
      count++;
    }
  });

  await updateDoc(eventDoc, {
    status: 'closed',
    closedAt: Timestamp.now(),
    participantCount: count,
    originalParticipantCount: count,
  });

  await createEventPayments(eventId, event, count);
  return count;
}

export async function reopenEventHelper(eventId: string) {
  const eventDoc = doc(db, 'events', eventId);
  const paymentsRef = collection(db, 'eventPayments');
  const paymentsSnapshot = await getDocs(paymentsRef);

  const deletePromises = paymentsSnapshot.docs.map(async (docSnap) => {
    const data = docSnap.data();
    if (data.eventId === eventId) {
      await deleteDoc(doc(db, 'eventPayments', docSnap.id));
    }
  });

  await Promise.all(deletePromises);

  await updateDoc(eventDoc, {
    status: 'open',
    closedAt: null,
    participantCount: 0,
    originalParticipantCount: 0,
    teamFund: 0,
  });
}

export async function recalculatePayments(eventId: string, newTotalAmount: number, participantCount: number) {
  const newPerPlayerAmount = calculatePerPlayerAmount(newTotalAmount, participantCount);
  const paymentsRef = collection(db, 'eventPayments');
  const paymentsSnapshot = await getDocs(paymentsRef);

  let teamFund = 0;

  const promises = paymentsSnapshot.docs.map(async (docSnap) => {
    const data = docSnap.data();
    if (data.eventId === eventId) {
      const totalPaid = data.totalPaid || 0;
      const extraAmount = totalPaid - newPerPlayerAmount;

      if (extraAmount > 0) {
        teamFund += extraAmount;
      }

      await updateDoc(doc(db, 'eventPayments', docSnap.id), {
        currentAmountDue: newPerPlayerAmount,
        updatedAt: Timestamp.now(),
      });
    }
  });

  await Promise.all(promises);

  await updateDoc(doc(db, 'events', eventId), {
    teamFund: teamFund,
  });

  return teamFund;
}

export async function checkAndAutoCloseEvents() {
  const eventsRef = collection(db, 'events');
  const eventsSnapshot = await getDocs(eventsRef);
  const now = Timestamp.now();

  const promises = eventsSnapshot.docs.map(async (docSnap) => {
    const data = docSnap.data();
    const eventId = docSnap.id;

    if (data.status === 'open' && data.deadline.toMillis() <= now.toMillis()) {
      const participantsRef = collection(db, 'eventParticipants');
      const participantsSnapshot = await getDocs(participantsRef);
      let count = 0;
      
      participantsSnapshot.forEach((pDoc) => {
        const pData = pDoc.data();
        if (pData.eventId === eventId && pData.currentStatus === 'joined') {
          count++;
        }
      });

      await updateDoc(doc(db, 'events', eventId), {
        status: 'closed',
        closedAt: now,
        participantCount: count,
        originalParticipantCount: count,
      });

      const event: Event = {
        id: eventId,
        title: data.title,
        date: data.date,
        time: data.time,
        totalAmount: data.totalAmount,
        durationHours: data.durationHours,
        deadline: data.deadline,
        status: 'closed',
        participantCount: count,
        teamFund: 0,
        createdBy: data.createdBy,
        createdByRole: data.createdByRole,
        createdAt: data.createdAt,
      };

      await createEventPayments(eventId, event, count);
    }

    if (data.status === 'closed' && data.date.toMillis() <= now.toMillis()) {
      await updateDoc(doc(db, 'events', eventId), {
        status: 'locked',
        autoLockedAt: now,
      });
    }
  });

  await Promise.all(promises);
}

export async function fetchParticipantCounts() {
  const participantsRef = collection(db, 'eventParticipants');
  const participantsSnapshot = await getDocs(participantsRef);
  
  const participantCounts: { [eventId: string]: number } = {};
  participantsSnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.currentStatus === 'joined') {
      participantCounts[data.eventId] = (participantCounts[data.eventId] || 0) + 1;
    }
  });

  return participantCounts;
}
