'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  updateDoc,
  Timestamp,
  query,
  where,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';

interface Player {
  id: string;
  paymentId: string;
  name: string;
  email: string;
  amountDue: number;
  totalPaid: number;
  paymentStatus: 'pending' | 'partial' | 'paid';
  paidAt: Timestamp | null;
  markedPaidBy: string | null;
  markedPaidByName: string | null;
  addedAfterClose: boolean;
}

interface Event {
  id: string;
  title: string;
  date: Timestamp;
  time: string;
  totalAmount: number;
  participantCount: number;
  status: string;
  teamFund: number;
}

export default function EventPaymentDetails() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const eventId = params?.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [message, setMessage] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('all');

  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  // Fetch event data
  const fetchEventData = useCallback(async () => {
    if (!eventId) return;

    try {
      const eventDoc = await getDoc(doc(db, 'events', eventId));
      if (!eventDoc.exists()) {
        setMessage('❌ Event not found');
        setLoadingData(false);
        return;
      }

      const eventData = eventDoc.data();
      setEvent({
        id: eventDoc.id,
        title: eventData.title,
        date: eventData.date,
        time: eventData.time,
        totalAmount: eventData.totalAmount,
        participantCount: eventData.participantCount || 0,
        status: eventData.status,
        teamFund: eventData.teamFund || 0,
      });
    } catch (error) {
      console.error('Error fetching event:', error);
      setMessage('❌ Failed to load event data');
      setLoadingData(false);
    }
  }, [eventId]);

  // Setup real-time listener for payments
  const setupRealtimeListener = useCallback(() => {
    if (!eventId) return;

    try {
      // Simple query without orderBy to avoid index requirement
      const paymentsRef = collection(db, 'eventPayments');
      const paymentsQuery = query(
        paymentsRef,
        where('eventId', '==', eventId)
      );

      const unsubscribe = onSnapshot(
        paymentsQuery,
        (snapshot) => {
          const playersList: Player[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            playersList.push({
              id: data.playerId,
              paymentId: docSnap.id,
              name: data.playerName,
              email: data.playerEmail || '',
              amountDue: data.currentAmountDue || 0,
              totalPaid: data.totalPaid || 0,
              paymentStatus: data.paymentStatus || 'pending',
              paidAt: data.paidAt || null,
              markedPaidBy: data.markedPaidBy || null,
              markedPaidByName: data.markedPaidByName || null,
              addedAfterClose: data.addedAfterClose || false,
            });
          });

          // Client-side sorting by name
          playersList.sort((a, b) => a.name.localeCompare(b.name));

          setPlayers(playersList);
          setLoadingData(false);
        },
        (error) => {
          console.error('Error in realtime listener:', error);
          setMessage('❌ Failed to load payment data');
          setLoadingData(false);
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up listener:', error);
      setLoadingData(false);
    }
  }, [eventId]);

  // Fetch data and setup listener
  useEffect(() => {
    if (role === 'treasurer' && eventId) {
      fetchEventData();
      const unsubscribe = setupRealtimeListener();

      // Cleanup listener on unmount
      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
      };
    }
  }, [role, eventId, fetchEventData, setupRealtimeListener]);

  const markAsPaid = async (player: Player) => {
    if (!user) return;

    if (!confirm(`Mark ${player.name}'s payment (₹${player.amountDue}) as PAID?`)) {
      return;
    }

    try {
      setProcessing(player.paymentId);

      await updateDoc(doc(db, 'eventPayments', player.paymentId), {
        totalPaid: player.amountDue,
        paymentStatus: 'paid',
        paidAt: Timestamp.now(),
        markedPaidBy: user.uid,
        markedPaidByName: user.displayName || user.email?.split('@')[0] || 'Treasurer',
        updatedAt: Timestamp.now(),
      });

      setMessage(`✅ Marked ${player.name} as paid`);
      setTimeout(() => setMessage(''), 2000);
    } catch (error) {
      console.error('Error updating payment:', error);
      setMessage('❌ Failed to update payment');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setProcessing(null);
    }
  };

  const markAsUnpaid = async (player: Player) => {
    if (!user) return;

    if (
      !confirm(
        `Mark ${player.name}'s payment as UNPAID? This will reset their payment status.`
      )
    ) {
      return;
    }

    try {
      setProcessing(player.paymentId);

      await updateDoc(doc(db, 'eventPayments', player.paymentId), {
        totalPaid: 0,
        paymentStatus: 'pending',
        paidAt: null,
        markedPaidBy: null,
        markedPaidByName: null,
        updatedAt: Timestamp.now(),
      });

      setMessage(`✅ Marked ${player.name} as unpaid`);
      setTimeout(() => setMessage(''), 2000);
    } catch (error) {
      console.error('Error updating payment:', error);
      setMessage('❌ Failed to update payment');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setProcessing(null);
    }
  };

  const getFilteredPlayers = () => {
    if (filter === 'all') return players;
    if (filter === 'paid') return players.filter((p) => p.paymentStatus === 'paid');
    return players.filter((p) => p.paymentStatus !== 'paid');
  };

  const filteredPlayers = getFilteredPlayers();
  const paidCount = players.filter((p) => p.paymentStatus === 'paid').length;
  const pendingCount = players.filter((p) => p.paymentStatus !== 'paid').length;
  const totalCollected = players.reduce((sum, p) => sum + p.totalPaid, 0);
  const totalDue = players.reduce((sum, p) => sum + p.amountDue, 0);
  const totalPending = totalDue - totalCollected;

  if (loading || !user || role !== 'treasurer') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">💳 Payment Management</h1>
              {event && (
                <p className="text-blue-100 text-base">
                  {event.title} • {event.date.toDate().toLocaleDateString('en-IN')} •{' '}
                  {event.time}
                </p>
              )}
            </div>
            <button
              onClick={() => router.back()}
              className="px-6 py-3 bg-white text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition shadow-md"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg text-center font-bold text-lg ${
              message.includes('✅')
                ? 'bg-green-100 text-green-800 border-2 border-green-300'
                : 'bg-red-100 text-red-800 border-2 border-red-300'
            }`}
          >
            {message}
          </div>
        )}

        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 text-lg font-medium">Loading payments...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-600">
                <p className="text-sm text-gray-600 font-semibold mb-2">Total Players</p>
                <p className="text-3xl font-bold text-blue-600">{players.length}</p>
              </div>
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-600">
                <p className="text-sm text-gray-600 font-semibold mb-2">Paid</p>
                <p className="text-3xl font-bold text-green-600">{paidCount}</p>
              </div>
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-red-600">
                <p className="text-sm text-gray-600 font-semibold mb-2">Pending</p>
                <p className="text-3xl font-bold text-red-600">{pendingCount}</p>
              </div>
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-orange-600">
                <p className="text-sm text-gray-600 font-semibold mb-2">Collected</p>
                <p className="text-3xl font-bold text-orange-600">
                  ₹{totalCollected.toLocaleString()}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-600">
                <p className="text-sm text-gray-600 font-semibold mb-2">Team Fund</p>
                <p className="text-3xl font-bold text-purple-600">
                  ₹{event?.teamFund?.toLocaleString() || 0}
                </p>
              </div>
            </div>

            {/* Event Details Card */}
            {event && (
              <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Event Details</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Turf Amount</p>
                    <p className="text-lg font-bold text-gray-900">
                      ₹{event.totalAmount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Per Player</p>
                    <p className="text-lg font-bold text-gray-900">
                      ₹{players.length > 0 ? players[0].amountDue.toLocaleString() : '0'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Due</p>
                    <p className="text-lg font-bold text-gray-900">
                      ₹{totalDue.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Pending Amount</p>
                    <p className="text-lg font-bold text-red-600">
                      ₹{totalPending.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-6 py-3 font-semibold rounded-lg transition ${
                    filter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All Players ({players.length})
                </button>
                <button
                  onClick={() => setFilter('paid')}
                  className={`px-6 py-3 font-semibold rounded-lg transition ${
                    filter === 'paid'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  ✓ Paid ({paidCount})
                </button>
                <button
                  onClick={() => setFilter('pending')}
                  className={`px-6 py-3 font-semibold rounded-lg transition ${
                    filter === 'pending'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  ⏳ Pending ({pendingCount})
                </button>
              </div>
            </div>

            {/* Players List */}
            {filteredPlayers.length === 0 ? (
              <div className="bg-white p-12 rounded-xl text-center shadow-lg border border-gray-200">
                <div className="text-6xl mb-4">👥</div>
                <p className="text-xl text-gray-600 font-semibold">No players found</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <h3 className="text-xl font-bold text-gray-900">
                    Players Payment Status ({filteredPlayers.length})
                  </h3>
                </div>

                <div className="divide-y divide-gray-200">
                  {filteredPlayers.map((player) => {
                    const isPaid = player.paymentStatus === 'paid';

                    return (
                      <div
                        key={player.paymentId}
                        className={`px-6 py-4 hover:bg-gray-50 transition ${
                          isPaid ? 'bg-green-50 bg-opacity-30' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="text-lg font-bold text-gray-900">
                                {player.name}
                              </h4>
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-bold ${
                                  isPaid
                                    ? 'bg-green-100 text-green-800 border border-green-300'
                                    : 'bg-red-100 text-red-800 border border-red-300'
                                }`}
                              >
                                {isPaid ? '✓ PAID' : '⏳ PENDING'}
                              </span>
                              {player.addedAfterClose && (
                                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                  Added After Close
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                              <span>📧 {player.email}</span>
                              <span className="font-semibold text-blue-600">
                                Amount: ₹{player.amountDue.toLocaleString()}
                              </span>
                              {isPaid && player.paidAt && (
                                <span className="text-green-600">
                                  Paid on:{' '}
                                  {player.paidAt.toDate().toLocaleDateString('en-IN')}
                                </span>
                              )}
                              {isPaid && player.markedPaidByName && (
                                <span className="text-gray-500 text-xs">
                                  Marked by: {player.markedPaidByName}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="ml-4">
                            {isPaid ? (
                              <button
                                onClick={() => markAsUnpaid(player)}
                                disabled={processing === player.paymentId}
                                className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {processing === player.paymentId
                                  ? '⏳ Processing...'
                                  : '✗ Mark Unpaid'}
                              </button>
                            ) : (
                              <button
                                onClick={() => markAsPaid(player)}
                                disabled={processing === player.paymentId}
                                className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {processing === player.paymentId
                                  ? '⏳ Processing...'
                                  : '✓ Mark Paid'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
