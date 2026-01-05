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

interface GuestPlayer {
  guestId: string;
  guestName: string;
}

export default function SecretaryEvents() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [myEvents, setMyEvents] = useState<Set<string>>(new Set());
  const [linkedGuests, setLinkedGuests] = useState<GuestPlayer[]>([]);
  const [filter, setFilter] = useState<'upcoming' | 'joined' | 'past'>('upcoming');
  const [loadingData, setLoadingData] = useState(true);
  const [message, setMessage] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showGuestDialog, setShowGuestDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<{ id: string; title: string } | null>(null);
  const [selectedGuests, setSelectedGuests] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && role !== 'secretary') {
      router.push('/login');
    }
  }, [role, loading, router]);

  const fetchLinkedGuests = useCallback(async () => {
    if (!user) return;

    try {
      // Fetch guest players linked to this user
      const guestsRef = collection(db, 'guestPlayers');
      const guestsQuery = query(
        guestsRef,
        where('parentIds', 'array-contains', user.uid),
        where('isActive', '==', true)
      );
      const guestsSnapshot = await getDocs(guestsQuery);

      const guests: GuestPlayer[] = [];
      guestsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        guests.push({
          guestId: docSnap.id,
          guestName: data.guestName,
        });
      });

      setLinkedGuests(guests);
    } catch (error) {
      console.error('Error fetching linked guests:', error);
    }
  }, [user]);

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

        // Track my events (including if I joined with guests)
        if (data.playerId === user.uid || data.parentId === user.uid) {
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
    if (role === 'secretary') {
      fetchEvents();
      fetchLinkedGuests();
    }
  }, [role, fetchEvents, fetchLinkedGuests]);

  const openGuestDialog = (eventId: string, eventTitle: string) => {
    setSelectedEvent({ id: eventId, title: eventTitle });
    setSelectedGuests(new Set()); // Start with none selected (parent must select)
    setShowGuestDialog(true);
  };

  const closeGuestDialog = () => {
    setShowGuestDialog(false);
    setSelectedEvent(null);
    setSelectedGuests(new Set());
  };

  const toggleGuest = (guestId: string) => {
    const newSelected = new Set(selectedGuests);
    if (newSelected.has(guestId)) {
      newSelected.delete(guestId);
    } else {
      newSelected.add(guestId);
    }
    setSelectedGuests(newSelected);
  };

  const handleJoinEventWithGuests = async () => {
    if (!user || !selectedEvent) return;

    try {
      setActionLoading(selectedEvent.id);
      closeGuestDialog();

      // Calculate total participants (self + selected guests)
      const totalToAdd = 1 + selectedGuests.size;

      // Optimistic UI update
      setEvents(prev => prev.map(e => 
        e.id === selectedEvent.id 
          ? { ...e, participantCount: e.participantCount + totalToAdd }
          : e
      ));
      setMyEvents(prev => new Set([...prev, selectedEvent.id]));

      await runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'events', selectedEvent.id);
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

        // Check if already joined
        const participantsRef = collection(db, 'eventParticipants');
        const existingQuery = query(
          participantsRef,
          where('eventId', '==', selectedEvent.id),
          where('playerId', '==', user.uid),
          where('currentStatus', '==', 'joined')
        );
        const existingSnapshot = await getDocs(existingQuery);

        if (!existingSnapshot.empty) {
          throw new Error('You have already joined this event');
        }

        const newParticipantCount = (eventData.participantCount || 0) + totalToAdd;

        transaction.update(eventRef, {
          participantCount: newParticipantCount,
        });

        // Add parent
        const parentParticipantRef = doc(collection(db, 'eventParticipants'));
        transaction.set(parentParticipantRef, {
          eventId: selectedEvent.id,
          playerId: user.uid,
          playerName: user.displayName || user.email?.split('@')[0] || 'Player',
          playerEmail: user.email || '',
          playerType: 'regular',
          joinedAt: Timestamp.now(),
          currentStatus: 'joined',
          addedAfterClose: false,
        });

        // Add selected guests
        for (const guestId of selectedGuests) {
          const guest = linkedGuests.find(g => g.guestId === guestId);
          if (guest) {
            const guestParticipantRef = doc(collection(db, 'eventParticipants'));
            transaction.set(guestParticipantRef, {
              eventId: selectedEvent.id,
              playerId: guestId,
              playerName: guest.guestName,
              playerEmail: '',
              playerType: 'guest',
              parentId: user.uid,
              parentName: user.displayName || user.email?.split('@')[0] || 'Player',
              joinedAt: Timestamp.now(),
              currentStatus: 'joined',
              addedAfterClose: false,
            });
          }
        }
      });

      // Show success dialog
      const guestText = selectedGuests.size > 0 
        ? ` with ${selectedGuests.size} guest${selectedGuests.size > 1 ? 's' : ''}`
        : '';
      setSuccessMessage(`You${guestText} have successfully joined "${selectedEvent.title}"!`);
      setShowSuccessDialog(true);
    } catch (error: any) {
      console.error('Error joining event:', error);
      
      // Revert optimistic update on error
      fetchEvents();
      
      setMessage(error.message || 'Failed to join event');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setActionLoading(null);
      setSelectedEvent(null);
      setSelectedGuests(new Set());
    }
  };

  const handleJoinEvent = async (eventId: string, eventTitle: string) => {
    // If secretary has linked guests, show guest selection dialog
    if (linkedGuests.length > 0) {
      openGuestDialog(eventId, eventTitle);
    } else {
      // No guests, join directly
      if (!user) return;

      try {
        setActionLoading(eventId);

        // Optimistic UI update
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
            playerName: user.displayName || user.email?.split('@')[0] || 'Player',
            playerEmail: user.email || '',
            playerType: 'regular',
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

      // Count how many will be removed (parent + their guests in this event)
      const participantsRef = collection(db, 'eventParticipants');
      const myParticipantsQuery = query(
        participantsRef,
        where('eventId', '==', selectedEvent.id),
        where('currentStatus', '==', 'joined')
      );
      const myParticipantsSnapshot = await getDocs(myParticipantsQuery);

      let toRemoveCount = 0;
      const toRemoveIds: string[] = [];

      myParticipantsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Remove parent and their guests
        if (data.playerId === user.uid || data.parentId === user.uid) {
          toRemoveCount++;
          toRemoveIds.push(docSnap.id);
        }
      });

      // Optimistic UI update
      setEvents(prev => prev.map(e => 
        e.id === selectedEvent.id 
          ? { ...e, participantCount: Math.max(e.participantCount - toRemoveCount, 0) }
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

        // Delete all participant records (parent + guests)
        toRemoveIds.forEach((docId) => {
          transaction.delete(doc(db, 'eventParticipants', docId));
        });

        const newParticipantCount = Math.max((eventData.participantCount || toRemoveCount) - toRemoveCount, 0);
        transaction.update(eventRef, {
          participantCount: newParticipantCount,
        });
      });

      // Show success dialog
      const guestText = toRemoveCount > 1 ? ` and ${toRemoveCount - 1} guest${toRemoveCount > 2 ? 's' : ''}` : '';
      setSuccessMessage(`You${guestText} have successfully left "${selectedEvent.title}"`);
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

  if (loading || !user || role !== 'secretary') {
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
      {/* Guest Selection Dialog */}
      {showGuestDialog && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 animate-slideUp max-h-[90vh] overflow-y-auto">
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                Select Participants
              </h3>
              <p className="text-sm text-gray-600 break-words">
                Joining: <span className="font-semibold">{selectedEvent.title}</span>
              </p>
            </div>

            {/* Parent (always selected) */}
            <div className="mb-4">
              <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-red-600 bg-red-50">
                <div className="w-5 h-5 bg-red-600 border-red-600 rounded border-2 flex-shrink-0 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    Myself ({user.displayName || 'You'})
                  </p>
                  <p className="text-xs text-gray-600">Required</p>
                </div>
              </div>
            </div>

            {/* Guest Players */}
            {linkedGuests.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-700 mb-3">Your Linked Players:</p>
                <div className="space-y-2">
                  {linkedGuests.map((guest) => (
                    <div
                      key={guest.guestId}
                      onClick={() => toggleGuest(guest.guestId)}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedGuests.has(guest.guestId)
                          ? 'border-red-600 bg-red-50'
                          : 'border-gray-200 hover:border-red-300 bg-white'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                          selectedGuests.has(guest.guestId)
                            ? 'bg-red-600 border-red-600'
                            : 'border-gray-300'
                        }`}
                      >
                        {selectedGuests.has(guest.guestId) && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">{guest.guestName}</p>
                        <p className="text-xs text-gray-600">Guest Player</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 mb-6 rounded-lg">
              <p className="text-sm text-blue-800">
                <span className="font-semibold">Total: {1 + selectedGuests.size} participant{1 + selectedGuests.size > 1 ? 's' : ''}</span>
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleJoinEventWithGuests}
                disabled={actionLoading === selectedEvent.id}
                className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === selectedEvent.id ? 'Joining...' : `Join with ${1 + selectedGuests.size} participant${1 + selectedGuests.size > 1 ? 's' : ''}`}
              </button>
              <button
                onClick={closeGuestDialog}
                disabled={actionLoading === selectedEvent.id}
                className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
              {linkedGuests.length > 0 && (
                <p className="text-xs text-orange-600 mt-2">
                  This will also remove any guests you joined with
                </p>
              )}
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

                  {/* Event Details - Updated with new financial data */}
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

                    <button
                      onClick={() => router.push(`/secretary/event-participants/${event.id}`)}
                      className="flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-2.5 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-lg border border-gray-200 transition-colors cursor-pointer flex items-center justify-center gap-2 text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span>Participants</span>
                      <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs font-bold">
                        {event.participantCount}
                      </span>
                    </button>

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
