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

type ActiveTab = 'overview' | 'events' | 'income' | 'expenses';

export default function SecretaryTeamFund() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [expenses, setExpenses]             = useState<Expense[]>([]);
  const [incomes, setIncomes]               = useState<Income[]>([]);
  const [events, setEvents]                 = useState<Event[]>([]);
  const [loadingData, setLoadingData]       = useState(true);
  const [activeTab, setActiveTab]           = useState<ActiveTab>('overview');
  const [expandedEvent, setExpandedEvent]   = useState<string | null>(null);
  const [expandedIncome, setExpandedIncome] = useState<string | null>(null);
  const [expandedExpense, setExpandedExpense] = useState<string | null>(null);
  const [financialSummary, setFinancialSummary] = useState({
    totalIncome: 0,
    eventIncome: 0,
    directIncome: 0,
    totalExpenses: 0,
    availableBalance: 0,
  });

  useEffect(() => {
    if (!loading && role !== 'secretary') router.push('/login');
  }, [role, loading, router]);

  // Expenses listener
  useEffect(() => {
    if (role !== 'secretary') return;
    setLoadingData(true);
    const unsub = onSnapshot(
      query(collection(db, 'expenses'), orderBy('dateSpent', 'desc')),
      (snap) => {
        setExpenses(snap.docs.map(d => ({
          id: d.id, ...d.data() as Omit<Expense, 'id'>
        })));
      }
    );
    return unsub;
  }, [role]);

  // Income listener
  useEffect(() => {
    if (role !== 'secretary') return;
    const unsub = onSnapshot(
      query(collection(db, 'income'), orderBy('dateReceived', 'desc')),
      (snap) => {
        setIncomes(snap.docs.map(d => ({
          id: d.id, ...d.data() as Omit<Income, 'id'>
        })));
      }
    );
    return unsub;
  }, [role]);

  // Events listener
  useEffect(() => {
    if (role !== 'secretary') return;
    const unsub = onSnapshot(
      query(collection(db, 'events'), orderBy('date', 'desc')),
      (snap) => {
        const list: Event[] = [];
        snap.forEach(d => {
          const data = d.data();
          const collected = data.totalCollected || 0;
          if ((data.status === 'closed' || data.status === 'locked') && collected > 0) {
            list.push({ id: d.id, ...data as Omit<Event, 'id'> });
          }
        });
        setEvents(list);
        setLoadingData(false);
      },
      () => setLoadingData(false)
    );
    return unsub;
  }, [role]);

  // Financial summary
  useEffect(() => {
    if (role !== 'secretary') return;
    getFinancialSummary()
      .then(setFinancialSummary)
      .catch(console.error);
  }, [role, expenses, incomes, events]);

  const calcPerPlayer = (total: number, count: number) =>
    count === 0 ? 0 : Math.max(Math.ceil((total / count) / 10) * 10, 100);

  const incomeSourceLabel: Record<string, string> = {
    sponsorship:    '🤝 Sponsorship',
    donation:       '💝 Donation',
    membership_fees:'💳 Membership',
    fundraising:    '🎉 Fundraising',
    other:          '📌 Other',
  };

  const fmtDate = (ts: Timestamp) =>
    ts.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

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

  const eventExpenses = expenses.filter(e => e.expenseType === 'event_payment');
  const otherExpenses = expenses.filter(e => e.expenseType === 'other_expense');
  const balance       = financialSummary.availableBalance;

  const TABS: { key: ActiveTab; label: string; count?: number }[] = [
    { key: 'overview',  label: 'Overview' },
    { key: 'events',    label: 'Events',   count: events.length },
    { key: 'income',    label: 'Income',   count: incomes.length },
    { key: 'expenses',  label: 'Expenses', count: expenses.length },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()}
            className="p-2.5 rounded-xl bg-gray-100 active:bg-gray-200 cursor-pointer flex-shrink-0">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-7 h-7 flex-shrink-0">
            <Image src="/logo.png" alt="Logo" width={28} height={28} className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-gray-900 leading-tight">Club Finances</h1>
            <p className="text-xs text-gray-400">Income, expenses &amp; balance</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-lg mx-auto px-4">
          <div className="flex border-t border-gray-100">
            {TABS.map(tab => (
              <button key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                  activeTab === tab.key
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    activeTab === tab.key ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENT ─────────────────────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto px-3 py-4 pb-12">
        {loadingData ? (
          <div className="flex items-center justify-center py-24">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : (
          <>
            {/* ══ OVERVIEW TAB ══════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
              <div className="space-y-3 animate-fadeIn">

                {/* Balance hero card */}
                <div className="relative overflow-hidden bg-gray-900 rounded-2xl p-5 text-white">
                  <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full border-[18px] border-red-600/20 pointer-events-none" />
                  <div className="absolute right-2 -bottom-8 w-20 h-20 rounded-full border-[14px] border-red-600/10 pointer-events-none" />
                  <div className="relative">
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">
                      Available Balance
                    </p>
                    <p className="text-4xl font-black text-white">
                      ₹{balance.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Current club funds</p>
                  </div>
                </div>

                {/* Income / Expenses row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Total Income</p>
                    <p className="text-xl font-black text-green-600">
                      ₹{financialSummary.totalIncome.toLocaleString()}
                    </p>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Events</span>
                        <span className="text-[10px] font-bold text-gray-700">
                          ₹{financialSummary.eventIncome.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Direct</span>
                        <span className="text-[10px] font-bold text-gray-700">
                          ₹{financialSummary.directIncome.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Total Expenses</p>
                    <p className="text-xl font-black text-red-600">
                      ₹{financialSummary.totalExpenses.toLocaleString()}
                    </p>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Turf</span>
                        <span className="text-[10px] font-bold text-gray-700">{eventExpenses.length} records</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Other</span>
                        <span className="text-[10px] font-bold text-gray-700">{otherExpenses.length} records</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick stats row */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Events',   value: String(events.length),   color: 'text-blue-600'   },
                    { label: 'Incomes',  value: String(incomes.length),  color: 'text-green-600'  },
                    { label: 'Expenses', value: String(expenses.length), color: 'text-red-600'    },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
                      <p className={`text-xl font-black ${color}`}>{value}</p>
                      <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Go to sections */}
                <div className="space-y-2">
                  {([
                    { tab: 'events'   as ActiveTab, icon: '🏟️', label: 'Event Income',   sub: `${events.length} completed events`,   count: `₹${financialSummary.eventIncome.toLocaleString()}`,   color: 'text-blue-600'  },
                    { tab: 'income'   as ActiveTab, icon: '💝', label: 'Other Income',   sub: `${incomes.length} records`,            count: `₹${financialSummary.directIncome.toLocaleString()}`,  color: 'text-green-600' },
                    { tab: 'expenses' as ActiveTab, icon: '💸', label: 'Club Expenses',  sub: `${expenses.length} expense records`,   count: `₹${financialSummary.totalExpenses.toLocaleString()}`, color: 'text-red-600'   },
                  ] as const).map(({ tab, icon, label, sub, count, color }) => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer text-left">
                      <span className="text-2xl flex-shrink-0">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900">{label}</p>
                        <p className="text-xs text-gray-400">{sub}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-black ${color}`}>{count}</p>
                        <svg className="w-4 h-4 text-gray-300 ml-auto mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ══ EVENTS TAB ════════════════════════════════════════════════ */}
            {activeTab === 'events' && (
              <div className="space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                    {events.length} Event{events.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs font-black text-green-600">
                    ₹{financialSummary.eventIncome.toLocaleString()} total
                  </p>
                </div>

                {events.length === 0 ? (
                  <EmptyState icon="🏟️" title="No event income yet"
                    sub="Income appears once events are closed and payments collected" />
                ) : events.map(event => {
                  const isExpanded   = expandedEvent === event.id;
                  const perPlayer    = calcPerPlayer(event.totalAmount, event.participantCount);
                  const expected     = perPlayer * event.participantCount;
                  const profit       = event.totalCollected - event.totalAmount;
                  const rate         = expected > 0 ? Math.round((event.totalCollected / expected) * 100) : 0;

                  return (
                    <div key={event.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <button onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                        className="w-full p-4 flex items-start gap-3 text-left cursor-pointer active:bg-gray-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="text-sm font-black text-gray-900 break-words">{event.title}</p>
                            {event.eventPaidToVendor && (
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-black rounded-full border border-blue-200">
                                ✓ Vendor Paid
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            <span>{fmtDate(event.date)}</span>
                            <span>·</span>
                            <span>{event.participantCount} players</span>
                            <span>·</span>
                            <span className={`font-bold ${rate === 100 ? 'text-green-600' : rate >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                              {rate}% collected
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-base font-black text-green-600">
                            ₹{event.totalCollected.toLocaleString()}
                          </p>
                          <svg className={`w-4 h-4 text-gray-300 ml-auto mt-1 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100 bg-gray-50 p-4 animate-fadeIn">
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label: 'Turf Cost',  value: `₹${event.totalAmount.toLocaleString()}`,     color: 'text-gray-900'   },
                              { label: 'Per Player', value: `₹${perPlayer.toLocaleString()}`,             color: 'text-blue-600'   },
                              { label: 'Expected',   value: `₹${expected.toLocaleString()}`,              color: 'text-purple-600' },
                              { label: 'Profit',     value: `₹${profit.toLocaleString()}`,                color: profit >= 0 ? 'text-green-600' : 'text-red-600' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="bg-white rounded-xl p-3 border border-gray-100">
                                <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1">{label}</p>
                                <p className={`text-base font-black ${color}`}>{value}</p>
                              </div>
                            ))}
                          </div>
                          {/* Collection bar */}
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-gray-400 font-semibold">Collection Rate</span>
                              <span className="text-[10px] font-black text-gray-700">{rate}%</span>
                            </div>
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  rate === 100 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(rate, 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ══ INCOME TAB ════════════════════════════════════════════════ */}
            {activeTab === 'income' && (
              <div className="space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                    {incomes.length} Record{incomes.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs font-black text-green-600">
                    ₹{financialSummary.directIncome.toLocaleString()} total
                  </p>
                </div>

                {incomes.length === 0 ? (
                  <EmptyState icon="💝" title="No other income recorded"
                    sub="Sponsorships, donations, and other income will appear here" />
                ) : incomes.map(income => {
                  const isExpanded = expandedIncome === income.id;
                  return (
                    <div key={income.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <button onClick={() => setExpandedIncome(isExpanded ? null : income.id)}
                        className="w-full p-4 flex items-start gap-3 text-left cursor-pointer active:bg-gray-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-gray-900 mb-1">{income.incomeName}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-gray-400">{fmtDate(income.dateReceived)}</span>
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-full border border-blue-100">
                              {incomeSourceLabel[income.incomeSource] ?? '📌 Other'}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-base font-black text-green-600">
                            ₹{income.amount.toLocaleString()}
                          </p>
                          {income.description && (
                            <svg className={`w-4 h-4 text-gray-300 ml-auto mt-1 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </div>
                      </button>

                      {isExpanded && income.description && (
                        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 animate-fadeIn">
                          <p className="text-xs text-gray-600 leading-relaxed">{income.description}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ══ EXPENSES TAB ══════════════════════════════════════════════ */}
            {activeTab === 'expenses' && (
              <div className="space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                    {expenses.length} Record{expenses.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs font-black text-red-600">
                    ₹{financialSummary.totalExpenses.toLocaleString()} total
                  </p>
                </div>

                {expenses.length === 0 ? (
                  <EmptyState icon="💸" title="No expenses recorded yet"
                    sub="Club expenses will appear here once the treasurer records them" />
                ) : (
                  <>
                    {/* Turf payments */}
                    {eventExpenses.length > 0 && (
                      <>
                        <div className="px-1 pt-1">
                          <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">
                            🏟️ Turf Payments · {eventExpenses.length}
                          </p>
                        </div>
                        {eventExpenses.map(expense => (
                          <ExpenseCard key={expense.id} expense={expense}
                            expanded={expandedExpense === expense.id}
                            onToggle={() => setExpandedExpense(expandedExpense === expense.id ? null : expense.id)}
                            label={expense.eventTitle ?? '—'}
                            sublabel="Turf vendor payment"
                            badgeClass="bg-blue-50 text-blue-600 border-blue-100"
                            badge="🏟️ Turf"
                            fmtDate={fmtDate} />
                        ))}
                      </>
                    )}

                    {/* Other expenses */}
                    {otherExpenses.length > 0 && (
                      <>
                        <div className="px-1 pt-2">
                          <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">
                            🛍️ Other Expenses · {otherExpenses.length}
                          </p>
                        </div>
                        {otherExpenses.map(expense => (
                          <ExpenseCard key={expense.id} expense={expense}
                            expanded={expandedExpense === expense.id}
                            onToggle={() => setExpandedExpense(expandedExpense === expense.id ? null : expense.id)}
                            label={expense.expenseName ?? '—'}
                            sublabel={expense.description ?? undefined}
                            badgeClass="bg-orange-50 text-orange-600 border-orange-100"
                            badge="🛍️ Other"
                            fmtDate={fmtDate} />
                        ))}
                      </>
                    )}

                    {/* Total strip */}
                    <div className="bg-gray-900 rounded-2xl p-4 flex items-center justify-between mt-2">
                      <p className="text-xs font-black text-gray-400 uppercase tracking-wide">Total Expenses</p>
                      <p className="text-lg font-black text-red-400">
                        ₹{financialSummary.totalExpenses.toLocaleString()}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
      `}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
      <div className="w-14 h-14 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center text-3xl">
        {icon}
      </div>
      <p className="text-sm font-bold text-gray-900">{title}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function ExpenseCard({
  expense, expanded, onToggle, label, sublabel, badge, badgeClass, fmtDate,
}: {
  expense: { id: string; amount: number; dateSpent: Timestamp; description?: string | null };
  expanded: boolean;
  onToggle: () => void;
  label: string;
  sublabel?: string;
  badge: string;
  badgeClass: string;
  fmtDate: (ts: Timestamp) => string;
}) {
  const hasDetail = !!sublabel;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={onToggle}
        className="w-full p-4 flex items-start gap-3 text-left cursor-pointer active:bg-gray-50 transition-colors">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900 mb-1">{label}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-400">{fmtDate(expense.dateSpent)}</span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${badgeClass}`}>
              {badge}
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-base font-black text-red-600">₹{expense.amount.toLocaleString()}</p>
          {hasDetail && (
            <svg className={`w-4 h-4 text-gray-300 ml-auto mt-1 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>

      {expanded && hasDetail && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 animate-fadeIn">
          <p className="text-xs text-gray-600 leading-relaxed">{sublabel}</p>
        </div>
      )}
    </div>
  );
}