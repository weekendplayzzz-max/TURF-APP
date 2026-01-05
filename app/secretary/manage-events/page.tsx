'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { collection, getDocs, doc, updateDoc, deleteDoc, Timestamp, query, orderBy, where } from 'firebase/firestore';
import {
  calculatePerPlayerAmount,
  closeEventHelper,
  reopenEventHelper,
  recalculatePayments,
  checkAndAutoCloseEvents,
  fetchParticipantCounts,
  updateEventTotalCollected,
} from '@/lib/eventManagement';

// Import shared types instead of defining them here
import type { Event, EventEditHistory } from '@/lib/eventManagement';

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
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [refreshingEvent, setRefreshingEvent] = useState<string | null>(null);
  const [eventToClose, setEventToClose] = useState<Event | null>(null);
  const [eventToReopen, setEventToReopen] = useState<Event | null>(null);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    totalAmount: '',
    durationHours: '',
    date: '',
    time: '',
    deadlineDate: '',
    deadlineTime: '',
  });

  useEffect(() => {
    if (!loading && role !== 'secretary') {
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
        const liveCount = participantCounts[eventId] || 0;
        
        eventsList.push({
          id: eventId,
          title: data.title,
          date: data.date,
          time: data.time,
          totalAmount: data.totalAmount,
          durationHours: data.durationHours,
          deadline: data.deadline,
          status: data.status,
          participantCount: data.participantCount || 0,
          liveParticipantCount: liveCount,
          totalCollected: data.totalCollected || 0,
          eventPaidToVendor: data.eventPaidToVendor || false,
          eventPaidAt: data.eventPaidAt || null,
          eventPaidBy: data.eventPaidBy || null,
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

  const refreshSingleEvent = async (eventId: string) => {
    try {
      setRefreshingEvent(eventId);

      const participantsRef = collection(db, 'eventParticipants');
      const participantQuery = query(
        participantsRef,
        where('eventId', '==', eventId),
        where('currentStatus', '==', 'joined')
      );
      const participantSnapshot = await getDocs(participantQuery);
      const liveCount = participantSnapshot.size;

      setEvents((prevEvents) =>
        prevEvents.map((event) =>
          event.id === eventId
            ? { ...event, liveParticipantCount: liveCount }
            : event
        )
      );

      setFilteredEvents((prevEvents) =>
        prevEvents.map((event) =>
          event.id === eventId
            ? { ...event, liveParticipantCount: liveCount }
            : event
        )
      );

      setMessage('Count updated!');
      setTimeout(() => setMessage(''), 1500);
    } catch (error) {
      console.error('Error refreshing event:', error);
      setMessage('Failed to refresh');
      setTimeout(() => setMessage(''), 2000);
    } finally {
      setRefreshingEvent(null);
    }
  };

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
    if (role === 'secretary') {
      fetchEvents();
    }
  }, [role, fetchEvents]);

  useEffect(() => {
    applyFilter(events, filter);
  }, [filter, events]);

  const openCloseDialog = (event: Event) => {
    setEventToClose(event);
    setShowCloseDialog(true);
  };

  const confirmClose = async () => {
    if (!eventToClose) return;

    try {
      setShowCloseDialog(false);
      await closeEventHelper(eventToClose.id, events);
      setSuccessMessage(`Event "${eventToClose.title}" closed successfully!`);
      setShowSuccessDialog(true);
      await fetchEvents();
    } catch (error) {
      console.error('Error closing event:', error);
      setMessage('Failed to close event');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setEventToClose(null);
    }
  };

  const openReopenDialog = (event: Event) => {
    setEventToReopen(event);
    setShowReopenDialog(true);
  };

  const confirmReopen = async () => {
    if (!eventToReopen) return;

    try {
      setShowReopenDialog(false);
      await reopenEventHelper(eventToReopen.id);
      setSuccessMessage(`Event "${eventToReopen.title}" reopened successfully!`);
      setShowSuccessDialog(true);
      await fetchEvents();
    } catch (error) {
      console.error('Error reopening event:', error);
      setMessage('Failed to reopen event');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setEventToReopen(null);
    }
  };

  const openDeleteDialog = (event: Event) => {
    setEventToDelete(event);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!eventToDelete) return;

    try {
      setDeletingEvent(true);
      setShowDeleteDialog(false);

      // Delete all event participants
      const participantsRef = collection(db, 'eventParticipants');
      const participantsQuery = query(participantsRef, where('eventId', '==', eventToDelete.id));
      const participantsSnapshot = await getDocs(participantsQuery);
      
      const participantDeletePromises = participantsSnapshot.docs.map((docSnap) => 
        deleteDoc(doc(db, 'eventParticipants', docSnap.id))
      );
      await Promise.all(participantDeletePromises);

      // Delete all event expenses (eventExpenses collection)
      const eventExpensesRef = collection(db, 'eventExpenses');
      const eventExpensesQuery = query(eventExpensesRef, where('eventId', '==', eventToDelete.id));
      const eventExpensesSnapshot = await getDocs(eventExpensesQuery);
      
      const eventExpenseDeletePromises = eventExpensesSnapshot.docs.map((docSnap) => 
        deleteDoc(doc(db, 'eventExpenses', docSnap.id))
      );
      await Promise.all(eventExpenseDeletePromises);

      // Delete from expenses collection (where expense is related to this event payment)
      const expensesRef = collection(db, 'expenses');
      const expensesQuery = query(expensesRef, where('eventId', '==', eventToDelete.id));
      const expensesSnapshot = await getDocs(expensesQuery);
      
      const expenseDeletePromises = expensesSnapshot.docs.map((docSnap) => 
        deleteDoc(doc(db, 'expenses', docSnap.id))
      );
      await Promise.all(expenseDeletePromises);

      // Delete the event itself
      await deleteDoc(doc(db, 'events', eventToDelete.id));

      setSuccessMessage(`Event "${eventToDelete.title}" and all its data deleted successfully!`);
      setShowSuccessDialog(true);
      await fetchEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      setMessage('Failed to delete event');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setEventToDelete(null);
      setDeletingEvent(false);
    }
  };

  const openEditModal = (event: Event) => {
    setSelectedEvent(event);
    
    const eventDate = event.date.toDate();
    const deadlineDate = event.deadline.toDate();
    
    setEditForm({
      title: event.title,
      totalAmount: event.totalAmount.toString(),
      durationHours: event.durationHours.toString(),
      date: eventDate.toISOString().split('T')[0],
      time: event.time,
      deadlineDate: deadlineDate.toISOString().split('T')[0],
      deadlineTime: deadlineDate.toTimeString().slice(0, 5),
    });
    setShowEditModal(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedEvent || !user) return;

    try {
      const eventDoc = doc(db, 'events', selectedEvent.id);
      const updates: any = {
        lastEditedAt: Timestamp.now(),
      };

      const editHistory: EventEditHistory[] = [];

      // Title change
      if (editForm.title !== selectedEvent.title) {
        updates.title = editForm.title;
        editHistory.push({
          action: 'title_updated',
          oldValue: selectedEvent.title,
          newValue: editForm.title,
          editedBy: user.uid,
          editedByRole: 'secretary',
          editedAt: Timestamp.now(),
          recalculationTriggered: false,
        });
      }

      // Amount change
      if (parseFloat(editForm.totalAmount) !== selectedEvent.totalAmount) {
        updates.totalAmount = parseFloat(editForm.totalAmount);
        editHistory.push({
          action: 'amount_updated',
          oldValue: selectedEvent.totalAmount,
          newValue: parseFloat(editForm.totalAmount),
          editedBy: user.uid,
          editedByRole: 'secretary',
          editedAt: Timestamp.now(),
          recalculationTriggered: selectedEvent.status === 'closed' || selectedEvent.status === 'locked',
        });
      }

      // Duration change
      if (parseFloat(editForm.durationHours) !== selectedEvent.durationHours) {
        updates.durationHours = parseFloat(editForm.durationHours);
        editHistory.push({
          action: 'duration_updated',
          oldValue: selectedEvent.durationHours,
          newValue: parseFloat(editForm.durationHours),
          editedBy: user.uid,
          editedByRole: 'secretary',
          editedAt: Timestamp.now(),
          recalculationTriggered: false,
        });
      }

      // Date change
      const newEventDateTime = new Date(`${editForm.date}T${editForm.time}`);
      const oldEventDateTime = selectedEvent.date.toDate();
      if (newEventDateTime.getTime() !== oldEventDateTime.getTime()) {
        updates.date = Timestamp.fromDate(newEventDateTime);
        updates.time = editForm.time;
        editHistory.push({
          action: 'date_updated',
          oldValue: oldEventDateTime.toISOString(),
          newValue: newEventDateTime.toISOString(),
          editedBy: user.uid,
          editedByRole: 'secretary',
          editedAt: Timestamp.now(),
          recalculationTriggered: false,
        });
      }

      // Deadline change
      const newDeadlineDateTime = new Date(`${editForm.deadlineDate}T${editForm.deadlineTime}`);
      const oldDeadlineDateTime = selectedEvent.deadline.toDate();
      if (newDeadlineDateTime.getTime() !== oldDeadlineDateTime.getTime()) {
        updates.deadline = Timestamp.fromDate(newDeadlineDateTime);
        editHistory.push({
          action: 'deadline_extended',
          oldValue: oldDeadlineDateTime.toISOString(),
          newValue: newDeadlineDateTime.toISOString(),
          editedBy: user.uid,
          editedByRole: 'secretary',
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

      // Recalculate payments if amount changed and event is closed or locked
      if ((selectedEvent.status === 'closed' || selectedEvent.status === 'locked') && 
          parseFloat(editForm.totalAmount) !== selectedEvent.totalAmount) {
        await recalculatePayments(selectedEvent.id, parseFloat(editForm.totalAmount), selectedEvent.participantCount);
        // Update totalCollected after recalculation
        await updateEventTotalCollected(selectedEvent.id);
      }

      setShowEditModal(false);
      setSuccessMessage(`Event "${editForm.title}" updated successfully!`);
      setShowSuccessDialog(true);
      await fetchEvents();
    } catch (error) {
      console.error('Error updating event:', error);
      setMessage('Failed to update event');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const viewParticipants = (eventId: string) => {
    router.push(`/secretary/event-participants/${eventId}`);
  };

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
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
                Manage Turf
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                View and manage all Turf
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-10">
        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg border-l-4 ${
            message.includes('successfully') || message.includes('updated')
              ? 'bg-green-50 border-green-500 text-green-800'
              : 'bg-red-50 border-red-500 text-red-800'
          }`}>
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-3 sm:p-4 md:p-6 mb-6">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 font-semibold rounded-lg transition-all duration-200 text-xs sm:text-sm md:text-base ${
                filter === 'all' ? 'bg-red-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({events.length})
            </button>
            <button
              onClick={() => setFilter('open')}
              className={`px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 font-semibold rounded-lg transition-all duration-200 text-xs sm:text-sm md:text-base ${
                filter === 'open' ? 'bg-red-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Open ({events.filter((e) => e.status === 'open').length})
            </button>
            <button
              onClick={() => setFilter('closed')}
              className={`px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 font-semibold rounded-lg transition-all duration-200 text-xs sm:text-sm md:text-base ${
                filter === 'closed' ? 'bg-red-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Closed ({events.filter((e) => e.status === 'closed').length})
            </button>
            <button
              onClick={() => setFilter('past')}
              className={`px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 font-semibold rounded-lg transition-all duration-200 text-xs sm:text-sm md:text-base ${
                filter === 'past' ? 'bg-red-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Past ({events.filter((e) => e.date.toDate() < new Date()).length})
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
              <p className="text-base text-gray-700 font-medium">Loading Turf...</p>
            </div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900 mb-2">No turf found</p>
            <p className="text-sm sm:text-base text-gray-600 mb-6">Create your first turf to get started</p>
            <button
              onClick={() => router.push('/secretary/create-event')}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Create Event
            </button>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {filteredEvents.map((event) => {
              const eventDate = event.date.toDate();
              
              const displayCount = event.status === 'open' 
                ? event.liveParticipantCount || 0 
                : event.participantCount;

              const perPlayerAmount = displayCount > 0 
                ? calculatePerPlayerAmount(event.totalAmount, displayCount)
                : 0;
              
              const expectedTotal = perPlayerAmount * displayCount;
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
                        {event.status === 'open' && (
                          <button
                            onClick={() => refreshSingleEvent(event.id)}
                            disabled={refreshingEvent === event.id}
                            className="flex-shrink-0 px-2 sm:px-3 py-1 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            title="Refresh participant count"
                          >
                            {refreshingEvent === event.id ? (
                              <>
                                <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span className="hidden sm:inline">Refreshing...</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span className="hidden sm:inline">Refresh</span>
                              </>
                            )}
                          </button>
                        )}
                        {event.eventPaidToVendor && (
                          <span className="px-2 sm:px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full border border-green-300">
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

                  {/* Event Stats - Updated with new financial data */}
                  <div className="bg-gray-50 rounded-xl p-3 sm:p-4 mb-4 border border-gray-200">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 text-center">
                      <div>
                        <p className="text-xs text-gray-600 mb-1">
                          {event.status === 'open' ? 'Players (LIVE)' : 'Players'}
                        </p>
                        <p className="text-lg sm:text-xl font-bold text-gray-900 flex items-center justify-center gap-2">
                          {displayCount}
                          {event.status === 'open' && displayCount > 0 && (
                            <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Per Player</p>
                        <p className="text-lg sm:text-xl font-bold text-red-600">
                          {event.status === 'open' 
                            ? (displayCount > 0 ? `~₹${perPlayerAmount}` : '—')
                            : perPlayerAmount > 0
                              ? `₹${perPlayerAmount}`
                              : '₹0'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Expected</p>
                        <p className="text-lg sm:text-xl font-bold text-purple-600">
                          {event.status === 'open' 
                            ? (displayCount > 0 ? `~₹${expectedTotal.toLocaleString()}` : '—')
                            : `₹${expectedTotal.toLocaleString()}`}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Collected</p>
                        <p className="text-lg sm:text-xl font-bold text-green-600">
                          ₹{event.totalCollected.toLocaleString()}
                        </p>
                        {event.status === 'closed' && displayCount > 0 && (
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
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    {event.status === 'open' && (
                      <button 
                        onClick={() => openCloseDialog(event)} 
                        className="flex-1 sm:flex-none px-4 sm:px-5 py-2 sm:py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors cursor-pointer text-xs sm:text-sm"
                      >
                        Close ({displayCount})
                      </button>
                    )}
                    {event.status === 'closed' && (
                      <button 
                        onClick={() => openReopenDialog(event)} 
                        className="flex-1 sm:flex-none px-4 sm:px-5 py-2 sm:py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors cursor-pointer text-xs sm:text-sm"
                      >
                        Reopen
                      </button>
                    )}
                    <button 
                      onClick={() => openEditModal(event)} 
                      className="flex-1 sm:flex-none px-4 sm:px-5 py-2 sm:py-2.5 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-lg border border-gray-200 transition-colors cursor-pointer text-xs sm:text-sm"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => viewParticipants(event.id)} 
                      className="flex-1 sm:flex-none px-4 sm:px-5 py-2 sm:py-2.5 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-lg border border-gray-200 transition-colors cursor-pointer text-xs sm:text-sm flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span className="hidden xs:inline">Participants</span>
                      <span className="xs:hidden">({displayCount})</span>
                      <span className="hidden xs:inline px-2 py-0.5 bg-gray-100 rounded-full text-xs font-bold">
                        {displayCount}
                      </span>
                    </button>
                    {(event.status === 'closed' || event.status === 'locked') && (
                      <button 
                        onClick={() => router.push(`/secretary/add-players/${event.id}`)} 
                        className="flex-1 sm:flex-none px-4 sm:px-5 py-2 sm:py-2.5 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-lg border border-gray-200 transition-colors cursor-pointer text-xs sm:text-sm"
                      >
                        Add Players
                      </button>
                    )}
                    {/* DELETE BUTTON */}
                    <button 
                      onClick={() => openDeleteDialog(event)} 
                      className="flex-1 sm:flex-none px-4 sm:px-5 py-2 sm:py-2.5 bg-white hover:bg-red-50 text-red-600 font-semibold rounded-lg border-2 border-red-600 transition-colors cursor-pointer text-xs sm:text-sm flex items-center justify-center gap-2"
                      title="Delete Event"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Close Dialog */}
      {showCloseDialog && eventToClose && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 animate-scale-in">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-2">
              Close Event?
            </h3>
            <p className="text-sm text-gray-600 text-center mb-4 font-medium">
              {eventToClose.title}
            </p>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800 font-semibold mb-2">⚠️ This will:</p>
              <ul className="text-xs text-red-700 space-y-1 ml-4">
                <li className="flex items-start gap-2">
                  <span className="font-bold flex-shrink-0">•</span>
                  <span>Lock registrations (no more join/leave)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold flex-shrink-0">•</span>
                  <span>Finalize participant count at {eventToClose.liveParticipantCount || 0} players</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold flex-shrink-0">•</span>
                  <span>Calculate final payment amounts</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={confirmClose}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Yes, Close Event
              </button>
              <button
                onClick={() => {
                  setShowCloseDialog(false);
                  setEventToClose(null);
                }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Dialog */}
      {showReopenDialog && eventToReopen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 animate-scale-in">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              </div>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-2">
              Reopen Event?
            </h3>
            <p className="text-sm text-gray-600 text-center mb-4 font-medium">
              {eventToReopen.title}
            </p>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-green-800 font-semibold mb-2">✓ This will:</p>
              <ul className="text-xs text-green-700 space-y-1 ml-4">
                <li className="flex items-start gap-2">
                  <span className="font-bold flex-shrink-0">•</span>
                  <span>Allow players to join/leave again</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold flex-shrink-0">•</span>
                  <span>Reset payment calculations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold flex-shrink-0">•</span>
                  <span>Extend registration until deadline</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={confirmReopen}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Yes, Reopen Event
              </button>
              <button
                onClick={() => {
                  setShowReopenDialog(false);
                  setEventToReopen(null);
                }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {showDeleteDialog && eventToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 animate-scale-in">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-2">
              Delete Event?
            </h3>
            <p className="text-sm text-gray-600 text-center mb-4 font-medium">
              {eventToDelete.title}
            </p>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800 font-semibold mb-2">⚠️ This action cannot be undone!</p>
              <p className="text-xs text-red-700 mb-3">This will permanently delete:</p>
              <ul className="text-xs text-red-700 space-y-1 ml-4">
                <li className="flex items-start gap-2">
                  <span className="font-bold flex-shrink-0">•</span>
                  <span>The event and all its details</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold flex-shrink-0">•</span>
                  <span>All {eventToDelete.participantCount} participant registrations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold flex-shrink-0">•</span>
                  <span>All associated expenses and payments</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold flex-shrink-0">•</span>
                  <span>Complete event history and edit logs</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={confirmDelete}
                disabled={deletingEvent}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingEvent ? 'Deleting...' : 'Delete Permanently'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteDialog(false);
                  setEventToDelete(null);
                }}
                disabled={deletingEvent}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Dialog */}
      {showSuccessDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 animate-scale-in">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-2">
              Success!
            </h3>
            <p className="text-sm text-gray-600 text-center mb-6">
              {successMessage}
            </p>

            <button
              onClick={() => setShowSuccessDialog(false)}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-2xl w-full p-6 sm:p-8 animate-scale-in my-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Edit Event</h2>
            <form onSubmit={handleEdit} className="space-y-5 sm:space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Event Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Turf Amount (₹)</label>
                <input
                  type="number"
                  value={editForm.totalAmount}
                  onChange={(e) => setEditForm({ ...editForm, totalAmount: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                  min="0"
                  step="10"
                  required
                />
                {(selectedEvent.status === 'closed' || selectedEvent.status === 'locked') && (
                  <p className="text-xs text-gray-500 mt-1">
                    Changing this will recalculate all payments and update totalCollected
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Duration (Hours)</label>
                <input
                  type="number"
                  value={editForm.durationHours}
                  onChange={(e) => setEditForm({ ...editForm, durationHours: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                  min="0.5"
                  step="0.5"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Event Date</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Event Time</label>
                  <input
                    type="time"
                    value={editForm.time}
                    onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Deadline Date</label>
                  <input
                    type="date"
                    value={editForm.deadlineDate}
                    onChange={(e) => setEditForm({ ...editForm, deadlineDate: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Deadline Time</label>
                  <input
                    type="time"
                    value={editForm.deadlineTime}
                    onChange={(e) => setEditForm({ ...editForm, deadlineTime: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 sm:gap-4 pt-2">
                <button 
                  type="submit" 
                  className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors text-sm sm:text-base"
                >
                  Save Changes
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowEditModal(false)} 
                  className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors text-sm sm:text-base"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Animation */}
      <style jsx>{`
        @keyframes scale-in {
          0% {
            opacity: 0;
            transform: scale(0.9);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
