import { db } from './firebase';
import { collection, getDocs, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

/**
 * Get total team fund accumulated from all events
 */
export async function getTotalTeamFund(): Promise<number> {
  try {
    const eventsRef = collection(db, 'events');
    const eventsSnapshot = await getDocs(eventsRef);
    
    let totalFund = 0;
    eventsSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Only count closed and locked events (team fund is calculated after closing)
      if ((data.status === 'closed' || data.status === 'locked') && data.teamFund) {
        totalFund += data.teamFund;
      }
    });
    
    return totalFund;
  } catch (error) {
    console.error('Error calculating total team fund:', error);
    return 0;
  }
}

/**
 * Get total expenses from teamExpenses collection
 */
export async function getTotalExpenses(): Promise<number> {
  try {
    const expensesRef = collection(db, 'teamExpenses');
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
 * Calculate current team fund balance
 * Balance = Total Team Fund (from events) - Total Expenses
 */
export async function getTeamFundBalance(): Promise<{
  totalFund: number;
  totalExpenses: number;
  balance: number;
}> {
  try {
    const totalFund = await getTotalTeamFund();
    const totalExpenses = await getTotalExpenses();
    const balance = totalFund - totalExpenses;

    return {
      totalFund,
      totalExpenses,
      balance: Math.max(balance, 0), // Balance cannot be negative
    };
  } catch (error) {
    console.error('Error calculating team fund balance:', error);
    return {
      totalFund: 0,
      totalExpenses: 0,
      balance: 0,
    };
  }
}

/**
 * Update team fund summary document
 * Call this after adding/deleting expenses or closing events
 */
export async function updateTeamFundSummary(): Promise<void> {
  try {
    const { totalFund, totalExpenses, balance } = await getTeamFundBalance();

    const summaryRef = doc(db, 'teamFundSummary', 'summary');
    await setDoc(summaryRef, {
      totalFund,
      totalExpenses,
      balance,
      lastUpdated: Timestamp.now(),
    });

    console.log(`✅ Team Fund Summary Updated: Fund: ₹${totalFund}, Expenses: ₹${totalExpenses}, Balance: ₹${balance}`);
  } catch (error) {
    console.error('Error updating team fund summary:', error);
    throw error;
  }
}

/**
 * Get team fund summary from cache (or calculate if not exists)
 */
export async function getTeamFundSummary(): Promise<{
  totalFund: number;
  totalExpenses: number;
  balance: number;
  lastUpdated: Timestamp | null;
}> {
  try {
    const summaryRef = doc(db, 'teamFundSummary', 'summary');
    const summaryDoc = await getDoc(summaryRef);

    if (summaryDoc.exists()) {
      const data = summaryDoc.data();
      return {
        totalFund: data.totalFund || 0,
        totalExpenses: data.totalExpenses || 0,
        balance: data.balance || 0,
        lastUpdated: data.lastUpdated || null,
      };
    } else {
      // If summary doesn't exist, calculate and create it
      await updateTeamFundSummary();
      return await getTeamFundSummary();
    }
  } catch (error) {
    console.error('Error getting team fund summary:', error);
    return {
      totalFund: 0,
      totalExpenses: 0,
      balance: 0,
      lastUpdated: null,
    };
  }
}
