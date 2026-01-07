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
  description: string | null;
  dateSpent: Timestamp;
  amount: number;
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


interface Income {
  id: string;
  incomeName: string;
  amount: number;
  dateReceived: Timestamp;
  incomeSource: 'sponsorship' | 'donation' | 'membership_fees' | 'fundraising' | 'other';
  description: string | null;
  createdByEmail: string;
  createdAt: Timestamp;
}


export default function PlayerTeamFund() {
  const { role, loading, user } = useAuth();
  const router = useRouter();


  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [financialSummary, setFinancialSummary] = useState({
    totalIncome: 0,
    totalExpenses: 0,
    availableBalance: 0,
  });


  useEffect(() => {
    if (!loading && role !== 'player') {
      router.push('/login');
    }
  }, [role, loading, router]);


  // Real-time listener for expenses
  useEffect(() => {
    if (role !== 'player') return;

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


  // Real-time listener for events
  useEffect(() => {
    if (role !== 'player') return;

    const eventsRef = collection(db, 'events');
    const eventsQuery = query(eventsRef, orderBy('date', 'desc'));

    const unsubscribeEvents = onSnapshot(
      eventsQuery,
      (snapshot) => {
        const eventsList: Event[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const totalCollected = data.totalCollected || 0;

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


  // Real-time listener for incomes
  useEffect(() => {
    if (role !== 'player') return;

    const incomesRef = collection(db, 'income');
    const incomesQuery = query(incomesRef, orderBy('dateReceived', 'desc'));

    const unsubscribeIncomes = onSnapshot(
      incomesQuery,
      (snapshot) => {
        const incomesList: Income[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          incomesList.push({
            id: docSnap.id,
            incomeName: data.incomeName,
            amount: data.amount,
            dateReceived: data.dateReceived,
            incomeSource: data.incomeSource,
            description: data.description || null,
            createdByEmail: data.createdByEmail,
            createdAt: data.createdAt,
          });
        });
        setIncomes(incomesList);
      },
      (error) => {
        console.error('Error fetching incomes:', error);
      }
    );

    return () => unsubscribeIncomes();
  }, [role]);


  // Fetch financial summary
  useEffect(() => {
    if (role !== 'player') return;

    const fetchSummary = async () => {
      try {
        const summary = await getFinancialSummary();
        setFinancialSummary(summary);
      } catch (error) {
        console.error('Error fetching financial summary:', error);
      }
    };

    fetchSummary();
  }, [role, expenses, events, incomes]);


  const toggleEvent = (eventId: string) => {
    setExpandedEvent(expandedEvent === eventId ? null : eventId);
  };


  const calculatePerPlayerAmount = (totalAmount: number, participantCount: number): number => {
    if (participantCount === 0) return 0;
    const baseAmount = totalAmount / participantCount;
    const roundedAmount = Math.ceil(baseAmount / 10) * 10;
    return Math.max(roundedAmount, 100);
  };


  if (loading || !user || role !== 'player') {
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
          <div className="flex items-center justify-between">
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
                  Club finances & transactions
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
              <p className="text-base text-gray-700 font-medium">Loading finances...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <p className="text-xs text-gray-600 mb-1">Total Income</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900">₹{financialSummary.totalIncome.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">{events.length} events + {incomes.length} direct</p>
              </div>

              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                  </svg>
                </div>
                <p className="text-xs text-gray-600 mb-1">Total Expenses</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900">₹{financialSummary.totalExpenses.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">{expenses.length} expenses</p>
              </div>

              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <p className="text-xs text-gray-600 mb-1">Available Balance</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900">₹{financialSummary.availableBalance.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Current balance</p>
              </div>
            </div>

            {/* Income History from Events */}
            {events.length > 0 && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 mb-6 overflow-hidden">
                <div className="px-4 sm:px-6 py-4 bg-gray-900 text-white">
                  <h2 className="text-lg sm:text-xl font-bold">Event Income</h2>
                  <p className="text-xs sm:text-sm text-gray-300 mt-1">
                    Money collected from events (₹100 min per player)
                  </p>
                </div>

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
                        <button
                          onClick={() => toggleEvent(event.id)}
                          className="w-full px-4 sm:px-6 py-4 flex items-center justify-between text-left"
                        >
                          <div className="flex-1 min-w-0 mr-4">
                            <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                              <h4 className="text-base sm:text-lg font-bold text-gray-900 break-words">
                                {event.title}
                              </h4>
                              <span className="px-2 sm:px-3 py-1 rounded-lg text-xs font-bold bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">
                                ₹{event.totalCollected.toLocaleString()}
                              </span>
                              {event.eventPaidToVendor && (
                                <span className="px-2 sm:px-3 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                                  ✓ Vendor Paid
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs sm:text-sm text-gray-600">
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
                          <svg
                            className={`w-5 h-5 sm:w-6 sm:h-6 text-gray-400 transition-transform flex-shrink-0 ${
                              isExpanded ? 'transform rotate-180' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {/* Event Details */}
                        {isExpanded && (
                          <div className="px-4 sm:px-6 pb-4 bg-gray-50">
                            <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <div className="text-center">
                                  <p className="text-xs text-gray-600 mb-1">Turf Cost</p>
                                  <p className="text-base sm:text-lg font-bold text-gray-900">
                                    ₹{event.totalAmount.toLocaleString()}
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-gray-600 mb-1">Per Player</p>
                                  <p className="text-base sm:text-lg font-bold text-blue-600">
                                    ₹{perPlayerAmount.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">Min ₹100</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-gray-600 mb-1">Expected</p>
                                  <p className="text-base sm:text-lg font-bold text-purple-600">
                                    ₹{expectedTotal.toLocaleString()}
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-gray-600 mb-1">Collected</p>
                                  <p className="text-base sm:text-lg font-bold text-green-600">
                                    ₹{event.totalCollected.toLocaleString()}
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-gray-600 mb-1">Profit</p>
                                  <p className="text-base sm:text-lg font-bold text-orange-600">
                                    ₹{profitMargin.toLocaleString()}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 pt-4 border-t border-gray-200">
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
              </div>
            )}

            {/* Direct Income (Sponsorships, Donations, etc.) */}
            {incomes.length > 0 && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 mb-6 overflow-hidden">
                <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-green-600 to-green-700 text-white">
                  <h2 className="text-lg sm:text-xl font-bold">Direct Income</h2>
                  <p className="text-xs sm:text-sm text-green-100 mt-1">
                    Sponsorships, donations & other non-event income
                  </p>
                </div>

                {/* Desktop Table View */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-900 text-white">
                      <tr>
                        <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm font-bold uppercase">Source</th>
                        <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm font-bold uppercase">Date</th>
                        <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm font-bold uppercase">Income Name</th>
                        <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm font-bold uppercase">Description</th>
                        <th className="px-4 md:px-6 py-3 md:py-4 text-right text-xs md:text-sm font-bold uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {incomes.map((income) => {
                        const sourceIcons = {
                          sponsorship: '🏢',
                          donation: '🎁',
                          membership_fees: '👥',
                          fundraising: '📈',
                          other: '📦',
                        };

                        const sourceLabels = {
                          sponsorship: 'Sponsorship',
                          donation: 'Donation',
                          membership_fees: 'Membership',
                          fundraising: 'Fundraising',
                          other: 'Other',
                        };

                        return (
                          <tr key={income.id} className="hover:bg-gray-50 transition">
                            <td className="px-4 md:px-6 py-3 md:py-4">
                              <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                {sourceIcons[income.incomeSource]} {sourceLabels[income.incomeSource]}
                              </span>
                            </td>
                            <td className="px-4 md:px-6 py-3 md:py-4 text-gray-900 font-semibold text-sm">
                              {income.dateReceived.toDate().toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="px-4 md:px-6 py-3 md:py-4">
                              <p className="text-gray-900 font-semibold text-sm">{income.incomeName}</p>
                            </td>
                            <td className="px-4 md:px-6 py-3 md:py-4 text-gray-600 text-sm">
                              {income.description ? (
                                income.description
                              ) : (
                                <span className="italic text-gray-400">No description</span>
                              )}
                            </td>
                            <td className="px-4 md:px-6 py-3 md:py-4 text-right">
                              <span className="text-green-600 font-bold text-base">
                                ₹{income.amount.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="sm:hidden divide-y divide-gray-200">
                  {incomes.map((income) => {
                    const sourceIcons = {
                      sponsorship: '🏢',
                      donation: '🎁',
                      membership_fees: '👥',
                      fundraising: '📈',
                      other: '📦',
                    };

                    const sourceLabels = {
                      sponsorship: 'Sponsorship',
                      donation: 'Donation',
                      membership_fees: 'Membership Fees',
                      fundraising: 'Fundraising',
                      other: 'Other',
                    };

                    return (
                      <div key={income.id} className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0 mr-3">
                            <p className="text-gray-900 font-bold text-sm mb-1">{income.incomeName}</p>
                            <p className="text-xs text-gray-600 mb-2">
                              {income.dateReceived.toDate().toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </p>
                            <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
                              {sourceIcons[income.incomeSource]} {sourceLabels[income.incomeSource]}
                            </span>
                          </div>
                          <span className="text-green-600 font-bold text-base whitespace-nowrap">
                            ₹{income.amount.toLocaleString()}
                          </span>
                        </div>
                        {income.description && (
                          <p className="text-xs text-gray-600 bg-gray-50 rounded p-2 mt-2">
                            {income.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Expenses List */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="px-4 sm:px-6 py-4 bg-gray-900 text-white">
                <h2 className="text-lg sm:text-xl font-bold">Club Expenses</h2>
                <p className="text-xs sm:text-sm text-gray-300 mt-1">
                  All team spending records
                </p>
              </div>

              {expenses.length === 0 ? (
                <div className="p-8 sm:p-12 text-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <p className="text-lg sm:text-xl font-bold text-gray-900 mb-2">No expenses recorded yet</p>
                  <p className="text-sm sm:text-base text-gray-600">
                    Expenses will appear once the treasurer records them
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-900 text-white">
                        <tr>
                          <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm font-bold uppercase">Type</th>
                          <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm font-bold uppercase">Date</th>
                          <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm font-bold uppercase">Expense</th>
                          <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm font-bold uppercase">Description</th>
                          <th className="px-4 md:px-6 py-3 md:py-4 text-right text-xs md:text-sm font-bold uppercase">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {expenses.map((expense) => (
                          <tr key={expense.id} className="hover:bg-gray-50 transition">
                            <td className="px-4 md:px-6 py-3 md:py-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                expense.expenseType === 'event_payment'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-orange-100 text-orange-700'
                              }`}>
                                {expense.expenseType === 'event_payment' ? '🏟️ Turf' : '🛍️ Other'}
                              </span>
                            </td>
                            <td className="px-4 md:px-6 py-3 md:py-4 text-gray-900 font-semibold text-sm">
                              {expense.dateSpent.toDate().toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="px-4 md:px-6 py-3 md:py-4">
                              <p className="text-gray-900 font-semibold text-sm">
                                {expense.expenseType === 'event_payment' 
                                  ? expense.eventTitle 
                                  : expense.expenseName}
                              </p>
                            </td>
                            <td className="px-4 md:px-6 py-3 md:py-4 text-gray-600 text-sm">
                              {expense.expenseType === 'event_payment' ? (
                                <span className="italic text-gray-500">Turf vendor payment</span>
                              ) : expense.description ? (
                                expense.description
                              ) : (
                                <span className="italic text-gray-400">No description</span>
                              )}
                            </td>
                            <td className="px-4 md:px-6 py-3 md:py-4 text-right">
                              <span className="text-red-600 font-bold text-base">
                                ₹{expense.amount.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="sm:hidden divide-y divide-gray-200">
                    {/* Event Payments Section */}
                    {eventExpenses.length > 0 && (
                      <>
                        <div className="bg-blue-50 px-4 py-3">
                          <p className="text-sm font-bold text-blue-900">🏟️ Event Payments ({eventExpenses.length})</p>
                        </div>
                        {eventExpenses.map((expense) => (
                          <div key={expense.id} className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0 mr-3">
                                <p className="text-gray-900 font-bold text-sm mb-1">{expense.eventTitle}</p>
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
                              <span className="text-red-600 font-bold text-base whitespace-nowrap">
                                ₹{expense.amount.toLocaleString()}
                              </span>
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
                        {otherExpenses.map((expense) => (
                          <div key={expense.id} className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0 mr-3">
                                <p className="text-gray-900 font-bold text-sm mb-1">{expense.expenseName}</p>
                                <p className="text-xs text-gray-600">
                                  {expense.dateSpent.toDate().toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </p>
                              </div>
                              <span className="text-red-600 font-bold text-base whitespace-nowrap">
                                ₹{expense.amount.toLocaleString()}
                              </span>
                            </div>
                            {expense.description && (
                              <p className="text-xs text-gray-600 bg-gray-50 rounded p-2 mt-2">
                                {expense.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </>
                    )}
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