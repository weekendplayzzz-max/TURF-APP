'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  doc, 
  updateDoc, 
  Timestamp 
} from 'firebase/firestore';
import { updateEventTotalCollected } from '@/lib/eventManagement';

interface Payment {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: Timestamp;
  playerId: string;
  playerName: string;
  currentAmountDue: number;
  totalPaid: number;
  paymentStatus: 'pending' | 'paid';
  paidAt: Timestamp | null;
  markedPaidBy: string | null;
}

interface Event {
  id: string;
  title: string;
  date: Timestamp;
  status: string;
  participantCount: number;
  totalCollected: number;
  totalAmount: number;
}

export default function ManagePayments() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());
  const [loadingData, setLoadingData] = useState(true);
  const [message, setMessage] = useState('');
  const [processingBulk, setProcessingBulk] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<{
    type: 'bulk-paid' | 'bulk-unpaid';
    count: number;
  } | null>(null);

  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  const fetchClosedEvents = useCallback(async () => {
    try {
      const eventsRef = collection(db, 'events');
      const eventsQuery = query(eventsRef, orderBy('date', 'desc'));
      const eventsSnapshot = await getDocs(eventsQuery);
      
      const closedEvents: Event[] = [];
      eventsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.status === 'closed' || data.status === 'locked') {
          closedEvents.push({
            id: docSnap.id,
            title: data.title,
            date: data.date,
            status: data.status,
            participantCount: data.participantCount || 0,
            totalCollected: data.totalCollected || 0,
            totalAmount: data.totalAmount || 0,
          });
        }
      });
      
      setEvents(closedEvents);
      setLoadingData(false);
    } catch (error) {
      console.error('Error fetching events:', error);
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'treasurer') {
      fetchClosedEvents();
    }
  }, [role, fetchClosedEvents]);

  const fetchPayments = useCallback(async (eventId: string) => {
    try {
      setLoadingData(true);
      setSelectedPayments(new Set());
      const paymentsRef = collection(db, 'eventPayments');
      const paymentsQuery = query(
        paymentsRef,
        where('eventId', '==', eventId),
        orderBy('playerName', 'asc')
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      
      const paymentsList: Payment[] = [];
      paymentsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        paymentsList.push({
          id: docSnap.id,
          eventId: data.eventId,
          eventTitle: data.eventTitle,
          eventDate: data.eventDate,
          playerId: data.playerId,
          playerName: data.playerName,
          currentAmountDue: data.currentAmountDue,
          totalPaid: data.totalPaid || 0,
          paymentStatus: data.paymentStatus,
          paidAt: data.paidAt,
          markedPaidBy: data.markedPaidBy,
        });
      });
      
      setPayments(paymentsList);
      setLoadingData(false);
    } catch (error) {
      console.error('Error fetching payments:', error);
      setLoadingData(false);
    }
  }, []);

  const handleEventSelect = (eventId: string) => {
    setSelectedEventId(eventId);
    if (eventId) {
      fetchPayments(eventId);
    } else {
      setPayments([]);
      setSelectedPayments(new Set());
    }
  };

  const togglePaymentSelection = (paymentId: string) => {
    setSelectedPayments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(paymentId)) {
        newSet.delete(paymentId);
      } else {
        newSet.add(paymentId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPayments.size === payments.length) {
      setSelectedPayments(new Set());
    } else {
      setSelectedPayments(new Set(payments.map(p => p.id)));
    }
  };

  const selectAllPending = () => {
    const pendingIds = payments.filter(p => p.paymentStatus === 'pending').map(p => p.id);
    setSelectedPayments(new Set(pendingIds));
  };

  const selectAllPaid = () => {
    const paidIds = payments.filter(p => p.paymentStatus === 'paid').map(p => p.id);
    setSelectedPayments(new Set(paidIds));
  };

  const openConfirmDialog = (type: 'bulk-paid' | 'bulk-unpaid') => {
    setConfirmAction({ type, count: selectedPayments.size });
    setShowConfirmDialog(true);
  };

  const closeConfirmDialog = () => {
    setShowConfirmDialog(false);
    setConfirmAction(null);
  };

  const closeSuccessDialog = () => {
    setShowSuccessDialog(false);
    setSuccessMessage('');
  };

  const handleBulkAction = async (markAsPaid: boolean) => {
    if (!user || selectedPayments.size === 0) return;

    try {
      setProcessingBulk(true);
      closeConfirmDialog();

      const selectedPaymentsList = payments.filter(p => selectedPayments.has(p.id));
      
      const updatePromises = selectedPaymentsList.map(payment => {
        const paymentRef = doc(db, 'eventPayments', payment.id);
        if (markAsPaid) {
          return updateDoc(paymentRef, {
            totalPaid: payment.currentAmountDue,
            paymentStatus: 'paid',
            paidAt: Timestamp.now(),
            markedPaidBy: user.uid,
            markedPaidByName: user.displayName || user.email || 'Treasurer',
            updatedAt: Timestamp.now(),
          });
        } else {
          return updateDoc(paymentRef, {
            totalPaid: 0,
            paymentStatus: 'pending',
            paidAt: null,
            markedPaidBy: null,
            markedPaidByName: null,
            updatedAt: Timestamp.now(),
          });
        }
      });

      await Promise.all(updatePromises);
      await updateEventTotalCollected(selectedEventId);

      setSuccessMessage(
        markAsPaid 
          ? `Successfully marked ${selectedPayments.size} payment${selectedPayments.size > 1 ? 's' : ''} as PAID`
          : `Successfully marked ${selectedPayments.size} payment${selectedPayments.size > 1 ? 's' : ''} as UNPAID`
      );
      setShowSuccessDialog(true);
      setSelectedPayments(new Set());
      await fetchPayments(selectedEventId);
      await fetchClosedEvents();
    } catch (error) {
      console.error('Error updating payments:', error);
      setMessage('Failed to update payments');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setProcessingBulk(false);
    }
  };

  const handleConfirmAction = () => {
    if (!confirmAction) return;
    handleBulkAction(confirmAction.type === 'bulk-paid');
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

  const paidCount = payments.filter(p => p.paymentStatus === 'paid').length;
  const pendingCount = payments.filter(p => p.paymentStatus === 'pending').length;
  const totalCollected = payments.reduce((sum, p) => sum + p.totalPaid, 0);
  const totalExpected = payments.reduce((sum, p) => sum + p.currentAmountDue, 0);
  const selectedEvent = events.find(e => e.id === selectedEventId);

  const selectedPendingCount = payments.filter(p => 
    selectedPayments.has(p.id) && p.paymentStatus === 'pending'
  ).length;
  const selectedPaidCount = payments.filter(p => 
    selectedPayments.has(p.id) && p.paymentStatus === 'paid'
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Confirmation Dialog */}
      {showConfirmDialog && confirmAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 animate-slideUp">
            <div className="text-center mb-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                confirmAction.type === 'bulk-paid' ? 'bg-green-50' : 'bg-red-50'
              }`}>
                <svg className={`w-8 h-8 ${
                  confirmAction.type === 'bulk-paid' ? 'text-green-600' : 'text-red-600'
                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {confirmAction.type === 'bulk-paid' ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  )}
                </svg>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                {confirmAction.type === 'bulk-paid' ? 'Mark Multiple as Paid?' : 'Mark Multiple as Unpaid?'}
              </h3>
              <p className="text-sm sm:text-base text-gray-600">
                {confirmAction.type === 'bulk-paid' 
                  ? 'Confirm payment received for' 
                  : 'Revert payment status for'}
              </p>
              <p className="text-xl font-bold text-gray-900 mt-2">
                {confirmAction.count} player{confirmAction.count > 1 ? 's' : ''}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleConfirmAction}
                disabled={processingBulk}
                className={`w-full px-6 py-3 text-white font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  confirmAction.type === 'bulk-paid'
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {processingBulk ? 'Processing...' : 
                  confirmAction.type === 'bulk-paid' 
                    ? 'Yes, Mark as Paid' 
                    : 'Yes, Mark as Unpaid'}
              </button>
              <button
                onClick={closeConfirmDialog}
                disabled={processingBulk}
                className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
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
                  Manage Payments
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                  Track and manage player payments
                </p>
              </div>
            </div>
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

        {/* Event Selector */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 mb-6">
          <label className="block text-gray-900 font-bold mb-3 text-sm sm:text-base">Select Event</label>
          <select
            value={selectedEventId}
            onChange={(e) => handleEventSelect(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none text-sm sm:text-base bg-white"
          >
            <option value="">-- Choose an event --</option>
            {events.map((event) => {
              const eventDate = event.date.toDate();
              const dateStr = eventDate.toLocaleDateString('en-IN', { 
                day: 'numeric', 
                month: 'short', 
                year: 'numeric' 
              });
              return (
                <option key={event.id} value={event.id}>
                  {event.title} - {dateStr} ({event.status.toUpperCase()}) - {event.participantCount} players - ₹{event.totalCollected.toLocaleString()}
                </option>
              );
            })}
          </select>
        </div>

        {/* Event Summary & Statistics */}
        {selectedEvent && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-2xl shadow-xl p-4 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600">Players</p>
                  <p className="text-xl font-bold text-gray-900">{selectedEvent.participantCount}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-4 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600">Paid</p>
                  <p className="text-xl font-bold text-green-600">{paidCount}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-4 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600">Pending</p>
                  <p className="text-xl font-bold text-red-600">{pendingCount}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-4 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600">Collected</p>
                  <p className="text-xl font-bold text-purple-600">₹{selectedEvent.totalCollected.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payments Table */}
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-base text-gray-700 font-medium">Loading payments...</p>
            </div>
          </div>
        ) : selectedEventId && payments.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            {/* Sticky Bulk Actions Header */}
            <div className="bg-gray-50 border-b border-gray-200 p-4 sticky top-0 z-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={toggleSelectAll}
                    className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 font-semibold rounded-lg transition-colors text-xs border border-gray-300"
                  >
                    {selectedPayments.size === payments.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button
                    onClick={selectAllPending}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-semibold rounded-lg transition-colors text-xs border border-red-200"
                  >
                    Pending ({pendingCount})
                  </button>
                  <button
                    onClick={selectAllPaid}
                    className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 font-semibold rounded-lg transition-colors text-xs border border-green-200"
                  >
                    Paid ({paidCount})
                  </button>
                </div>
                
                {selectedPayments.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">
                      {selectedPayments.size} selected
                    </span>
                    {selectedPendingCount > 0 && (
                      <button
                        onClick={() => openConfirmDialog('bulk-paid')}
                        disabled={processingBulk}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors text-xs disabled:opacity-50"
                      >
                        ✓ Mark Paid ({selectedPendingCount})
                      </button>
                    )}
                    {selectedPaidCount > 0 && (
                      <button
                        onClick={() => openConfirmDialog('bulk-unpaid')}
                        disabled={processingBulk}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors text-xs disabled:opacity-50"
                      >
                        ✗ Unpaid ({selectedPaidCount})
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Compact Table */}
          <div className="overflow-x-auto">
  <table className="w-full">
    <thead className="bg-red-600 text-white">
      <tr>
        <th className="px-4 py-3 text-left">
          <input
            type="checkbox"
            checked={selectedPayments.size === payments.length && payments.length > 0}
            onChange={toggleSelectAll}
            className="w-4 h-4 text-red-600 bg-white rounded border-gray-300 focus:ring-red-500 cursor-pointer"
          />
        </th>
        <th className="px-4 py-3 text-left text-sm font-bold">Player Name</th>
        <th className="px-4 py-3 text-center text-sm font-bold">Amount Due</th>
        <th className="px-4 py-3 text-center text-sm font-bold">Status</th>
      </tr>
    </thead>
    <tbody>
      {payments.map((payment, index) => (
        <tr
          key={payment.id}
          className={`border-b transition-colors ${
            selectedPayments.has(payment.id)
              ? 'bg-red-50'
              : index % 2 === 0 
              ? 'bg-white hover:bg-gray-50' 
              : 'bg-gray-50 hover:bg-gray-100'
          }`}
        >
          <td className="px-4 py-3">
            <input
              type="checkbox"
              checked={selectedPayments.has(payment.id)}
              onChange={() => togglePaymentSelection(payment.id)}
              className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500 cursor-pointer"
            />
          </td>
          <td className="px-4 py-3 text-sm font-semibold text-gray-900">{payment.playerName}</td>
          <td className="px-4 py-3 text-center text-sm font-bold text-blue-600">
            ₹{payment.currentAmountDue.toLocaleString()}
          </td>
          <td className="px-4 py-3 text-center">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${
              payment.paymentStatus === 'paid'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              {payment.paymentStatus === 'paid' ? '✓ PAID' : '✗ PENDING'}
            </span>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>


            {/* Summary Footer */}
            <div className="bg-gray-50 border-t border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
                <div className="flex gap-6">
                  <div>
                    <span className="text-gray-600">Total Expected: </span>
                    <span className="font-bold text-gray-900">₹{totalExpected.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Total Collected: </span>
                    <span className="font-bold text-green-600">₹{totalCollected.toLocaleString()}</span>
                  </div>
                </div>
                <div>
                  <span className="text-gray-600">Collection Rate: </span>
                  <span className="font-bold text-purple-600">
                    {totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : selectedEventId ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900 mb-2">No payments found</p>
            <p className="text-sm sm:text-base text-gray-600">Payment records will appear here</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Select an event</p>
            <p className="text-sm sm:text-base text-gray-600">Choose an event above to view and manage payments</p>
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
