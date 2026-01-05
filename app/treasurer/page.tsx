'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db, auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import Image from 'next/image';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFinancialSummary } from '@/lib/eventManagement';
import Link from 'next/link';

interface FinanceSummary {
  totalIncome: number; // Total collected from all events
  totalExpenses: number; // All expenses including event payments
  availableBalance: number; // Income - Expenses
  totalPlayers: number;
  totalTransactions: number;
  totalEvents: number;
  openEvents: number;
  closedEvents: number;
  lockedEvents: number;
}

export default function TreasurerDashboard() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  
  const [summary, setSummary] = useState<FinanceSummary>({
    totalIncome: 0,
    totalExpenses: 0,
    availableBalance: 0,
    totalPlayers: 0,
    totalTransactions: 0,
    totalEvents: 0,
    openEvents: 0,
    closedEvents: 0,
    lockedEvents: 0,
  });
  
  const [pageLoading, setPageLoading] = useState(true);

  /* 🔐 Role protection */
  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'treasurer') {
      router.push('/login');
    }
  }, [loading, user, role, router]);

  /* 📊 Fetch all dashboard stats */
  const fetchSummary = useCallback(async () => {
    try {
      setPageLoading(true);

      // Fetch financial summary using new system
      const financialData = await getFinancialSummary();

      // Fetch all users (players)
      const usersRef = collection(db, 'users');
      const usersQuery = query(usersRef, where('role', '==', 'player'));
      const usersSnapshot = await getDocs(usersQuery);
      const totalPlayers = usersSnapshot.size;

      // Fetch all events and categorize by status
      const eventsRef = collection(db, 'events');
      const eventsSnapshot = await getDocs(eventsRef);
      let openEvents = 0;
      let closedEvents = 0;
      let lockedEvents = 0;

      eventsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'open') {
          openEvents++;
        } else if (data.status === 'closed') {
          closedEvents++;
        } else if (data.status === 'locked') {
          lockedEvents++;
        }
      });

      // Fetch all payments to count total transactions
      const paymentsRef = collection(db, 'eventPayments');
      const paymentsSnapshot = await getDocs(paymentsRef);
      const totalTransactions = paymentsSnapshot.size;

      setSummary({
        totalIncome: financialData.totalIncome,
        totalExpenses: financialData.totalExpenses,
        availableBalance: financialData.availableBalance,
        totalPlayers: totalPlayers,
        totalTransactions: totalTransactions,
        totalEvents: eventsSnapshot.size,
        openEvents: openEvents,
        closedEvents: closedEvents,
        lockedEvents: lockedEvents,
      });
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setPageLoading(false);
    }
  }, []); // Empty dependency array - function doesn't depend on external values

  useEffect(() => {
    if (role === 'treasurer') {
      fetchSummary();
    }
  }, [role, fetchSummary]);

  /* 🚪 Logout */
  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading || !user || role !== 'treasurer') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-base text-gray-700 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 flex-shrink-0">
                <Image
                  src="/logo.png"
                  alt="Art of War Logo"
                  width={56}
                  height={56}
                  className="w-full h-full object-contain"
                />
              </div>
              {/* Show full title only on desktop */}
              <div className="hidden sm:block">
                <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">
                  Treasurer Dashboard
                </h1>
                <p className="text-xs md:text-sm text-gray-600 mt-0.5">
                  Welcome, <span className="font-semibold">{user.displayName || user.email?.split('@')[0] || 'Treasurer'}</span>
                </p>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="px-3 py-2 sm:px-4 sm:py-2.5 md:px-6 md:py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer text-xs sm:text-sm md:text-base"
            >
              <span className="hidden sm:inline">Sign Out</span>
              <span className="sm:hidden">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 md:py-10">
        {pageLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-base text-gray-700 font-medium">Loading dashboard...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Primary Financial Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 md:gap-6 mb-6 sm:mb-8">
              <StatCard
                title="Total Income"
                value={`₹${summary.totalIncome.toLocaleString()}`}
                subtitle="Collected from all events"
                icon={
                  <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                bgColor="bg-green-50"
                textColor="text-green-700"
              />
              <StatCard
                title="Total Expenses"
                value={`₹${summary.totalExpenses.toLocaleString()}`}
                subtitle="All payments made"
                icon={
                  <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                }
                bgColor="bg-red-50"
                textColor="text-red-700"
              />
              <StatCard
                title="Available Balance"
                value={`₹${summary.availableBalance.toLocaleString()}`}
                subtitle="Ready to use"
                icon={
                  <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                  </svg>
                }
                bgColor="bg-blue-50"
                textColor="text-blue-700"
              />
            </div>


            {/* Quick Actions */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-5 sm:p-6 md:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 sm:mb-8">Quick Actions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
                <ActionButton
                  label="Create Turf"
                  path="/treasurer/create-event"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  }
                />
                <ActionButton
                  label="Manage Turf"
                  path="/treasurer/manage-events"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  }
                />
                <ActionButton
                  label="Join Turf"
                  path="/treasurer/events"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                />
                <ActionButton
                  label="Manage Payments"
                  path="/treasurer/manage-payments"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  }
                />
                <ActionButton
                  label="Add Income"
                  path="/treasurer/add-income"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
                <ActionButton
                  label="Add Expense"
                  path="/treasurer/team-expenses"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  }
                />
                <ActionButton
                  label="View Expenses"
                  path="/treasurer/view-expenses"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  }
                />
                <ActionButton
                  label="My Payments"
                  path="/treasurer/payment"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  }
                />
               
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Reusable Components ---------- */

function StatCard({
  title,
  value,
  subtitle,
  icon,
  bgColor = 'bg-gray-50',
  textColor = 'text-gray-700',
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  bgColor?: string;
  textColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-12 h-12 sm:w-14 sm:h-14 ${bgColor} rounded-lg flex items-center justify-center ${textColor}`}>
          {icon}
        </div>
      </div>
      <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">{title}</p>
      <p className="text-3xl sm:text-4xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}

function ActionButton({
  label,
  icon,
  path,
}: {
  label: string;
  icon: React.ReactNode;
  path: string;
}) {
  return (
    <Link href={path}>
      <div className="group p-5 sm:p-6 bg-white border-2 border-gray-200 hover:border-red-600 rounded-xl transition-all duration-200 shadow-sm hover:shadow-lg cursor-pointer text-left">
        <div className="w-12 h-12 sm:w-14 sm:h-14 mb-4 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-red-50 transition-colors duration-200 text-gray-700 group-hover:text-red-600">
          {icon}
        </div>
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1 sm:mb-2">{label}</h3>
        <p className="text-xs sm:text-sm text-gray-600">Manage {label.toLowerCase()}</p>
      </div>
    </Link>
  );
}
