'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  orderBy,
} from 'firebase/firestore';

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
  createdByRole: string;
}

export default function PlayerEvents() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [myEvents, setMyEvents] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'upcoming' | 'joined' | 'past'>('upcoming');
  const [loadingData, setLoadingData] = useState(true);
  const [message, setMessage] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && role !== 'player') {
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

      const eventsList: Event[] = [];
      eventsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        eventsList.push({
          id: docSnap.id,
          title: data.title,
          date: data.date,
          time: data.time,
          totalAmount: data.totalAmount,
          durationHours: data.durationHours,
          deadline: data.deadline,
          status: data.status,
          participantCount: data.participantCount || 0,
          createdByRole: data.createdByRole,
        });
      });

      setEvents(eventsList);

      // Fetch my participations
      const participantsRef = collection(db, 'eventParticipants');
      const myParticipantsQuery = query(
        participantsRef,
        where('playerId', '==', user.uid),
        where('currentStatus', '==', 'joined')
      );
      const myParticipantsSnapshot = await getDocs(myParticipantsQuery);

      const myEventIds = new Set<string>();
      myParticipantsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        myEventIds.add(data.eventId);
      });

      setMyEvents(myEventIds);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    if (role === 'player') {
      fetchEvents();
    }
  }, [role, fetchEvents]);

  const handleJoinEvent = async (eventId: string, eventTitle: string) => {
    if (!user) return;

    try {
      setActionLoading(eventId);

      // Create participant record
      const participantRef = doc(collection(db, 'eventParticipants'));
      await setDoc(participantRef, {
        eventId: eventId,
        playerId: user.uid,
        playerName: user.displayName || user.email?.split('@')[0] || 'Player',
        playerEmail: user.email || '',
        joinedAt: Timestamp.now(),
        currentStatus: 'joined',
      });

      setMessage(`✅ Successfully joined "${eventTitle}"!`);
      setTimeout(() => {
        fetchEvents();
        setMessage('');
      }, 1500);
    } catch (error) {
      console.error('Error joining event:', error);
      setMessage('❌ Failed to join event');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setActionLoading(null);
    }
  };

  const handleLeaveEvent = async (eventId: string, eventTitle: string) => {
    if (!user) return;

    if (!confirm(`Are you sure you want to leave "${eventTitle}"?`)) {
      return;
    }

    try {
      setActionLoading(eventId);

      // Find and delete participant record
      const participantsRef = collection(db, 'eventParticipants');
      const participantsSnapshot = await getDocs(participantsRef);

      participantsSnapshot.forEach(async (docSnap) => {
        const data = docSnap.data();
        if (data.eventId === eventId && data.playerId === user.uid) {
          await deleteDoc(doc(db, 'eventParticipants', docSnap.id));
        }
      });

      setMessage(`✅ Successfully left "${eventTitle}"`);
      setTimeout(() => {
        fetchEvents();
        setMessage('');
      }, 1500);
    } catch (error) {
      console.error('Error leaving event:', error);
      setMessage('❌ Failed to leave event');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setActionLoading(null);
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
  const newEventsCount = events.filter((e) => {
    const now = new Date();
    const eventDate = e.date.toDate();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    return eventDate >= now && e.status === 'open' && e.date.toDate() >= threeDaysAgo;
  }).length;

  if (loading || !user || role !== 'player') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">🏆 Turf Events</h1>
              <p className="text-green-100 text-base">
                Join upcoming matches and view your schedule
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="px-6 py-3 bg-white text-green-600 font-bold rounded-lg hover:bg-green-50 transition shadow-md"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Message */}
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

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => setFilter('upcoming')}
              className={`px-6 py-3 font-semibold rounded-lg transition relative ${
                filter === 'upcoming'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              🟢 Upcoming
              {newEventsCount > 0 && filter !== 'upcoming' && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                  {newEventsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilter('joined')}
              className={`px-6 py-3 font-semibold rounded-lg transition ${
                filter === 'joined'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              ✓ Joined ({myEvents.size})
            </button>
            <button
              onClick={() => setFilter('past')}
              className={`px-6 py-3 font-semibold rounded-lg transition ${
                filter === 'past'
                  ? 'bg-gray-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              ⚫ Past Events
            </button>
          </div>
        </div>

        {/* Events List */}
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-green-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 text-lg font-medium">Loading events...</p>
            </div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-white p-12 rounded-xl text-center shadow-lg border border-gray-200">
            <div className="text-6xl mb-4">📅</div>
            <p className="text-xl text-gray-600 font-semibold">
              {filter === 'upcoming'
                ? 'No upcoming events'
                : filter === 'joined'
                ? "You haven't joined any events yet"
                : 'No past events'}
            </p>
            <p className="text-gray-500 mt-2">
              {filter === 'upcoming'
                ? 'Check back later for new matches'
                : filter === 'joined'
                ? 'Join an upcoming event to get started'
                : 'Your event history will appear here'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {filteredEvents.map((event) => {
              const eventDate = event.date.toDate();
              const deadlineDate = event.deadline.toDate();
              const now = new Date();
              const isDeadlinePassed = deadlineDate <= now;
              const isEventPast = eventDate < now;
              const hasJoined = myEvents.has(event.id);
              const canJoinLeave = event.status === 'open' && !isDeadlinePassed;

              const statusColor =
                event.status === 'open'
                  ? 'bg-green-100 text-green-800 border-green-300'
                  : event.status === 'closed'
                  ? 'bg-red-100 text-red-800 border-red-300'
                  : 'bg-gray-100 text-gray-800 border-gray-300';

              return (
                <div
                  key={event.id}
                  className={`bg-white rounded-xl shadow-lg border-l-4 p-6 hover:shadow-xl transition ${
                    hasJoined ? 'border-green-600' : 'border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-2xl font-bold text-gray-900">
                          {event.title}
                        </h3>
                        {hasJoined && (
                          <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full border border-green-300">
                            ✓ JOINED
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        <span className="flex items-center">
                          📅 {eventDate.toLocaleDateString('en-IN', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                        <span className="flex items-center">
                          ⏰ {event.time}
                        </span>
                        <span className="flex items-center">
                          ⏱️ {event.durationHours} hours
                        </span>
                        <span className="flex items-center">
                          💰 ₹{event.totalAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-4 py-2 rounded-full text-sm font-bold border-2 ${statusColor}`}
                    >
                      {event.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-gray-600">Players Joined</p>
                        <p className="text-xl font-bold text-green-600">
                          {event.participantCount}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Deadline</p>
                        <p className="text-sm font-semibold text-gray-700">
                          {deadlineDate.toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })} {deadlineDate.toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Created By</p>
                        <p className="text-sm font-semibold text-gray-700 capitalize">
                          {event.createdByRole}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-3">
                    {canJoinLeave && !hasJoined && (
                      <button
                        onClick={() => handleJoinEvent(event.id, event.title)}
                        disabled={actionLoading === event.id}
                        className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === event.id ? '⏳ Joining...' : '✓ Join Event'}
                      </button>
                    )}
                    {canJoinLeave && hasJoined && (
                      <button
                        onClick={() => handleLeaveEvent(event.id, event.title)}
                        disabled={actionLoading === event.id}
                        className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === event.id ? '⏳ Leaving...' : '✗ Leave Event'}
                      </button>
                    )}
                    {!canJoinLeave && event.status === 'open' && isDeadlinePassed && (
                      <span className="px-6 py-2 bg-gray-200 text-gray-600 font-semibold rounded-lg cursor-not-allowed">
                        Deadline Passed
                      </span>
                    )}
                    {event.status === 'closed' && (
                      <span className="px-6 py-2 bg-red-100 text-red-800 font-semibold rounded-lg">
                        Event Closed
                      </span>
                    )}
                    {event.status === 'locked' && (
                      <span className="px-6 py-2 bg-gray-200 text-gray-600 font-semibold rounded-lg">
                        Event Completed
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
