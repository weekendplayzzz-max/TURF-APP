'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useCallback } from 'react';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { deleteIncome, getFinancialSummaryUpdated } from '@/lib/eventManagement';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
  query,
  orderBy,
} from 'firebase/firestore';

type IncomeSource =
  | 'sponsorship'
  | 'donation'
  | 'membership_fees'
  | 'fundraising'
  | 'other';

interface IncomeItem {
  id: string;
  incomeName: string;
  description: string | null;
  amount: number;
  dateReceived: Timestamp;
  incomeSource: IncomeSource;
  createdBy: string;
  createdByEmail: string;
  createdByRole: string;
  createdAt: Timestamp;
}

interface EditFormState {
  incomeName: string;
  amount: string;
  dateReceived: string;
  incomeSource: IncomeSource;
  description: string;
}

function Spinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-center">
        <div className="relative w-12 h-12 mx-auto mb-4">
          <div className="absolute inset-0 border-4 border-green-600/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-sm sm:text-base text-gray-700 font-medium">{label}</p>
      </div>
    </div>
  );
}

function getIncomeSourceMeta(source: IncomeSource) {
  switch (source) {
    case 'sponsorship':
      return {
        label: 'Sponsorship',
        emoji: '🏢',
        pill: 'bg-blue-50 text-blue-700 border-blue-200',
      };
    case 'donation':
      return {
        label: 'Donation',
        emoji: '🎁',
        pill: 'bg-pink-50 text-pink-700 border-pink-200',
      };
    case 'membership_fees':
      return {
        label: 'Membership Fees',
        emoji: '👥',
        pill: 'bg-purple-50 text-purple-700 border-purple-200',
      };
    case 'fundraising':
      return {
        label: 'Fundraising',
        emoji: '📈',
        pill: 'bg-orange-50 text-orange-700 border-orange-200',
      };
    default:
      return {
        label: 'Other',
        emoji: '📦',
        pill: 'bg-gray-100 text-gray-700 border-gray-200',
      };
  }
}

function formatDateInput(ts: Timestamp | null | undefined) {
  if (!ts) return '';
  const d = ts.toDate();
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ViewManageIncomePage() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [incomeList, setIncomeList] = useState<IncomeItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [message, setMessage] = useState<{ type: 'success' | 'error' | ''; text: string }>({
    type: '',
    text: '',
  });

  const [filter, setFilter] = useState<'all' | IncomeSource>('all');
  const [search, setSearch] = useState('');

  const [selectedIncome, setSelectedIncome] = useState<IncomeItem | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>({
    incomeName: '',
    amount: '',
    dateReceived: '',
    incomeSource: 'sponsorship',
    description: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [incomeToDelete, setIncomeToDelete] = useState<IncomeItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [fundData, setFundData] = useState({
    totalIncome: 0,
    eventIncome: 0,
    directIncome: 0,
    totalExpenses: 0,
    availableBalance: 0,
  });

  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  const showTemporaryMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => {
      setMessage({ type: '', text: '' });
    }, 3000);
  };

  const fetchIncome = useCallback(async () => {
    try {
      setLoadingData(true);

      const incomeRef = collection(db, 'income');
      const incomeQuery = query(incomeRef, orderBy('dateReceived', 'desc'), orderBy('createdAt', 'desc'));
      const incomeSnapshot = await getDocs(incomeQuery);

      const items: IncomeItem[] = [];
      incomeSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          incomeName: data.incomeName || '',
          description: data.description || null,
          amount: data.amount || 0,
          dateReceived: data.dateReceived,
          incomeSource: (data.incomeSource || 'other') as IncomeSource,
          createdBy: data.createdBy || '',
          createdByEmail: data.createdByEmail || '',
          createdByRole: data.createdByRole || '',
          createdAt: data.createdAt,
        });
      });

      setIncomeList(items);
    } catch (error) {
      console.error('Error fetching income:', error);
      showTemporaryMessage('error', 'Failed to load income records');
    } finally {
      setLoadingData(false);
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await getFinancialSummaryUpdated();
      setFundData(data);
    } catch (error) {
      console.error('Error fetching financial summary:', error);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      setRefreshing(true);
      await Promise.all([fetchIncome(), fetchSummary()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchIncome, fetchSummary]);

  useEffect(() => {
    if (role === 'treasurer') {
      refreshAll();
    }
  }, [role, refreshAll]);

  const filteredIncome = useMemo(() => {
    const q = search.trim().toLowerCase();

    return incomeList.filter((item) => {
      const matchesFilter = filter === 'all' ? true : item.incomeSource === filter;
      const matchesSearch =
        q.length === 0 ||
        item.incomeName.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q) ||
        item.createdByEmail.toLowerCase().includes(q);

      return matchesFilter && matchesSearch;
    });
  }, [incomeList, filter, search]);

  const summary = useMemo(() => {
    return filteredIncome.reduce(
      (acc, item) => {
        acc.totalAmount += item.amount;
        acc.count += 1;
        return acc;
      },
      { totalAmount: 0, count: 0 }
    );
  }, [filteredIncome]);

  const openEditModal = (item: IncomeItem) => {
    setSelectedIncome(item);
    setEditForm({
      incomeName: item.incomeName,
      amount: String(item.amount),
      dateReceived: formatDateInput(item.dateReceived),
      incomeSource: item.incomeSource,
      description: item.description || '',
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    if (savingEdit) return;
    setShowEditModal(false);
    setSelectedIncome(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncome) return;

    const trimmedName = editForm.incomeName.trim();
    const parsedAmount = parseFloat(editForm.amount);
    const trimmedDescription = editForm.description.trim();

    if (!trimmedName) {
      showTemporaryMessage('error', 'Income name is required');
      return;
    }

    if (!editForm.amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      showTemporaryMessage('error', 'Please enter a valid amount greater than 0');
      return;
    }

    if (!editForm.dateReceived) {
      showTemporaryMessage('error', 'Date received is required');
      return;
    }

    const selectedDate = new Date(editForm.dateReceived);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (selectedDate > today) {
      showTemporaryMessage('error', 'Date received cannot be in the future');
      return;
    }

    try {
      setSavingEdit(true);

      await updateDoc(doc(db, 'income', selectedIncome.id), {
        incomeName: trimmedName,
        amount: parsedAmount,
        incomeSource: editForm.incomeSource,
        description: trimmedDescription || null,
        dateReceived: Timestamp.fromDate(new Date(editForm.dateReceived)),
        updatedAt: Timestamp.now(),
        lastEditedAt: Timestamp.now(),
        lastEditedBy: user?.uid || '',
        lastEditedByRole: 'treasurer',
      });

      setIncomeList((prev) =>
        prev.map((item) =>
          item.id === selectedIncome.id
            ? {
                ...item,
                incomeName: trimmedName,
                amount: parsedAmount,
                incomeSource: editForm.incomeSource,
                description: trimmedDescription || null,
                dateReceived: Timestamp.fromDate(new Date(editForm.dateReceived)),
              }
            : item
        )
      );

      setShowEditModal(false);
      setSelectedIncome(null);
      await fetchSummary();
      showTemporaryMessage('success', 'Income updated successfully');
    } catch (error) {
      console.error('Error updating income:', error);
      showTemporaryMessage('error', 'Failed to update income');
    } finally {
      setSavingEdit(false);
    }
  };

  const openDeleteDialog = (item: IncomeItem) => {
    setIncomeToDelete(item);
    setShowDeleteDialog(true);
  };

  const closeDeleteDialog = () => {
    if (deleting) return;
    setShowDeleteDialog(false);
    setIncomeToDelete(null);
  };

  const confirmDelete = async () => {
    if (!incomeToDelete) return;

    try {
      setDeleting(true);
      const result = await deleteIncome(incomeToDelete.id);

      if (result.success) {
        setIncomeList((prev) => prev.filter((item) => item.id !== incomeToDelete.id));
        await fetchSummary();
        showTemporaryMessage('success', 'Income deleted successfully');
      } else {
        showTemporaryMessage('error', result.message || 'Failed to delete income');
      }
    } catch (error) {
      console.error('Error deleting income:', error);
      showTemporaryMessage('error', 'Failed to delete income');
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
      setIncomeToDelete(null);
    }
  };

  if (loading || !user || role !== 'treasurer') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-green-600/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-base text-gray-700 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {showEditModal && selectedIncome && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-slideUp">
            <div className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <p className="text-[11px] font-black text-green-500 uppercase tracking-widest mb-2">
                    Edit Income
                  </p>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                    Update income details
                  </h2>
                </div>
                <button
                  onClick={closeEditModal}
                  disabled={savingEdit}
                  className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-500 flex items-center justify-center transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-5">
                <div>
                  <label htmlFor="editIncomeName" className="block text-sm font-bold text-gray-900 mb-2">
                    Income Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="editIncomeName"
                    type="text"
                    value={editForm.incomeName}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, incomeName: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none text-sm sm:text-base text-black"
                    placeholder="Enter income name"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="editIncomeSource" className="block text-sm font-bold text-gray-900 mb-2">
                    Income Source <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="editIncomeSource"
                    value={editForm.incomeSource}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        incomeSource: e.target.value as IncomeSource,
                      }))
                    }
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none text-sm sm:text-base bg-white text-black"
                    required
                  >
                    <option value="sponsorship">🏢 Sponsorship</option>
                    <option value="donation">🎁 Donation</option>
                    <option value="membership_fees">👥 Membership Fees</option>
                    <option value="fundraising">📈 Fundraising</option>
                    <option value="other">📦 Other</option>
                  </select>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="editAmount" className="block text-sm font-bold text-gray-900 mb-2">
                      Amount (₹) <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="editAmount"
                      type="number"
                      min="1"
                      step="1"
                      value={editForm.amount}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, amount: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none text-sm sm:text-base text-black"
                      placeholder="0"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="editDateReceived" className="block text-sm font-bold text-gray-900 mb-2">
                      Date Received <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="editDateReceived"
                      type="date"
                      value={editForm.dateReceived}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, dateReceived: e.target.value }))}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none text-sm sm:text-base text-black"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="editDescription" className="block text-sm font-bold text-gray-900 mb-2">
                    Reason / Description <span className="text-gray-500 font-medium">(Optional)</span>
                  </label>
                  <textarea
                    id="editDescription"
                    rows={4}
                    value={editForm.description}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none text-sm sm:text-base text-black"
                    placeholder="Add details about this income..."
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="flex-1 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
                  >
                    {savingEdit ? 'Saving Changes...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={closeEditModal}
                    disabled={savingEdit}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-bold py-3 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showDeleteDialog && incomeToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 animate-slideUp">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                </svg>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                Delete Income?
              </h3>
              <p className="text-sm text-gray-600 mb-2 break-words">
                {incomeToDelete.incomeName}
              </p>
              <p className="text-sm font-semibold text-gray-900 mb-4">
                ₹{incomeToDelete.amount.toLocaleString()}
              </p>

              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-left">
                <p className="text-sm font-semibold text-red-800 mb-1">This action cannot be undone.</p>
                <p className="text-xs text-red-700">
                  The income entry will be permanently removed from your financial records.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={closeDeleteDialog}
                  disabled={deleting}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-bold py-3 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
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

              <div className="min-w-0">
                <h1 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900">
                  View & Manage Income
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                  Review all income records, edit entries, and remove incorrect ones
                </p>
              </div>
            </div>

            <button
              onClick={() => router.push('/treasurer/add-income')}
              className="px-3 sm:px-5 py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors whitespace-nowrap"
            >
              + Add Income
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-10">
        {message.text && (
          <div
            className={`mb-6 p-4 rounded-xl border-l-4 animate-slideDown ${
              message.type === 'success'
                ? 'bg-green-50 border-green-500 text-green-800'
                : 'bg-red-50 border-red-500 text-red-800'
            }`}
          >
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1">
              Total Income
            </p>
            <p className="text-lg sm:text-2xl font-black text-gray-900">
              ₹{fundData.totalIncome.toLocaleString()}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1">
              Direct Income
            </p>
            <p className="text-lg sm:text-2xl font-black text-green-600">
              ₹{fundData.directIncome.toLocaleString()}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1">
              Filtered Entries
            </p>
            <p className="text-lg sm:text-2xl font-black text-gray-900">
              {summary.count}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1">
              Filtered Amount
            </p>
            <p className="text-lg sm:text-2xl font-black text-green-600">
              ₹{summary.totalAmount.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 mb-6">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1">
              <label htmlFor="incomeSearch" className="sr-only">
                Search income
              </label>
              <div className="relative">
                <svg
                  className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  id="incomeSearch"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, description, or creator email"
                  className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none text-sm text-black"
                />
              </div>
            </div>

            <div className="lg:w-60">
              <label htmlFor="incomeFilter" className="sr-only">
                Filter by source
              </label>
              <select
                id="incomeFilter"
                value={filter}
                onChange={(e) => setFilter(e.target.value as 'all' | IncomeSource)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none text-sm bg-white text-black"
              >
                <option value="all">All Sources</option>
                <option value="sponsorship">Sponsorship</option>
                <option value="donation">Donation</option>
                <option value="membership_fees">Membership Fees</option>
                <option value="fundraising">Fundraising</option>
                <option value="other">Other</option>
              </select>
            </div>

            <button
              onClick={refreshAll}
              disabled={refreshing}
              className="px-4 py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-50 text-gray-700 font-bold rounded-xl transition-colors text-sm whitespace-nowrap"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {loadingData ? (
          <Spinner label="Loading income records..." />
        ) : filteredIncome.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 sm:p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0-5v2m0 14v2m9-9h-2M5 12H3" />
              </svg>
            </div>
            <p className="text-lg font-bold text-gray-900 mb-2">No income records found</p>
            <p className="text-sm text-gray-600 mb-6">
              Try changing the filter, clearing search, or add a new income entry.
            </p>
            <button
              onClick={() => router.push('/treasurer/add-income')}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors"
            >
              Add Income
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredIncome.map((item) => {
              const meta = getIncomeSourceMeta(item.incomeSource);
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-black uppercase tracking-wide ${meta.pill}`}>
                          <span>{meta.emoji}</span>
                          {meta.label}
                        </span>

                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-[11px] font-black uppercase tracking-wide">
                          ID #{item.id.slice(-6).toUpperCase()}
                        </span>
                      </div>

                      <h2 className="text-lg sm:text-xl font-black text-gray-900 break-words">
                        {item.incomeName}
                      </h2>

                      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2 mt-3 text-xs sm:text-sm text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0-5v2m0 14v2m9-9h-2M5 12H3" />
                          </svg>
                          <span className="font-semibold text-green-700">
                            ₹{item.amount.toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>
                            Received {item.dateReceived.toDate().toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="truncate">
                            {item.createdByEmail || 'No creator email'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>
                            Added {item.createdAt?.toDate?.().toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            }) || '—'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl bg-gray-50 border border-gray-100 p-3">
                        <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">
                          Reason / Description
                        </p>
                        <p className="text-sm text-gray-700 break-words">
                          {item.description?.trim() || 'No description added.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-row lg:flex-col gap-2 lg:w-40">
                      <button
                        onClick={() => openEditModal(item)}
                        className="flex-1 lg:w-full px-4 py-2.5 bg-white hover:bg-green-50 active:bg-green-100 text-green-700 border border-green-200 font-bold rounded-xl transition-colors text-sm"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => openDeleteDialog(item)}
                        className="flex-1 lg:w-full px-4 py-2.5 bg-white hover:bg-red-50 active:bg-red-100 text-red-600 border border-red-200 font-bold rounded-xl transition-colors text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
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
            transform: translateY(18px);
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
          animation: slideUp 0.25s ease-out;
        }

        .animate-slideDown {
          animation: slideDown 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}