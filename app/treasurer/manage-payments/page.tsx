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
  Timestamp,
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

interface PlayerDebt {
  playerId: string;
  playerName: string;
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  payments: Payment[];
}

type ActiveTab = 'by-turf' | 'by-player';

export default function ManagePayments() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('by-turf');

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());
  const [loadingData, setLoadingData] = useState(true);
  const [refreshingTurf, setRefreshingTurf] = useState(false);
  const [message, setMessage] = useState('');
  const [processingBulk, setProcessingBulk] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<{
    type: 'bulk-paid' | 'bulk-unpaid';
    count: number;
  } | null>(null);

  const [playerDebts, setPlayerDebts] = useState<PlayerDebt[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [refreshingPlayers, setRefreshingPlayers] = useState(false);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [partialAmounts, setPartialAmounts] = useState<Record<string, string>>({});
  const [processingPlayer, setProcessingPlayer] = useState<string | null>(null);
  const [playerMessage, setPlayerMessage] = useState('');
  const [eventPendingCounts, setEventPendingCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!loading && role !== 'treasurer') router.push('/login');
  }, [role, loading, router]);

  const fetchClosedEvents = useCallback(async () => {
    try {
      const eventsSnapshot = await getDocs(
        query(collection(db, 'events'), orderBy('date', 'desc'))
      );
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

      const pendingCounts: Record<string, number> = {};
      await Promise.all(
        closedEvents.map(async (event) => {
          const snap = await getDocs(
            query(
              collection(db, 'eventPayments'),
              where('eventId', '==', event.id),
              where('paymentStatus', '==', 'pending')
            )
          );
          pendingCounts[event.id] = snap.size;
        })
      );

      setEvents(closedEvents);
      setEventPendingCounts(pendingCounts);
      setLoadingData(false);
    } catch (error) {
      console.error('Error fetching events:', error);
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'treasurer') fetchClosedEvents();
  }, [role, fetchClosedEvents]);

  const fetchPlayerDebts = useCallback(async () => {
    try {
      setLoadingPlayers(true);
      const snap = await getDocs(
        query(collection(db, 'eventPayments'), where('paymentStatus', '==', 'pending'))
      );
      const playerMap: Record<string, PlayerDebt> = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const payment: Payment = {
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
        };
        if (!playerMap[data.playerId]) {
          playerMap[data.playerId] = {
            playerId: data.playerId,
            playerName: data.playerName,
            totalDue: 0,
            totalPaid: 0,
            totalPending: 0,
            payments: [],
          };
        }
        const stillOwed = data.currentAmountDue - (data.totalPaid || 0);
        playerMap[data.playerId].totalDue += data.currentAmountDue;
        playerMap[data.playerId].totalPaid += data.totalPaid || 0;
        playerMap[data.playerId].totalPending += stillOwed;
        playerMap[data.playerId].payments.push(payment);
      });
      Object.values(playerMap).forEach((p) =>
        p.payments.sort((a, b) => a.eventDate.toMillis() - b.eventDate.toMillis())
      );
      setPlayerDebts(
        Object.values(playerMap).sort((a, b) => b.totalPending - a.totalPending)
      );
    } catch (error) {
      console.error('Error fetching player debts:', error);
    } finally {
      setLoadingPlayers(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'treasurer' && activeTab === 'by-player') fetchPlayerDebts();
  }, [role, activeTab, fetchPlayerDebts]);

  const fetchPayments = useCallback(async (eventId: string) => {
    try {
      setLoadingData(true);
      setSelectedPayments(new Set());
      const snap = await getDocs(
        query(
          collection(db, 'eventPayments'),
          where('eventId', '==', eventId),
          orderBy('playerName', 'asc')
        )
      );
      const list: Payment[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
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
      setPayments(list);
      setLoadingData(false);
    } catch (error) {
      console.error('Error fetching payments:', error);
      setLoadingData(false);
    }
  }, []);

  const handleEventSelect = (eventId: string) => {
    setSelectedEventId(eventId);
    if (eventId) fetchPayments(eventId);
    else { setPayments([]); setSelectedPayments(new Set()); }
  };

  const handleRefreshTurf = async () => {
    setRefreshingTurf(true);
    await fetchClosedEvents();
    if (selectedEventId) await fetchPayments(selectedEventId);
    setRefreshingTurf(false);
  };

  const handleRefreshPlayers = async () => {
    setRefreshingPlayers(true);
    await fetchPlayerDebts();
    setRefreshingPlayers(false);
  };

  const togglePaymentSelection = (id: string) => {
    setSelectedPayments((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () =>
    setSelectedPayments(
      selectedPayments.size === payments.length ? new Set() : new Set(payments.map((p) => p.id))
    );

  const selectAllPending = () =>
    setSelectedPayments(new Set(payments.filter((p) => p.paymentStatus === 'pending').map((p) => p.id)));

  const selectAllPaid = () =>
    setSelectedPayments(new Set(payments.filter((p) => p.paymentStatus === 'paid').map((p) => p.id)));

  const openConfirmDialog = (type: 'bulk-paid' | 'bulk-unpaid') => {
    setConfirmAction({ type, count: selectedPayments.size });
    setShowConfirmDialog(true);
  };

  const closeConfirmDialog = () => { setShowConfirmDialog(false); setConfirmAction(null); };
  const closeSuccessDialog = () => { setShowSuccessDialog(false); setSuccessMessage(''); };

  const handleBulkAction = async (markAsPaid: boolean) => {
    if (!user || selectedPayments.size === 0) return;
    try {
      setProcessingBulk(true);
      closeConfirmDialog();
      const list = payments.filter((p) => selectedPayments.has(p.id));
      await Promise.all(
        list.map((payment) =>
          updateDoc(
            doc(db, 'eventPayments', payment.id),
            markAsPaid
              ? {
                  totalPaid: payment.currentAmountDue,
                  paymentStatus: 'paid',
                  paidAt: Timestamp.now(),
                  markedPaidBy: user.uid,
                  markedPaidByName: user.displayName || user.email || 'Treasurer',
                  updatedAt: Timestamp.now(),
                }
              : {
                  totalPaid: 0,
                  paymentStatus: 'pending',
                  paidAt: null,
                  markedPaidBy: null,
                  markedPaidByName: null,
                  updatedAt: Timestamp.now(),
                }
          )
        )
      );
      await updateEventTotalCollected(selectedEventId);
      setSuccessMessage(
        markAsPaid
          ? `Marked ${selectedPayments.size} payment${selectedPayments.size > 1 ? 's' : ''} as PAID`
          : `Marked ${selectedPayments.size} payment${selectedPayments.size > 1 ? 's' : ''} as UNPAID`
      );
      setShowSuccessDialog(true);
      setSelectedPayments(new Set());
      await fetchPayments(selectedEventId);
      await fetchClosedEvents();
    } catch (error) {
      console.error(error);
      setMessage('Failed to update payments');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setProcessingBulk(false);
    }
  };

  const handleMarkPlayerTotalPaid = async (player: PlayerDebt) => {
    if (!user) return;
    try {
      setProcessingPlayer(player.playerId);
      await Promise.all(
        player.payments.map((payment) =>
          updateDoc(doc(db, 'eventPayments', payment.id), {
            totalPaid: payment.currentAmountDue,
            paymentStatus: 'paid',
            paidAt: Timestamp.now(),
            markedPaidBy: user.uid,
            markedPaidByName: user.displayName || user.email || 'Treasurer',
            updatedAt: Timestamp.now(),
          })
        )
      );
      const eventIds = [...new Set(player.payments.map((p) => p.eventId))];
      await Promise.all(eventIds.map((id) => updateEventTotalCollected(id)));
      setPlayerMessage(`Cleared all dues for ${player.playerName}`);
      setTimeout(() => setPlayerMessage(''), 3000);
      await fetchPlayerDebts();
    } catch (error) {
      console.error(error);
      setPlayerMessage('Failed to update. Try again.');
      setTimeout(() => setPlayerMessage(''), 3000);
    } finally {
      setProcessingPlayer(null);
    }
  };

  const handleMarkPartialPayment = async (player: PlayerDebt) => {
    if (!user) return;
    const amount = parseFloat(partialAmounts[player.playerId] || '');
    if (isNaN(amount) || amount <= 0) {
      setPlayerMessage('Enter a valid amount');
      setTimeout(() => setPlayerMessage(''), 2000);
      return;
    }
    if (amount > player.totalPending) {
      setPlayerMessage(`Amount exceeds total pending (₹${player.totalPending})`);
      setTimeout(() => setPlayerMessage(''), 2500);
      return;
    }
    try {
      setProcessingPlayer(player.playerId);
      let remaining = amount;
      const affectedEventIds: string[] = [];
      for (const payment of player.payments) {
        if (remaining <= 0) break;
        const stillOwed = payment.currentAmountDue - payment.totalPaid;
        if (stillOwed <= 0) continue;
        const allocate = Math.min(remaining, stillOwed);
        const newTotalPaid = payment.totalPaid + allocate;
        const nowFullyPaid = newTotalPaid >= payment.currentAmountDue;
        await updateDoc(doc(db, 'eventPayments', payment.id), {
          totalPaid: newTotalPaid,
          paymentStatus: nowFullyPaid ? 'paid' : 'pending',
          ...(nowFullyPaid
            ? {
                paidAt: Timestamp.now(),
                markedPaidBy: user.uid,
                markedPaidByName: user.displayName || user.email || 'Treasurer',
              }
            : {}),
          updatedAt: Timestamp.now(),
        });
        affectedEventIds.push(payment.eventId);
        remaining -= allocate;
      }
      await Promise.all([...new Set(affectedEventIds)].map((id) => updateEventTotalCollected(id)));
      setPartialAmounts((prev) => ({ ...prev, [player.playerId]: '' }));
      setPlayerMessage(`₹${amount} recorded for ${player.playerName}`);
      setTimeout(() => setPlayerMessage(''), 3000);
      await fetchPlayerDebts();
    } catch (error) {
      console.error(error);
      setPlayerMessage('Failed to update. Try again.');
      setTimeout(() => setPlayerMessage(''), 3000);
    } finally {
      setProcessingPlayer(null);
    }
  };

  if (loading || !user || role !== 'treasurer') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="relative w-14 h-14 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  const paidCount = payments.filter((p) => p.paymentStatus === 'paid').length;
  const pendingCount = payments.filter((p) => p.paymentStatus === 'pending').length;
  const totalCollected = payments.reduce((sum, p) => sum + p.totalPaid, 0);
  const totalExpected = payments.reduce((sum, p) => sum + p.currentAmountDue, 0);
  const selectedPendingCount = payments.filter(
    (p) => selectedPayments.has(p.id) && p.paymentStatus === 'pending'
  ).length;
  const selectedPaidCount = payments.filter(
    (p) => selectedPayments.has(p.id) && p.paymentStatus === 'paid'
  ).length;

  const RefreshButton = ({ onClick, spinning }: { onClick: () => void; spinning: boolean }) => (
    <button
      onClick={onClick}
      disabled={spinning}
      className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0"
    >
      <svg
        className={`w-4 h-4 text-gray-600 ${spinning ? 'animate-spin' : ''}`}
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">

      {/* Confirm Dialog */}
      {showConfirmDialog && confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md p-6 animate-slideUp">
            <div className="text-center mb-5">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${confirmAction.type === 'bulk-paid' ? 'bg-gray-100' : 'bg-red-50'}`}>
                <svg className={`w-7 h-7 ${confirmAction.type === 'bulk-paid' ? 'text-gray-800' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {confirmAction.type === 'bulk-paid'
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />}
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                {confirmAction.type === 'bulk-paid' ? 'Mark as Paid?' : 'Mark as Unpaid?'}
              </h3>
              <p className="text-sm text-gray-500">
                {confirmAction.type === 'bulk-paid' ? 'Confirm payment for' : 'Revert status for'}{' '}
                <span className="font-bold text-gray-900">
                  {confirmAction.count} player{confirmAction.count > 1 ? 's' : ''}
                </span>
              </p>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => handleBulkAction(confirmAction.type === 'bulk-paid')}
                disabled={processingBulk}
                className={`w-full py-3 text-white font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50 text-sm ${confirmAction.type === 'bulk-paid' ? 'bg-gray-900 active:bg-gray-700' : 'bg-red-600 active:bg-red-700'}`}
              >
                {processingBulk ? 'Processing...' : confirmAction.type === 'bulk-paid' ? 'Yes, Mark as Paid' : 'Yes, Mark as Unpaid'}
              </button>
              <button
                onClick={closeConfirmDialog}
                disabled={processingBulk}
                className="w-full py-3 bg-gray-100 active:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors cursor-pointer text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
              <h3 className="text-lg font-bold text-gray-900 mb-1">Done!</h3>
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
              <h1 className="text-sm sm:text-base font-bold text-gray-900 leading-tight">Mark Payments</h1>
              <p className="text-xs text-gray-400 hidden sm:block">Track and manage player payments</p>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex border-t border-gray-100">
            {([
              {
                id: 'by-turf' as ActiveTab,
                label: 'By Turf',
                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
              },
              {
                id: 'by-player' as ActiveTab,
                label: 'By Player',
                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />,
              },
            ] as const).map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-2 px-5 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeTab === id
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {icon}
                </svg>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6">

        {/* ── BY TURF TAB ── */}
        {activeTab === 'by-turf' && (
          <div className="animate-fadeIn space-y-4">
            {message && (
              <div className="p-3 rounded-xl border-l-4 bg-red-50 border-red-500 text-red-800 text-sm font-medium animate-slideDown">
                {message}
              </div>
            )}

            {/* Event Selector */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Select Event</p>
                <RefreshButton onClick={handleRefreshTurf} spinning={refreshingTurf} />
              </div>

              {/* ── Custom event picker replaces <select> to avoid OS dropdown ugliness ── */}
              <EventPicker
                events={events}
                selectedEventId={selectedEventId}
                eventPendingCounts={eventPendingCounts}
                onSelect={handleEventSelect}
                loading={loadingData && events.length === 0}
              />

              {/* Summary strip */}
              {selectedEventId && !loadingData && (() => {
                const rate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;
                return (
                  <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
                    <div className="w-full h-1.5 bg-gray-100">
                      <div
                        className={`h-full transition-all duration-500 ${rate === 100 ? 'bg-gray-900' : rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(rate, 100)}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-4 divide-x divide-gray-100">
                      {[
                        { label: 'Players', value: events.find((e) => e.id === selectedEventId)?.participantCount ?? 0, color: 'text-gray-900' },
                        { label: 'Paid', value: paidCount, color: 'text-gray-900' },
                        { label: 'Pending', value: pendingCount, color: pendingCount > 0 ? 'text-red-600' : 'text-gray-400' },
                        { label: 'Rate', value: `${rate}%`, color: rate === 100 ? 'text-gray-900' : rate >= 50 ? 'text-yellow-600' : 'text-red-600' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="py-2.5 text-center">
                          <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                          <p className={`text-sm font-bold ${color}`}>{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Payments Table */}
            {loadingData ? (
              <div className="flex items-center justify-center py-16">
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
                  <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
            ) : selectedEventId && payments.length > 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Bulk action bar */}
                <div className="bg-gray-50 border-b border-gray-100 p-3 sticky top-[97px] z-10">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={toggleSelectAll}
                      className="px-2.5 py-1.5 bg-white hover:bg-gray-100 text-gray-700 font-semibold rounded-lg text-xs border border-gray-300 transition-colors"
                    >
                      {selectedPayments.size === payments.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button
                      onClick={selectAllPending}
                      className="px-2.5 py-1.5 bg-red-50 text-red-700 font-semibold rounded-lg text-xs border border-red-200 transition-colors"
                    >
                      Pending ({pendingCount})
                    </button>
                    <button
                      onClick={selectAllPaid}
                      className="px-2.5 py-1.5 bg-gray-100 text-gray-700 font-semibold rounded-lg text-xs border border-gray-200 transition-colors"
                    >
                      Paid ({paidCount})
                    </button>
                    {selectedPayments.size > 0 && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-xs font-semibold text-gray-500">{selectedPayments.size} selected</span>
                        {selectedPendingCount > 0 && (
                          <button
                            onClick={() => openConfirmDialog('bulk-paid')}
                            disabled={processingBulk}
                            className="px-2.5 py-1.5 bg-gray-900 active:bg-gray-700 text-white font-semibold rounded-lg text-xs disabled:opacity-50 transition-colors"
                          >
                            Paid ({selectedPendingCount})
                          </button>
                        )}
                        {selectedPaidCount > 0 && (
                          <button
                            onClick={() => openConfirmDialog('bulk-unpaid')}
                            disabled={processingBulk}
                            className="px-2.5 py-1.5 bg-red-600 active:bg-red-700 text-white font-semibold rounded-lg text-xs disabled:opacity-50 transition-colors"
                          >
                            Unpaid ({selectedPaidCount})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-900 text-white">
                      <tr>
                        <th className="px-3 py-2.5 text-left w-8">
                          <input
                            type="checkbox"
                            checked={selectedPayments.size === payments.length && payments.length > 0}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded cursor-pointer"
                          />
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold">Player</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold">Amount</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment, index) => (
                        <tr
                          key={payment.id}
                          onClick={() => togglePaymentSelection(payment.id)}
                          className={`border-b border-gray-100 cursor-pointer transition-colors ${
                            selectedPayments.has(payment.id)
                              ? 'bg-red-50'
                              : index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                          }`}
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              readOnly
                              checked={selectedPayments.has(payment.id)}
                              className="w-4 h-4 text-red-600 rounded pointer-events-none"
                            />
                          </td>
                          <td className="px-3 py-3 text-sm font-semibold text-gray-900">{payment.playerName}</td>
                          <td className="px-3 py-3 text-center text-sm font-bold text-gray-700">
                            ₹{payment.currentAmountDue.toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                              payment.paymentStatus === 'paid'
                                ? 'bg-gray-100 text-gray-700 border border-gray-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                              {payment.paymentStatus === 'paid' ? 'PAID' : 'DUE'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 border-t border-gray-100 px-4 py-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex gap-3">
                      <span className="text-gray-400">Expected <span className="font-bold text-gray-900">₹{totalExpected.toLocaleString()}</span></span>
                      <span className="text-gray-400">Collected <span className="font-bold text-gray-900">₹{totalCollected.toLocaleString()}</span></span>
                    </div>
                    <span className="text-gray-400">
                      Rate <span className="font-bold text-gray-900">
                        {totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0}%
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            ) : selectedEventId ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
                <p className="text-sm font-bold text-gray-900 mb-1">No payments found</p>
                <p className="text-xs text-gray-400">No records for this event yet</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm font-bold text-gray-900 mb-1">Select an event</p>
                <p className="text-xs text-gray-400">Choose an event above to manage payments</p>
              </div>
            )}
          </div>
        )}

        {/* ── BY PLAYER TAB ── */}
        {activeTab === 'by-player' && (
          <div className="animate-fadeIn space-y-3">
            {playerMessage && (
              <div className={`p-3 rounded-xl border-l-4 text-sm font-medium animate-slideDown ${
                playerMessage.startsWith('Cleared') || playerMessage.includes('recorded')
                  ? 'bg-gray-50 border-gray-400 text-gray-800'
                  : 'bg-red-50 border-red-500 text-red-800'
              }`}>
                {playerMessage}
              </div>
            )}

            {loadingPlayers ? (
              <div className="flex items-center justify-center py-16">
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
                  <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
            ) : playerDebts.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
                <div className="w-14 h-14 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-bold text-gray-900 mb-1">All cleared!</p>
                <p className="text-xs text-gray-400">No players have pending dues</p>
              </div>
            ) : (
              <>
                {/* Summary row */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Players with dues</p>
                    <p className="text-2xl font-bold text-red-600">{playerDebts.length}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-0.5">Total pending</p>
                      <p className="text-2xl font-bold text-gray-900">
                        ₹{playerDebts.reduce((s, p) => s + p.totalPending, 0).toLocaleString()}
                      </p>
                    </div>
                    <RefreshButton onClick={handleRefreshPlayers} spinning={refreshingPlayers} />
                  </div>
                </div>

                {playerDebts.map((player, index) => {
                  const isExpanded = expandedPlayer === player.playerId;
                  const isProcessing = processingPlayer === player.playerId;
                  const partialVal = partialAmounts[player.playerId] || '';

                  return (
                    <div key={player.playerId} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => setExpandedPlayer(isExpanded ? null : player.playerId)}
                        className="w-full p-4 flex items-center gap-3 text-left cursor-pointer active:bg-gray-50 transition-colors"
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                          index === 0 ? 'bg-red-100 text-red-700'
                          : index === 1 ? 'bg-orange-100 text-orange-700'
                          : index === 2 ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-500'
                        }`}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{player.playerName}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {player.payments.length} turf{player.payments.length > 1 ? 's' : ''} unpaid
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 mr-1">
                          <p className="text-base font-bold text-red-600">₹{player.totalPending.toLocaleString()}</p>
                          <p className="text-xs text-gray-400">pending</p>
                        </div>
                        <svg
                          className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100 animate-fadeIn">
                          <div className="px-4 pt-3 pb-2">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Unpaid Turfs</p>
                            <div className="space-y-2">
                              {player.payments
                                .filter((p) => p.paymentStatus === 'pending')
                                .map((payment) => {
                                  const stillOwed = payment.currentAmountDue - payment.totalPaid;
                                  return (
                                    <div key={payment.id}
                                      className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-100">
                                      <div className="flex-1 min-w-0 mr-3">
                                        <p className="text-xs font-semibold text-gray-900 truncate">{payment.eventTitle}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                          {payment.eventDate.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </p>
                                      </div>
                                      <div className="text-right flex-shrink-0">
                                        <p className="text-sm font-bold text-red-600">₹{stillOwed.toLocaleString()}</p>
                                        {payment.totalPaid > 0 && (
                                          <p className="text-xs text-gray-500">₹{payment.totalPaid} paid</p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>

                          <div className="px-4 pb-4 pt-2 space-y-2">
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold pointer-events-none">₹</span>
                                <input
                                  type="number"
                                  placeholder="Partial amount"
                                  value={partialVal}
                                  onChange={(e) =>
                                    setPartialAmounts((prev) => ({ ...prev, [player.playerId]: e.target.value }))
                                  }
                                  className="w-full pl-7 pr-3 py-3 border-2 border-gray-200 rounded-xl focus:border-red-500 focus:outline-none text-sm text-gray-900 bg-white"
                                  min="1"
                                  max={player.totalPending}
                                  inputMode="numeric"
                                />
                              </div>
                              <button
                                onClick={() => handleMarkPartialPayment(player)}
                                disabled={isProcessing || !partialVal}
                                className="px-4 py-3 bg-gray-900 active:bg-gray-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 cursor-pointer flex-shrink-0"
                              >
                                {isProcessing ? '...' : 'Record'}
                              </button>
                            </div>
                            <button
                              onClick={() => handleMarkPlayerTotalPaid(player)}
                              disabled={isProcessing}
                              className="w-full py-3 bg-red-600 active:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {isProcessing ? 'Processing...' : `Mark All Paid — ₹${player.totalPending.toLocaleString()}`}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
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

/* ── Custom Event Picker — replaces native <select> ── */
function EventPicker({
  events,
  selectedEventId,
  eventPendingCounts,
  onSelect,
  loading,
}: {
  events: Event[];
  selectedEventId: string;
  eventPendingCounts: Record<string, number>;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = events.find((e) => e.id === selectedEventId);

  if (loading) return <div className="animate-pulse h-12 bg-gray-100 rounded-xl" />;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-3 border-2 border-red-500 rounded-xl bg-white text-sm cursor-pointer text-left"
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            {eventPendingCounts[selected.id] > 0 ? (
              <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500" />
            ) : (
              <span className="flex-shrink-0 w-2 h-2 rounded-full bg-gray-400" />
            )}
            <span className="font-semibold text-gray-900 truncate">{selected.title}</span>
            <span className="text-gray-400 flex-shrink-0">·</span>
            <span className="text-gray-400 flex-shrink-0 text-xs">
              {selected.date.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </span>
        ) : (
          <span className="text-gray-400">-- Choose an event --</span>
        )}
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden max-h-64 overflow-y-auto">
          <button
            onClick={() => { onSelect(''); setOpen(false); }}
            className="w-full px-4 py-3 text-left text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
          >
            -- Choose an event --
          </button>
          {events.map((event) => {
            const pending = eventPendingCounts[event.id] ?? 0;
            const dateStr = event.date.toDate().toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
            });
            const isSelected = event.id === selectedEventId;
            return (
              <button
                key={event.id}
                onClick={() => { onSelect(event.id); setOpen(false); }}
                className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors border-b border-gray-50 last:border-0 ${
                  isSelected ? 'bg-red-50' : 'hover:bg-gray-50'
                }`}
              >
                {pending > 0 ? (
                  <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 mt-0.5" />
                ) : (
                  <span className="flex-shrink-0 w-2 h-2 rounded-full bg-gray-300 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isSelected ? 'text-red-700' : 'text-gray-900'}`}>
                    {event.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  {pending > 0 ? (
                    <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                      {pending} unpaid
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      All paid
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}