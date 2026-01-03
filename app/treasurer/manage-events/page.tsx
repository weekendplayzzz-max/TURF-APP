'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, Timestamp, query, orderBy } from 'firebase/firestore';
import {
  calculatePerPlayerAmount,
  closeEventHelper,
  reopenEventHelper,
  recalculatePayments,
  checkAndAutoCloseEvents,
  fetchParticipantCounts,
} from '@/lib/eventManagement';

interface EventEditHistory {
  action: 'title_updated' | 'amount_updated' | 'duration_updated' | 'player_added';
  oldValue: string | number;
  newValue: string | number;
  editedBy: string;
  editedByRole: string;
  editedAt: Timestamp;
  recalculationTriggered: boolean;
}

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
  teamFund: number;
  createdBy: string;
  createdByRole: string;
  createdAt: Timestamp;
  editHistory?: EventEditHistory[];
}

export default function ManageEvents() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed' | 'past'>('all');
  const [message, setMessage] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    totalAmount: '',
    durationHours: '',
  });

  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  const fetchEvents = useCallback(async () => {
    try {
      setLoadingData(true);
      await checkAndAutoCloseEvents();

      const eventsRef = collection(db, 'events');
      const eventsQuery = query(eventsRef, orderBy('date', 'desc'));
      const eventsSnapshot = await getDocs(eventsQuery);

      const participantCounts = await fetchParticipantCounts();

      const eventsList: Event[] = [];
      eventsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const eventId = docSnap.id;
        
        eventsList.push({
          id: eventId,
          title: data.title,
          date: data.date,
          time: data.time,
          totalAmount: data.totalAmount,
          durationHours: data.durationHours,
          deadline: data.deadline,
          status: data.status,
          participantCount: participantCounts[eventId] || 0,
          teamFund: data.teamFund || 0,
          createdBy: data.createdBy,
          createdByRole: data.createdByRole,
          createdAt: data.createdAt,
          editHistory: data.editHistory || [],
        });
      });

      setEvents(eventsList);
      applyFilter(eventsList, filter);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoadingData(false);
    }
  }, [filter]);

  const applyFilter = (eventsList: Event[], filterType: string) => {
    const now = new Date();
    let filtered = eventsList;

    if (filterType === 'open') {
      filtered = eventsList.filter((e) => e.status === 'open');
    } else if (filterType === 'closed') {
      filtered = eventsList.filter((e) => e.status === 'closed');
    } else if (filterType === 'past') {
      filtered = eventsList.filter((e) => e.date.toDate() < now);
    }

    setFilteredEvents(filtered);
  };

  useEffect(() => {
    if (role === 'treasurer') {
      fetchEvents();
    }
  }, [role, fetchEvents]);

  useEffect(() => {
    applyFilter(events, filter);
  }, [filter, events]);

  const closeEvent = async (eventId: string, isAutoClose = false) => {
    if (!isAutoClose && !confirm('Close this event? Players can no longer join/leave.')) {
      return;
    }

    try {
      await closeEventHelper(eventId, events);

      if (!isAutoClose) {
        setMessage('✅ Event closed successfully');
        setTimeout(() => {
          fetchEvents();
          setMessage('');
        }, 1500);
      }
    } catch (error) {
      console.error('Error closing event:', error);
      if (!isAutoClose) {
        setMessage('❌ Failed to close event');
        setTimeout(() => setMessage(''), 3000);
      }
    }
  };

  const reopenEvent = async (eventId: string) => {
    if (!confirm('Reopen this event? Players will be able to join/leave again until the deadline.')) {
      return;
    }

    try {
      await reopenEventHelper(eventId);
      setMessage('✅ Event reopened successfully');
      setTimeout(() => {
        fetchEvents();
        setMessage('');
      }, 1500);
    } catch (error) {
      console.error('Error reopening event:', error);
      setMessage('❌ Failed to reopen event');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const openEditModal = (event: Event) => {
    if (event.status === 'locked') {
      setMessage('❌ Cannot edit locked events');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setSelectedEvent(event);
    setEditForm({
      title: event.title,
      totalAmount: event.totalAmount.toString(),
      durationHours: event.durationHours.toString(),
    });
    setShowEditModal(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedEvent || !user) return;

    try {
      const eventDoc = doc(db, 'events', selectedEvent.id);
      const updates: Partial<Event> & { lastEditedAt: Timestamp } = {
        lastEditedAt: Timestamp.now(),
      };

      const editHistory: EventEditHistory[] = [];

      if (editForm.title !== selectedEvent.title) {
        updates.title = editForm.title;
        editHistory.push({
          action: 'title_updated',
          oldValue: selectedEvent.title,
          newValue: editForm.title,
          editedBy: user.uid,
          editedByRole: 'treasurer',
          editedAt: Timestamp.now(),
          recalculationTriggered: false,
        });
      }

      if (parseFloat(editForm.totalAmount) !== selectedEvent.totalAmount) {
        updates.totalAmount = parseFloat(editForm.totalAmount);
        editHistory.push({
          action: 'amount_updated',
          oldValue: selectedEvent.totalAmount,
          newValue: parseFloat(editForm.totalAmount),
          editedBy: user.uid,
          editedByRole: 'treasurer',
          editedAt: Timestamp.now(),
          recalculationTriggered: selectedEvent.status === 'closed',
        });
      }

      if (parseFloat(editForm.durationHours) !== selectedEvent.durationHours) {
        updates.durationHours = parseFloat(editForm.durationHours);
        editHistory.push({
          action: 'duration_updated',
          oldValue: selectedEvent.durationHours,
          newValue: parseFloat(editForm.durationHours),
          editedBy: user.uid,
          editedByRole: 'treasurer',
          editedAt: Timestamp.now(),
          recalculationTriggered: false,
        });
      }

      if (editHistory.length > 0) {
        const existingHistory = selectedEvent.editHistory || [];
        await updateDoc(eventDoc, {
          ...updates,
          editHistory: [...existingHistory, ...editHistory],
        });
      } else {
        await updateDoc(eventDoc, updates);
      }

      if (selectedEvent.status === 'closed' && parseFloat(editForm.totalAmount) !== selectedEvent.totalAmount) {
        await recalculatePayments(selectedEvent.id, parseFloat(editForm.totalAmount), selectedEvent.participantCount);
      }

      setMessage('✅ Event updated successfully');
      setShowEditModal(false);
      setTimeout(() => {
        fetchEvents();
        setMessage('');
      }, 1500);
    } catch (error) {
      console.error('Error updating event:', error);
      setMessage('❌ Failed to update event');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const viewParticipants = (eventId: string) => {
    router.push(`/treasurer/event-participants/${eventId}`);
  };

  if (loading || !user || role !== 'treasurer') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">📊 Manage Events</h1>
              <p className="text-blue-100 text-base">View and manage all turf events</p>
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

        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => setFilter('all')}
              className={`px-6 py-3 font-semibold rounded-lg transition ${
                filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All Events ({events.length})
            </button>
            <button
              onClick={() => setFilter('open')}
              className={`px-6 py-3 font-semibold rounded-lg transition ${
                filter === 'open' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              🟢 Open ({events.filter((e) => e.status === 'open').length})
            </button>
            <button
              onClick={() => setFilter('closed')}
              className={`px-6 py-3 font-semibold rounded-lg transition ${
                filter === 'closed' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              🔴 Closed ({events.filter((e) => e.status === 'closed').length})
            </button>
            <button
              onClick={() => setFilter('past')}
              className={`px-6 py-3 font-semibold rounded-lg transition ${
                filter === 'past' ? 'bg-gray-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              ⚫ Past ({events.filter((e) => e.date.toDate() < new Date()).length})
            </button>
          </div>
        </div>

        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 text-lg font-medium">Loading events...</p>
            </div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-white p-12 rounded-xl text-center shadow-lg border border-gray-200">
            <div className="text-6xl mb-4">📅</div>
            <p className="text-xl text-gray-600 font-semibold">No events found</p>
            <p className="text-gray-500 mt-2">Create your first event to get started</p>
            <button
              onClick={() => router.push('/treasurer/create-event')}
              className="mt-6 px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition"
            >
              + Create Event
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {filteredEvents.map((event) => {
              const eventDate = event.date.toDate();
              const statusColor =
                event.status === 'open'
                  ? 'bg-green-100 text-green-800 border-green-300'
                  : event.status === 'closed'
                  ? 'bg-red-100 text-red-800 border-red-300'
                  : 'bg-gray-100 text-gray-800 border-gray-300';

              return (
                <div
                  key={event.id}
                  className="bg-white rounded-xl shadow-lg border-l-4 border-blue-600 p-6 hover:shadow-xl transition"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">{event.title}</h3>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        <span>📅 {eventDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <span>⏰ {event.time}</span>
                        <span>⏱️ {event.durationHours} hours</span>
                        <span>💰 ₹{event.totalAmount.toLocaleString()}</span>
                      </div>
                    </div>
                    <span className={`px-4 py-2 rounded-full text-sm font-bold border-2 ${statusColor}`}>
                      {event.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div>
                        <p className="text-xs text-gray-600">Players</p>
                        <p className="text-xl font-bold text-blue-600">{event.participantCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Per Player</p>
                        <p className="text-xl font-bold text-green-600">
                          {event.status === 'open' 
                            ? '—' 
                            : event.participantCount > 0
                              ? `₹${calculatePerPlayerAmount(event.totalAmount, event.participantCount)}`
                              : '₹0'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Team Fund</p>
                        <p className="text-xl font-bold text-green-600">₹{event.teamFund}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Created By</p>
                        <p className="text-sm font-semibold text-gray-700 capitalize">{event.createdByRole}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {event.status === 'open' && (
                      <button onClick={() => closeEvent(event.id)} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition">
                        🔒 Close Event
                      </button>
                    )}
                    {event.status === 'closed' && event.deadline.toDate() > new Date() && (
                      <button onClick={() => reopenEvent(event.id)} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition">
                        🔓 Reopen Event
                      </button>
                    )}
                    {event.status !== 'locked' && (
                      <button onClick={() => openEditModal(event)} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition">
                        ✏️ Edit
                      </button>
                    )}
                    <button onClick={() => viewParticipants(event.id)} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition">
                      👥 View Participants
                    </button>
                    {event.status === 'closed' && (
                      <button onClick={() => router.push(`/treasurer/add-players/${event.id}`)} className="px-4 py-2 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 transition">
                        ➕ Add Players
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showEditModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Edit Event</h2>
            <form onSubmit={handleEdit} className="space-y-6">
              <div>
                <label className="block text-gray-700 font-bold mb-2">Event Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-2">Total Amount (₹)</label>
                <input
                  type="number"
                  value={editForm.totalAmount}
                  onChange={(e) => setEditForm({ ...editForm, totalAmount: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  min="0"
                  step="10"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-2">Duration (Hours)</label>
                <input
                  type="number"
                  value={editForm.durationHours}
                  onChange={(e) => setEditForm({ ...editForm, durationHours: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  min="0.5"
                  step="0.5"
                  required
                />
              </div>

              <div className="flex gap-4">
                <button type="submit" className="flex-1 px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition">
                  ✓ Save Changes
                </button>
                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 px-6 py-3 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400 transition">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
