'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db , auth} from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';

interface FinanceSummary {
  totalContributions: number;
  totalExpenses: number;
  balance: number;
  totalPlayers: number;
  totalTransactions: number;
}

export default function TreasurerDashboard() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState<FinanceSummary>({
    totalContributions: 0,
    totalExpenses: 0,
    balance: 0,
    totalPlayers: 0,
    totalTransactions: 0,
  });
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  const fetchSummary = useCallback(async () => {
    try {
      setLoadingData(true);

      // Fetch all appointed players
      const playersRef = collection(db, 'appointedPlayers');
      const playersSnapshot = await getDocs(playersRef);
      const totalPlayers = playersSnapshot.size;

      // Fetch all financial transactions
      const financesRef = collection(db, 'finances');
      const financesSnapshot = await getDocs(financesRef);
      
      let contributions = 0;
      let expenses = 0;

      financesSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.type === 'contribution') {
          contributions += data.amount || 0;
        } else if (data.type === 'expense') {
          expenses += data.amount || 0;
        }
      });

      setSummary({
        totalContributions: contributions,
        totalExpenses: expenses,
        balance: contributions - expenses,
        totalPlayers: totalPlayers,
        totalTransactions: financesSnapshot.size,
      });
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'treasurer') {
      fetchSummary();
    }
  }, [role, fetchSummary]);

  const handleLogout = async () => {
  try {
    await signOut(auth);
    router.push('/login');
  } catch (error) {
    console.error('Logout failed:', error);
  }
};


  if (loading || !user || role !== 'treasurer') {
    return null;
  }

  return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">💰 Treasurer Dashboard</h1>
              <p className="text-blue-100 text-base">
                Welcome, <span className="font-semibold">{user.displayName || user.email}</span>
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-6 py-3 bg-white text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition shadow-md"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 text-lg font-medium">Loading dashboard...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Financial Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              {/* Total Contributions */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-8 rounded-xl border-2 border-green-300 shadow-lg hover:shadow-xl transition">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-gray-700 text-sm font-bold uppercase tracking-wide">Total Contributions</p>
                  <span className="text-3xl">💵</span>
                </div>
                <p className="text-4xl font-black text-green-700 mt-2">
                  ₹{summary.totalContributions.toLocaleString()}
                </p>
              </div>

              {/* Total Expenses */}
              <div className="bg-gradient-to-br from-red-50 to-red-100 p-8 rounded-xl border-2 border-red-300 shadow-lg hover:shadow-xl transition">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-gray-700 text-sm font-bold uppercase tracking-wide">Total Expenses</p>
                  <span className="text-3xl">💸</span>
                </div>
                <p className="text-4xl font-black text-red-700 mt-2">
                  ₹{summary.totalExpenses.toLocaleString()}
                </p>
              </div>

              {/* Current Balance */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-8 rounded-xl border-2 border-blue-300 shadow-lg hover:shadow-xl transition">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-gray-700 text-sm font-bold uppercase tracking-wide">Current Balance</p>
                  <span className="text-3xl">💰</span>
                </div>
                <p className="text-4xl font-black text-blue-700 mt-2">
                  ₹{summary.balance.toLocaleString()}
                </p>
              </div>

              {/* Total Players */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-8 rounded-xl border-2 border-purple-300 shadow-lg hover:shadow-xl transition">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-gray-700 text-sm font-bold uppercase tracking-wide">Total Players</p>
                  <span className="text-3xl">👥</span>
                </div>
                <p className="text-4xl font-black text-purple-700 mt-2">
                  {summary.totalPlayers}
                </p>
              </div>
            </div>

{/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
                <span className="text-3xl mr-3">📊</span>
                Quick Actions
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  onClick={() => router.push('/treasurer/create-event')}
                  className="p-4 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded-lg hover:from-green-700 hover:to-green-800 transition"
                >
                  🏆 Create Event
                </button>
                <button
                  onClick={() => router.push('/treasurer/manage-events')}
                  className="p-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-purple-800 transition"
                >
                  📊 Manage Events
                </button>
                <button
                  onClick={() => router.push('/treasurer/manage-finances')}
                  className="p-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
                >
                  💵 Manage Finances
                </button>
                <button
                  onClick={() => router.push('/treasurer/view-players')}
                  className="p-4 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition"
                >
                  👥 View Players
                </button>
                <button
                  onClick={() => router.push('/treasurer/finance-report')}
                  className="p-4 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition"
                >
                  📈 Finance Report
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}