'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import {
  collection, getDocs, doc, query, where,
  Timestamp, orderBy, runTransaction,
} from 'firebase/firestore';
import { calculatePerPlayerAmount } from '@/lib/eventManagement';

interface Event {
  id: string;
  title: string;
  date: Timestamp;
  time: string;
  totalAmount: number;
  durationHours: number;
  deadline: Timestamp;
  status: 'open' | 'closed' | 'locked';
  participantCount: number;
  totalCollected: number;
  eventPaidToVendor: boolean;
  createdByRole: string;
}

export default function TreasurerEvents() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [events,           setEvents]           = useState<Event[]>([]);
  const [myEvents,         setMyEvents]         = useState<Set<string>>(new Set());
  const [filter,           setFilter]           = useState<'upcoming' | 'joined' | 'past'>('upcoming');
  const [loadingData,      setLoadingData]      = useState(true);
  const [errorMessage,     setErrorMessage]     = useState('');
  const [actionLoading,    setActionLoading]    = useState<string | null>(null);
  const [showLeaveDialog,  setShowLeaveDialog]  = useState(false);
  const [showSuccessDialog,setShowSuccessDialog]= useState(false);
  const [successMessage,   setSuccessMessage]   = useState('');
  const [selectedEvent,    setSelectedEvent]    = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!loading && role !== 'treasurer') router.push('/login');
  }, [role, loading, router]);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingData(true);
      const eventsSnap = await getDocs(query(collection(db, 'events'), orderBy('date', 'desc')));
      const partSnap   = await getDocs(query(collection(db, 'eventParticipants'), where('currentStatus', '==', 'joined')));

      const countMap  = new Map<string, number>();
      const myEventIds = new Set<string>();
      partSnap.forEach(d => {
        const data = d.data();
        countMap.set(data.eventId, (countMap.get(data.eventId) || 0) + 1);
        if (data.playerId === user.uid) myEventIds.add(data.eventId);
      });

      const list: Event[] = [];
      eventsSnap.forEach(d => {
        const data = d.data();
        list.push({
          id: d.id, title: data.title, date: data.date, time: data.time,
          totalAmount: data.totalAmount, durationHours: data.durationHours,
          deadline: data.deadline, status: data.status,
          participantCount: countMap.get(d.id) || 0,
          totalCollected: data.totalCollected || 0,
          eventPaidToVendor: data.eventPaidToVendor || false,
          createdByRole: data.createdByRole,
        });
      });

      setEvents(list);
      setMyEvents(myEventIds);
    } catch (e) {
      console.error('Error fetching events:', e);
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    if (role === 'treasurer') fetchEvents();
  }, [role, fetchEvents]);

  const handleJoinEvent = async (eventId: string, eventTitle: string) => {
    if (!user) return;
    try {
      setActionLoading(eventId);
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, participantCount: e.participantCount + 1 } : e));
      setMyEvents(prev => new Set([...prev, eventId]));

      await runTransaction(db, async (tx) => {
        const eventRef = doc(db, 'events', eventId);
        const eventDoc = await tx.get(eventRef);
        if (!eventDoc.exists()) throw new Error('Event not found');
        const data = eventDoc.data();
        if (data.status !== 'open') throw new Error('Event is no longer open');
        if (data.deadline.toMillis() <= Timestamp.now().toMillis()) throw new Error('Registration deadline has passed');

        const existing = await getDocs(query(
          collection(db, 'eventParticipants'),
          where('eventId', '==', eventId),
          where('playerId', '==', user.uid),
          where('currentStatus', '==', 'joined')
        ));
        if (!existing.empty) throw new Error('You have already joined this event');

        tx.update(eventRef, { participantCount: (data.participantCount || 0) + 1 });
        tx.set(doc(collection(db, 'eventParticipants')), {
          eventId, playerId: user.uid,
          playerName: user.displayName || user.email?.split('@')[0] || 'Treasurer',
          playerEmail: user.email || '', joinedAt: Timestamp.now(),
          currentStatus: 'joined', addedAfterClose: false,
        });
      });

      setSuccessMessage(`You've joined "${eventTitle}"!`);
      setShowSuccessDialog(true);
    } catch (e: any) {
      fetchEvents();
      setErrorMessage(e.message || 'Failed to join event');
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setActionLoading(null);
    }
  };

  const handleLeaveEvent = async () => {
    if (!user || !selectedEvent) return;
    try {
      setActionLoading(selectedEvent.id);
      setShowLeaveDialog(false);
      setEvents(prev => prev.map(e => e.id === selectedEvent.id ? { ...e, participantCount: Math.max(e.participantCount - 1, 0) } : e));
      setMyEvents(prev => { const s = new Set(prev); s.delete(selectedEvent.id); return s; });

      await runTransaction(db, async (tx) => {
        const eventRef = doc(db, 'events', selectedEvent.id);
        const eventDoc = await tx.get(eventRef);
        if (!eventDoc.exists()) throw new Error('Event not found');
        const data = eventDoc.data();
        if (data.status !== 'open') throw new Error('Cannot leave a closed event');

        const snap = await getDocs(query(
          collection(db, 'eventParticipants'),
          where('eventId', '==', selectedEvent.id),
          where('playerId', '==', user.uid),
          where('currentStatus', '==', 'joined')
        ));
        if (snap.empty) throw new Error('Participant record not found');
        snap.forEach(d => tx.delete(doc(db, 'eventParticipants', d.id)));
        tx.update(eventRef, { participantCount: Math.max((data.participantCount || 1) - 1, 0) });
      });

      setSuccessMessage(`You've left "${selectedEvent.title}"`);
      setShowSuccessDialog(true);
    } catch (e: any) {
      fetchEvents();
      setErrorMessage(e.message || 'Failed to leave event');
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setActionLoading(null);
      setSelectedEvent(null);
    }
  };

  const filteredEvents = (() => {
    const now = new Date();
    if (filter === 'upcoming') return events.filter(e => e.date.toDate() >= now && e.status === 'open');
    if (filter === 'joined')   return events.filter(e => myEvents.has(e.id));
    if (filter === 'past')     return events.filter(e => e.date.toDate() < now || e.status === 'locked');
    return events;
  })();

  if (loading || !user || role !== 'treasurer') {
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

      {/* ── Leave Confirm Dialog ── */}
      {showLeaveDialog && selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 animate-slideUp shadow-2xl">
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-base font-black text-gray-900 text-center mb-1">Leave Event?</p>
            <p className="text-xs text-gray-400 text-center mb-5 break-words">
              "{selectedEvent.title}"
            </p>
            <div className="space-y-2">
              <button onClick={handleLeaveEvent} disabled={!!actionLoading}
                className="w-full py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-sm font-black rounded-2xl transition-colors cursor-pointer disabled:opacity-50">
                Yes, Leave
              </button>
              <button onClick={() => { setShowLeaveDialog(false); setSelectedEvent(null); }}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold rounded-2xl transition-colors cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Dialog ── */}
      {showSuccessDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 animate-slideUp shadow-2xl text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-base font-black text-gray-900 mb-1">Done!</p>
            <p className="text-xs text-gray-400 mb-5 break-words">{successMessage}</p>
            <button onClick={() => { setShowSuccessDialog(false); setSuccessMessage(''); }}
              className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-black rounded-2xl transition-colors cursor-pointer">
              Got it
            </button>
          </div>
        </div>
      )}

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
            <h1 className="text-sm font-bold text-gray-900 leading-tight">Events</h1>
            <p className="text-xs text-gray-400">Browse and join upcoming events</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3 py-4 pb-12 space-y-3">

        {/* ── Error toast ── */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 animate-slideDown">
            <p className="text-xs font-bold text-red-700">{errorMessage}</p>
          </div>
        )}

        {/* ── Filter tab bar ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1 flex gap-1">
          {([
            { id: 'upcoming' as const, label: 'Upcoming', count: events.filter(e => e.date.toDate() >= new Date() && e.status === 'open').length },
            { id: 'joined'   as const, label: 'Joined',   count: myEvents.size },
            { id: 'past'     as const, label: 'Past',     count: null },
          ]).map(({ id, label, count }) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                filter === id ? 'bg-red-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-700'
              }`}>
              {label}
              {count !== null && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none ${
                  filter === id ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-500'
                }`}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 p-10 text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-900">
              {filter === 'upcoming' ? 'No upcoming events' : filter === 'joined' ? "Haven't joined any events" : 'No past events'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {filter === 'upcoming' ? 'Check back later for new events' : filter === 'joined' ? 'Join an upcoming event to get started' : 'Your event history will appear here'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map(event => {
              const eventDate       = event.date.toDate();
              const deadlineDate    = event.deadline.toDate();
              const now             = new Date();
              const isDeadlinePassed = deadlineDate <= now;
              const hasJoined       = myEvents.has(event.id);
              const canAct          = event.status === 'open' && !isDeadlinePassed;
              const isLoading       = actionLoading === event.id;

              const perPlayer    = event.status !== 'open' && event.participantCount > 0
                ? calculatePerPlayerAmount(event.totalAmount, event.participantCount) : 0;
              const expected     = perPlayer * event.participantCount;
              const profit       = event.totalCollected - event.totalAmount;
              const collectRate  = expected > 0 ? Math.round((event.totalCollected / expected) * 100) : 0;

              return (
                <div key={event.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">

                  {/* Status bar */}
                  <div className={`h-1 w-full ${
                    event.status === 'open' ? 'bg-red-500' : 'bg-gray-200'
                  }`} />

                  <div className="p-4">

                    {/* Title row */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-black text-gray-900 leading-snug break-words">{event.title}</h3>
                          {hasJoined && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 bg-red-600 text-white rounded-full leading-none flex-shrink-0">
                              Joined
                            </span>
                          )}
                          {event.eventPaidToVendor && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200 flex-shrink-0">
                              Vendor Paid
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                        event.status === 'open'
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}>
                        {event.status}
                      </span>
                    </div>

                    {/* Meta chips */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
                      {[
                        { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
                          text: eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
                        { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
                          text: `${event.time} · ${event.durationHours}h` },
                        { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />,
                          text: `₹${event.totalAmount.toLocaleString()}` },
                      ].map(({ icon, text }, i) => (
                        <span key={i} className="flex items-center gap-1 text-xs text-gray-400">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
                          {text}
                        </span>
                      ))}
                    </div>

                    {/* Stats inline row */}
                    {event.status === 'open' ? (
                      <div className="flex items-center divide-x divide-gray-200 bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden mb-3">
                        <div className="flex-1 py-2.5 text-center">
                          <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">Players</p>
                          <p className="text-sm font-black text-gray-800 mt-0.5">{event.participantCount}</p>
                        </div>
                        <div className="flex-1 py-2.5 text-center">
                          <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">Reg. Deadline</p>
                          <p className="text-xs font-black text-gray-800 mt-0.5">
                            {deadlineDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </p>
                          <p className="text-[9px] text-gray-400 leading-tight">
                            {deadlineDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="flex-1 py-2.5 text-center">
                          <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">Turf Cost</p>
                          <p className="text-sm font-black text-gray-800 mt-0.5">₹{event.totalAmount.toLocaleString()}</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* 2×2 grid for closed events */}
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          {[
                            { label: 'Players',   value: String(event.participantCount) },
                            { label: 'Your Share',value: hasJoined && perPlayer > 0 ? `₹${perPlayer}` : '—' },
                            { label: 'Expected',  value: `₹${expected.toLocaleString()}` },
                            { label: 'Collected', value: `₹${event.totalCollected.toLocaleString()}` },
                          ].map(({ label, value }) => (
                            <div key={label} className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 text-center">
                              <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                              <p className="text-sm font-black text-gray-800 mt-0.5">{value}</p>
                            </div>
                          ))}
                        </div>
                        {/* Profit full-width */}
                        <div className={`rounded-xl px-3 py-2 border text-center mb-3 ${
                          profit < 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'
                        }`}>
                          <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">
                            Profit · {collectRate}% collected
                          </p>
                          <p className={`text-sm font-black mt-0.5 ${profit < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                            ₹{profit.toLocaleString()}
                          </p>
                        </div>
                      </>
                    )}

                    {/* Action buttons */}
                    {canAct && !hasJoined && (
                      <button onClick={() => handleJoinEvent(event.id, event.title)} disabled={isLoading}
                        className="w-full py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-black rounded-2xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                        {isLoading ? 'Joining…' : 'Join Event'}
                      </button>
                    )}

                    {canAct && hasJoined && (
                      <button onClick={() => { setSelectedEvent({ id: event.id, title: event.title }); setShowLeaveDialog(true); }} disabled={isLoading}
                        className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 text-xs font-black rounded-2xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                        {isLoading ? 'Leaving…' : 'Leave Event'}
                      </button>
                    )}

                    {event.status === 'open' && isDeadlinePassed && (
                      <div className="w-full py-2.5 bg-gray-50 border border-gray-200 text-gray-400 text-xs font-bold rounded-2xl text-center">
                        Registration Closed
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
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: translateY(0) } }
        .animate-fadeIn  { animation: fadeIn  0.15s ease-out; }
        .animate-slideUp { animation: slideUp 0.2s  ease-out; }
        .animate-slideDown { animation: slideDown 0.2s ease-out; }
      `}</style>
    </div>
  );
}