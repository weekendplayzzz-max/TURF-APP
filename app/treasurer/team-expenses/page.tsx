'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  getFinancialSummary,
  addOtherExpense,
  markEventAsPaidToVendor,
  getUnpaidEvents,
} from '@/lib/eventManagement';

interface UnpaidEvent {
  id: string;
  title: string;
  totalAmount: number;
  totalCollected: number;
  date: any;
}

export default function AddExpense() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [expenseType, setExpenseType] = useState<'event_payment' | 'other_expense'>('other_expense');
  const [dateSpent, setDateSpent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [selectedEventId, setSelectedEventId] = useState('');
  const [unpaidEvents, setUnpaidEvents] = useState<UnpaidEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [expenseName, setExpenseName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  const [fundData, setFundData] = useState({
    totalIncome: 0,
    totalExpenses: 0,
    availableBalance: 0,
  });
  const [loadingBalance, setLoadingBalance] = useState(true);

  useEffect(() => {
    if (!loading && role !== 'treasurer') router.push('/login');
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'treasurer') {
      fetchBalance();
      fetchUnpaidEvents();
    }
  }, [role]);

  const fetchBalance = async () => {
    try {
      setLoadingBalance(true);
      const data = await getFinancialSummary();
      setFundData(data);
    } catch (error) {
      console.error('Error fetching balance:', error);
    } finally {
      setLoadingBalance(false);
    }
  };

  const fetchUnpaidEvents = async () => {
    try {
      setLoadingEvents(true);
      const events = await getUnpaidEvents();
      setUnpaidEvents(events);
    } catch (error) {
      console.error('Error fetching unpaid events:', error);
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleExpenseTypeChange = (type: 'event_payment' | 'other_expense') => {
    setExpenseType(type);
    setMessage({ type: '', text: '' });
    setExpenseName('');
    setDescription('');
    setAmount('');
    setSelectedEventId('');
    setDateSpent('');
  };

  const closeSuccessDialog = () => {
    setShowSuccessDialog(false);
    setSuccessMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (!dateSpent) {
      setMessage({ type: 'error', text: 'Date spent is required' });
      return;
    }

    const selectedDate = new Date(dateSpent);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (selectedDate > today) {
      setMessage({ type: 'error', text: 'Date spent cannot be in the future' });
      return;
    }

    try {
      setSubmitting(true);

      if (expenseType === 'event_payment') {
        if (!selectedEventId) {
          setMessage({ type: 'error', text: 'Please select an event' });
          return;
        }

        const result = await markEventAsPaidToVendor(
          selectedEventId,
          user?.uid || '',
          user?.email || ''
        );

        if (result.success) {
          const sel = unpaidEvents.find((e) => e.id === selectedEventId);
          setSuccessMessage(
            `Event "${sel?.title}" marked as paid to vendor! Expense of ₹${sel?.totalAmount.toLocaleString()} recorded.`
          );
          setShowSuccessDialog(true);
          setSelectedEventId('');
          setDateSpent('');
          fetchBalance();
          fetchUnpaidEvents();
        } else {
          setMessage({ type: 'error', text: result.message || 'Failed to mark event as paid' });
        }
      } else {
        if (!expenseName.trim()) {
          setMessage({ type: 'error', text: 'Expense name is required' });
          return;
        }
        const expenseAmount = parseFloat(amount);
        if (!amount || expenseAmount <= 0) {
          setMessage({ type: 'error', text: 'Please enter a valid amount greater than 0' });
          return;
        }

        const result = await addOtherExpense(
          expenseName.trim(),
          expenseAmount,
          new Date(dateSpent),
          description.trim() || null,
          user?.uid || '',
          user?.email || ''
        );

        if (result.success) {
          setSuccessMessage(`Expense "${expenseName}" (₹${expenseAmount.toLocaleString()}) added successfully!`);
          setShowSuccessDialog(true);
          setExpenseName('');
          setDescription('');
          setAmount('');
          setDateSpent('');
          fetchBalance();
        } else {
          setMessage({ type: 'error', text: result.message || 'Failed to add expense' });
        }
      }
    } catch (error) {
      console.error('Error adding expense:', error);
      setMessage({ type: 'error', text: 'Failed to add expense. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user || role !== 'treasurer') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="relative w-14 h-14 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-sm text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  const selectedEvent = unpaidEvents.find((e) => e.id === selectedEventId);
  const parsedAmount =
    expenseType === 'other_expense'
      ? parseFloat(amount || '0')
      : selectedEvent
      ? selectedEvent.totalAmount
      : 0;
  const balanceAfter =
    parsedAmount > 0 ? fundData.availableBalance - parsedAmount : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">

      {/* Success Dialog */}
      {showSuccessDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md p-6 animate-slideUp">
            <div className="text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Recorded!</h3>
              <p className="text-sm text-gray-500 break-words">{successMessage}</p>
              <button
                onClick={closeSuccessDialog}
                className="mt-5 w-full py-3 bg-gray-900 active:bg-gray-700 text-white font-semibold rounded-xl transition-colors cursor-pointer text-sm"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors cursor-pointer flex-shrink-0"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="w-8 h-8 flex-shrink-0">
              <Image src="/logo.png" alt="Logo" width={32} height={32} className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-gray-900 leading-tight">Add Expense</h1>
              <p className="text-xs text-gray-400 hidden sm:block">Record team expenses and vendor payments</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">

        {/* ── Balance Card — dark theme, matches app ── */}
        <div className="relative overflow-hidden bg-gray-900 rounded-2xl shadow-sm p-4 sm:p-5 text-white">
          {/* Subtle red accent ring top-right */}
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border-[20px] border-red-600/20 pointer-events-none" />
          <div className="absolute right-4 -bottom-10 w-24 h-24 rounded-full border-[16px] border-red-600/10 pointer-events-none" />

          <div className="flex items-start justify-between relative mb-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Available Balance
              </p>
              {loadingBalance ? (
                <div className="animate-pulse h-9 bg-gray-700 rounded-lg w-36" />
              ) : (
                <p className="text-3xl sm:text-4xl font-bold text-white">
                  ₹{fundData.availableBalance.toLocaleString()}
                </p>
              )}
            </div>
            {/* Wallet icon */}
            <div className="w-10 h-10 bg-red-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 10h18M3 6h18M3 14h18M3 18h18" />
              </svg>
            </div>
          </div>

          {/* Stats row */}
          <div className={`grid gap-2 relative ${balanceAfter !== null ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div className="bg-white/8 rounded-xl px-3 py-2.5 border border-white/10">
              <p className="text-xs text-gray-400 mb-0.5">Total In</p>
              <p className="text-sm font-bold text-white">₹{fundData.totalIncome.toLocaleString()}</p>
            </div>
            <div className="bg-white/8 rounded-xl px-3 py-2.5 border border-white/10">
              <p className="text-xs text-gray-400 mb-0.5">Total Out</p>
              <p className="text-sm font-bold text-white">₹{fundData.totalExpenses.toLocaleString()}</p>
            </div>
            {balanceAfter !== null && (
              <div className={`rounded-xl px-3 py-2.5 border transition-all ${
                balanceAfter < 0
                  ? 'bg-red-600/20 border-red-500/40'
                  : 'bg-white/8 border-white/10'
              }`}>
                <p className="text-xs text-gray-400 mb-0.5">After This</p>
                <p className={`text-sm font-bold ${balanceAfter < 0 ? 'text-red-400' : 'text-white'}`}>
                  {balanceAfter < 0 ? '−' : ''}₹{Math.abs(balanceAfter).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {message.text && (
          <div className="p-3 rounded-xl border-l-4 bg-red-50 border-red-500 text-red-800 text-sm font-medium animate-slideDown">
            {message.text}
          </div>
        )}

        {/* ── Expense Type Selector ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">What are you recording?</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                type: 'other_expense' as const,
                icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                ),
                label: 'Other Expense',
                sub: 'Jerseys, equipment, fees',
              },
              {
                type: 'event_payment' as const,
                icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ),
                label: 'Event Payment',
                sub: 'Pay turf vendor',
              },
            ].map(({ type, icon, label, sub }) => {
              const active = expenseType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleExpenseTypeChange(type)}
                  className={`relative p-3 sm:p-4 rounded-xl border-2 text-left transition-all cursor-pointer overflow-hidden ${
                    active
                      ? 'border-red-600 bg-red-50'
                      : 'border-gray-200 bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  {active && (
                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-600 rounded-full" />
                  )}
                  <span className={`${active ? 'text-red-600' : 'text-gray-400'}`}>{icon}</span>
                  <p className={`text-xs sm:text-sm font-bold mt-2 ${active ? 'text-red-700' : 'text-gray-700'}`}>
                    {label}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-tight">{sub}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Form Card ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-5">
          <form onSubmit={handleSubmit} className="space-y-5">

            {expenseType === 'event_payment' ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Select Event <span className="text-red-500">*</span>
                  </label>
                  {loadingEvents ? (
                    <div className="animate-pulse h-12 bg-gray-100 rounded-xl" />
                  ) : unpaidEvents.length === 0 ? (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                      <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-700">All events paid</p>
                        <p className="text-xs text-gray-400">No pending vendor payments.</p>
                      </div>
                    </div>
                  ) : (
                    <select
                      value={selectedEventId}
                      onChange={(e) => setSelectedEventId(e.target.value)}
                      className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl focus:border-red-500 focus:outline-none text-sm bg-white text-gray-900 cursor-pointer"
                      required
                    >
                      <option value="">-- Select an event --</option>
                      {unpaidEvents.map((event) => (
                        <option key={event.id} value={event.id} className="text-gray-900">
                          {event.title} · ₹{event.totalAmount.toLocaleString()}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Event detail strip */}
                {selectedEvent && (
                  <div className="rounded-xl border border-gray-200 overflow-hidden animate-slideDown">
                    <div className="grid grid-cols-2 divide-x divide-gray-100">
                      <div className="p-3 text-center">
                        <p className="text-xs text-gray-400 mb-0.5">Turf Cost</p>
                        <p className="text-base font-bold text-gray-900">
                          ₹{selectedEvent.totalAmount.toLocaleString()}
                        </p>
                      </div>
                      <div className="p-3 text-center">
                        <p className="text-xs text-gray-400 mb-0.5">Collected</p>
                        <p className={`text-base font-bold ${
                          selectedEvent.totalCollected >= selectedEvent.totalAmount
                            ? 'text-gray-900'
                            : 'text-red-600'
                        }`}>
                          ₹{selectedEvent.totalCollected.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {selectedEvent.totalCollected < selectedEvent.totalAmount && (
                      <div className="px-3 py-2 bg-red-50 border-t border-red-100 flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="text-xs font-semibold text-red-600">
                          Shortfall of ₹{(selectedEvent.totalAmount - selectedEvent.totalCollected).toLocaleString()} — collected less than turf cost
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Expense Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Expense Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={expenseName}
                    onChange={(e) => setExpenseName(e.target.value)}
                    placeholder="e.g., Jersey Purchase, Equipment Repair"
                    className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl focus:border-red-500 focus:outline-none text-sm text-gray-900 bg-white placeholder-gray-300"
                    required
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold pointer-events-none select-none">₹</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      className="w-full pl-7 pr-3 py-3 border-2 border-gray-200 rounded-xl focus:border-red-500 focus:outline-none text-sm text-gray-900 bg-white"
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Balance: <span className="font-semibold text-gray-600">₹{fundData.availableBalance.toLocaleString()}</span>
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Description <span className="font-normal text-gray-300 normal-case">(optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Any additional details..."
                    rows={3}
                    className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl focus:border-red-500 focus:outline-none text-sm text-gray-900 bg-white placeholder-gray-300 resize-none"
                  />
                </div>
              </>
            )}

            {/* Date Spent */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Date Spent <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={dateSpent}
                onChange={(e) => setDateSpent(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl focus:border-red-500 focus:outline-none text-sm text-gray-900 bg-white cursor-pointer"
                required
              />
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={
                  submitting ||
                  (expenseType === 'event_payment' && unpaidEvents.length === 0) ||
                  (expenseType === 'other_expense' && fundData.availableBalance === 0)
                }
                className="flex-1 py-3 bg-red-600 active:bg-red-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {expenseType === 'event_payment' ? 'Mark Event as Paid' : 'Add Expense'}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-5 py-3 bg-gray-100 active:bg-gray-200 text-gray-600 font-semibold rounded-xl transition-colors text-sm cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.25s ease-out; }
        .animate-slideDown { animation: slideDown 0.2s ease-out; }
      `}</style>
    </div>
  );
}