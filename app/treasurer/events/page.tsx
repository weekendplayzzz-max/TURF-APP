'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import {
  collection,
  getDocs,
  doc,
  query,
  where,
  Timestamp,
  orderBy,
  runTransaction,
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
  const [events, setEvents] = useState<Event[]>([]);
  const [myEvents, setMyEvents] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'upcoming' | 'joined' | 'past'>('upcoming');
  const [loadingData, setLoadingData] = useState(true);
  const [message, setMessage] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  const fetchEvents = useCallback(async () => {
    if (!user) return;

    try {
      setLoadingData(true);

      // Fetch all events
      const eventsRef = collection(db, 'events');
      const eventsQuery = query(eventsRef, orderBy('date', 'desc'));
      const eventsSnapshot = await getDocs(eventsQuery);

      // Fetch ALL participants at once for efficiency
      const participantsRef = collection(db, 'eventParticipants');
      const allParticipantsQuery = query(
        participantsRef,
        where('currentStatus', '==', 'joined')
      );
      const allParticipantsSnapshot = await getDocs(allParticipantsQuery);

      // Create a map of eventId -> participant count
      const participantCountMap = new Map<string, number>();
      const myEventIds = new Set<string>();

      allParticipantsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const eventId = data.eventId;
        
        // Count participants per event
        participantCountMap.set(
          eventId,
          (participantCountMap.get(eventId) || 0) + 1
        );

        // Track my events
        if (data.playerId === user.uid) {
          myEventIds.add(eventId);
        }
      });

      const eventsList: Event[] = [];
      eventsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const eventId = docSnap.id;
        
        // Use REAL count from participants collection
        const realParticipantCount = participantCountMap.get(eventId) || 0;
        
        eventsList.push({
          id: eventId,
          title: data.title,
          date: data.date,
          time: data.time,
          totalAmount: data.totalAmount,
          durationHours: data.durationHours,
          deadline: data.deadline,
          status: data.status,
          participantCount: realParticipantCount,
          totalCollected: data.totalCollected || 0,
          eventPaidToVendor: data.eventPaidToVendor || false,
          createdByRole: data.createdByRole,
        });
      });

      setEvents(eventsList);
      setMyEvents(myEventIds);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    if (role === 'treasurer') {
      fetchEvents();
    }
  }, [role, fetchEvents]);

  const handleJoinEvent = async (eventId: string, eventTitle: string) => {
    if (!user) return;

    try {
      setActionLoading(eventId);

      // Optimistic UI update - update immediately
      setEvents(prev => prev.map(e => 
        e.id === eventId 
          ? { ...e, participantCount: e.participantCount + 1 }
          : e
      ));
      setMyEvents(prev => new Set([...prev, eventId]));

      await runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'events', eventId);
        const eventDoc = await transaction.get(eventRef);

        if (!eventDoc.exists()) {
          throw new Error('Event not found');
        }

        const eventData = eventDoc.data();

        if (eventData.status !== 'open') {
          throw new Error('Event is no longer open for registration');
        }

        if (eventData.deadline.toMillis() <= Timestamp.now().toMillis()) {
          throw new Error('Registration deadline has passed');
        }

        const participantsRef = collection(db, 'eventParticipants');
        const existingQuery = query(
          participantsRef,
          where('eventId', '==', eventId),
          where('playerId', '==', user.uid),
          where('currentStatus', '==', 'joined')
        );
        const existingSnapshot = await getDocs(existingQuery);

        if (!existingSnapshot.empty) {
          throw new Error('You have already joined this event');
        }

        const newParticipantCount = (eventData.participantCount || 0) + 1;

        transaction.update(eventRef, {
          participantCount: newParticipantCount,
        });

        const participantRef = doc(collection(db, 'eventParticipants'));
        transaction.set(participantRef, {
          eventId: eventId,
          playerId: user.uid,
          playerName: user.displayName || user.email?.split('@')[0] || 'Treasurer',
          playerEmail: user.email || '',
          joinedAt: Timestamp.now(),
          currentStatus: 'joined',
          addedAfterClose: false,
        });
      });

      // Show success dialog
      setSuccessMessage(`You've successfully joined "${eventTitle}"!`);
      setShowSuccessDialog(true);
    } catch (error: any) {
      console.error('Error joining event:', error);
      
      // Revert optimistic update on error
      fetchEvents();
      
      setMessage(error.message || 'Failed to join event');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setActionLoading(null);
    }
  };

  const openLeaveDialog = (eventId: string, eventTitle: string) => {
    setSelectedEvent({ id: eventId, title: eventTitle });
    setShowLeaveDialog(true);
  };

  const closeLeaveDialog = () => {
    setShowLeaveDialog(false);
    setSelectedEvent(null);
  };

  const closeSuccessDialog = () => {
    setShowSuccessDialog(false);
    setSuccessMessage('');
  };

  const handleLeaveEvent = async () => {
    if (!user || !selectedEvent) return;

    try {
      setActionLoading(selectedEvent.id);
      closeLeaveDialog();

      // Optimistic UI update - update immediately
      setEvents(prev => prev.map(e => 
        e.id === selectedEvent.id 
          ? { ...e, participantCount: Math.max(e.participantCount - 1, 0) }
          : e
      ));
      setMyEvents(prev => {
        const newSet = new Set(prev);
        newSet.delete(selectedEvent.id);
        return newSet;
      });

      await runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'events', selectedEvent.id);
        const eventDoc = await transaction.get(eventRef);

        if (!eventDoc.exists()) {
          throw new Error('Event not found');
        }

        const eventData = eventDoc.data();

        if (eventData.status !== 'open') {
          throw new Error('Cannot leave a closed event');
        }

        const participantsRef = collection(db, 'eventParticipants');
        const participantQuery = query(
          participantsRef,
          where('eventId', '==', selectedEvent.id),
          where('playerId', '==', user.uid),
          where('currentStatus', '==', 'joined')
        );
        const participantSnapshot = await getDocs(participantQuery);

        if (participantSnapshot.empty) {
          throw new Error('Participant record not found');
        }

        participantSnapshot.forEach((docSnap) => {
          transaction.delete(doc(db, 'eventParticipants', docSnap.id));
        });

        const newParticipantCount = Math.max((eventData.participantCount || 1) - 1, 0);
        transaction.update(eventRef, {
          participantCount: newParticipantCount,
        });
      });

      // Show success dialog
      setSuccessMessage(`You've successfully left "${selectedEvent.title}"`);
      setShowSuccessDialog(true);
    } catch (error: any) {
      console.error('Error leaving event:', error);
      
      // Revert optimistic update on error
      fetchEvents();
      
      setMessage(error.message || 'Failed to leave event');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setActionLoading(null);
      setSelectedEvent(null);
    }
  };

  const getFilteredEvents = () => {
    const now = new Date();

    if (filter === 'upcoming') {
      return events.filter((e) => e.date.toDate() >= now && e.status === 'open');
    } else if (filter === 'joined') {
      return events.filter((e) => myEvents.has(e.id));
    } else if (filter === 'past') {
      return events.filter((e) => e.date.toDate() < now || e.status === 'locked');
    }

    return events;
  };

  const filteredEvents = getFilteredEvents();

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
      {/* Leave Confirmation Dialog */}
      {showLeaveDialog && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 animate-slideUp">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                Leave Event?
              </h3>
              <p className="text-sm sm:text-base text-gray-600">
                Are you sure you want to leave
              </p>
              <p className="text-sm sm:text-base font-semibold text-gray-900 mt-1 break-words">
                "{selectedEvent.title}"?
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleLeaveEvent}
                disabled={actionLoading === selectedEvent.id}
                className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === selectedEvent.id ? 'Leaving...' : 'Yes, Leave Event'}
              </button>
              <button
                onClick={closeLeaveDialog}
                disabled={actionLoading === selectedEvent.id}
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
                  Events
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                  Browse and join upcoming events
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

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 mb-6">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setFilter('upcoming')}
              className={`px-4 sm:px-6 py-2 sm:py-2.5 font-semibold rounded-lg transition-all duration-200 text-sm sm:text-base ${
                filter === 'upcoming'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setFilter('joined')}
              className={`px-4 sm:px-6 py-2 sm:py-2.5 font-semibold rounded-lg transition-all duration-200 text-sm sm:text-base ${
                filter === 'joined'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Joined ({myEvents.size})
            </button>
            <button
              onClick={() => setFilter('past')}
              className={`px-4 sm:px-6 py-2 sm:py-2.5 font-semibold rounded-lg transition-all duration-200 text-sm sm:text-base ${
                filter === 'past'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Past
            </button>
          </div>
        </div>

        {/* Events List */}
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-base text-gray-700 font-medium">Loading events...</p>
            </div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
              {filter === 'upcoming'
                ? 'No upcoming events'
                : filter === 'joined'
                ? "You haven't joined any events yet"
                : 'No past events'}
            </p>
            <p className="text-sm sm:text-base text-gray-600">
              {filter === 'upcoming'
                ? 'Check back later for new events'
                : filter === 'joined'
                ? 'Join an upcoming event to get started'
                : 'Your event history will appear here'}
            </p>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {filteredEvents.map((event) => {
              const eventDate = event.date.toDate();
              const deadlineDate = event.deadline.toDate();
              const now = new Date();
              const isDeadlinePassed = deadlineDate <= now;
              const hasJoined = myEvents.has(event.id);
              const canJoinLeave = event.status === 'open' && !isDeadlinePassed;

              const perPlayerAmount = event.status !== 'open' && event.participantCount > 0
                ? calculatePerPlayerAmount(event.totalAmount, event.participantCount)
                : 0;

              const expectedTotal = perPlayerAmount * event.participantCount;
              const profitMargin = event.totalCollected - event.totalAmount;
              const collectionRate = expectedTotal > 0 
                ? Math.round((event.totalCollected / expectedTotal) * 100)
                : 0;

              return (
                <div
                  key={event.id}
                  className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 hover:shadow-2xl transition-shadow duration-200"
                >
                  {/* Event Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-2 flex-wrap">
                        <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 break-words">
                          {event.title}
                        </h3>
                        {hasJoined && (
                          <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 rounded-full text-xs font-medium text-green-700">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Joined
                          </span>
                        )}
                        {event.eventPaidToVendor && (
                          <span className="px-2 sm:px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full border border-blue-300">
                            ✓ Vendor Paid
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-2 text-xs sm:text-sm text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="truncate">{eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>{event.time}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>{event.durationHours}h</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <span>₹{event.totalAmount.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <span className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold ${
                      event.status === 'open'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : event.status === 'closed'
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-gray-100 text-gray-700 border border-gray-200'
                    }`}>
                      {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                    </span>
                  </div>

                  {/* Event Details */}
                  <div className="bg-gray-50 rounded-xl p-3 sm:p-4 mb-4 border border-gray-200">
                    {event.status === 'open' ? (
                      <div className="grid grid-cols-3 gap-3 sm:gap-4 text-center">
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Players Joined</p>
                          <p className="text-lg sm:text-xl font-bold text-gray-900">
                            {event.participantCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Registration Ends</p>
                          <p className="text-xs sm:text-sm font-bold text-red-600">
                            {deadlineDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </p>
                          <p className="text-xs font-semibold text-red-600">
                            {deadlineDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Turf Cost</p>
                          <p className="text-lg sm:text-xl font-bold text-gray-900">
                            ₹{event.totalAmount.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 text-center">
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Players</p>
                          <p className="text-lg sm:text-xl font-bold text-gray-900">
                            {event.participantCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Your Share</p>
                          <p className="text-lg sm:text-xl font-bold text-red-600">
                            {hasJoined && perPlayerAmount > 0 ? `₹${perPlayerAmount}` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Expected</p>
                          <p className="text-lg sm:text-xl font-bold text-purple-600">
                            ₹{expectedTotal.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Collected</p>
                          <p className="text-lg sm:text-xl font-bold text-green-600">
                            ₹{event.totalCollected.toLocaleString()}
                          </p>
                          {event.participantCount > 0 && (
                            <p className="text-xs text-gray-500 mt-1">{collectionRate}%</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Profit</p>
                          <p className="text-lg sm:text-xl font-bold text-orange-600">
                            ₹{profitMargin.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    {canJoinLeave && !hasJoined && (
                      <button
                        onClick={() => handleJoinEvent(event.id, event.title)}
                        disabled={actionLoading === event.id}
                        className="flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        {actionLoading === event.id ? 'Joining...' : 'Join Event'}
                      </button>
                    )}

                    {canJoinLeave && hasJoined && (
                      <button
                        onClick={() => openLeaveDialog(event.id, event.title)}
                        disabled={actionLoading === event.id}
                        className="flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-2.5 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Leave Event
                      </button>
                    )}

                    {!canJoinLeave && event.status === 'open' && isDeadlinePassed && (
                      <span className="flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-2.5 bg-gray-100 text-gray-600 font-semibold rounded-lg text-center text-sm">
                        Deadline Passed
                      </span>
                    )}
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
