'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import {
  collection, getDocs, doc, updateDoc,
  Timestamp, query, orderBy, where,
} from 'firebase/firestore';
import { calculatePerPlayerAmount, 
  closeEventHelper, 
  reopenEventHelper, 
  recalculatePayments, 
  checkAndAutoCloseEvents, 
  fetchParticipantCounts, 
  updateEventTotalCollected, 
  deleteEventHelper, removePlayersFromEvent, 
  type RemovePlayersResult, } from '@/lib/eventManagement'
import type { Event, EventEditHistory } from '@/lib/eventManagement';
interface RemoveParticipant {
  id: string
  playerId: string
  playerName: string
  playerEmail: string
  isPaid: boolean
  playerType: string
}

export default function ManageEvents() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [events,          setEvents]          = useState<Event[]>([]);
  const [filteredEvents,  setFilteredEvents]  = useState<Event[]>([]);
  const [loadingData,     setLoadingData]     = useState(true);
  const [filter,          setFilter]          = useState<'all'|'open'|'closed'|'past'>('all');
  const [message,         setMessage]         = useState('');
  const [selectedEvent,   setSelectedEvent]   = useState<Event | null>(null);
  const [refreshingEvent, setRefreshingEvent] = useState<string | null>(null);

  // Dialogs
  const [showEditModal,     setShowEditModal]     = useState(false);
  const [showCloseDialog,   setShowCloseDialog]   = useState(false);
  const [showReopenDialog,  setShowReopenDialog]  = useState(false);
  const [showDeleteDialog,  setShowDeleteDialog]  = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage,    setSuccessMessage]    = useState('');
  const [eventToClose,      setEventToClose]      = useState<Event | null>(null);
  const [eventToReopen,     setEventToReopen]     = useState<Event | null>(null);
  const [eventToDelete,     setEventToDelete]     = useState<Event | null>(null);
  const [deletingEvent,     setDeletingEvent]     = useState(false);

  const [editForm, setEditForm] = useState({
    title: '', totalAmount: '', durationHours: '',
    date: '', time: '', deadlineDate: '', deadlineTime: '',
  });

  // ── Remove Players state ──
const [showRemovePlayersModal, setShowRemovePlayersModal] = useState(false)
const [eventForRemoval, setEventForRemoval] = useState<Event | null>(null)
const [participantsForRemoval, setParticipantsForRemoval] = useState<RemoveParticipant[]>([])
const [selectedForRemoval, setSelectedForRemoval] = useState<Set<string>>(new Set())
const [loadingParticipants, setLoadingParticipants] = useState(false)
const [removingPlayers, setRemovingPlayers] = useState(false)

  useEffect(() => {
    if (!loading && role !== 'secretary') router.push('/login');
  }, [role, loading, router]);

  const applyFilter = (list: Event[], f: string) => {
    const now = new Date();
    let result = list;
    if (f === 'open')   result = list.filter(e => e.status === 'open');
    if (f === 'closed') result = list.filter(e => e.status === 'closed');
    if (f === 'past')   result = list.filter(e => e.date.toDate() < now);
    setFilteredEvents(result);
  };

  const fetchEvents = useCallback(async () => {
    try {
      setLoadingData(true);
      await checkAndAutoCloseEvents();
      const snap   = await getDocs(query(collection(db, 'events'), orderBy('date', 'desc')));
      const counts = await fetchParticipantCounts();
      const list: Event[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({
          id: d.id,
          title: data.title,
          date: data.date,
          time: data.time,
          totalAmount: data.totalAmount,
          durationHours: data.durationHours,
          deadline: data.deadline,
          status: data.status,
          participantCount: data.participantCount || 0,
          liveParticipantCount: counts[d.id] || 0,
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
      setEvents(list);
      applyFilter(list, filter);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  }, [filter]);

  useEffect(() => { if (role === 'secretary') fetchEvents(); }, [role, fetchEvents]);
  useEffect(() => { applyFilter(events, filter); }, [filter, events]);

  const refreshSingleEvent = async (eventId: string) => {
    try {
      setRefreshingEvent(eventId);
      const snap = await getDocs(query(
        collection(db, 'eventParticipants'),
        where('eventId', '==', eventId),
        where('currentStatus', '==', 'joined')
      ));
      const liveCount = snap.size;
      const patch = (list: Event[]) =>
        list.map(e => e.id === eventId ? { ...e, liveParticipantCount: liveCount } : e);
      setEvents(patch);
      setFilteredEvents(patch);
      setMessage('Count updated!');
      setTimeout(() => setMessage(''), 1500);
    } catch {
      setMessage('Failed to refresh');
      setTimeout(() => setMessage(''), 2000);
    } finally {
      setRefreshingEvent(null);
    }
  };

  // ── Close ────────────────────────────────────────────────────────────────────
  const openCloseDialog   = (e: Event) => { setEventToClose(e);   setShowCloseDialog(true); };
  const confirmClose      = async () => {
    if (!eventToClose) return;
    try {
      setShowCloseDialog(false);
      await closeEventHelper(eventToClose.id, events);
      setSuccessMessage(`"${eventToClose.title}" closed successfully!`);
      setShowSuccessDialog(true);
      await fetchEvents();
    } catch { setMessage('Failed to close event'); setTimeout(() => setMessage(''), 3000); }
    finally  { setEventToClose(null); }
  };

  // ── Reopen ───────────────────────────────────────────────────────────────────
  const openReopenDialog  = (e: Event) => { setEventToReopen(e);  setShowReopenDialog(true); };
  const confirmReopen     = async () => {
    if (!eventToReopen) return;
    try {
      setShowReopenDialog(false);
      await reopenEventHelper(eventToReopen.id);
      setSuccessMessage(`"${eventToReopen.title}" reopened successfully!`);
      setShowSuccessDialog(true);
      await fetchEvents();
    } catch { setMessage('Failed to reopen event'); setTimeout(() => setMessage(''), 3000); }
    finally  { setEventToReopen(null); }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const openDeleteDialog  = (e: Event) => { setEventToDelete(e);  setShowDeleteDialog(true); };
  const confirmDelete     = async () => {
    if (!eventToDelete) return;
    try {
      setDeletingEvent(true);
      setShowDeleteDialog(false);
      const result = await deleteEventHelper(eventToDelete.id);
      if (result.success) {
        setSuccessMessage(
          `"${eventToDelete.title}" deleted!\n` +
          `Removed: ${result.deletedCounts.participants} participants, ` +
          `${result.deletedCounts.payments} payments, ` +
          `${result.deletedCounts.expenses} expenses`
        );
        setShowSuccessDialog(true);
        await fetchEvents();
      } else {
        setMessage('Failed to delete event'); setTimeout(() => setMessage(''), 3000);
      }
    } catch { setMessage('Failed to delete event'); setTimeout(() => setMessage(''), 3000); }
    finally  { setEventToDelete(null); setDeletingEvent(false); }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────────
  const openEditModal = (event: Event) => {
    setSelectedEvent(event);
    const ed = event.date.toDate();
    const dd = event.deadline.toDate();
    setEditForm({
      title:        event.title,
      totalAmount:  event.totalAmount.toString(),
      durationHours:event.durationHours.toString(),
      date:         ed.toISOString().split('T')[0],
      time:         event.time,
      deadlineDate: dd.toISOString().split('T')[0],
      deadlineTime: dd.toTimeString().slice(0, 5),
    });
    setShowEditModal(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent || !user) return;
    try {
      const eventDoc = doc(db, 'events', selectedEvent.id);
      const updates: any = { lastEditedAt: Timestamp.now() };
      const history: EventEditHistory[] = [];
      const now = Timestamp.now();

      if (editForm.title !== selectedEvent.title) {
        updates.title = editForm.title;
        history.push({ action: 'title_updated', oldValue: selectedEvent.title, newValue: editForm.title, editedBy: user.uid, editedByRole: 'secretary', editedAt: now, recalculationTriggered: false });
      }
      if (parseFloat(editForm.totalAmount) !== selectedEvent.totalAmount) {
        updates.totalAmount = parseFloat(editForm.totalAmount);
        history.push({ action: 'amount_updated', oldValue: selectedEvent.totalAmount, newValue: parseFloat(editForm.totalAmount), editedBy: user.uid, editedByRole: 'secretary', editedAt: now, recalculationTriggered: selectedEvent.status === 'closed' || selectedEvent.status === 'locked' });
      }
      if (parseFloat(editForm.durationHours) !== selectedEvent.durationHours) {
        updates.durationHours = parseFloat(editForm.durationHours);
        history.push({ action: 'duration_updated', oldValue: selectedEvent.durationHours, newValue: parseFloat(editForm.durationHours), editedBy: user.uid, editedByRole: 'secretary', editedAt: now, recalculationTriggered: false });
      }
      const newDT  = new Date(`${editForm.date}T${editForm.time}`);
      const oldDT  = selectedEvent.date.toDate();
      if (newDT.getTime() !== oldDT.getTime()) {
        updates.date = Timestamp.fromDate(newDT);
        updates.time = editForm.time;
        history.push({ action: 'date_updated', oldValue: oldDT.toISOString(), newValue: newDT.toISOString(), editedBy: user.uid, editedByRole: 'secretary', editedAt: now, recalculationTriggered: false });
      }
      const newDL  = new Date(`${editForm.deadlineDate}T${editForm.deadlineTime}`);
      const oldDL  = selectedEvent.deadline.toDate();
      if (newDL.getTime() !== oldDL.getTime()) {
        updates.deadline = Timestamp.fromDate(newDL);
        history.push({ action: 'deadline_extended', oldValue: oldDL.toISOString(), newValue: newDL.toISOString(), editedBy: user.uid, editedByRole: 'secretary', editedAt: now, recalculationTriggered: false });
      }

      await updateDoc(eventDoc, history.length > 0
        ? { ...updates, editHistory: [...(selectedEvent.editHistory || []), ...history] }
        : updates
      );

      if ((selectedEvent.status === 'closed' || selectedEvent.status === 'locked') &&
          parseFloat(editForm.totalAmount) !== selectedEvent.totalAmount) {
        await recalculatePayments(selectedEvent.id, parseFloat(editForm.totalAmount), selectedEvent.participantCount);
        await updateEventTotalCollected(selectedEvent.id);
      }

      setShowEditModal(false);
      setSuccessMessage(`"${editForm.title}" updated successfully!`);
      setShowSuccessDialog(true);
      await fetchEvents();
    } catch (err) {
      console.error(err);
      setMessage('Failed to update event');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // ── Remove Players handlers ──
const openRemovePlayersModal = async (event: Event) => {
  setEventForRemoval(event)
  setSelectedForRemoval(new Set())
  setShowRemovePlayersModal(true)
  setLoadingParticipants(true)
  try {
    const participantsRef = collection(db, 'eventParticipants')
    const participantsQuery = query(
      participantsRef,
      where('eventId', '==', event.id),
      where('currentStatus', '==', 'joined')
    )
    const participantsSnapshot = await getDocs(participantsQuery)

    const paymentsRef = collection(db, 'eventPayments')
    const paymentsQuery = query(paymentsRef, where('eventId', '==', event.id))
    const paymentsSnapshot = await getDocs(paymentsQuery)

    const paidMap: { [playerId: string]: boolean } = {}
    paymentsSnapshot.forEach((docSnap) => {
      const data = docSnap.data()
      paidMap[data.playerId] = data.paymentStatus === 'paid'
    })

    const list: RemoveParticipant[] = []
    participantsSnapshot.forEach((docSnap) => {
      const data = docSnap.data()
      list.push({
        id: docSnap.id,
        playerId: data.playerId,
        playerName: data.playerName,
        playerEmail: data.playerEmail || '',
        isPaid: paidMap[data.playerId] || false,
        playerType: data.playerType || 'regular',
      })
    })

    list.sort((a, b) => {
      if (a.isPaid !== b.isPaid) return a.isPaid ? -1 : 1
      return a.playerName.localeCompare(b.playerName)
    })

    setParticipantsForRemoval(list)
  } catch (error) {
    console.error('Error fetching participants for removal:', error)
    setMessage('Failed to load participants')
    setTimeout(() => setMessage(''), 2000)
    setShowRemovePlayersModal(false)
  } finally {
    setLoadingParticipants(false)
  }
}

const togglePlayerForRemoval = (playerId: string) => {
  setSelectedForRemoval((prev) => {
    const next = new Set(prev)
    if (next.has(playerId)) {
      next.delete(playerId)
    } else {
      next.add(playerId)
    }
    return next
  })
}

const confirmRemovePlayers = async () => {
  if (!eventForRemoval || selectedForRemoval.size === 0) return
  try {
    setRemovingPlayers(true)
    setShowRemovePlayersModal(false)

    const result = await removePlayersFromEvent(
      eventForRemoval.id,
      Array.from(selectedForRemoval),
      eventForRemoval.status,
      eventForRemoval.totalAmount
    )

    if (result.success) {
      setSuccessMessage(
        `${result.removedCount} player${result.removedCount > 1 ? 's' : ''} removed from "${eventForRemoval.title}" successfully!`
      )
      setShowSuccessDialog(true)
      await fetchEvents()
    } else {
      setMessage(result.message)
      setTimeout(() => setMessage(''), 3000)
    }
  } catch (error) {
    console.error('Error removing players:', error)
    setMessage('Failed to remove players')
    setTimeout(() => setMessage(''), 3000)
  } finally {
    setRemovingPlayers(false)
    setEventForRemoval(null)
    setSelectedForRemoval(new Set())
    setParticipantsForRemoval([])
  }
}

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading || !user || role !== 'secretary') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const FILTERS: { key: typeof filter; label: string; count: number }[] = [
    { key: 'all',    label: 'All',    count: events.length },
    { key: 'open',   label: 'Open',   count: events.filter(e => e.status === 'open').length },
    { key: 'closed', label: 'Closed', count: events.filter(e => e.status === 'closed').length },
    { key: 'past',   label: 'Past',   count: events.filter(e => e.date.toDate() < new Date()).length },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── CLOSE DIALOG ───────────────────────────────────────────────────── */}
      {showCloseDialog && eventToClose && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-6 pb-5 animate-slideUp">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-black text-gray-900 text-center">Close Event?</h3>
            <p className="text-sm text-gray-500 text-center mt-1 font-semibold">{eventToClose.title}</p>
            <div className="mt-4 bg-red-50 rounded-2xl p-3 border border-red-100 space-y-1.5">
              {['Lock registrations (no more join/leave)',
                `Finalize count at ${eventToClose.liveParticipantCount || 0} players`,
                'Calculate final payment amounts'].map(txt => (
                <p key={txt} className="text-[11px] text-red-700 flex items-start gap-1.5">
                  <span className="text-red-400 font-black flex-shrink-0">·</span>{txt}
                </p>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <button onClick={confirmClose}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm">
                Yes, Close Event
              </button>
              <button onClick={() => { setShowCloseDialog(false); setEventToClose(null); }}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-colors cursor-pointer text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REOPEN DIALOG ──────────────────────────────────────────────────── */}
      {showReopenDialog && eventToReopen && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-6 pb-5 animate-slideUp">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-black text-gray-900 text-center">Reopen Event?</h3>
            <p className="text-sm text-gray-500 text-center mt-1 font-semibold">{eventToReopen.title}</p>
            <div className="mt-4 bg-green-50 rounded-2xl p-3 border border-green-100 space-y-1.5">
              {['Allow players to join/leave again',
                'Reset payment calculations',
                'Extend registration until deadline'].map(txt => (
                <p key={txt} className="text-[11px] text-green-700 flex items-start gap-1.5">
                  <span className="text-green-400 font-black flex-shrink-0">·</span>{txt}
                </p>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <button onClick={confirmReopen}
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm">
                Yes, Reopen Event
              </button>
              <button onClick={() => { setShowReopenDialog(false); setEventToReopen(null); }}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-colors cursor-pointer text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE DIALOG ──────────────────────────────────────────────────── */}
      {showDeleteDialog && eventToDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-6 pb-5 animate-slideUp">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-black text-gray-900 text-center">Delete Event?</h3>
            <p className="text-sm text-gray-500 text-center mt-1 font-semibold">{eventToDelete.title}</p>
            <div className="mt-4 bg-red-50 rounded-2xl p-3 border border-red-100 space-y-1.5">
              <p className="text-[11px] text-red-800 font-black">This action cannot be undone. Permanently deletes:</p>
              {[`The event and all details`,
                `All ${eventToDelete.participantCount} participant registrations`,
                'All associated expenses and payments',
                'Complete event history and edit logs'].map(txt => (
                <p key={txt} className="text-[11px] text-red-700 flex items-start gap-1.5">
                  <span className="text-red-400 font-black flex-shrink-0">·</span>{txt}
                </p>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <button onClick={confirmDelete} disabled={deletingEvent}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm disabled:opacity-50">
                {deletingEvent ? 'Deleting...' : 'Delete Permanently'}
              </button>
              <button onClick={() => { setShowDeleteDialog(false); setEventToDelete(null); }} disabled={deletingEvent}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-colors cursor-pointer text-sm disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SUCCESS DIALOG ─────────────────────────────────────────────────── */}
      {showSuccessDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-6 pb-5 text-center animate-slideUp">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-black text-gray-900">Success!</h3>
            <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{successMessage}</p>
            <button onClick={() => setShowSuccessDialog(false)}
              className="mt-5 w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm">
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Remove Players Modal ── */}
{showRemovePlayersModal && eventForRemoval && (
  <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
    <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-6 pb-6 animate-slideUp max-h-[90vh] flex flex-col">

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-black text-gray-900">Remove Players</h2>
          <p className="text-xs text-gray-400 truncate">{eventForRemoval.title}</p>
        </div>
        <button
          onClick={() => {
            setShowRemovePlayersModal(false)
            setEventForRemoval(null)
            setSelectedForRemoval(new Set())
            setParticipantsForRemoval([])
          }}
          className="p-2 rounded-xl bg-gray-100 active:bg-gray-200 cursor-pointer"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Paid warning */}
      {Array.from(selectedForRemoval).some(
        (pid) => participantsForRemoval.find((p) => p.playerId === pid)?.isPaid
      ) && (
        <div className="mb-2 bg-yellow-50 border border-yellow-200 rounded-2xl px-3 py-2.5 flex items-start gap-2">
          <svg className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-xs text-yellow-800 font-semibold">
            Selected player(s) have paid. Removing will <span className="font-black">delete their payment record</span> and recalculate all dues.
          </p>
        </div>
      )}

      {/* Selection count */}
      {selectedForRemoval.size > 0 && (
        <p className="text-xs text-gray-400 mb-1">
          <span className="font-black text-red-600">{selectedForRemoval.size}</span> player{selectedForRemoval.size > 1 ? 's' : ''} selected
        </p>
      )}

      {/* Participant list */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 mt-1 pr-0.5">
        {loadingParticipants ? (
          <div className="flex items-center justify-center py-10">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : participantsForRemoval.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm font-bold text-gray-400">No participants found</p>
          </div>
        ) : (
          participantsForRemoval.map((participant) => {
            const isSelected = selectedForRemoval.has(participant.playerId)
            return (
              <div
                key={participant.playerId}
                onClick={() => togglePlayerForRemoval(participant.playerId)}
                className={`flex items-center gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-all active:scale-[0.98] ${
                  isSelected
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-100 bg-white hover:border-gray-200'
                }`}
              >
                {/* Checkbox */}
                <div className={`w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  isSelected ? 'bg-red-600 border-red-600' : 'border-gray-300'
                }`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                {/* Avatar */}
                <div className="w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-black text-sm flex-shrink-0">
                  {participant.playerName.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{participant.playerName}</p>
                  <p className="text-xs text-gray-400 truncate">{participant.playerEmail || 'No email'}</p>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {participant.isPaid && (
                    <span className="px-1.5 py-0.5 bg-yellow-50 text-yellow-700 text-[10px] font-black rounded-full border border-yellow-200">
                      PAID
                    </span>
                  )}
                  {participant.playerType === 'guest' && (
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-black rounded-full border border-blue-200">
                      Guest
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-4 space-y-2 pt-3 border-t border-gray-100">
        <button
          onClick={confirmRemovePlayers}
          disabled={selectedForRemoval.size === 0 || loadingParticipants}
          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {selectedForRemoval.size === 0
            ? 'Select Players to Remove'
            : `Remove ${selectedForRemoval.size} Player${selectedForRemoval.size > 1 ? 's' : ''}`}
        </button>
        <button
          onClick={() => {
            setShowRemovePlayersModal(false)
            setEventForRemoval(null)
            setSelectedForRemoval(new Set())
            setParticipantsForRemoval([])
          }}
          className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-colors cursor-pointer text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}

      {/* ── EDIT MODAL ─────────────────────────────────────────────────────── */}
      {showEditModal && selectedEvent && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn overflow-y-auto">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-6 pb-6 animate-slideUp sm:my-8 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-black text-gray-900">Edit Event</h2>
              <button onClick={() => setShowEditModal(false)}
                className="p-2 rounded-xl bg-gray-100 active:bg-gray-200 cursor-pointer">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleEdit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5 uppercase tracking-wide">Event Title</label>
                <input type="text" value={editForm.title}
                  onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-red-500 text-sm text-gray-900"
                  required />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5 uppercase tracking-wide">Turf Amount (₹)</label>
                <input type="number" value={editForm.totalAmount}
                  onChange={e => setEditForm({ ...editForm, totalAmount: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-red-500 text-sm text-gray-900"
                  min="0" step="10" required />
                {(selectedEvent.status === 'closed' || selectedEvent.status === 'locked') && (
                  <p className="text-[11px] text-orange-500 mt-1.5 font-semibold">
                    ⚠️ Changing this will recalculate all payments and update totalCollected
                  </p>
                )}
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5 uppercase tracking-wide">Duration (Hours)</label>
                <input type="number" value={editForm.durationHours}
                  onChange={e => setEditForm({ ...editForm, durationHours: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-red-500 text-sm text-gray-900"
                  min="0.5" step="0.5" required />
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-gray-700 mb-1.5 uppercase tracking-wide">Event Date</label>
                  <input type="date" value={editForm.date}
                    onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                    className="w-full px-3 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-red-500 text-sm text-gray-900"
                    required />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 mb-1.5 uppercase tracking-wide">Event Time</label>
                  <input type="time" value={editForm.time}
                    onChange={e => setEditForm({ ...editForm, time: e.target.value })}
                    className="w-full px-3 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-red-500 text-sm text-gray-900"
                    required />
                </div>
              </div>

              {/* Deadline */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-gray-700 mb-1.5 uppercase tracking-wide">Deadline Date</label>
                  <input type="date" value={editForm.deadlineDate}
                    onChange={e => setEditForm({ ...editForm, deadlineDate: e.target.value })}
                    className="w-full px-3 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-red-500 text-sm text-gray-900"
                    required />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 mb-1.5 uppercase tracking-wide">Deadline Time</label>
                  <input type="time" value={editForm.deadlineTime}
                    onChange={e => setEditForm({ ...editForm, deadlineTime: e.target.value })}
                    className="w-full px-3 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-red-500 text-sm text-gray-900"
                    required />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="submit"
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm">
                  Save Changes
                </button>
                <button type="button" onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-colors cursor-pointer text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()}
            className="p-2.5 rounded-xl bg-gray-100 active:bg-gray-200 cursor-pointer flex-shrink-0">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-7 h-7 flex-shrink-0">
            <Image src="/logo.png" alt="Logo" width={28} height={28} className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-gray-900 leading-tight">Manage Turfs</h1>
            <p className="text-xs text-gray-400">View and manage all turf matches</p>
          </div>
          <button onClick={() => router.push('/secretary/create-event')}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors cursor-pointer text-xs flex-shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New
          </button>
        </div>
      </div>

      {/* ── CONTENT ────────────────────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto px-3 py-4 pb-12">

        {/* Message */}
        {message && (
          <div className={`mb-3 px-4 py-3 rounded-2xl border text-xs font-semibold animate-slideDown ${
            message.includes('updated') || message.includes('updated')
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {message}
          </div>
        )}

        {/* Filter tabs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 mb-4 flex gap-1">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                filter === f.key
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-700'
              }`}>
              {f.label}
              <span className={`ml-1 text-[10px] font-black ${filter === f.key ? 'text-red-200' : 'text-gray-300'}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Events */}
        {loadingData ? (
          <div className="flex items-center justify-center py-24">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <div className="w-14 h-14 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-900">No turfs found</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">Create your first turf to get started</p>
            <button onClick={() => router.push('/secretary/create-event')}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm">
              Create Event
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map(event => {
              const displayCount   = event.status === 'open' ? (event.liveParticipantCount || 0) : event.participantCount;
              const perPlayer      = displayCount > 0 ? calculatePerPlayerAmount(event.totalAmount, displayCount) : 0;
              const expected       = perPlayer * displayCount;
              const profit         = event.totalCollected - event.totalAmount;
              const rate           = expected > 0 ? Math.round((event.totalCollected / expected) * 100) : 0;
              const eventDate      = event.date.toDate();

              return (
                <div key={event.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                  {/* Card top */}
                  <div className="p-4">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="text-sm font-black text-gray-900 break-words">{event.title}</h3>
                          {event.eventPaidToVendor && (
                            <span className="px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-black rounded-full border border-green-200">
                              ✓ Vendor Paid
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-gray-400 flex-wrap">
                          <span>{eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                          <span>·</span>
                          <span>{event.time}</span>
                          <span>·</span>
                          <span>{event.durationHours}h</span>
                          <span>·</span>
                          <span>₹{event.totalAmount.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {event.status === 'open' && (
                          <button onClick={() => refreshSingleEvent(event.id)}
                            disabled={refreshingEvent === event.id}
                            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors cursor-pointer disabled:opacity-50"
                            title="Refresh count">
                            <svg className={`w-3.5 h-3.5 text-gray-500 ${refreshingEvent === event.id ? 'animate-spin' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                        )}
                        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black border ${
                          event.status === 'open'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : event.status === 'closed'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}>
                          {event.status === 'open' ? '🟢' : event.status === 'closed' ? '🔴' : '🔒'}{' '}
                          {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                        </span>
                      </div>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-5 gap-1.5 bg-gray-50 rounded-xl p-2.5 border border-gray-100 mb-3">
                      {[
                        { label: event.status === 'open' ? 'Live' : 'Players', value: String(displayCount), color: 'text-gray-900', live: event.status === 'open' && displayCount > 0 },
                        { label: 'Per Player', value: displayCount > 0 ? `₹${perPlayer}` : '—', color: 'text-red-600' },
                        { label: 'Expected',   value: displayCount > 0 ? `₹${expected.toLocaleString()}` : '—', color: 'text-purple-600' },
                        { label: 'Collected',  value: `₹${event.totalCollected.toLocaleString()}`, color: 'text-green-600' },
                        { label: 'Profit',     value: `₹${profit.toLocaleString()}`, color: profit >= 0 ? 'text-orange-500' : 'text-red-500' },
                      ].map(({ label, value, color, live }) => (
                        <div key={label} className="text-center">
                          <p className="text-[9px] text-gray-400 font-semibold mb-0.5">{label}</p>
                          <p className={`text-xs font-black ${color} flex items-center justify-center gap-0.5`}>
                            {value}
                            {live && <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Collection bar (closed events only) */}
                    {event.status !== 'open' && displayCount > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-gray-400 font-semibold">Collection</span>
                          <span className="text-[10px] font-black text-gray-700">{rate}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${
                            rate === 100 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                          }`} style={{ width: `${Math.min(rate, 100)}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      {event.status === 'open' && (
                        <button onClick={() => openCloseDialog(event)}
                          className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors cursor-pointer text-xs">
                          Close ({displayCount})
                        </button>
                      )}
                      {event.status === 'closed' && (
                        <button onClick={() => openReopenDialog(event)}
                          className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors cursor-pointer text-xs">
                          Reopen
                        </button>
                      )}
                      <button onClick={() => openEditModal(event)}
                        className="flex-1 py-2 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-xl border border-gray-200 transition-colors cursor-pointer text-xs">
                        Edit
                      </button>
                      {/* Remove Players Button */}
<button
  onClick={() => openRemovePlayersModal(event)}
  disabled={removingPlayers}
  className="flex-1 py-2 bg-white hover:bg-red-50 text-red-600 font-bold rounded-xl border border-red-200 transition-colors cursor-pointer text-xs flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
>
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
  </svg>
  <span></span>
</button>
                      <button onClick={() => router.push(`/secretary/event-participants/${event.id}`)}
                        className="flex-1 py-2 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-xl border border-gray-200 transition-colors cursor-pointer text-xs flex items-center justify-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>{displayCount}</span>
                      </button>
                      {(event.status === 'closed' || event.status === 'locked') && (
                        <button onClick={() => router.push(`/secretary/add-players/${event.id}`)}
                          className="flex-1 py-2 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-xl border border-gray-200 transition-colors cursor-pointer text-xs">
                          + Players
                        </button>
                      )}
                      <button onClick={() => openDeleteDialog(event)}
                        className="py-2 px-3 bg-white hover:bg-red-50 text-red-600 font-bold rounded-xl border-2 border-red-200 transition-colors cursor-pointer text-xs flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
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
        @keyframes fadeIn    { from { opacity: 0 }                              to { opacity: 1 } }
        @keyframes slideUp   { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        .animate-fadeIn    { animation: fadeIn    0.2s  ease-out; }
        .animate-slideUp   { animation: slideUp   0.25s ease-out; }
        .animate-slideDown { animation: slideDown 0.2s  ease-out; }
      `}</style>
    </div>
  );
}