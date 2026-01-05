import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  setDoc, 
  deleteDoc, 
  getDoc,
  Timestamp,
  addDoc,
  query,
  where
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
  totalCollected: number; // NEW: Real money collected
  eventPaidToVendor: boolean; // NEW: Payment status to turf
  eventPaidAt: Timestamp | null; // NEW: When paid to vendor
  eventPaidBy: string | null; // NEW: Who paid vendor
  createdBy: string;
  createdByRole: string;
  createdAt: Timestamp;
  editHistory?: EventEditHistory[];
}

interface Expense {
  id: string;
  expenseType: 'event_payment' | 'other_expense';
  eventId?: string;
  eventTitle?: string;
  expenseName?: string;
  description?: string;
  amount: number;
  dateSpent: Timestamp;
  createdBy: string;
  createdByEmail: string;
  createdByRole: string;
  createdAt: Timestamp;
}

/**
 * Calculate per-player amount with rounding rules
 * - Minimum ₹100
 * - Rounded UP to nearest ₹10 (e.g., 112 -> 120, 125 -> 130)
 */
export function calculatePerPlayerAmount(totalAmount: number, playerCount: number): number {
  if (playerCount === 0) return 0;

  const rawAmount = totalAmount / playerCount;

  // Minimum is ₹100
  if (rawAmount < 100) return 100;

  // Round UP to nearest ₹10
  const roundedUp = Math.ceil(rawAmount / 10) * 10;

  // Ensure minimum ₹100
  return Math.max(roundedUp, 100);
}

/**
 * Calculate event's total collected amount from payment records
 * Uses write-time aggregation pattern for real-time updates
 */
export async function calculateEventTotalCollected(eventId: string): Promise<number> {
  try {
    const paymentsRef = collection(db, 'eventPayments');
    const paymentsSnapshot = await getDocs(paymentsRef);
    
    let totalCollected = 0;
    paymentsSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.eventId === eventId && data.paymentStatus === 'paid') {
        totalCollected += data.totalPaid || 0;
      }
    });
    
    return totalCollected;
  } catch (error) {
    console.error('Error calculating total collected:', error);
    return 0;
  }
}

/**
 * Update event's totalCollected field in real-time
 * Called after every payment status change
 */
export async function updateEventTotalCollected(eventId: string): Promise<void> {
  try {
    const totalCollected = await calculateEventTotalCollected(eventId);
    const eventRef = doc(db, 'events', eventId);
    
    await updateDoc(eventRef, {
      totalCollected: totalCollected,
      updatedAt: Timestamp.now(),
    });
    
    console.log(`✅ Updated totalCollected for event ${eventId}: ₹${totalCollected}`);
  } catch (error) {
    console.error('Error updating total collected:', error);
  }
}

/**
 * Create payment records when event closes
 */
/**
 * Create payment records when event closes
 */
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
          playerEmail: data.playerEmail || '',  // ← ADD THIS
          playerType: data.playerType || 'regular',  // ← ADD THIS (critical for guests!)
          parentId: data.parentId || null,  // ← ADD THIS (critical for guests!)
          parentName: data.parentName || null,  // ← ADD THIS (optional but helpful)
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

    // Initialize totalCollected as 0
    await updateDoc(doc(db, 'events', eventId), {
      totalCollected: 0,
    });

    console.log(`✅ Created payments for event ${eventId}. Per player: ₹${perPlayerAmount}`);
  } catch (error) {
    console.error('Error creating payments:', error);
  }
}


/**
 * Close event and create payment records
 */
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
    totalCollected: 0,
    eventPaidToVendor: false,
  });

  await createEventPayments(eventId, event, count);
  return count;
}

/**
 * Reopen event and delete payment records
 */
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
    totalCollected: 0,
    eventPaidToVendor: false,
  });
}

/**
 * Recalculate payments when event details change
 */
export async function recalculatePayments(eventId: string, newTotalAmount: number, participantCount: number) {
  const newPerPlayerAmount = calculatePerPlayerAmount(newTotalAmount, participantCount);
  const paymentsRef = collection(db, 'eventPayments');
  const paymentsSnapshot = await getDocs(paymentsRef);

  const promises = paymentsSnapshot.docs.map(async (docSnap) => {
    const data = docSnap.data();
    if (data.eventId === eventId) {
      const totalPaid = data.totalPaid || 0;

      // Update payment status
      let paymentStatus = 'pending';
      if (totalPaid >= newPerPlayerAmount) {
        paymentStatus = 'paid';
      }

      await updateDoc(doc(db, 'eventPayments', docSnap.id), {
        currentAmountDue: newPerPlayerAmount,
        paymentStatus: paymentStatus,
        updatedAt: Timestamp.now(),
      });
    }
  });

  await Promise.all(promises);

  // Update total collected
  await updateEventTotalCollected(eventId);

  await updateDoc(doc(db, 'events', eventId), {
    lastEditedAt: Timestamp.now(),
  });

  console.log(`✅ Recalculated payments for event ${eventId}. Per player: ₹${newPerPlayerAmount}`);
}

/**
 * Auto-close events past deadline and auto-lock events past date
 */
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
        totalCollected: 0,
        eventPaidToVendor: false,
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
        totalCollected: 0,
        eventPaidToVendor: false,
        eventPaidAt: null,
        eventPaidBy: null,
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

/**
 * Fetch participant counts per event
 */
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

// ==================== NEW FINANCIAL TRACKING SYSTEM ====================

/**
 * Calculate total income from all closed/locked events
 * Sum of totalCollected across all events
 */
export async function calculateTotalIncome(): Promise<number> {
  try {
    const eventsRef = collection(db, 'events');
    const eventsSnapshot = await getDocs(eventsRef);
    
    let totalIncome = 0;
    eventsSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if ((data.status === 'closed' || data.status === 'locked') && data.totalCollected) {
        totalIncome += data.totalCollected;
      }
    });
    
    return totalIncome;
  } catch (error) {
    console.error('Error calculating total income:', error);
    return 0;
  }
}

/**
 * Calculate total expenses from expenses collection
 */
export async function calculateTotalExpenses(): Promise<number> {
  try {
    const expensesRef = collection(db, 'expenses');
    const expensesSnapshot = await getDocs(expensesRef);
    
    let totalExpenses = 0;
    expensesSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.amount) {
        totalExpenses += data.amount;
      }
    });
    
    return totalExpenses;
  } catch (error) {
    console.error('Error calculating total expenses:', error);
    return 0;
  }
}

/**
 * Get comprehensive financial summary
 * Returns: Total Income, Total Expenses, Available Balance
 */
/**
 * Get comprehensive financial summary (UPDATED VERSION)
 * Returns: Total Income (events + direct), Total Expenses, Available Balance
 */
export async function getFinancialSummary(): Promise<{
  totalIncome: number;
  eventIncome: number;
  directIncome: number;
  totalExpenses: number;
  availableBalance: number;
}> {
  try {
    const eventIncome = await calculateTotalIncome(); // From events
    const directIncome = await calculateTotalDirectIncome(); // From income collection
    const totalIncome = eventIncome + directIncome;
    const totalExpenses = await calculateTotalExpenses();
    const availableBalance = Math.max(totalIncome - totalExpenses, 0);

    return {
      totalIncome,
      eventIncome,
      directIncome,
      totalExpenses,
      availableBalance,
    };
  } catch (error) {
    console.error('Error calculating financial summary:', error);
    return {
      totalIncome: 0,
      eventIncome: 0,
      directIncome: 0,
      totalExpenses: 0,
      availableBalance: 0,
    };
  }
}


/**
 * Mark event as paid to vendor
 * Creates expense record and validates sufficient funds
 */
export async function markEventAsPaidToVendor(
  eventId: string,
  paidBy: string,
  paidByEmail: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Get event details
    const eventRef = doc(db, 'events', eventId);
    const eventSnap = await getDoc(eventRef);
    
    if (!eventSnap.exists()) {
      return { success: false, message: 'Event not found' };
    }

    const eventData = eventSnap.data();

    // Check if already paid
    if (eventData.eventPaidToVendor) {
      return { success: false, message: 'Event already marked as paid to vendor' };
    }

    // Validate sufficient funds collected
    const totalCollected = eventData.totalCollected || 0;
    const eventAmount = eventData.totalAmount;

    if (totalCollected < eventAmount) {
      console.warn(`⚠️ Insufficient funds: Collected ₹${totalCollected}, Required ₹${eventAmount}`);
      // Allow payment but warn
    }

    // Create expense record
    await addDoc(collection(db, 'expenses'), {
      expenseType: 'event_payment',
      eventId: eventId,
      eventTitle: eventData.title,
      amount: eventAmount,
      dateSpent: Timestamp.now(),
      createdBy: paidBy,
      createdByEmail: paidByEmail,
      createdByRole: 'treasurer',
      createdAt: Timestamp.now(),
    });

    // Update event
    await updateDoc(eventRef, {
      eventPaidToVendor: true,
      eventPaidAt: Timestamp.now(),
      eventPaidBy: paidBy,
      updatedAt: Timestamp.now(),
    });

    return { 
      success: true, 
      message: `Event marked as paid. Expense of ₹${eventAmount} recorded.` 
    };
  } catch (error) {
    console.error('Error marking event as paid:', error);
    return { success: false, message: 'Failed to mark event as paid' };
  }
}

/**
 * Add other expenses (non-event: jerseys, equipment, etc.)
 */
export async function addOtherExpense(
  expenseName: string,
  amount: number,
  dateSpent: Date,
  description: string | null,
  createdBy: string,
  createdByEmail: string
): Promise<{ success: boolean; message: string; availableBalance?: number }> {
  try {
    // Check if sufficient balance
    const { availableBalance } = await getFinancialSummary();
    
    if (amount > availableBalance) {
      return {
        success: false,
        message: `Insufficient balance! Available: ₹${availableBalance}, Requested: ₹${amount}`,
      };
    }

    // Add expense
    await addDoc(collection(db, 'expenses'), {
      expenseType: 'other_expense',
      expenseName,
      description,
      amount,
      dateSpent: Timestamp.fromDate(dateSpent),
      createdBy,
      createdByEmail,
      createdByRole: 'treasurer',
      createdAt: Timestamp.now(),
    });

    // Calculate new balance
    const newBalance = availableBalance - amount;

    return {
      success: true,
      message: `Expense added successfully! New balance: ₹${newBalance}`,
      availableBalance: newBalance,
    };
  } catch (error) {
    console.error('Error adding expense:', error);
    return {
      success: false,
      message: 'Failed to add expense',
    };
  }
}

/**
 * Delete expense (and unmark event if it's an event payment)
 */
export async function deleteExpense(expenseId: string): Promise<{
  success: boolean;
  message: string;
  availableBalance?: number;
}> {
  try {
    const expenseRef = doc(db, 'expenses', expenseId);
    const expenseSnap = await getDoc(expenseRef);

    if (!expenseSnap.exists()) {
      return { success: false, message: 'Expense not found' };
    }

    const expenseData = expenseSnap.data();

    // If it's an event payment, unmark the event
    if (expenseData.expenseType === 'event_payment' && expenseData.eventId) {
      const eventRef = doc(db, 'events', expenseData.eventId);
      await updateDoc(eventRef, {
        eventPaidToVendor: false,
        eventPaidAt: null,
        eventPaidBy: null,
        updatedAt: Timestamp.now(),
      });
    }

    // Delete expense
    await deleteDoc(expenseRef);

    // Get new balance
    const { availableBalance } = await getFinancialSummary();

    return {
      success: true,
      message: `Expense deleted successfully! New balance: ₹${availableBalance}`,
      availableBalance,
    };
  } catch (error) {
    console.error('Error deleting expense:', error);
    return {
      success: false,
      message: 'Failed to delete expense',
    };
  }
}

/**
 * Get all events that haven't been paid to vendor yet
 */
export async function getUnpaidEvents(): Promise<Event[]> {
  try {
    const eventsRef = collection(db, 'events');
    const eventsSnapshot = await getDocs(eventsRef);
    
    const unpaidEvents: Event[] = [];
    eventsSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (
        (data.status === 'closed' || data.status === 'locked') && 
        !data.eventPaidToVendor
      ) {
        unpaidEvents.push({
          id: docSnap.id,
          ...data,
        } as Event);
      }
    });
    
    return unpaidEvents;
  } catch (error) {
    console.error('Error fetching unpaid events:', error);
    return [];
  }
}
// ==================== INCOME MANAGEMENT SYSTEM ====================

interface Income {
  id: string;
  incomeName: string;
  description: string | null;
  amount: number;
  dateReceived: Timestamp;
  incomeSource: 'sponsorship' | 'donation' | 'membership_fees' | 'fundraising' | 'other';
  createdBy: string;
  createdByEmail: string;
  createdByRole: string;
  createdAt: Timestamp;
}

/**
 * Add income entry (sponsorships, donations, membership fees, etc.)
 * Only treasurer can add income
 */
export async function addIncome(
  incomeName: string,
  amount: number,
  dateReceived: Date,
  incomeSource: 'sponsorship' | 'donation' | 'membership_fees' | 'fundraising' | 'other',
  description: string | null,
  createdBy: string,
  createdByEmail: string
): Promise<{ success: boolean; message: string }> {
  try {
    if (amount <= 0) {
      return {
        success: false,
        message: 'Amount must be greater than 0',
      };
    }

    // Add income record
    await addDoc(collection(db, 'income'), {
      incomeName,
      description,
      amount,
      dateReceived: Timestamp.fromDate(dateReceived),
      incomeSource,
      createdBy,
      createdByEmail,
      createdByRole: 'treasurer',
      createdAt: Timestamp.now(),
    });

    return {
      success: true,
      message: `Income of ₹${amount.toLocaleString()} added successfully!`,
    };
  } catch (error) {
    console.error('Error adding income:', error);
    return {
      success: false,
      message: 'Failed to add income',
    };
  }
}

/**
 * Calculate total income from income collection
 */
export async function calculateTotalDirectIncome(): Promise<number> {
  try {
    const incomeRef = collection(db, 'income');
    const incomeSnapshot = await getDocs(incomeRef);
    
    let totalDirectIncome = 0;
    incomeSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.amount) {
        totalDirectIncome += data.amount;
      }
    });
    
    return totalDirectIncome;
  } catch (error) {
    console.error('Error calculating direct income:', error);
    return 0;
  }
}

/**
 * Updated: Calculate TOTAL income (events + direct income)
 */
export async function calculateTotalIncomeUpdated(): Promise<number> {
  try {
    const eventIncome = await calculateTotalIncome(); // From events
    const directIncome = await calculateTotalDirectIncome(); // From income collection
    
    return eventIncome + directIncome;
  } catch (error) {
    console.error('Error calculating total income:', error);
    return 0;
  }
}

/**
 * Updated Financial Summary including direct income
 */
export async function getFinancialSummaryUpdated(): Promise<{
  totalIncome: number;
  eventIncome: number;
  directIncome: number;
  totalExpenses: number;
  availableBalance: number;
}> {
  try {
    const eventIncome = await calculateTotalIncome();
    const directIncome = await calculateTotalDirectIncome();
    const totalIncome = eventIncome + directIncome;
    const totalExpenses = await calculateTotalExpenses();
    const availableBalance = Math.max(totalIncome - totalExpenses, 0);

    return {
      totalIncome,
      eventIncome,
      directIncome,
      totalExpenses,
      availableBalance,
    };
  } catch (error) {
    console.error('Error calculating financial summary:', error);
    return {
      totalIncome: 0,
      eventIncome: 0,
      directIncome: 0,
      totalExpenses: 0,
      availableBalance: 0,
    };
  }
}

/**
 * Delete income entry
 */
export async function deleteIncome(incomeId: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const incomeRef = doc(db, 'income', incomeId);
    const incomeSnap = await getDoc(incomeRef);

    if (!incomeSnap.exists()) {
      return { success: false, message: 'Income record not found' };
    }

    await deleteDoc(incomeRef);

    return {
      success: true,
      message: 'Income deleted successfully!',
    };
  } catch (error) {
    console.error('Error deleting income:', error);
    return {
      success: false,
      message: 'Failed to delete income',
    };
  }
}
