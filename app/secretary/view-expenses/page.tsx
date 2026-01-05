'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { collection, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { getFinancialSummary } from '@/lib/eventManagement';

interface Expense {
  id: string;
  expenseType: 'event_payment' | 'other_expense';
  eventId?: string;
  eventTitle?: string;
  expenseName?: string;
  description?: string | null;
  dateSpent: Timestamp;
  amount: number;
  createdByEmail: string;
  createdAt: Timestamp;
}

interface Income {
  id: string;
  incomeName: string;
  description: string | null;
  amount: number;
  dateReceived: Timestamp;
  incomeSource: 'sponsorship' | 'donation' | 'membership_fees' | 'fundraising' | 'other';
  createdByEmail: string;
  createdAt: Timestamp;
}

interface Event {
  id: string;
  title: string;
  date: Timestamp;
  time: string;
  totalAmount: number;
  participantCount: number;
  totalCollected: number;
  eventPaidToVendor: boolean;
  status: 'open' | 'closed' | 'locked';
}

export default function SecretaryTeamFund() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [expandedIncome, setExpandedIncome] = useState<string | null>(null);
  const [financialSummary, setFinancialSummary] = useState({
    totalIncome: 0,
    eventIncome: 0,
    directIncome: 0,
    totalExpenses: 0,
    availableBalance: 0,
  });

  useEffect(() => {
    if (!loading && role !== 'secretary') {
      router.push('/login');
    }
  }, [role, loading, router]);

  // Real-time listener for expenses
  useEffect(() => {
    if (role !== 'secretary') return;

    setLoadingData(true);

    const expensesRef = collection(db, 'expenses');
    const expensesQuery = query(expensesRef, orderBy('dateSpent', 'desc'));

    const unsubscribeExpenses = onSnapshot(
      expensesQuery,
      (snapshot) => {
        const expensesList: Expense[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          expensesList.push({
            id: docSnap.id,
            expenseType: data.expenseType,
            eventId: data.eventId,
            eventTitle: data.eventTitle,
            expenseName: data.expenseName,
            description: data.description || null,
            dateSpent: data.dateSpent,
            amount: data.amount,
            createdByEmail: data.createdByEmail,
            createdAt: data.createdAt,
          });
        });
        setExpenses(expensesList);
      },
      (error) => {
        console.error('Error fetching expenses:', error);
      }
    );

    return () => unsubscribeExpenses();
  }, [role]);

  // Real-time listener for direct income (sponsorships, donations, etc.)
  useEffect(() => {
    if (role !== 'secretary') return;

    const incomeRef = collection(db, 'income');
    const incomeQuery = query(incomeRef, orderBy('dateReceived', 'desc'));

    const unsubscribeIncome = onSnapshot(
      incomeQuery,
      (snapshot) => {
        const incomeList: Income[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          incomeList.push({
            id: docSnap.id,
            incomeName: data.incomeName,
            description: data.description || null,
            amount: data.amount,
            dateReceived: data.dateReceived,
            incomeSource: data.incomeSource,
            createdByEmail: data.createdByEmail,
            createdAt: data.createdAt,
          });
        });
        setIncomes(incomeList);
      },
      (error) => {
        console.error('Error fetching income:', error);
      }
    );

    return () => unsubscribeIncome();
  }, [role]);

  // Real-time listener for events
  useEffect(() => {
    if (role !== 'secretary') return;

    const eventsRef = collection(db, 'events');
    const eventsQuery = query(eventsRef, orderBy('date', 'desc'));

    const unsubscribeEvents = onSnapshot(
      eventsQuery,
      (snapshot) => {
        const eventsList: Event[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const totalCollected = data.totalCollected || 0;

          // Only include closed/locked events with collected money
          if ((data.status === 'closed' || data.status === 'locked') && totalCollected > 0) {
            eventsList.push({
              id: docSnap.id,
              title: data.title,
              date: data.date,
              time: data.time,
              totalAmount: data.totalAmount,
              participantCount: data.participantCount || 0,
              totalCollected: totalCollected,
              eventPaidToVendor: data.eventPaidToVendor || false,
              status: data.status,
            });
          }
        });
        setEvents(eventsList);
        setLoadingData(false);
      },
      (error) => {
        console.error('Error fetching events:', error);
        setLoadingData(false);
      }
    );

    return () => unsubscribeEvents();
  }, [role]);

  // Fetch financial summary (refresh when expenses, incomes, or events change)
  useEffect(() => {
    if (role !== 'secretary') return;

    const fetchSummary = async () => {
      try {
        const summary = await getFinancialSummary();
        setFinancialSummary(summary);
      } catch (error) {
        console.error('Error fetching financial summary:', error);
      }
    };

    fetchSummary();
  }, [role, expenses, incomes, events]);

  const toggleEvent = (eventId: string) => {
    setExpandedEvent(expandedEvent === eventId ? null : eventId);
  };

  const toggleIncome = (incomeId: string) => {
    setExpandedIncome(expandedIncome === incomeId ? null : incomeId);
  };

  // Calculate per player amount with ₹100 minimum
  const calculatePerPlayerAmount = (totalAmount: number, participantCount: number): number => {
    if (participantCount === 0) return 0;
    const baseAmount = totalAmount / participantCount;
    const roundedAmount = Math.ceil(baseAmount / 10) * 10;
    return Math.max(roundedAmount, 100); // Minimum ₹100
  };

  // Get income source label
  const getIncomeSourceLabel = (source: string): string => {
    const labels: { [key: string]: string } = {
      sponsorship: '🤝 Sponsorship',
      donation: '💝 Donation',
      membership_fees: '💳 Membership Fees',
      fundraising: '🎉 Fundraising',
      other: '📌 Other Income',
    };
    return labels[source] || '📌 Other';
  };

  if (loading || !user || role !== 'secretary') {
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

  const eventExpenses = expenses.filter(e => e.expenseType === 'event_payment');
  const otherExpenses = expenses.filter(e => e.expenseType === 'other_expense');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                title="Go Back"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div className="w-9 h-9 sm:w-12 sm:h-12 flex-shrink-0">
                <Image
                  src="/logo.png"
                  alt="Art of War Logo"
                  width={48}
                  height={48}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900">
                  Club Finances
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                  Complete overview of income and expenses
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-10">
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-base text-gray-700 font-medium">Loading club finances...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs sm:text-sm text-gray-600 font-semibold">Total Income</p>
                  <span className="text-2xl sm:text-3xl">📈</span>
                </div>
                <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-green-600">
                  ₹{financialSummary.totalIncome.toLocaleString()}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 bg-green-50 text-green-700 rounded border border-green-200">
                    Events: ₹{financialSummary.eventIncome.toLocaleString()}
                  </span>
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200">
                    Direct: ₹{financialSummary.directIncome.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs sm:text-sm text-gray-600 font-semibold">Total Expenses</p>
                  <span className="text-2xl sm:text-3xl">💸</span>
                </div>
                <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-red-600">
                  ₹{financialSummary.totalExpenses.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-2">{expenses.length} expense(s)</p>
              </div>

              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs sm:text-sm text-gray-600 font-semibold">Available Balance</p>
                  <span className="text-2xl sm:text-3xl">💰</span>
                </div>
                <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-blue-600">
                  ₹{financialSummary.availableBalance.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-2">Current club balance</p>
              </div>
            </div>

            {/* Income History - Events */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 mb-6 sm:mb-8">
              <div className="px-4 sm:px-6 py-4 bg-gray-50 border-b border-gray-200 rounded-t-2xl">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="text-2xl sm:text-3xl">🏟️</span>
                  <span>Event Income</span>
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">Money collected from turf events (₹100 minimum per player)</p>
              </div>

              {events.length === 0 ? (
                <div className="p-8 sm:p-12 text-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-3xl sm:text-4xl">🏟️</span>
                  </div>
                  <p className="text-base sm:text-xl font-bold text-gray-900 mb-2">No event income yet</p>
                  <p className="text-sm sm:text-base text-gray-600">
                    Income will appear here once events are completed and payments are collected
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {events.map((event) => {
                    const isExpanded = expandedEvent === event.id;
                    const eventDate = event.date.toDate();
                    const perPlayerAmount = calculatePerPlayerAmount(event.totalAmount, event.participantCount);
                    const expectedTotal = perPlayerAmount * event.participantCount;
                    const profitMargin = event.totalCollected - event.totalAmount;
                    const collectionRate = expectedTotal > 0 
                      ? Math.round((event.totalCollected / expectedTotal) * 100)
                      : 0;

                    return (
                      <div key={event.id} className="transition-colors hover:bg-gray-50">
                        {/* Event Header */}
                        <div
                          onClick={() => toggleEvent(event.id)}
                          className="px-4 sm:px-6 py-4 cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <h4 className="text-base sm:text-lg font-bold text-gray-900 break-words">
                                  {event.title}
                                </h4>
                                <span className="px-2 sm:px-3 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200 flex-shrink-0">
                                  ₹{event.totalCollected.toLocaleString()}
                                </span>
                                {event.eventPaidToVendor && (
                                  <span className="px-2 sm:px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0">
                                    ✓ Vendor Paid
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm text-gray-600">
                                <span className="flex items-center gap-1">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  {eventDate.toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                                <span className="flex items-center gap-1">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                  </svg>
                                  {event.participantCount} players
                                </span>
                                <span className="text-green-600 font-semibold">
                                  {collectionRate}% collected
                                </span>
                              </div>
                            </div>
                            <button className="flex-shrink-0 p-1">
                              <svg
                                className={`w-5 h-5 sm:w-6 sm:h-6 text-gray-400 transition-transform ${
                                  isExpanded ? 'transform rotate-180' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Event Details */}
                        {isExpanded && (
                          <div className="px-4 sm:px-6 pb-4 bg-gray-50">
                            <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 sm:gap-6">
                                <div>
                                  <p className="text-xs text-gray-600 font-semibold mb-1">Turf Cost</p>
                                  <p className="text-lg sm:text-2xl font-bold text-gray-900">
                                    ₹{event.totalAmount.toLocaleString()}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600 font-semibold mb-1">Per Player</p>
                                  <p className="text-lg sm:text-2xl font-bold text-blue-600">
                                    ₹{perPlayerAmount.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">Min ₹100</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600 font-semibold mb-1">Expected</p>
                                  <p className="text-lg sm:text-2xl font-bold text-purple-600">
                                    ₹{expectedTotal.toLocaleString()}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600 font-semibold mb-1">Collected</p>
                                  <p className="text-lg sm:text-2xl font-bold text-green-600">
                                    ₹{event.totalCollected.toLocaleString()}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600 font-semibold mb-1">Profit</p>
                                  <p className="text-lg sm:text-2xl font-bold text-orange-600">
                                    ₹{profitMargin.toLocaleString()}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
                                <p className="text-xs sm:text-sm text-gray-600">
                                  <strong>Collection:</strong> ₹{event.totalCollected.toLocaleString()} collected from players 
                                </p>
                                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                                  <strong>Profit:</strong> ₹{event.totalCollected.toLocaleString()} - ₹{event.totalAmount.toLocaleString()} turf = ₹{profitMargin.toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Direct Income (Sponsorships, Donations, etc.) */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 mb-6 sm:mb-8">
              <div className="px-4 sm:px-6 py-4 bg-green-50 border-b border-green-200 rounded-t-2xl">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="text-2xl sm:text-3xl">💝</span>
                  <span>Other Income</span>
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">Sponsorships, donations, membership fees, and fundraising</p>
              </div>

              {incomes.length === 0 ? (
                <div className="p-8 sm:p-12 text-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-3xl sm:text-4xl">💝</span>
                  </div>
                  <p className="text-base sm:text-xl font-bold text-gray-900 mb-2">No other income recorded yet</p>
                  <p className="text-sm sm:text-base text-gray-600">
                    Sponsorships, donations, and other income will appear here
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {incomes.map((income) => {
                    const isExpanded = expandedIncome === income.id;
                    const incomeDate = income.dateReceived.toDate();

                    return (
                      <div key={income.id} className="transition-colors hover:bg-gray-50">
                        <div
                          onClick={() => toggleIncome(income.id)}
                          className="px-4 sm:px-6 py-4 cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <h4 className="text-base sm:text-lg font-bold text-gray-900 break-words">
                                  {income.incomeName}
                                </h4>
                                <span className="px-2 sm:px-3 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200 flex-shrink-0">
                                  ₹{income.amount.toLocaleString()}
                                </span>
                                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0">
                                  {getIncomeSourceLabel(income.incomeSource)}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs sm:text-sm text-gray-600">
                                <span className="flex items-center gap-1">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  {incomeDate.toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                              </div>
                            </div>
                            <button className="flex-shrink-0 p-1">
                              <svg
                                className={`w-5 h-5 sm:w-6 sm:h-6 text-gray-400 transition-transform ${
                                  isExpanded ? 'transform rotate-180' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {isExpanded && income.description && (
                          <div className="px-4 sm:px-6 pb-4 bg-gray-50">
                            <div className="bg-white rounded-xl p-4 border border-gray-200">
                              <p className="text-sm text-gray-700">{income.description}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Expenses Section */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 mb-6 sm:mb-8">
              <div className="px-4 sm:px-6 py-4 bg-gray-50 border-b border-gray-200 rounded-t-2xl">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="text-2xl sm:text-3xl">💰</span>
                  <span>Club Expenses</span>
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">All team spending records</p>
              </div>

              {expenses.length === 0 ? (
                <div className="p-8 sm:p-12 text-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-3xl sm:text-4xl">💰</span>
                  </div>
                  <p className="text-base sm:text-xl font-bold text-gray-900 mb-2">No expenses recorded yet</p>
                  <p className="text-sm sm:text-base text-gray-600">
                    Club expenses will appear here once the treasurer records them
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="block lg:hidden divide-y divide-gray-200">
                    {/* Event Payments Section */}
                    {eventExpenses.length > 0 && (
                      <>
                        <div className="bg-blue-50 px-4 py-3">
                          <p className="text-sm font-bold text-blue-900">🏟️ Event Payments ({eventExpenses.length})</p>
                        </div>
                        {eventExpenses.map((expense, index) => (
                          <div
                            key={expense.id}
                            className={`p-4 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0 mr-3">
                                <p className="text-sm font-bold text-gray-900 mb-1">{expense.eventTitle}</p>
                                <p className="text-xs text-gray-600">
                                  {expense.dateSpent.toDate().toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </p>
                                <span className="inline-block mt-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
                                  Turf Vendor Payment
                                </span>
                              </div>
                              <p className="text-lg font-bold text-red-600 flex-shrink-0">
                                ₹{expense.amount.toLocaleString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Other Expenses Section */}
                    {otherExpenses.length > 0 && (
                      <>
                        <div className="bg-orange-50 px-4 py-3">
                          <p className="text-sm font-bold text-orange-900">🛍️ Other Expenses ({otherExpenses.length})</p>
                        </div>
                        {otherExpenses.map((expense, index) => (
                          <div
                            key={expense.id}
                            className={`p-4 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0 mr-3">
                                <p className="text-sm font-bold text-gray-900 mb-1">{expense.expenseName}</p>
                                <p className="text-xs text-gray-600">
                                  {expense.dateSpent.toDate().toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </p>
                              </div>
                              <p className="text-lg font-bold text-red-600 flex-shrink-0">
                                ₹{expense.amount.toLocaleString()}
                              </p>
                            </div>
                            {expense.description && (
                              <p className="text-xs text-gray-600 mt-2">{expense.description}</p>
                            )}
                          </div>
                        ))}
                      </>
                    )}

                    <div className="bg-gray-100 border-t-2 border-gray-300 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-900">TOTAL EXPENSES:</span>
                        <span className="text-xl font-bold text-red-600">
                          ₹{financialSummary.totalExpenses.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Type</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Date</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Expense</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Description</th>
                          <th className="px-6 py-4 text-right text-sm font-bold text-gray-900">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {expenses.map((expense, index) => (
                          <tr
                            key={expense.id}
                            className={`${
                              index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                            } hover:bg-gray-100 transition`}
                          >
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                expense.expenseType === 'event_payment'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-orange-100 text-orange-700'
                              }`}>
                                {expense.expenseType === 'event_payment' ? '🏟️ Turf' : '🛍️ Other'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-900 font-semibold">
                              {expense.dateSpent.toDate().toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-gray-900 font-semibold">
                                {expense.expenseType === 'event_payment' 
                                  ? expense.eventTitle 
                                  : expense.expenseName}
                              </p>
                            </td>
                            <td className="px-6 py-4 text-gray-600 text-sm max-w-xs">
                              {expense.expenseType === 'event_payment' ? (
                                <span className="italic text-gray-500">Turf vendor payment</span>
                              ) : expense.description ? (
                                expense.description
                              ) : (
                                <span className="italic text-gray-400">No description</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-red-600 font-bold text-lg">
                                ₹{expense.amount.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                        <tr>
                          <td colSpan={4} className="px-6 py-4 text-right font-bold text-gray-900">
                            TOTAL EXPENSES:
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-red-600 font-bold text-xl">
                              ₹{financialSummary.totalExpenses.toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
