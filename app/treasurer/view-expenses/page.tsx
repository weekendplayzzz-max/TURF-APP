'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  deleteDoc,
  doc,
} from 'firebase/firestore';

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

export default function ViewAllExpenses() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [message, setMessage] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'event_payment' | 'other_expense'>('all');

  // Calculate totals
  const eventExpenses = expenses.filter(e => e.expenseType === 'event_payment');
  const otherExpenses = expenses.filter(e => e.expenseType === 'other_expense');
  const totalEventExpenses = eventExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalOtherExpenses = otherExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalAllExpenses = totalEventExpenses + totalOtherExpenses;

  // Filter expenses based on selected type
  const filteredExpenses = filterType === 'all' 
    ? expenses 
    : expenses.filter(e => e.expenseType === filterType);

  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  // Real-time listener for ALL expenses
  useEffect(() => {
    if (role !== 'treasurer') return;

    setLoadingData(true);

    const expensesRef = collection(db, 'expenses');
    const expensesQuery = query(expensesRef, orderBy('dateSpent', 'desc'));

    const unsubscribe = onSnapshot(
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
        setLoadingData(false);
      },
      (error) => {
        console.error('Error fetching expenses:', error);
        setLoadingData(false);
      }
    );

    return () => unsubscribe();
  }, [role]);

  const openDeleteDialog = (expense: Expense) => {
    setSelectedExpense(expense);
    setShowDeleteDialog(true);
  };

  const closeDeleteDialog = () => {
    setShowDeleteDialog(false);
    setSelectedExpense(null);
  };

  const closeSuccessDialog = () => {
    setShowSuccessDialog(false);
    setSuccessMessage('');
  };

  const handleDeleteExpense = async () => {
    if (!selectedExpense) return;

    // Prevent deletion of event payments
    if (selectedExpense.expenseType === 'event_payment') {
      setMessage('Event payments cannot be deleted directly. Please manage through the event.');
      setTimeout(() => setMessage(''), 5000);
      closeDeleteDialog();
      return;
    }

    try {
      setDeletingId(selectedExpense.id);
      closeDeleteDialog();

      await deleteDoc(doc(db, 'expenses', selectedExpense.id));

      setSuccessMessage(`Expense "${selectedExpense.expenseName}" (₹${selectedExpense.amount.toLocaleString()}) deleted successfully`);
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error deleting expense:', error);
      setMessage('Failed to delete expense');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setDeletingId(null);
      setSelectedExpense(null);
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
      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && selectedExpense && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 animate-slideUp">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                Delete Expense?
              </h3>
              <p className="text-sm sm:text-base text-gray-600">
                Are you sure you want to delete
              </p>
              <p className="text-sm sm:text-base font-semibold text-gray-900 mt-1 break-words">
                "{selectedExpense.expenseType === 'event_payment' ? selectedExpense.eventTitle : selectedExpense.expenseName}"
              </p>
              <p className="text-lg font-bold text-red-600 mt-2">
                ₹{selectedExpense.amount.toLocaleString()}
              </p>
              {selectedExpense.expenseType === 'event_payment' ? (
                <p className="text-xs text-yellow-700 mt-2 bg-yellow-50 p-2 rounded">
                  ⚠️ Event payments cannot be deleted
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-2">
                  This action cannot be undone
                </p>
              )}
            </div>

            <div className="space-y-3">
              {selectedExpense.expenseType === 'other_expense' && (
                <button
                  onClick={handleDeleteExpense}
                  disabled={deletingId === selectedExpense.id}
                  className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deletingId === selectedExpense.id ? 'Deleting...' : 'Yes, Delete Expense'}
                </button>
              )}
              <button
                onClick={closeDeleteDialog}
                disabled={deletingId === selectedExpense.id}
                className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {selectedExpense.expenseType === 'event_payment' ? 'Close' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  All Expenses
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                  View all club expenses and event payments
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/treasurer/team-expenses')}
              className="px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors text-xs sm:text-sm flex items-center gap-1 sm:gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Add Expense</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-10">
        {/* Error Message */}
        {message && (
          <div className="mb-6 p-4 rounded-lg border-l-4 bg-red-50 border-red-500 text-red-800 animate-slideDown">
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}

    

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
          <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-600 mb-1">Turf Payments</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-600">₹{totalEventExpenses.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">{eventExpenses.length} payment(s)</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-600 mb-1">Other Expenses</p>
                <p className="text-2xl sm:text-3xl font-bold text-orange-600">₹{totalOtherExpenses.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">{otherExpenses.length} expense(s)</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-600 mb-1">Total Expenses</p>
                <p className="text-2xl sm:text-3xl font-bold text-red-600">₹{totalAllExpenses.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">{expenses.length} total</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 mb-6 overflow-hidden">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setFilterType('all')}
              className={`flex-1 px-4 py-3 sm:py-4 font-semibold text-xs sm:text-sm transition-colors ${
                filterType === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              All ({expenses.length})
            </button>
            <button
              onClick={() => setFilterType('event_payment')}
              className={`flex-1 px-4 py-3 sm:py-4 font-semibold text-xs sm:text-sm transition-colors border-x border-gray-200 ${
                filterType === 'event_payment'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              🏟️ Turf Payments ({eventExpenses.length})
            </button>
            <button
              onClick={() => setFilterType('other_expense')}
              className={`flex-1 px-4 py-3 sm:py-4 font-semibold text-xs sm:text-sm transition-colors ${
                filterType === 'other_expense'
                  ? 'bg-orange-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              🛍️ Other Expenses ({otherExpenses.length})
            </button>
          </div>
        </div>

        {/* Expenses List */}
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-base text-gray-700 font-medium">Loading expenses...</p>
            </div>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
              {filterType === 'all' && 'No expenses recorded yet'}
              {filterType === 'event_payment' && 'No event payments recorded yet'}
              {filterType === 'other_expense' && 'No other expenses recorded yet'}
            </p>
            <p className="text-sm sm:text-base text-gray-600 mb-6">
              {filterType === 'all' && 'Start tracking expenses to see them here'}
              {filterType === 'event_payment' && 'Event payments will appear when you mark events as paid'}
              {filterType === 'other_expense' && 'Add expenses like jerseys, equipment, and tournament fees'}
            </p>
            <button
              onClick={() => router.push('/treasurer/team-expenses/add')}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            >
              Add Expense
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900 text-white">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold">Type</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold">Date</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold">Expense</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold">Description</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-right text-xs sm:text-sm font-bold">Amount</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-center text-xs sm:text-sm font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredExpenses.map((expense, index) => (
                    <tr
                      key={expense.id}
                      className={`${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      } ${
                        expense.expenseType === 'event_payment' ? 'hover:bg-blue-50' : 'hover:bg-orange-50'
                      } transition-colors`}
                    >
                      <td className="px-4 sm:px-6 py-3 sm:py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                          expense.expenseType === 'event_payment'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {expense.expenseType === 'event_payment' ? '🏟️ Event' : '🛍️ Other'}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-900 font-semibold whitespace-nowrap">
                        {expense.dateSpent.toDate().toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4">
                        <p className="text-xs sm:text-sm text-gray-900 font-semibold">
                          {expense.expenseType === 'event_payment' ? expense.eventTitle : expense.expenseName}
                        </p>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-600 max-w-xs">
                        {expense.expenseType === 'event_payment' ? (
                          <span className="italic text-gray-500">Turf vendor payment</span>
                        ) : expense.description ? (
                          expense.description
                        ) : (
                          <span className="italic text-gray-400">No description</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-right whitespace-nowrap">
                        <span className={`font-bold text-sm sm:text-base ${
                          expense.expenseType === 'event_payment' ? 'text-blue-600' : 'text-orange-600'
                        }`}>
                          ₹{expense.amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-center">
                        <button
                          onClick={() => openDeleteDialog(expense)}
                          disabled={deletingId === expense.id || expense.expenseType === 'event_payment'}
                          className={`px-3 py-1.5 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            expense.expenseType === 'event_payment'
                              ? 'bg-gray-400 cursor-not-allowed'
                              : 'bg-red-600 hover:bg-red-700'
                          }`}
                          title={expense.expenseType === 'event_payment' ? 'Event payments cannot be deleted' : 'Delete expense'}
                        >
                          {deletingId === expense.id ? 'Deleting...' : expense.expenseType === 'event_payment' ? 'Locked' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={4} className="px-4 sm:px-6 py-3 sm:py-4 text-right font-bold text-gray-900 text-xs sm:text-sm">
                      {filterType === 'all' && 'TOTAL ALL EXPENSES:'}
                      {filterType === 'event_payment' && 'TOTAL EVENT PAYMENTS:'}
                      {filterType === 'other_expense' && 'TOTAL OTHER EXPENSES:'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-right whitespace-nowrap">
                      <span className="text-red-600 font-bold text-base sm:text-lg">
                        ₹{
                          filterType === 'all' ? totalAllExpenses.toLocaleString() :
                          filterType === 'event_payment' ? totalEventExpenses.toLocaleString() :
                          totalOtherExpenses.toLocaleString()
                        }
                      </span>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden divide-y divide-gray-200">
              {filteredExpenses.map((expense) => (
                <div key={expense.id} className={`p-4 ${
                  expense.expenseType === 'event_payment' ? 'bg-blue-50' : 'bg-white'
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0 mr-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                          expense.expenseType === 'event_payment'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {expense.expenseType === 'event_payment' ? '🏟️ Turf' : '🛍️ Other'}
                        </span>
                      </div>
                      <p className="text-gray-900 font-bold text-sm mb-1">
                        {expense.expenseType === 'event_payment' ? expense.eventTitle : expense.expenseName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {expense.dateSpent.toDate().toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                      {expense.expenseType === 'other_expense' && expense.description && (
                        <p className="text-xs text-gray-600 mt-1 bg-gray-50 rounded p-2">
                          {expense.description}
                        </p>
                      )}
                    </div>
                    <span className={`font-bold text-base whitespace-nowrap ${
                      expense.expenseType === 'event_payment' ? 'text-blue-600' : 'text-orange-600'
                    }`}>
                      ₹{expense.amount.toLocaleString()}
                    </span>
                  </div>
                  {expense.expenseType === 'other_expense' && (
                    <button
                      onClick={() => openDeleteDialog(expense)}
                      disabled={deletingId === expense.id}
                      className="mt-2 w-full px-3 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingId === expense.id ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                  {expense.expenseType === 'event_payment' && (
                    <div className="mt-2 text-center text-xs text-gray-500 italic">
                      Event payments cannot be deleted
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
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
