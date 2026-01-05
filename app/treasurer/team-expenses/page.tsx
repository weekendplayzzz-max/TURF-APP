'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { 
  getFinancialSummary, 
  addOtherExpense, 
  markEventAsPaidToVendor,
  getUnpaidEvents 
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

  // Expense Type Selection
  const [expenseType, setExpenseType] = useState<'event_payment' | 'other_expense'>('other_expense');

  // Common Fields
  const [dateSpent, setDateSpent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Event Payment Fields
  const [selectedEventId, setSelectedEventId] = useState('');
  const [unpaidEvents, setUnpaidEvents] = useState<UnpaidEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Other Expense Fields
  const [expenseName, setExpenseName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  // Financial Summary
  const [fundData, setFundData] = useState({
    totalIncome: 0,
    totalExpenses: 0,
    availableBalance: 0,
  });
  const [loadingBalance, setLoadingBalance] = useState(true);

  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
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
    // Reset all fields when switching
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

    // Date validation
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
        // Handle Event Payment
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
          const selectedEvent = unpaidEvents.find(e => e.id === selectedEventId);
          setSuccessMessage(
            `Event "${selectedEvent?.title}" marked as paid to vendor! Expense of ₹${selectedEvent?.totalAmount.toLocaleString()} recorded.`
          );
          setShowSuccessDialog(true);

          // Reset and refresh
          setSelectedEventId('');
          setDateSpent('');
          fetchBalance();
          fetchUnpaidEvents();
        } else {
          setMessage({ type: 'error', text: result.message || 'Failed to mark event as paid' });
        }
      } else {
        // Handle Other Expense
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
          setSuccessMessage(
            `Expense "${expenseName}" (₹${expenseAmount.toLocaleString()}) added successfully!`
          );
          setShowSuccessDialog(true);

          // Reset form and refresh balance
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
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-base text-gray-700 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  const selectedEvent = unpaidEvents.find(e => e.id === selectedEventId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Success Dialog */}
      {showSuccessDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 animate-slideUp">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                Success!
              </h3>
              <p className="text-sm sm:text-base text-gray-600 break-words">
                {successMessage}
              </p>
              
              <button
                onClick={closeSuccessDialog}
                className="mt-6 w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
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
              <div>
                <h1 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900">
                  Add Expense
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                  Record team expenses and vendor payments
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-10">
        {/* Financial Balance Card */}
        <div className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-2xl shadow-xl p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-green-100 text-xs sm:text-sm font-semibold mb-1">Available Balance</p>
              {loadingBalance ? (
                <div className="animate-pulse">
                  <div className="h-8 sm:h-10 bg-green-400 rounded w-32"></div>
                </div>
              ) : (
                <p className="text-2xl sm:text-3xl md:text-4xl font-bold">₹{fundData.availableBalance.toLocaleString()}</p>
              )}
              <div className="mt-2 sm:mt-3 text-xs sm:text-sm text-green-100 space-y-1">
                <p>Income: ₹{fundData.totalIncome.toLocaleString()}</p>
                <p>Expenses: ₹{fundData.totalExpenses.toLocaleString()}</p>
              </div>
            </div>
            <div className="text-4xl sm:text-5xl md:text-6xl opacity-20">💰</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 md:p-8 border border-gray-200">
          {/* Error Message */}
          {message.text && (
            <div
              className={`mb-6 p-4 rounded-lg border-l-4 animate-slideDown ${
                message.type === 'success'
                  ? 'bg-green-50 border-green-500 text-green-800'
                  : 'bg-red-50 border-red-500 text-red-800'
              }`}
            >
              <p className="text-sm font-medium">{message.text}</p>
            </div>
          )}

          {/* Expense Type Selection */}
          <div className="mb-6 sm:mb-8">
            <label className="block text-gray-900 font-bold mb-3 sm:mb-4 text-sm sm:text-base">
              Expense Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {/* Event Payment Option */}
              <div
                onClick={() => handleExpenseTypeChange('event_payment')}
                className={`p-4 sm:p-6 border-2 rounded-xl cursor-pointer transition-all ${
                  expenseType === 'event_payment'
                    ? 'border-red-600 bg-red-50'
                    : 'border-gray-300 hover:border-red-400 bg-white'
                }`}
              >
                <div className="flex items-center mb-2 sm:mb-3">
                  <input
                    type="radio"
                    id="event_payment"
                    name="expenseType"
                    value="event_payment"
                    checked={expenseType === 'event_payment'}
                    onChange={() => handleExpenseTypeChange('event_payment')}
                    className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 cursor-pointer"
                  />
                  <label htmlFor="event_payment" className="ml-3 font-bold text-base sm:text-lg cursor-pointer">
                    🏟️ Event Payment
                  </label>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 ml-7 sm:ml-8">
                  Mark turf vendor payment for a specific event
                </p>
              </div>

              {/* Other Expense Option */}
              <div
                onClick={() => handleExpenseTypeChange('other_expense')}
                className={`p-4 sm:p-6 border-2 rounded-xl cursor-pointer transition-all ${
                  expenseType === 'other_expense'
                    ? 'border-red-600 bg-red-50'
                    : 'border-gray-300 hover:border-red-400 bg-white'
                }`}
              >
                <div className="flex items-center mb-2 sm:mb-3">
                  <input
                    type="radio"
                    id="other_expense"
                    name="expenseType"
                    value="other_expense"
                    checked={expenseType === 'other_expense'}
                    onChange={() => handleExpenseTypeChange('other_expense')}
                    className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 cursor-pointer"
                  />
                  <label htmlFor="other_expense" className="ml-3 font-bold text-base sm:text-lg cursor-pointer">
                    🛍️ Other Expense
                  </label>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 ml-7 sm:ml-8">
                  Jerseys, equipment, tournament fees, etc.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {expenseType === 'event_payment' ? (
              <>
                {/* Event Payment Form */}
                <div className="mb-6">
                  <label htmlFor="eventSelect" className="block text-gray-900 font-bold mb-2 text-sm sm:text-base">
                    Select Event <span className="text-red-500">*</span>
                  </label>
                  {loadingEvents ? (
                    <div className="animate-pulse">
                      <div className="h-12 bg-gray-200 rounded-lg"></div>
                    </div>
                  ) : unpaidEvents.length === 0 ? (
                    <div className="bg-yellow-50 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded-lg">
                      <p className="font-semibold text-sm">No unpaid events available</p>
                      <p className="text-xs mt-1">All events have been paid to vendors.</p>
                    </div>
                  ) : (
                    <select
                      id="eventSelect"
                      value={selectedEventId}
                      onChange={(e) => setSelectedEventId(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none text-sm sm:text-base bg-white"
                      required
                    >
                      <option value="">-- Select an event to pay --</option>
                      {unpaidEvents.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.title} - ₹{event.totalAmount.toLocaleString()} (Collected: ₹
                          {event.totalCollected.toLocaleString()})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Event Details Card */}
                {selectedEvent && (
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 sm:p-5 mb-6 rounded-lg">
                    <p className="font-semibold text-blue-900 mb-3 text-sm sm:text-base">Event Payment Details</p>
                    <div className="space-y-2 text-xs sm:text-sm text-blue-800">
                      <p><strong>Event:</strong> {selectedEvent.title}</p>
                      <p><strong>Turf Amount:</strong> ₹{selectedEvent.totalAmount.toLocaleString()}</p>
                      <p><strong>Collected from Players:</strong> ₹{selectedEvent.totalCollected.toLocaleString()}</p>
                      {selectedEvent.totalCollected < selectedEvent.totalAmount && (
                        <p className="text-yellow-700 font-semibold">
                          ⚠️ Warning: Collected amount is less than turf cost!
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Other Expense Form */}
                <div className="mb-6">
                  <label htmlFor="expenseName" className="block text-gray-900 font-bold mb-2 text-sm sm:text-base">
                    Expense Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="expenseName"
                    value={expenseName}
                    onChange={(e) => setExpenseName(e.target.value)}
                    placeholder="e.g., Jersey Purchase, Equipment Repair"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none text-sm sm:text-base"
                    required
                  />
                </div>

                <div className="mb-6">
                  <label htmlFor="description" className="block text-gray-900 font-bold mb-2 text-sm sm:text-base">
                    Description <span className="text-gray-500 text-xs sm:text-sm">(Optional)</span>
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Additional details about this expense..."
                    rows={4}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none text-sm sm:text-base"
                  />
                </div>

                <div className="mb-6">
                  <label htmlFor="amount" className="block text-gray-900 font-bold mb-2 text-sm sm:text-base">
                    Amount Spent (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    id="amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    min="1"
                    step="1"
                    max={fundData.availableBalance}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none text-sm sm:text-base"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Maximum: ₹{fundData.availableBalance.toLocaleString()} (available balance)
                  </p>
                </div>
              </>
            )}

            {/* Common Field: Date Spent */}
            <div className="mb-6">
              <label htmlFor="dateSpent" className="block text-gray-900 font-bold mb-2 text-sm sm:text-base">
                Date Spent <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                id="dateSpent"
                value={dateSpent}
                onChange={(e) => setDateSpent(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none text-sm sm:text-base"
                required
              />
            </div>

          

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <button
                type="submit"
                disabled={
                  submitting || 
                  (expenseType === 'event_payment' && unpaidEvents.length === 0) ||
                  (expenseType === 'other_expense' && fundData.availableBalance === 0)
                }
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <span>{expenseType === 'event_payment' ? '✓' : '💰'}</span>
                    {expenseType === 'event_payment' ? 'Mark Event as Paid' : 'Add Expense'}
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 sm:px-8 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-lg transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }

        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
