'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';

interface Payment {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: Timestamp;
  eventTime: string;
  playerId: string;
  playerName: string;
  playerType: 'regular' | 'guest';
  parentId?: string;
  currentAmountDue: number;
  totalPaid: number;
  paymentStatus: 'pending' | 'partial' | 'paid';
  paidAt: Timestamp | null;
  markedPaidByName: string | null;
}

export default function MyPayments() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && role !== 'player') {
      router.push('/login');
    }
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'player' && user) {
      fetchMyPayments();
    }
  }, [role, user]);

  const fetchMyPayments = async () => {
    if (!user) return;

    try {
      setLoadingData(true);
      
      console.log('🔍 Fetching payments for user:', user.uid);
      
      const paymentsList: Payment[] = [];
      const paymentsRef = collection(db, 'eventPayments');
      
      // Strategy: Fetch ALL eventPayments and filter in code
      // This avoids ANY index requirements
      console.log('📥 Fetching all eventPayments...');
      const allPaymentsSnapshot = await getDocs(paymentsRef);
      
      console.log(`📊 Total eventPayments in database: ${allPaymentsSnapshot.size}`);
      
      let myPaymentCount = 0;
      let guestPaymentCount = 0;

      allPaymentsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        
        // Debug log each document
        console.log(`📄 Payment ${docSnap.id}:`, {
          playerId: data.playerId,
          playerName: data.playerName,
          playerType: data.playerType,
          parentId: data.parentId,
          eventTitle: data.eventTitle
        });
        
        // Check if this payment belongs to current user (as player OR as parent)
        const isMyPayment = data.playerId === user.uid;
        const isMyGuestPayment = data.parentId === user.uid;
        
        if (isMyPayment || isMyGuestPayment) {
          console.log(`✅ MATCH FOUND: ${isMyPayment ? 'My Payment' : 'Guest Payment'}`);
          
          if (isMyPayment) myPaymentCount++;
          if (isMyGuestPayment) guestPaymentCount++;
          
          paymentsList.push({
            id: docSnap.id,
            eventId: data.eventId,
            eventTitle: data.eventTitle,
            eventDate: data.eventDate,
            eventTime: data.eventTime,
            playerId: data.playerId,
            playerName: data.playerName,
            playerType: data.playerType || 'regular',
            parentId: data.parentId,
            currentAmountDue: data.currentAmountDue,
            totalPaid: data.totalPaid || 0,
            paymentStatus: data.paymentStatus,
            paidAt: data.paidAt,
            markedPaidByName: data.markedPaidByName,
          });
        }
      });

      console.log(`\n📈 Summary:`);
      console.log(`   My direct payments: ${myPaymentCount}`);
      console.log(`   Guest payments I'm responsible for: ${guestPaymentCount}`);
      console.log(`   Total payments: ${paymentsList.length}`);

      // Sort by event date descending
      paymentsList.sort((a, b) => b.eventDate.toMillis() - a.eventDate.toMillis());

      setPayments(paymentsList);
    } catch (error) {
      console.error('❌ Error fetching payments:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const getFilteredPayments = () => {
    if (filter === 'paid') {
      return payments.filter((p) => p.paymentStatus === 'paid');
    } else if (filter === 'pending') {
      return payments.filter((p) => p.paymentStatus === 'pending' || p.paymentStatus === 'partial');
    }
    return payments;
  };

  const filteredPayments = getFilteredPayments();
  const totalPaid = payments.filter(p => p.paymentStatus === 'paid').length;
  const totalPending = payments.filter(p => p.paymentStatus === 'pending' || p.paymentStatus === 'partial').length;
  const totalAmountPaid = payments.reduce((sum, p) => sum + p.totalPaid, 0);
  const totalAmountDue = payments.reduce((sum, p) => sum + (p.paymentStatus !== 'paid' ? p.currentAmountDue : 0), 0);

  // Group payments by event for better display
  const groupedPayments = filteredPayments.reduce((groups, payment) => {
    const eventKey = payment.eventId;
    if (!groups[eventKey]) {
      groups[eventKey] = [];
    }
    groups[eventKey].push(payment);
    return groups;
  }, {} as Record<string, Payment[]>);

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
                  My Payments
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                  Track your payment history (yours & guests)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-10">
        {/* Statistics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-xs text-gray-600 mb-1">Total Payments</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{payments.length}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-xs text-gray-600 mb-1">Paid</p>
            <p className="text-2xl sm:text-3xl font-bold text-green-600">{totalPaid}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs text-gray-600 mb-1">Pending</p>
            <p className="text-2xl sm:text-3xl font-bold text-red-600">{totalPending}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-xs text-gray-600 mb-1">Total Paid</p>
            <p className="text-xl sm:text-2xl font-bold text-blue-600">₹{totalAmountPaid}</p>
          </div>
        </div>

        {/* Outstanding Balance Warning */}
        {totalAmountDue > 0 && (
          <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300 rounded-2xl p-4 sm:p-6 mb-6 shadow-lg animate-slideDown">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="text-3xl sm:text-4xl flex-shrink-0">⚠️</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-bold text-red-900 mb-2">
                  Outstanding Balance
                </h3>
                <p className="text-sm sm:text-base text-red-800 mb-3">
                  You have <strong className="text-red-900">₹{totalAmountDue.toLocaleString()}</strong> pending across{' '}
                  <strong className="text-red-900">{totalPending}</strong> payment(s).
                </p>
                <div className="bg-white rounded-lg p-3 border border-red-200">
                  <p className="text-xs sm:text-sm text-gray-700 font-semibold mb-1">
                    💡 Payment Instructions:
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600">
                    Contact your team treasurer to complete payment. Status updates automatically once confirmed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 mb-6">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 sm:px-6 py-2 sm:py-2.5 font-semibold rounded-lg transition-all duration-200 text-sm sm:text-base ${
                filter === 'all'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({payments.length})
            </button>
            <button
              onClick={() => setFilter('paid')}
              className={`px-4 sm:px-6 py-2 sm:py-2.5 font-semibold rounded-lg transition-all duration-200 text-sm sm:text-base ${
                filter === 'paid'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              ✓ Paid ({totalPaid})
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 sm:px-6 py-2 sm:py-2.5 font-semibold rounded-lg transition-all duration-200 text-sm sm:text-base ${
                filter === 'pending'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              ⏳ Pending ({totalPending})
            </button>
          </div>
        </div>

        {/* Payments List */}
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
        ) : filteredPayments.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
              {filter === 'all'
                ? 'No payments found'
                : filter === 'paid'
                ? 'No paid payments yet'
                : 'No pending payments'}
            </p>
            <p className="text-sm sm:text-base text-gray-600">
              {filter === 'all'
                ? 'Join Turfs to see your payment history'
                : filter === 'paid'
                ? 'Your paid payments will appear here'
                : 'All caught up! No pending payments'}
            </p>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {Object.entries(groupedPayments).map(([eventId, eventPayments]) => {
              const firstPayment = eventPayments[0];
              const eventDate = firstPayment.eventDate.toDate();
              const totalEventDue = eventPayments.reduce((sum, p) => sum + p.currentAmountDue, 0);
              const totalEventPaid = eventPayments.reduce((sum, p) => sum + p.totalPaid, 0);
              const totalEventBalance = totalEventDue - totalEventPaid;
              const allPaid = eventPayments.every(p => p.paymentStatus === 'paid');
              const somePending = eventPayments.some(p => p.paymentStatus === 'pending' || p.paymentStatus === 'partial');

              return (
                <div
                  key={eventId}
                  className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 hover:shadow-2xl transition-shadow duration-200"
                >
                  {/* Event Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-2 break-words">
                        {firstPayment.eventTitle}
                      </h3>
                      <div className="flex flex-wrap gap-3 text-xs sm:text-sm text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>{eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>{firstPayment.eventTime}</span>
                        </div>
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded border border-blue-200">
                          {eventPayments.length} participant{eventPayments.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    <span className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold ${
                      allPaid
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : somePending
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                    }`}>
                      {allPaid ? '✓ All Paid' : somePending ? '⏳ Payment Due' : '⏳ Partial'}
                    </span>
                  </div>

                  {/* Participant Payments */}
                  <div className="space-y-3">
                    {eventPayments.map((payment) => {
                      const balance = Math.max(0, payment.currentAmountDue - payment.totalPaid);
                      const isGuest = payment.playerType === 'guest';

                      return (
                        <div key={payment.id} className="bg-gray-50 rounded-xl p-3 sm:p-4 border border-gray-200">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-base sm:text-lg font-bold text-gray-900">
                                {payment.playerName}
                              </span>
                              {isGuest && (
                                <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded border border-purple-200">
                                  Guest
                                </span>
                              )}
                            </div>
                            <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                              payment.paymentStatus === 'paid'
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : payment.paymentStatus === 'partial'
                                ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                              {payment.paymentStatus === 'paid' ? '✓ Paid' : payment.paymentStatus === 'partial' ? '⏳ Partial' : '⏳ Pending'}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-3 text-center">
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Due</p>
                              <p className="text-base sm:text-lg font-bold text-gray-900">
                                ₹{payment.currentAmountDue}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Paid</p>
                              <p className="text-base sm:text-lg font-bold text-green-600">
                                ₹{payment.totalPaid}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Balance</p>
                              <p className={`text-base sm:text-lg font-bold ${
                                balance > 0 ? 'text-red-600' : 'text-green-600'
                              }`}>
                                ₹{balance}
                              </p>
                            </div>
                          </div>

                          {payment.paymentStatus === 'paid' && payment.paidAt && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <p className="text-xs text-green-700">
                                ✓ Confirmed on {payment.paidAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} by {payment.markedPaidByName || 'Treasurer'}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Event Total Summary */}
                  {eventPayments.length > 1 && (
                    <div className="mt-4 bg-blue-50 rounded-xl p-3 sm:p-4 border-2 border-blue-200">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-sm font-bold text-blue-900">Turf Total:</span>
                        <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm font-bold flex-wrap">
                          <span className="text-gray-700">Due: ₹{totalEventDue}</span>
                          <span className="text-green-600">Paid: ₹{totalEventPaid}</span>
                          <span className={totalEventBalance > 0 ? 'text-red-600' : 'text-green-600'}>
                            Balance: ₹{totalEventBalance}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
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

        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
