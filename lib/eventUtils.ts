import { db } from './firebase';
import { collection, getDocs, doc, updateDoc, setDoc, getDoc, Timestamp } from 'firebase/firestore';

/**
 * Calculate per-player amount with rounding rules
 * - Minimum ₹100
 * - Rounded to nearest ₹10
 */
export function calculatePerPlayerAmount(totalAmount: number, playerCount: number): number {
  if (playerCount === 0) return 0;

  const rawAmount = totalAmount / playerCount;

  // Minimum is ₹100
  if (rawAmount < 100) return 100;

  // Round to nearest ₹10
  const rounded = Math.round(rawAmount / 10) * 10;

  // Ensure minimum ₹100
  return Math.max(rounded, 100);
}

interface EventData {
  title: string;
  date: Timestamp;
  time: string;
  totalAmount: number;
  participantCount: number;
  editHistory?: EventEditHistory[];
}

interface EventEditHistory {
  action: string;
  playerId?: string;
  playerName?: string;
  addedBy?: string;
  addedByRole?: string;
  editedAt: Timestamp;
  recalculationTriggered: boolean;
  oldParticipantCount?: number;
  newParticipantCount?: number;
  oldPerPlayerAmount?: number;
  newPerPlayerAmount?: number;
}

/**
 * Create payment records for all participants when event closes
 */
export async function createEventPayments(eventId: string, eventData: EventData, participantCount: number) {
  if (participantCount === 0) return;

  try {
    const perPlayerAmount = calculatePerPlayerAmount(eventData.totalAmount, participantCount);

    // Get all participants for this event
    const participantsRef = collection(db, 'eventParticipants');
    const participantsSnapshot = await getDocs(participantsRef);

    const promises = participantsSnapshot.docs.map(async (docSnap) => {
      const data = docSnap.data();
      if (data.eventId === eventId && data.currentStatus === 'joined') {
        // Create payment record
        const paymentRef = doc(collection(db, 'eventPayments'));
        await setDoc(paymentRef, {
          eventId: eventId,
          eventTitle: eventData.title,
          eventDate: eventData.date,
          eventTime: eventData.time,
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
    console.log(`✅ Created ${promises.length} payment records for event ${eventId}`);
  } catch (error) {
    console.error('Error creating payments:', error);
    throw error;
  }
}

/**
 * Recalculate all payments for an event after changes
 * - Updates current amount due
 * - Calculates team fund from overpayments
 */
export async function recalculateEventPayments(eventId: string, newTotalAmount: number, participantCount: number) {
  try {
    const newPerPlayerAmount = calculatePerPlayerAmount(newTotalAmount, participantCount);

    // Get all payments for this event
    const paymentsRef = collection(db, 'eventPayments');
    const paymentsSnapshot = await getDocs(paymentsRef);

    let teamFund = 0;

    const promises = paymentsSnapshot.docs.map(async (docSnap) => {
      const data = docSnap.data();
      if (data.eventId === eventId) {
        const totalPaid = data.totalPaid || 0;
        const extraAmount = totalPaid - newPerPlayerAmount;

        // Add to team fund if overpaid
        if (extraAmount > 0) {
          teamFund += extraAmount;
        }

        // Update payment status
        let paymentStatus = 'pending';
        if (totalPaid >= newPerPlayerAmount) {
          paymentStatus = 'paid';
        } else if (totalPaid > 0) {
          paymentStatus = 'partial';
        }

        await updateDoc(doc(db, 'eventPayments', docSnap.id), {
          currentAmountDue: newPerPlayerAmount,
          paymentStatus: paymentStatus,
          updatedAt: Timestamp.now(),
        });
      }
    });

    await Promise.all(promises);

    // Update event team fund
    await updateDoc(doc(db, 'events', eventId), {
      teamFund: teamFund,
      lastEditedAt: Timestamp.now(),
    });

    console.log(`✅ Recalculated payments for event ${eventId}. Team fund: ₹${teamFund}`);
    return teamFund;
  } catch (error) {
    console.error('Error recalculating payments:', error);
    throw error;
  }
}

/**
 * Check all events and auto-close those past deadline
 * Also auto-lock events past their date
 */
export async function checkAndAutoCloseEvents() {
  try {
    const eventsRef = collection(db, 'events');
    const eventsSnapshot = await getDocs(eventsRef);
    const now = Timestamp.now();

    const promises = eventsSnapshot.docs.map(async (docSnap) => {
      const data = docSnap.data();
      const eventId = docSnap.id;

      // Auto-close if deadline passed and still open
      if (data.status === 'open' && data.deadline.toMillis() <= now.toMillis()) {
        // Get participant count
        const participantsRef = collection(db, 'eventParticipants');
        const participantsSnapshot = await getDocs(participantsRef);
        let count = 0;
        participantsSnapshot.forEach((pDoc) => {
          const pData = pDoc.data();
          if (pData.eventId === eventId && pData.currentStatus === 'joined') {
            count++;
          }
        });

        // Close event
        await updateDoc(doc(db, 'events', eventId), {
          status: 'closed',
          closedAt: now,
          participantCount: count,
          originalParticipantCount: count,
        });

        // Create payments
        const eventData: EventData = {
          title: data.title,
          date: data.date,
          time: data.time,
          totalAmount: data.totalAmount,
          participantCount: count,
        };
        await createEventPayments(eventId, eventData, count);

        console.log(`✅ Auto-closed event: ${data.title} (${count} participants)`);
      }

      // Auto-lock if event date passed and not locked
      if (data.status === 'closed' && data.date.toMillis() <= now.toMillis()) {
        await updateDoc(doc(db, 'events', eventId), {
          status: 'locked',
          autoLockedAt: now,
        });
        console.log(`🔒 Auto-locked event: ${data.title}`);
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error('Error auto-closing events:', error);
  }
}

/**
 * Add a player to a closed event and recalculate payments
 */
export async function addPlayerToClosedEvent(
  eventId: string,
  playerId: string,
  playerName: string,
  playerEmail: string,
  addedBy: string,
  addedByRole: 'secretary' | 'treasurer'
) {
  try {
    // Fetch event data using getDoc instead of getDocs
    const eventDocRef = doc(db, 'events', eventId);
    const eventDocSnap = await getDoc(eventDocRef);

    if (!eventDocSnap.exists()) {
      throw new Error('Event not found');
    }

    const eventData = eventDocSnap.data() as EventData;

    // Create participant record
    const participantRef = doc(collection(db, 'eventParticipants'));
    await setDoc(participantRef, {
      eventId: eventId,
      playerId: playerId,
      playerName: playerName,
      playerEmail: playerEmail,
      joinedAt: Timestamp.now(),
      currentStatus: 'joined',
      addedAfterClose: true,
      addedBy: addedBy,
      addedByRole: addedByRole,
    });

    // Update participant count
    const newParticipantCount = eventData.participantCount + 1;
    await updateDoc(eventDocRef, {
      participantCount: newParticipantCount,
    });

    // Calculate new per-player amount
    const newPerPlayerAmount = calculatePerPlayerAmount(eventData.totalAmount, newParticipantCount);

    // Create payment for new player
    const paymentRef = doc(collection(db, 'eventPayments'));
    await setDoc(paymentRef, {
      eventId: eventId,
      eventTitle: eventData.title,
      eventDate: eventData.date,
      eventTime: eventData.time,
      playerId: playerId,
      playerName: playerName,
      originalAmountDue: newPerPlayerAmount,
      currentAmountDue: newPerPlayerAmount,
      totalPaid: 0,
      paymentStatus: 'pending',
      paidAt: null,
      markedPaidBy: null,
      markedPaidByName: null,
      addedAfterClose: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Recalculate all payments
    await recalculateEventPayments(eventId, eventData.totalAmount, newParticipantCount);

    // Add to edit history
    const editHistory = eventData.editHistory || [];
    editHistory.push({
      action: 'player_added',
      playerId: playerId,
      playerName: playerName,
      addedBy: addedBy,
      addedByRole: addedByRole,
      editedAt: Timestamp.now(),
      recalculationTriggered: true,
      oldParticipantCount: eventData.participantCount,
      newParticipantCount: newParticipantCount,
      oldPerPlayerAmount: calculatePerPlayerAmount(eventData.totalAmount, eventData.participantCount),
      newPerPlayerAmount: newPerPlayerAmount,
    });

    await updateDoc(eventDocRef, {
      editHistory: editHistory,
      lastEditedAt: Timestamp.now(),
    });

    console.log(`✅ Added player ${playerName} to closed event ${eventData.title}`);
  } catch (error) {
    console.error('Error adding player to closed event:', error);
    throw error;
  }
}
