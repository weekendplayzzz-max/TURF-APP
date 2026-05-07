'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { collection, getDocs, Timestamp } from 'firebase/firestore';

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

type Filter = 'all' | 'paid' | 'pending';

export default function MyPayments() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [payments,     setPayments]     = useState<Payment[]>([]);
  const [filter,       setFilter]       = useState<Filter>('all');
  const [loadingData,  setLoadingData]  = useState(true);

  useEffect(() => {
    if (!loading && role !== 'player' && role !== 'secretary') router.push('/login');
  }, [role, loading, router]);

  useEffect(() => {
    if ((role === 'player' || role === 'secretary') && user) fetchMyPayments();
  }, [role, user]);

  const fetchMyPayments = async () => {
    if (!user) return;
    try {
      setLoadingData(true);
      const allSnap = await getDocs(collection(db, 'eventPayments'));
      const list: Payment[] = [];
      allSnap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.playerId === user.uid || d.parentId === user.uid) {
          list.push({
            id: docSnap.id,
            eventId: d.eventId,
            eventTitle: d.eventTitle,
            eventDate: d.eventDate,
            eventTime: d.eventTime,
            playerId: d.playerId,
            playerName: d.playerName,
            playerType: d.playerType || 'regular',
            parentId: d.parentId,
            currentAmountDue: d.currentAmountDue,
            totalPaid: d.totalPaid || 0,
            paymentStatus: d.paymentStatus,
            paidAt: d.paidAt,
            markedPaidByName: d.markedPaidByName,
          });
        }
      });
      list.sort((a, b) => b.eventDate.toMillis() - a.eventDate.toMillis());
      setPayments(list);
    } catch (e) {
      console.error('Error fetching payments:', e);
    } finally {
      setLoadingData(false);
    }
  };

  if (loading || !user || (role !== 'player' && role !== 'secretary')) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const filtered = filter === 'paid'
    ? payments.filter(p => p.paymentStatus === 'paid')
    : filter === 'pending'
    ? payments.filter(p => p.paymentStatus !== 'paid')
    : payments;

  const totalPaid        = payments.filter(p => p.paymentStatus === 'paid').length;
  const totalPending     = payments.filter(p => p.paymentStatus !== 'paid').length;
  const totalAmountPaid  = payments.reduce((s, p) => s + p.totalPaid, 0);
  const totalAmountDue   = payments.reduce((s, p) => s + (p.paymentStatus !== 'paid' ? p.currentAmountDue : 0), 0);

  const grouped = filtered.reduce((acc, p) => {
    (acc[p.eventId] ??= []).push(p);
    return acc;
  }, {} as Record<string, Payment[]>);

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
            <h1 className="text-sm font-bold text-gray-900 leading-tight">My Payments</h1>
            <p className="text-xs text-gray-400">Track your payment history</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3 py-4 pb-12 space-y-3">

        {/* ── Summary dark card ── */}
        <div className="relative overflow-hidden bg-gray-900 rounded-2xl p-4 text-white">
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full border-[18px] border-red-600/20 pointer-events-none" />
          <div className="absolute right-2 -bottom-8 w-20 h-20 rounded-full border-[14px] border-red-600/10 pointer-events-none" />
          <div className="relative">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Outstanding Balance</p>
            <p className="text-3xl font-black text-white">
              ₹{totalAmountDue.toLocaleString()}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                { label: 'Total',   value: String(payments.length)            },
                { label: 'Paid',    value: String(totalPaid)                  },
                { label: 'Amount Paid', value: `₹${totalAmountPaid.toLocaleString()}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/[0.07] rounded-xl px-2 py-2 border border-white/10 text-center">
                  <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                  <p className="text-xs font-black text-white mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Outstanding warning ── */}
        {totalAmountDue > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 animate-fadeIn">
            <div className="flex items-start gap-2.5">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-red-700">
                  ₹{totalAmountDue.toLocaleString()} due across {totalPending} payment{totalPending > 1 ? 's' : ''}
                </p>
                <p className="text-[11px] text-red-500 mt-0.5">
                  {role === 'secretary'
                    ? 'Contact your treasurer or manage from the dashboard.'
                    : 'Contact your treasurer to complete payment.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Filter pills ── */}
        <div className="flex gap-2">
          {([
            { id: 'all'     as Filter, label: `All (${payments.length})`   },
            { id: 'paid'    as Filter, label: `Paid (${totalPaid})`         },
            { id: 'pending' as Filter, label: `Pending (${totalPending})`   },
          ]).map(({ id, label }) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-colors cursor-pointer border ${
                filter === id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Payment list ── */}
        {loadingData ? (
          <div className="flex items-center justify-center py-16">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <div className="w-10 h-10 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-sm font-black text-gray-700">
              {filter === 'all' ? 'No payments found' : filter === 'paid' ? 'No paid payments yet' : 'No pending payments'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {filter === 'all' ? 'Join events to see your payment history' : filter === 'paid' ? 'Paid payments appear here' : 'All caught up!'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([eventId, eventPayments]) => {
              const first          = eventPayments[0];
              const eventDate      = first.eventDate.toDate();
              const totalEventDue  = eventPayments.reduce((s, p) => s + p.currentAmountDue, 0);
              const totalEventPaid = eventPayments.reduce((s, p) => s + p.totalPaid, 0);
              const balance        = totalEventDue - totalEventPaid;
              const allPaid        = eventPayments.every(p => p.paymentStatus === 'paid');
              const somePending    = eventPayments.some(p => p.paymentStatus !== 'paid');

              return (
                <div key={eventId} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                  {/* Event header */}
                  <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-gray-900 leading-tight truncate">{first.eventTitle}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <p className="text-[11px] text-gray-400">
                            {eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                          <p className="text-[11px] text-gray-400">· {first.eventTime}</p>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200">
                            {eventPayments.length} player{eventPayments.length > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border flex-shrink-0 ${
                        allPaid
                          ? 'bg-gray-100 text-gray-500 border-gray-200'
                          : 'bg-red-50 text-red-600 border-red-200'
                      }`}>
                        {allPaid ? 'Paid' : 'Due'}
                      </span>
                    </div>
                  </div>

                  {/* Participant rows */}
                  <div className="divide-y divide-gray-100">
                    {eventPayments.map(payment => {
                      const bal     = Math.max(0, payment.currentAmountDue - payment.totalPaid);
                      const isGuest = payment.playerType === 'guest';

                      return (
                        <div key={payment.id} className="px-4 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-xs font-black text-gray-800 truncate">{payment.playerName}</p>
                              {isGuest && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200 flex-shrink-0">
                                  Guest
                                </span>
                              )}
                            </div>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border flex-shrink-0 ${
                              payment.paymentStatus === 'paid'
                                ? 'bg-gray-100 text-gray-500 border-gray-200'
                                : payment.paymentStatus === 'partial'
                                ? 'bg-yellow-50 text-yellow-600 border-yellow-200'
                                : 'bg-red-50 text-red-600 border-red-200'
                            }`}>
                              {payment.paymentStatus === 'paid' ? 'Paid' : payment.paymentStatus === 'partial' ? 'Partial' : 'Pending'}
                            </span>
                          </div>

                          {/* Due / Paid / Balance */}
                          <div className="flex items-center divide-x divide-gray-200 bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                            {[
                              { label: 'Due',     value: `₹${payment.currentAmountDue}`,  color: 'text-gray-800' },
                              { label: 'Paid',    value: `₹${payment.totalPaid}`,          color: 'text-gray-800' },
                              { label: 'Balance', value: `₹${bal}`,                        color: bal > 0 ? 'text-red-600' : 'text-gray-800' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="flex-1 py-2 text-center">
                                <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                                <p className={`text-xs font-black mt-0.5 ${color}`}>{value}</p>
                              </div>
                            ))}
                          </div>

                          {payment.paymentStatus === 'paid' && payment.paidAt && (
                            <p className="text-[10px] text-gray-400 mt-1.5">
                              Confirmed {payment.paidAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · by {payment.markedPaidByName || 'Treasurer'}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Event total — only if multiple participants */}
                  {eventPayments.length > 1 && (
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Event Total</p>
                        <div className="flex items-center gap-3">
                          <p className="text-xs font-bold text-gray-500">Due ₹{totalEventDue}</p>
                          <p className="text-xs font-bold text-gray-500">Paid ₹{totalEventPaid}</p>
                          <p className={`text-xs font-black ${balance > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                            Bal ₹{balance}
                          </p>
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
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
      `}</style>
    </div>
  );
}