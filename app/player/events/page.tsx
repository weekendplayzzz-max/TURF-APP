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

// ─── Types ────────────────────────────────────────────────────────────────────
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

interface GuestPlayer {
  guestId: string;
  guestName: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PlayerEvents() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [events,            setEvents]            = useState<Event[]>([]);
  const [myEvents,          setMyEvents]          = useState<Set<string>>(new Set());
  const [linkedGuests,      setLinkedGuests]      = useState<GuestPlayer[]>([]);
  const [filter,            setFilter]            = useState<'upcoming' | 'joined' | 'past'>('upcoming');
  const [loadingData,       setLoadingData]       = useState(true);
  const [message,           setMessage]           = useState('');
  const [actionLoading,     setActionLoading]     = useState<string | null>(null);
  const [showLeaveDialog,   setShowLeaveDialog]   = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showGuestDialog,   setShowGuestDialog]   = useState(false);
  const [successMessage,    setSuccessMessage]    = useState('');
  const [selectedEvent,     setSelectedEvent]     = useState<{ id: string; title: string } | null>(null);
  const [selectedGuests,    setSelectedGuests]    = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && role !== 'player') router.push('/login');
  }, [role, loading, router]);

  const fetchLinkedGuests = useCallback(async () => {
    if (!user) return;
    try {
      const snap = await getDocs(query(
        collection(db, 'guestPlayers'),
        where('parentIds', 'array-contains', user.uid),
        where('isActive', '==', true)
      ));
      const guests: GuestPlayer[] = [];
      snap.forEach(d => guests.push({ guestId: d.id, guestName: d.data().guestName }));
      setLinkedGuests(guests);
    } catch (e) { console.error(e); }
  }, [user]);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingData(true);
      const eventsSnap = await getDocs(query(collection(db, 'events'), orderBy('date', 'desc')));
      const participantsSnap = await getDocs(query(
        collection(db, 'eventParticipants'),
        where('currentStatus', '==', 'joined')
      ));

      const countMap = new Map<string, number>();
      const myEventIds = new Set<string>();
      participantsSnap.forEach(d => {
        const data = d.data();
        countMap.set(data.eventId, (countMap.get(data.eventId) || 0) + 1);
        if (data.playerId === user.uid || data.parentId === user.uid) myEventIds.add(data.eventId);
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
    } catch (e) { console.error(e); }
    finally { setLoadingData(false); }
  }, [user]);

  useEffect(() => {
    if (role === 'player') { fetchEvents(); fetchLinkedGuests(); }
  }, [role, fetchEvents, fetchLinkedGuests]);

  const openGuestDialog    = (id: string, title: string) => { setSelectedEvent({ id, title }); setSelectedGuests(new Set()); setShowGuestDialog(true); };
  const closeGuestDialog   = () => { setShowGuestDialog(false); setSelectedEvent(null); setSelectedGuests(new Set()); };
  const toggleGuest        = (id: string) => { const s = new Set(selectedGuests); s.has(id) ? s.delete(id) : s.add(id); setSelectedGuests(s); };
  const closeLeaveDialog   = () => { setShowLeaveDialog(false); setSelectedEvent(null); };
  const closeSuccessDialog = () => { setShowSuccessDialog(false); setSuccessMessage(''); };

  const handleJoinEventWithGuests = async () => {
    if (!user || !selectedEvent) return;
    try {
      setActionLoading(selectedEvent.id);
      closeGuestDialog();

      await runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'events', selectedEvent.id);
        const eventDoc = await transaction.get(eventRef);
        if (!eventDoc.exists()) throw new Error('Event not found');
        const eventData = eventDoc.data();
        if (eventData.status !== 'open') throw new Error('Event is no longer open for registration');
        if (eventData.deadline.toMillis() < Timestamp.now().toMillis()) throw new Error('Registration deadline has passed');

        const participantsRef = collection(db, 'eventParticipants');
        const existingSnap = await getDocs(query(participantsRef, where('eventId', '==', selectedEvent.id), where('playerId', '==', user.uid), where('currentStatus', '==', 'joined')));
        if (!existingSnap.empty) throw new Error('You have already joined this event');

        const allSnap = await getDocs(query(participantsRef, where('eventId', '==', selectedEvent.id), where('currentStatus', '==', 'joined')));
        const alreadyJoined = new Set<string>();
        allSnap.forEach(d => { if (d.data().playerType === 'guest') alreadyJoined.add(d.data().playerId); });

        const guestsToAdd = Array.from(selectedGuests).filter(id => !alreadyJoined.has(id));
        const skipped     = selectedGuests.size - guestsToAdd.length;
        const totalToAdd  = 1 + guestsToAdd.length;

        transaction.update(eventRef, { participantCount: (eventData.participantCount || 0) + totalToAdd });
        transaction.set(doc(collection(db, 'eventParticipants')), {
          eventId: selectedEvent.id, playerId: user.uid,
          playerName: user.displayName || user.email?.split('@')[0] || 'Player',
          playerEmail: user.email || '', playerType: 'regular',
          joinedAt: Timestamp.now(), currentStatus: 'joined', addedAfterClose: false,
        });

        for (const guestId of guestsToAdd) {
          const guest = linkedGuests.find(g => g.guestId === guestId);
          if (guest) {
            transaction.set(doc(collection(db, 'eventParticipants')), {
              eventId: selectedEvent.id, playerId: guestId, playerName: guest.guestName,
              playerEmail: '', playerType: 'guest', parentId: user.uid,
              parentName: user.displayName || user.email?.split('@')[0] || 'Player',
              joinedAt: Timestamp.now(), currentStatus: 'joined', addedAfterClose: false,
            });
          }
        }

        setEvents(prev => prev.map(e => e.id === selectedEvent.id ? { ...e, participantCount: e.participantCount + totalToAdd } : e));
        setMyEvents(prev => new Set([...prev, selectedEvent.id]));

        let msg = `You${guestsToAdd.length > 0 ? ` with ${guestsToAdd.length} guest${guestsToAdd.length > 1 ? 's' : ''}` : ''} have successfully joined ${selectedEvent.title}!`;
        if (skipped > 0) msg += ` (${skipped} guest${skipped > 1 ? 's were' : ' was'} already in the event and skipped)`;
        setSuccessMessage(msg);
        setShowSuccessDialog(true);
      });
    } catch (e: any) {
      console.error(e);
      fetchEvents();
      setMessage(e.message || 'Failed to join event');
      setTimeout(() => setMessage(''), 3000);
    } finally { setActionLoading(null); setSelectedEvent(null); setSelectedGuests(new Set()); }
  };

  const handleJoinEvent = async (eventId: string, eventTitle: string) => {
    if (linkedGuests.length > 0) return openGuestDialog(eventId, eventTitle);
    if (!user) return;
    try {
      setActionLoading(eventId);
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, participantCount: e.participantCount + 1 } : e));
      setMyEvents(prev => new Set([...prev, eventId]));

      await runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'events', eventId);
        const eventDoc = await transaction.get(eventRef);
        if (!eventDoc.exists()) throw new Error('Event not found');
        const eventData = eventDoc.data();
        if (eventData.status !== 'open') throw new Error('Event is no longer open for registration');
        if (eventData.deadline.toMillis() <= Timestamp.now().toMillis()) throw new Error('Registration deadline has passed');

        const existingSnap = await getDocs(query(collection(db, 'eventParticipants'), where('eventId', '==', eventId), where('playerId', '==', user.uid), where('currentStatus', '==', 'joined')));
        if (!existingSnap.empty) throw new Error('You have already joined this event');

        transaction.update(eventRef, { participantCount: (eventData.participantCount || 0) + 1 });
        transaction.set(doc(collection(db, 'eventParticipants')), {
          eventId, playerId: user.uid,
          playerName: user.displayName || user.email?.split('@')[0] || 'Player',
          playerEmail: user.email || '', playerType: 'regular',
          joinedAt: Timestamp.now(), currentStatus: 'joined', addedAfterClose: false,
        });
      });

      setSuccessMessage(`You've successfully joined "${eventTitle}"!`);
      setShowSuccessDialog(true);
    } catch (e: any) {
      console.error(e);
      fetchEvents();
      setMessage(e.message || 'Failed to join event');
      setTimeout(() => setMessage(''), 3000);
    } finally { setActionLoading(null); }
  };

  const handleLeaveEvent = async () => {
    if (!user || !selectedEvent) return;
    try {
      setActionLoading(selectedEvent.id);
      closeLeaveDialog();

      const snap = await getDocs(query(collection(db, 'eventParticipants'), where('eventId', '==', selectedEvent.id), where('currentStatus', '==', 'joined')));
      let toRemoveCount = 0;
      const toRemoveIds: string[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.playerId === user.uid || data.parentId === user.uid) { toRemoveCount++; toRemoveIds.push(d.id); }
      });

      setEvents(prev => prev.map(e => e.id === selectedEvent.id ? { ...e, participantCount: Math.max(e.participantCount - toRemoveCount, 0) } : e));
      setMyEvents(prev => { const s = new Set(prev); s.delete(selectedEvent.id); return s; });

      await runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'events', selectedEvent.id);
        const eventDoc = await transaction.get(eventRef);
        if (!eventDoc.exists()) throw new Error('Event not found');
        if (eventDoc.data().status !== 'open') throw new Error('Cannot leave a closed event');
        toRemoveIds.forEach(id => transaction.delete(doc(db, 'eventParticipants', id)));
        transaction.update(eventRef, { participantCount: Math.max((eventDoc.data().participantCount || toRemoveCount) - toRemoveCount, 0) });
      });

      const guestText = toRemoveCount > 1 ? ` and ${toRemoveCount - 1} guest${toRemoveCount > 2 ? 's' : ''}` : '';
      setSuccessMessage(`You${guestText} have successfully left "${selectedEvent.title}"`);
      setShowSuccessDialog(true);
    } catch (e: any) {
      console.error(e);
      fetchEvents();
      setMessage(e.message || 'Failed to leave event');
      setTimeout(() => setMessage(''), 3000);
    } finally { setActionLoading(null); setSelectedEvent(null); }
  };

  const getFilteredEvents = () => {
    const now = new Date();
    if (filter === 'upcoming') return events.filter(e => e.date.toDate() >= now && e.status === 'open');
    if (filter === 'joined')   return events.filter(e => myEvents.has(e.id));
    if (filter === 'past')     return events.filter(e => e.date.toDate() < now || e.status === 'locked');
    return events;
  };
  const filteredEvents = getFilteredEvents();

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

      {/* ══════════════════════════════════════
          GUEST DIALOG
      ══════════════════════════════════════ */}
      {showGuestDialog && selectedEvent && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto animate-slideUp">
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="px-5 pt-4 pb-2">
              <h3 className="text-lg font-black text-gray-900">Select Participants</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Joining: <span className="font-semibold text-gray-600">{selectedEvent.title}</span>
              </p>
            </div>
            <div className="px-5 pb-5 space-y-2 mt-2">
              <div className="flex items-center gap-3 p-3 rounded-2xl border-2 border-red-500 bg-red-50">
                <div className="w-5 h-5 bg-red-600 rounded-md flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Myself ({user.displayName || 'You'})</p>
                  <p className="text-xs text-gray-400">Required</p>
                </div>
              </div>
              {linkedGuests.length > 0 && (
                <>
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest pt-2 pb-1">Your Linked Players</p>
                  {linkedGuests.map(guest => (
                    <div
                      key={guest.guestId}
                      onClick={() => toggleGuest(guest.guestId)}
                      className={`flex items-center gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                        selectedGuests.has(guest.guestId) ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white hover:border-red-300'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        selectedGuests.has(guest.guestId) ? 'bg-red-600 border-red-600' : 'border-gray-300'
                      }`}>
                        {selectedGuests.has(guest.guestId) && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{guest.guestName}</p>
                        <p className="text-xs text-gray-400">Guest Player</p>
                      </div>
                    </div>
                  ))}
                </>
              )}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-xl mt-1">
                <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-xs font-semibold text-gray-600">
                  Total: <span className="text-gray-900 font-black">{1 + selectedGuests.size}</span> participant{1 + selectedGuests.size > 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={handleJoinEventWithGuests} disabled={!!actionLoading}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-colors disabled:opacity-50 cursor-pointer text-sm mt-2">
                {actionLoading ? 'Joining...' : `Join with ${1 + selectedGuests.size} participant${1 + selectedGuests.size > 1 ? 's' : ''}`}
              </button>
              <button onClick={closeGuestDialog} disabled={!!actionLoading}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-colors disabled:opacity-50 cursor-pointer text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          LEAVE DIALOG
      ══════════════════════════════════════ */}
      {showLeaveDialog && selectedEvent && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slideUp px-5 pt-6 pb-5">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-black text-gray-900 text-center">Leave Turf?</h3>
            <p className="text-sm text-gray-500 text-center mt-1">
              Are you sure you want to leave <span className="font-semibold text-gray-900">"{selectedEvent.title}"</span>?
            </p>
            {linkedGuests.length > 0 && (
              <p className="text-xs text-gray-400 text-center mt-1.5">This will also remove any guests you joined with.</p>
            )}
            <div className="mt-5 space-y-2">
              <button onClick={handleLeaveEvent} disabled={!!actionLoading}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-colors disabled:opacity-50 cursor-pointer text-sm">
                {actionLoading ? 'Leaving...' : 'Yes, Leave Turf'}
              </button>
              <button onClick={closeLeaveDialog} disabled={!!actionLoading}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-colors disabled:opacity-50 cursor-pointer text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          SUCCESS DIALOG
      ══════════════════════════════════════ */}
      {showSuccessDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slideUp px-5 pt-6 pb-5">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-black text-gray-900 text-center">Success!</h3>
            <p className="text-sm text-gray-500 text-center mt-1 break-words">{successMessage}</p>
            <button onClick={closeSuccessDialog}
              className="mt-5 w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm">
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          HEADER
      ══════════════════════════════════════ */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2.5 rounded-xl bg-gray-100 active:bg-gray-200 cursor-pointer flex-shrink-0">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-7 h-7 flex-shrink-0">
            <Image src="/logo.png" alt="Logo" width={28} height={28} className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-gray-900 leading-tight">Turfs</h1>
            <p className="text-xs text-gray-400">Browse and join upcoming turfs</p>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-lg mx-auto px-3 py-4 pb-12 space-y-4">

        {message && (
          <div className="px-4 py-3 rounded-2xl bg-red-50 border border-red-200 animate-slideDown">
            <p className="text-xs font-semibold text-red-700">{message}</p>
          </div>
        )}

        {/* Filter tabs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1 flex gap-1">
          {([
            { id: 'upcoming' as const, label: 'Upcoming' },
            { id: 'joined'   as const, label: `Joined (${myEvents.size})` },
            { id: 'past'     as const, label: 'Past' },
          ]).map(({ id, label }) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                filter === id ? 'bg-red-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Events */}
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-10 text-center">
            <div className="w-14 h-14 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-900">
              {filter === 'upcoming' ? 'No upcoming turfs' : filter === 'joined' ? "You haven't joined any turfs" : 'No past turfs'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {filter === 'upcoming' ? 'Check back later' : filter === 'joined' ? 'Join an upcoming turf to get started' : 'Your history will appear here'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map(event => {
              const eventDate        = event.date.toDate();
              const deadlineDate     = event.deadline.toDate();
              const now              = new Date();
              const isDeadlinePassed = deadlineDate <= now;
              const hasJoined        = myEvents.has(event.id);
              const canJoinLeave     = event.status === 'open' && !isDeadlinePassed;
              const isPast           = event.status !== 'open';

              const perPlayerAmount = isPast && event.participantCount > 0
                ? calculatePerPlayerAmount(event.totalAmount, event.participantCount)
                : 0;
              const expectedTotal  = perPlayerAmount * event.participantCount;
              const profitMargin   = event.totalCollected - event.totalAmount;
              const collectionRate = expectedTotal > 0 ? Math.round((event.totalCollected / expectedTotal) * 100) : 0;

              return (
                <div key={event.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">

                  {/* Status color bar */}
                  <div className={`h-1 w-full ${
                    event.status === 'open' ? 'bg-red-500' : 'bg-gray-300'
                  }`} />

                  <div className="p-4">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-black text-gray-900 leading-tight">{event.title}</h3>
                          {hasJoined && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full text-[10px] font-bold text-gray-600">
                              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              Joined
                            </span>
                          )}
                          {event.eventPaidToVendor && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-full border border-gray-200">
                              Vendor Paid
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${
                        event.status === 'open'
                          ? 'bg-red-50 text-red-600 border border-red-200'
                          : 'bg-gray-100 text-gray-500 border border-gray-200'
                      }`}>
                        {event.status}
                      </span>
                    </div>

                    {/* Meta chips */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
                      {[
                        { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />, text: eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
                        { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />, text: `${event.time} · ${event.durationHours}h` },
                        { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />, text: `₹${event.totalAmount.toLocaleString()}` },
                      ].map(({ icon, text }, i) => (
                        <div key={i} className="flex items-center gap-1 text-xs text-gray-500">
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
                          <span>{text}</span>
                        </div>
                      ))}
                    </div>

                    {/* ── Stats block ── */}
                    {event.status === 'open' ? (
                      /* OPEN: 3-column */
                      <div className="bg-gray-50 rounded-2xl p-3 mb-3 border border-gray-100 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-gray-400 font-semibold mb-0.5">Players</p>
                          <p className="text-xl font-black text-gray-900">{event.participantCount}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 font-semibold mb-0.5">Deadline</p>
                          <p className="text-xs font-black text-red-600 leading-tight">
                            {deadlineDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </p>
                          <p className="text-[10px] font-semibold text-red-500">
                            {deadlineDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 font-semibold mb-0.5">Cost</p>
                          <p className="text-xl font-black text-gray-900">₹{event.totalAmount.toLocaleString()}</p>
                        </div>
                      </div>
                    ) : (
                      /* PAST / LOCKED / CLOSED: 2-row layout */
                      <div className="bg-gray-50 rounded-2xl p-3 mb-3 border border-gray-100 space-y-2">

                        {/* Row 1 — Players · Your Share · Collection % */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-[10px] text-gray-400 font-semibold mb-0.5">Players</p>
                            <p className="text-xl font-black text-gray-900">{event.participantCount}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 font-semibold mb-0.5">Your Share</p>
                            <p className="text-xl font-black text-red-600">
                              {hasJoined && perPlayerAmount > 0 ? `₹${perPlayerAmount}` : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 font-semibold mb-0.5">Collected</p>
                            <p className="text-xl font-black text-gray-900">{collectionRate}%</p>
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-gray-200" />

                        {/* Row 2 — Expected · Collected amount · Profit pills */}
                        <div className="flex gap-2">
                          {[
                            { label: 'Expected',  value: `₹${expectedTotal.toLocaleString()}` },
                            { label: 'Collected', value: `₹${event.totalCollected.toLocaleString()}` },
                            { label: 'Profit',    value: `₹${profitMargin.toLocaleString()}`, warn: profitMargin < 0 },
                          ].map(({ label, value, warn }) => (
                            <div key={label} className="flex-1 bg-white rounded-xl px-2 py-1.5 text-center border border-gray-100">
                              <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                              <p className={`text-xs font-black mt-0.5 ${warn ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      {canJoinLeave && !hasJoined && (
                        <button onClick={() => handleJoinEvent(event.id, event.title)} disabled={actionLoading === event.id}
                          className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-colors disabled:opacity-50 cursor-pointer text-xs">
                          {actionLoading === event.id ? 'Joining...' : 'Join Turf'}
                        </button>
                      )}
                      {canJoinLeave && hasJoined && (
                        <button onClick={() => { setSelectedEvent({ id: event.id, title: event.title }); setShowLeaveDialog(true); }} disabled={actionLoading === event.id}
                          className="flex-1 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-2xl transition-colors disabled:opacity-50 cursor-pointer text-xs">
                          Leave
                        </button>
                      )}
                      {!canJoinLeave && event.status === 'open' && isDeadlinePassed && (
                        <span className="flex-1 py-2.5 bg-gray-100 text-gray-400 font-bold rounded-2xl text-center text-xs">
                          Deadline Passed
                        </span>
                      )}
                      <button
                        onClick={() => router.push(`/player/event-participants/${event.id}`)}
                        className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-colors cursor-pointer text-xs flex-shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {event.participantCount}
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
        @keyframes fadeIn    { from { opacity: 0 }                             to { opacity: 1 } }
        @keyframes slideUp   { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        .animate-fadeIn    { animation: fadeIn    0.2s  ease-out; }
        .animate-slideUp   { animation: slideUp   0.25s ease-out; }
        .animate-slideDown { animation: slideDown 0.2s  ease-out; }
      `}</style>
    </div>
  );
}