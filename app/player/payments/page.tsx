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

export default function MyPayments() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [payments,    setPayments]    = useState<Payment[]>([]);
  const [filter,      setFilter]      = useState<'all' | 'paid' | 'pending'>('all');
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && role !== 'player') router.push('/login');
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'player' && user) fetchMyPayments();
  }, [role, user]);

  const fetchMyPayments = async () => {
    if (!user) return;
    try {
      setLoadingData(true);
      const allSnap = await getDocs(collection(db, 'eventPayments'));
      const list: Payment[] = [];
      allSnap.forEach(d => {
        const data = d.data();
        if (data.playerId === user.uid || data.parentId === user.uid) {
          list.push({
            id: d.id,
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
      list.sort((a, b) => b.eventDate.toMillis() - a.eventDate.toMillis());
      setPayments(list);
    } catch (e) {
      console.error('Error fetching payments:', e);
    } finally {
      setLoadingData(false);
    }
  };

  const filteredPayments = filter === 'paid'
    ? payments.filter(p => p.paymentStatus === 'paid')
    : filter === 'pending'
    ? payments.filter(p => p.paymentStatus !== 'paid')
    : payments;

  const totalPaid       = payments.filter(p => p.paymentStatus === 'paid').length;
  const totalPending    = payments.filter(p => p.paymentStatus !== 'paid').length;
  const totalAmountPaid = payments.reduce((s, p) => s + p.totalPaid, 0);
  const totalAmountDue  = payments.reduce((s, p) => s + (p.paymentStatus !== 'paid' ? Math.max(0, p.currentAmountDue - p.totalPaid) : 0), 0);

  const groupedPayments = filteredPayments.reduce((acc, p) => {
    if (!acc[p.eventId]) acc[p.eventId] = [];
    acc[p.eventId].push(p);
    return acc;
  }, {} as Record<string, Payment[]>);

  if (loading || !user || role !== 'player') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 cursor-pointer flex-shrink-0 transition-colors"
          >
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

        {/* ── Stats: dark finance card style ── */}
        <div className="relative overflow-hidden bg-gray-900 rounded-2xl p-4 text-white">
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full border-[18px] border-red-600/20 pointer-events-none" />
          <div className="absolute right-2 -bottom-8 w-20 h-20 rounded-full border-[14px] border-red-600/10 pointer-events-none" />
          <div className="relative">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-3">Payment Overview</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Total',   value: String(payments.length)              },
                { label: 'Paid',    value: String(totalPaid)                    },
                { label: 'Pending', value: String(totalPending)                 },
                { label: 'Spent',   value: `₹${totalAmountPaid.toLocaleString()}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/8 rounded-xl px-2 py-2.5 text-center border border-white/10">
                  <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide leading-tight">{label}</p>
                  <p className="text-base font-black text-white mt-1 leading-none">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Outstanding balance warning ── */}
        {totalAmountDue > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 animate-slideDown">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-red-700">
                  ₹{totalAmountDue.toLocaleString()} outstanding · {totalPending} payment{totalPending > 1 ? 's' : ''} due
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Contact your treasurer to settle. Confirmed automatically once paid.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Filter tabs ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1 flex gap-1">
          {([
            { id: 'all'     as const, label: `All`,     count: payments.length },
            { id: 'paid'    as const, label: `Paid`,    count: totalPaid       },
            { id: 'pending' as const, label: `Pending`, count: totalPending    },
          ]).map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                filter === id ? 'bg-red-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              {label}
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none ${
                filter === id ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Payment list ── */}
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 p-10 text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-900">
              {filter === 'all' ? 'No payments found' : filter === 'paid' ? 'No paid payments yet' : 'All caught up!'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {filter === 'all' ? 'Join turfs to see your payment history' : filter === 'paid' ? 'Paid payments will appear here' : 'No pending payments'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedPayments).map(([eventId, eventPayments]) => {
              const first          = eventPayments[0];
              const eventDate      = first.eventDate.toDate();
              const totalEventDue  = eventPayments.reduce((s, p) => s + p.currentAmountDue, 0);
              const totalEventPaid = eventPayments.reduce((s, p) => s + p.totalPaid, 0);
              const totalEventBal  = totalEventDue - totalEventPaid;
              const allPaid        = eventPayments.every(p => p.paymentStatus === 'paid');

              return (
                <div key={eventId} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">

                  {/* Status bar */}
                  <div className={`h-1 w-full ${allPaid ? 'bg-gray-200' : 'bg-red-500'}`} />

                  <div className="p-4">

                    {/* Event title + meta */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-black text-gray-900 leading-snug">{first.eventTitle}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {first.eventTime}
                          </span>
                          {eventPayments.length > 1 && (
                            <span className="text-[10px] text-gray-400 font-semibold">
                              · {eventPayments.length} participants
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                        allPaid
                          ? 'bg-gray-100 text-gray-500 border-gray-200'
                          : 'bg-red-50 text-red-600 border-red-200'
                      }`}>
                        {allPaid ? 'Paid' : 'Due'}
                      </span>
                    </div>

                    {/* Participant payment rows */}
                    <div className="space-y-2">
                      {eventPayments.map(payment => {
                        const balance = Math.max(0, payment.currentAmountDue - payment.totalPaid);
                        const isPaid  = payment.paymentStatus === 'paid';

                        return (
                          <div key={payment.id} className={`rounded-2xl border p-3 ${
                            isPaid ? 'bg-gray-50 border-gray-100' : 'bg-red-50/40 border-red-100'
                          }`}>

                            {/* Name row */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2 min-w-0">
                                {/* Avatar circle */}
                                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[10px] font-black text-gray-600">
                                    {payment.playerName.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-gray-900 leading-tight truncate">{payment.playerName}</p>
                                  {payment.playerType === 'guest' && (
                                    <p className="text-[9px] text-gray-400 font-semibold leading-tight">Guest player</p>
                                  )}
                                </div>
                              </div>
                              <span className={`flex-shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                isPaid
                                  ? 'bg-gray-100 text-gray-500 border-gray-200'
                                  : payment.paymentStatus === 'partial'
                                  ? 'bg-gray-100 text-gray-600 border-gray-200'
                                  : 'bg-red-50 text-red-600 border-red-200'
                              }`}>
                                {isPaid ? 'Paid' : payment.paymentStatus === 'partial' ? 'Partial' : 'Pending'}
                              </span>
                            </div>

                            {/* Due / Paid / Balance — horizontal inline, no boxes */}
                            <div className="flex items-center gap-0 divide-x divide-gray-200 bg-white rounded-xl border border-gray-100 overflow-hidden">
                              {[
                                { label: 'Due',     value: `₹${payment.currentAmountDue}`,  red: false },
                                { label: 'Paid',    value: `₹${payment.totalPaid}`,          red: false },
                                { label: 'Balance', value: `₹${balance}`,                   red: balance > 0 },
                              ].map(({ label, value, red }) => (
                                <div key={label} className="flex-1 py-2 text-center">
                                  <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                                  <p className={`text-sm font-black mt-0.5 ${red ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
                                </div>
                              ))}
                            </div>

                            {/* Confirmed stamp */}
                            {isPaid && payment.paidAt && (
                              <div className="mt-2.5 flex items-center gap-1.5">
                                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                <p className="text-[10px] text-gray-400">
                                  Confirmed {payment.paidAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                  {' '}by <span className="font-semibold text-gray-500">{payment.markedPaidByName || 'Treasurer'}</span>
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Multi-participant total footer */}
                    {eventPayments.length > 1 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Turf Total</p>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-gray-400">Due <span className="font-bold text-gray-600">₹{totalEventDue}</span></span>
                          <span className="text-[11px] text-gray-400">Paid <span className="font-bold text-gray-600">₹{totalEventPaid}</span></span>
                          <span className={`text-[11px] font-black ${totalEventBal > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                            Bal ₹{totalEventBal}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideDown { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: translateY(0) } }
        .animate-slideDown { animation: slideDown 0.2s ease-out; }
      `}</style>
    </div>
  );
}