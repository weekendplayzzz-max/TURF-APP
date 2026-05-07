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

const SOURCE_LABELS: Record<string, string> = {
  sponsorship:     'Sponsorship',
  donation:        'Donation',
  membership_fees: 'Membership',
  fundraising:     'Fundraising',
  other:           'Other',
};

export default function SecretaryTeamFund() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [expenses,         setExpenses]         = useState<Expense[]>([]);
  const [events,           setEvents]           = useState<Event[]>([]);
  const [incomes,          setIncomes]          = useState<Income[]>([]);
  const [loadingData,      setLoadingData]      = useState(true);
  const [expandedEvent,    setExpandedEvent]    = useState<string | null>(null);
  const [activeTab,        setActiveTab]        = useState<'overview' | 'events' | 'income' | 'expenses'>('overview');
  const [financialSummary, setFinancialSummary] = useState({ totalIncome: 0, totalExpenses: 0, availableBalance: 0 });

  useEffect(() => {
    if (!loading && role !== 'secretary') router.push('/login');
  }, [role, loading, router]);

  useEffect(() => {
    if (role !== 'secretary') return;
    setLoadingData(true);
    const unsub = onSnapshot(
      query(collection(db, 'expenses'), orderBy('dateSpent', 'desc')),
      snap => setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data(), description: d.data().description || null } as Expense)))
    );
    return () => unsub();
  }, [role]);

  useEffect(() => {
    if (role !== 'secretary') return;
    const unsub = onSnapshot(
      query(collection(db, 'events'), orderBy('date', 'desc')),
      snap => {
        const list: Event[] = [];
        snap.forEach(d => {
          const data = d.data();
          const totalCollected = data.totalCollected || 0;
          if ((data.status === 'closed' || data.status === 'locked') && totalCollected > 0) {
            list.push({
              id: d.id, title: data.title, date: data.date, time: data.time,
              totalAmount: data.totalAmount, participantCount: data.participantCount || 0,
              totalCollected, eventPaidToVendor: data.eventPaidToVendor || false, status: data.status,
            });
          }
        });
        setEvents(list);
        setLoadingData(false);
      },
      () => setLoadingData(false)
    );
    return () => unsub();
  }, [role]);

  useEffect(() => {
    if (role !== 'secretary') return;
    const unsub = onSnapshot(
      query(collection(db, 'income'), orderBy('dateReceived', 'desc')),
      snap => setIncomes(snap.docs.map(d => ({ id: d.id, ...d.data(), description: d.data().description || null } as Income)))
    );
    return () => unsub();
  }, [role]);

  useEffect(() => {
    if (role !== 'secretary') return;
    getFinancialSummary().then(setFinancialSummary).catch(console.error);
  }, [role, expenses, events, incomes]);

  const toggleEvent   = (id: string) => setExpandedEvent(expandedEvent === id ? null : id);
  const calcPerPlayer = (total: number, count: number) =>
    count === 0 ? 0 : Math.max(Math.ceil((total / count) / 10) * 10, 100);

  const eventExpenses = expenses.filter(e => e.expenseType === 'event_payment');
  const otherExpenses = expenses.filter(e => e.expenseType === 'other_expense');
  const balancePos    = financialSummary.availableBalance >= 0;

  if (loading || !user || role !== 'secretary') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview'  as const, label: 'Overview',  count: null             },
    { id: 'events'    as const, label: 'Events',    count: events.length    },
    { id: 'income'    as const, label: 'Income',    count: incomes.length   },
    { id: 'expenses'  as const, label: 'Expenses',  count: expenses.length  },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()}
            className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 cursor-pointer flex-shrink-0 transition-colors">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-7 h-7 flex-shrink-0">
            <Image src="/logo.png" alt="Logo" width={28} height={28} className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-gray-900 leading-tight">Club Finances</h1>
            <p className="text-xs text-gray-400">Club finances & transactions</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3 py-4 pb-12 space-y-3">

        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : (
          <>
            {/* ── Dark finance overview card ── */}
            <div className="relative overflow-hidden bg-gray-900 rounded-2xl p-4 text-white">
              <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full border-[18px] border-red-600/20 pointer-events-none" />
              <div className="absolute right-2 -bottom-8 w-20 h-20 rounded-full border-[14px] border-red-600/10 pointer-events-none" />
              <div className="relative">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-3">Financial Overview</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label: 'Income',   value: `₹${financialSummary.totalIncome.toLocaleString()}`   },
                    { label: 'Expenses', value: `₹${financialSummary.totalExpenses.toLocaleString()}` },
                    { label: 'Balance',  value: `₹${financialSummary.availableBalance.toLocaleString()}`, red: !balancePos },
                  ].map(({ label, value, red }) => (
                    <div key={label} className="bg-white/[0.07] rounded-xl px-2 py-2.5 text-center border border-white/10">
                      <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide leading-tight">{label}</p>
                      <p className={`text-sm font-black mt-1 leading-none ${red ? 'text-red-400' : 'text-white'}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-500">
                  {events.length} events · {incomes.length} direct income · {expenses.length} expenses
                </p>
              </div>
            </div>

            {/* ── Tabs — underline style ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex">
                {tabs.map(({ id, label, count }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex-1 relative py-3 flex flex-col items-center gap-0.5 cursor-pointer transition-colors ${
                      activeTab === id ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <span className="text-[11px] font-bold leading-tight">{label}</span>
                    {count !== null && (
                      <span className={`text-[10px] font-black leading-none ${
                        activeTab === id ? 'text-red-500' : 'text-gray-400'
                      }`}>{count}</span>
                    )}
                    {/* Active underline */}
                    <span className={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full transition-all ${
                      activeTab === id ? 'bg-red-600' : 'bg-transparent'
                    }`} />
                  </button>
                ))}
              </div>
            </div>

            {/* ══════════════════════════════════════
                OVERVIEW TAB
            ══════════════════════════════════════ */}
            {activeTab === 'overview' && (
              <div className="space-y-3">
                {/* 2×2 quick stats */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Total Events',   value: String(events.length),   sub: 'with collections'                                              },
                    { label: 'Direct Income',  value: String(incomes.length),  sub: 'sponsorships & donations'                                      },
                    { label: 'Total Expenses', value: String(expenses.length), sub: `${eventExpenses.length} turf · ${otherExpenses.length} other`  },
                    { label: 'Balance',        value: `₹${financialSummary.availableBalance.toLocaleString()}`,
                      sub: balancePos ? 'available funds' : 'deficit', red: !balancePos },
                  ].map(({ label, value, sub, red }) => (
                    <div key={label} className={`rounded-2xl border shadow-sm p-4 ${red ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                      <p className={`text-2xl font-black mt-1 ${red ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{sub}</p>
                    </div>
                  ))}
                </div>

                {/* Recent expenses strip */}
                {expenses.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-xs font-black text-gray-700">Recent Expenses</p>
                      <button onClick={() => setActiveTab('expenses')}
                        className="text-[10px] font-bold text-red-600 cursor-pointer hover:text-red-700">
                        View all →
                      </button>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {expenses.slice(0, 3).map(e => (
                        <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">
                              {e.expenseType === 'event_payment' ? e.eventTitle : e.expenseName}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {e.dateSpent.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              {' · '}{e.expenseType === 'event_payment' ? 'Turf' : 'Other'}
                            </p>
                          </div>
                          <span className="text-xs font-black text-red-600 flex-shrink-0">−₹{e.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════
                EVENTS TAB
            ══════════════════════════════════════ */}
            {activeTab === 'events' && (
              <div className="space-y-2">
                {events.length === 0 ? (
                  <EmptyState title="No event income yet" sub="Closed events with collected payments appear here" />
                ) : events.map(event => {
                  const isExpanded = expandedEvent === event.id;
                  const eventDate  = event.date.toDate();
                  const perPlayer  = calcPerPlayer(event.totalAmount, event.participantCount);
                  const expected   = perPlayer * event.participantCount;
                  const profit     = event.totalCollected - event.totalAmount;
                  const rate       = expected > 0 ? Math.round((event.totalCollected / expected) * 100) : 0;

                  return (
                    <div key={event.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <button onClick={() => toggleEvent(event.id)} className="w-full px-4 pt-4 pb-3 text-left">
                        {/* Title row */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-black text-gray-900">{event.title}</h3>
                              {event.eventPaidToVendor && (
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200 flex-shrink-0">
                                  Vendor Paid
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-sm font-black text-gray-900">₹{event.totalCollected.toLocaleString()}</span>
                            <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                        {/* Meta row */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {event.participantCount} players
                          </span>
                          <span className="text-xs font-semibold text-gray-500">{rate}% collected</span>
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3 animate-slideDown">
                          {/* 2×2 grid */}
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: 'Turf Cost',  value: `₹${event.totalAmount.toLocaleString()}` },
                              { label: 'Per Player', value: `₹${perPlayer.toLocaleString()}` },
                              { label: 'Expected',   value: `₹${expected.toLocaleString()}` },
                              { label: 'Collected',  value: `₹${event.totalCollected.toLocaleString()}` },
                            ].map(({ label, value }) => (
                              <div key={label} className="bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100 text-center">
                                <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                                <p className="text-sm font-black text-gray-800 mt-0.5">{value}</p>
                              </div>
                            ))}
                          </div>
                          {/* Profit — full width */}
                          <div className={`rounded-xl px-3 py-2.5 border text-center ${
                            profit < 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'
                          }`}>
                            <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">Profit / Loss</p>
                            <p className={`text-base font-black mt-0.5 ${profit < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                              ₹{profit.toLocaleString()}
                            </p>
                          </div>
                          {/* Calculation note */}
                          <div className="px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                            <p className="text-[10px] text-gray-400 leading-relaxed">
                              Collected <span className="font-bold text-gray-600">₹{event.totalCollected.toLocaleString()}</span>
                              {' − '}Turf <span className="font-bold text-gray-600">₹{event.totalAmount.toLocaleString()}</span>
                              {' = '}Profit <span className={`font-bold ${profit < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                                ₹{profit.toLocaleString()}
                              </span>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ══════════════════════════════════════
                INCOME TAB
            ══════════════════════════════════════ */}
            {activeTab === 'income' && (
              <div className="space-y-2">
                {incomes.length === 0 ? (
                  <EmptyState title="No direct income yet" sub="Sponsorships, donations & other income appear here" />
                ) : incomes.map(income => (
                  <div key={income.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    {/* Top row: name + amount */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="text-sm font-black text-gray-900 leading-snug flex-1 min-w-0">{income.incomeName}</p>
                      <p className="text-sm font-black text-gray-900 flex-shrink-0">+₹{income.amount.toLocaleString()}</p>
                    </div>
                    {/* Meta row: badge + date on same line */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200">
                        {SOURCE_LABELS[income.incomeSource]}
                      </span>
                      <span className="text-xs text-gray-400">
                        {income.dateReceived.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    {/* Description */}
                    {income.description && (
                      <p className="text-xs text-gray-500 mt-1.5 leading-relaxed border-t border-gray-100 pt-2">
                        {income.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ══════════════════════════════════════
                EXPENSES TAB
            ══════════════════════════════════════ */}
            {activeTab === 'expenses' && (
              <div className="space-y-3">
                {expenses.length === 0 ? (
                  <EmptyState title="No expenses recorded" sub="Expenses will appear once the treasurer records them" />
                ) : (
                  <>
                    {/* Turf payments */}
                    {eventExpenses.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                          <p className="text-xs font-black text-gray-700 uppercase tracking-wide">Turf Payments</p>
                          <span className="text-[10px] font-black px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                            {eventExpenses.length}
                          </span>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {eventExpenses.map(e => (
                            <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-900 break-words leading-snug">{e.eventTitle}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  {e.dateSpent.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  {' · '}Vendor payment
                                </p>
                              </div>
                              <span className="text-xs font-black text-red-600 flex-shrink-0 ml-2">
                                −₹{e.amount.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Other expenses */}
                    {otherExpenses.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                          <p className="text-xs font-black text-gray-700 uppercase tracking-wide">Other Expenses</p>
                          <span className="text-[10px] font-black px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                            {otherExpenses.length}
                          </span>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {otherExpenses.map(e => (
                            <div key={e.id} className="px-4 py-3 flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-900 break-words leading-snug">{e.expenseName}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  {e.dateSpent.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                                {e.description && (
                                  <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">{e.description}</p>
                                )}
                              </div>
                              <span className="text-xs font-black text-red-600 flex-shrink-0 ml-2">
                                −₹{e.amount.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes slideDown { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: translateY(0) } }
        .animate-slideDown { animation: slideDown 0.2s ease-out; }
      `}</style>
    </div>
  );
}

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
      <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </div>
      <p className="text-sm font-bold text-gray-900">{title}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}