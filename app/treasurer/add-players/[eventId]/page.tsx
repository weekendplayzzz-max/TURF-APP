'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, Timestamp, query, where } from 'firebase/firestore';
import { calculatePerPlayerAmount, recalculatePayments } from '@/lib/eventManagement';

interface Player {
  id: string;
  name: string;
  email: string;
  status: 'Active' | 'Pending';
  type: 'regular' | 'guest';
  role?: string;
  parentId?: string;
  parentName?: string;
}

interface Event {
  id: string;
  title: string;
  date: Timestamp;
  time: string;
  totalAmount: number;
  participantCount: number;
  status: string;
}

export default function AddPlayers() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const eventId = params?.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [currentParticipants, setCurrentParticipants] = useState<Set<string>>(new Set());
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [loadingData, setLoadingData] = useState(true);
  const [message, setMessage] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'treasurer' && eventId) {
      fetchData();
    }
  }, [role, eventId]);

  const fetchData = async () => {
    try {
      setLoadingData(true);

      // Fetch event details
      const eventDoc = await getDoc(doc(db, 'events', eventId));
      if (!eventDoc.exists()) {
        setMessage('Event not found');
        return;
      }

      const eventData = eventDoc.data();
      
      console.log('📊 Event Data:', {
        eventId,
        participantCount: eventData.participantCount,
        title: eventData.title,
      });

      setEvent({
        id: eventDoc.id,
        title: eventData.title,
        date: eventData.date,
        time: eventData.time,
        totalAmount: eventData.totalAmount,
        participantCount: eventData.participantCount || 0,
        status: eventData.status,
      });

      // Fetch current participants from eventParticipants collection
      const participantsRef = collection(db, 'eventParticipants');
      const participantsSnapshot = await getDocs(participantsRef);
      const participantEmails = new Set<string>();
      const participantIds = new Set<string>();

      participantsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.eventId === eventId && data.currentStatus === 'joined') {
          participantIds.add(data.playerId);
          if (data.playerEmail) {
            participantEmails.add(data.playerEmail);
          }
        }
      });

      console.log('👥 Actual Participants in DB:', {
        count: participantIds.size,
        ids: Array.from(participantIds),
        emails: Array.from(participantEmails),
      });

      setCurrentParticipants(participantIds);

      // Sync participantCount if wrong
      if (eventDoc.exists() && (eventData.participantCount || 0) !== participantIds.size) {
        console.log('⚠️ Syncing participantCount:', {
          oldCount: eventData.participantCount,
          newCount: participantIds.size,
        });
        
        await updateDoc(doc(db, 'events', eventId), {
          participantCount: participantIds.size,
        });

        setEvent(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            participantCount: participantIds.size,
          };
        });
      }

      // Fetch all authorized players
      const players: Player[] = [];
      const playerEmailsSet = new Set<string>();

      // 1. Get ALL users from users collection (fetch all, filter in memory)
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);

      usersSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const userRole = data.role;
        const email = data.email;
        
        // Include player, secretary, and treasurer roles only
        if (!['player', 'secretary', 'treasurer'].includes(userRole)) {
          return;
        }

        // Skip if already in event or already processed
        if (participantIds.has(docSnap.id) || participantEmails.has(email) || playerEmailsSet.has(email)) {
          return;
        }

        playerEmailsSet.add(email);
        players.push({
          id: docSnap.id,
          name: data.displayName || data.name || email?.split('@')[0] || 'Player',
          email: email,
          status: 'Active',
          type: 'regular',
          role: userRole,
        });
      });

      // 2. Get ALL users from authorizedUsers collection (fetch all, filter in memory)
      const authUsersRef = collection(db, 'authorizedUsers');
      const authUsersSnapshot = await getDocs(authUsersRef);

      authUsersSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const userRole = data.role;
        const email = data.email;
        
        // Include player, secretary, and treasurer roles only
        if (!['player', 'secretary', 'treasurer'].includes(userRole)) {
          return;
        }
        
        // Skip if already in event or already processed
        if (participantEmails.has(email) || playerEmailsSet.has(email)) {
          return;
        }

        playerEmailsSet.add(email);
        players.push({
          id: docSnap.id,
          name: data.displayName || email?.split('@')[0] || 'Player',
          email: email,
          status: 'Pending',
          type: 'regular',
          role: userRole,
        });
      });

      // 3. Get guest players from guestPlayers collection (only active ones)
      const guestPlayersRef = collection(db, 'guestPlayers');
      const guestPlayersQuery = query(guestPlayersRef, where('isActive', '==', true));
      const guestPlayersSnapshot = await getDocs(guestPlayersQuery);

      guestPlayersSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const guestId = docSnap.id;
        
        // Skip if guest is already in the event
        if (participantIds.has(guestId)) {
          return;
        }

        // Get parent information
        const parentIds = data.parentIds || [];
        const parentNames = data.parentNames || [];
        const parentName = parentNames.length > 0 ? parentNames.join(', ') : 'Unknown';

        players.push({
          id: guestId,
          name: data.guestName,
          email: `Guest (managed by ${parentName})`,
          status: 'Active',
          type: 'guest',
          parentId: parentIds[0], // Store first parent ID
          parentName: parentName,
        });
      });

      // Sort: regular users first (by role priority), then guests
      players.sort((a, b) => {
        // Sort by type first
        if (a.type !== b.type) {
          return a.type === 'regular' ? -1 : 1;
        }
        
        // Within regular users, sort by role priority
        if (a.type === 'regular' && b.type === 'regular') {
          const roleOrder: { [key: string]: number } = { 'player': 1, 'secretary': 2, 'treasurer': 3 };
          const aOrder = roleOrder[a.role || 'player'] || 99;
          const bOrder = roleOrder[b.role || 'player'] || 99;
          if (aOrder !== bOrder) {
            return aOrder - bOrder;
          }
        }
        
        // Finally sort by name
        return a.name.localeCompare(b.name);
      });

      console.log('✅ Available Participants to Add:', {
        count: players.length,
        regularCount: players.filter(p => p.type === 'regular').length,
        guestCount: players.filter(p => p.type === 'guest').length,
        breakdown: {
          players: players.filter(p => p.role === 'player').length,
          secretaries: players.filter(p => p.role === 'secretary').length,
          treasurers: players.filter(p => p.role === 'treasurer').length,
          guests: players.filter(p => p.type === 'guest').length,
        },
      });

      setAvailablePlayers(players);
    } catch (error) {
      console.error('❌ Error fetching data:', error);
      setMessage('Failed to load data');
    } finally {
      setLoadingData(false);
    }
  };

  const togglePlayerSelection = (playerId: string) => {
    const newSelected = new Set(selectedPlayers);
    if (newSelected.has(playerId)) {
      newSelected.delete(playerId);
    } else {
      newSelected.add(playerId);
    }
    setSelectedPlayers(newSelected);
  };

  const selectAll = () => {
    setSelectedPlayers(new Set(availablePlayers.map(p => p.id)));
  };

  const clearSelection = () => {
    setSelectedPlayers(new Set());
  };

  const closeSuccessDialog = () => {
    setShowSuccessDialog(false);
    setSuccessMessage('');
  };

  const handleAddPlayers = async () => {
    if (selectedPlayers.size === 0) {
      setMessage('Please select at least one participant');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    try {
      setProcessing(true);

      const addedPlayerIds: string[] = [];

      // Calculate new participant count
      const newParticipantCount = (event?.participantCount || 0) + selectedPlayers.size;
      
      // Calculate new per-player amount
      const newPerPlayerAmount = event 
        ? calculatePerPlayerAmount(event.totalAmount, newParticipantCount)
        : 0;

      // Add each selected player
      for (const playerId of selectedPlayers) {
        const player = availablePlayers.find((p) => p.id === playerId);
        if (!player) continue;

        // ✓ 1. Create participant record
        const participantRef = doc(collection(db, 'eventParticipants'));
        
        const participantData: any = {
          eventId: eventId,
          playerId: playerId,
          playerName: player.name,
          playerEmail: player.email,
          playerType: player.type,
          playerStatus: player.status,
          joinedAt: Timestamp.now(),
          currentStatus: 'joined',
          addedAfterClose: true,
          addedBy: user?.uid,
          addedByRole: 'treasurer',
        };

        // Add parent info for guests
        if (player.type === 'guest' && player.parentId) {
          participantData.parentId = player.parentId;
          participantData.parentName = player.parentName;
        }

        await setDoc(participantRef, participantData);

        // ✓ 2. Create payment record immediately
        const paymentRef = doc(collection(db, 'eventPayments'));
        
        const paymentData: any = {
          eventId: eventId,
          eventTitle: event?.title,
          eventDate: event?.date,
          eventTime: event?.time,
          playerId: playerId,
          playerName: player.name,
          playerType: player.type,
          originalAmountDue: newPerPlayerAmount,
          currentAmountDue: newPerPlayerAmount,
          totalPaid: 0,
          paymentStatus: 'pending',
          paidAt: null,
          markedPaidBy: null,
          markedPaidByName: null,
          addedAfterClose: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        // Add parent info for guests
        if (player.type === 'guest' && player.parentId) {
          paymentData.parentId = player.parentId;
          paymentData.parentName = player.parentName;
        }

        await setDoc(paymentRef, paymentData);

        addedPlayerIds.push(playerId);
      }

      // Update Firestore event document
      await updateDoc(doc(db, 'events', eventId), {
        participantCount: newParticipantCount,
        lastEditedAt: Timestamp.now(),
      });

      // Update current participants state immediately
      setCurrentParticipants(prev => {
        const updated = new Set(prev);
        addedPlayerIds.forEach(id => updated.add(id));
        return updated;
      });

      // Update event state immediately with new count
      setEvent(prevEvent => {
        if (!prevEvent) return prevEvent;
        return {
          ...prevEvent,
          participantCount: newParticipantCount,
        };
      });

      // Remove added players from available players list
      setAvailablePlayers(prev => 
        prev.filter(p => !addedPlayerIds.includes(p.id))
      );

      // ✓ Recalculate all existing payments
      if (event) {
        await recalculatePayments(eventId, event.totalAmount, newParticipantCount);
      }

      const regularCount = availablePlayers.filter(p => selectedPlayers.has(p.id) && p.type === 'regular').length;
      const guestCount = availablePlayers.filter(p => selectedPlayers.has(p.id) && p.type === 'guest').length;
      
      let message = `Successfully added ${selectedPlayers.size} participant(s)`;
      if (regularCount > 0 && guestCount > 0) {
        message += ` (${regularCount} user${regularCount > 1 ? 's' : ''}, ${guestCount} guest${guestCount > 1 ? 's' : ''})`;
      } else if (guestCount > 0) {
        message += ` (${guestCount} guest${guestCount > 1 ? 's' : ''})`;
      }
      message += ' with payment records (pending status)';

      setSuccessMessage(message);
      setShowSuccessDialog(true);
      
      // Clear selection
      setSelectedPlayers(new Set());

    } catch (error) {
      console.error('Error adding players:', error);
      setMessage('Failed to add participants');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setProcessing(false);
    }
  };

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

  // Count selected by type
  const selectedRegular = availablePlayers.filter(p => selectedPlayers.has(p.id) && p.type === 'regular').length;
  const selectedGuests = availablePlayers.filter(p => selectedPlayers.has(p.id) && p.type === 'guest').length;

  // Get role display badge
  const getRoleBadge = (player: Player) => {
    if (player.type === 'guest') {
      return <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold rounded-full flex-shrink-0">Guest</span>;
    }
    
    const roleColors: { [key: string]: string } = {
      'player': 'bg-blue-50 text-blue-700 border-blue-200',
      'secretary': 'bg-orange-50 text-orange-700 border-orange-200',
      'treasurer': 'bg-green-50 text-green-700 border-green-200',
    };
    
    const colorClass = roleColors[player.role || 'player'] || 'bg-gray-50 text-gray-700 border-gray-200';
    
    return (
      <span className={`px-2 py-0.5 border text-xs font-bold rounded-full flex-shrink-0 ${colorClass}`}>
        {(player.role || 'player').charAt(0).toUpperCase() + (player.role || 'player').slice(1)}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
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
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
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
              <div className="flex-1 min-w-0">
                <h1 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900">
                  Add Participants
                </h1>
                {event && (
                  <p className="text-xs sm:text-sm text-gray-600 truncate">
                    {event.title} • {event.date.toDate().toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })} • {event.time}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-10">
        {message && (
          <div className={`mb-6 p-4 rounded-lg border-l-4 animate-slideDown ${
            message.includes('Successfully') || message.includes('successfully')
              ? 'bg-green-50 border-green-500 text-green-800'
              : message.includes('Please') || message.includes('select')
              ? 'bg-yellow-50 border-yellow-500 text-yellow-800'
              : 'bg-red-50 border-red-500 text-red-800'
          }`}>
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}

        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-base text-gray-700 font-medium">Loading participants...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Event Info */}
            <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 mb-6 border border-gray-200">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Event Details</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-xl p-3 sm:p-4">
                  <p className="text-xs text-gray-600 mb-1">Current Participants</p>
                  <p className="text-xl sm:text-2xl font-bold text-blue-600">
                    {currentParticipants.size}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 sm:p-4">
                  <p className="text-xs text-gray-600 mb-1">Total Amount</p>
                  <p className="text-xl sm:text-2xl font-bold text-purple-600">₹{event?.totalAmount.toLocaleString()}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 sm:p-4">
                  <p className="text-xs text-gray-600 mb-1">Status</p>
                  <span className="inline-block px-3 py-1 bg-red-100 text-red-700 border border-red-200 rounded-full text-xs font-bold">
                    {event?.status.toUpperCase()}
                  </span>
                </div>
                <div className="bg-green-50 rounded-xl p-3 sm:p-4">
                  <p className="text-xs text-gray-600 mb-1">Selected to Add</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-600">
                    {selectedPlayers.size}
                    {selectedPlayers.size > 0 && (
                      <span className="text-xs text-green-700 ml-1 block mt-1">
                        ({selectedRegular}U, {selectedGuests}G)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Players List */}
            {availablePlayers.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 sm:p-12 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <p className="text-lg sm:text-xl font-bold text-gray-900 mb-2">No available participants to add</p>
                <p className="text-sm sm:text-base text-gray-600">
                  All authorized users and guests are already in this event
                </p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 mb-6 border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                      Available Participants ({availablePlayers.length})
                    </h2>
                    <div className="flex gap-2">
                      <button
                        onClick={selectAll}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors border border-blue-200"
                      >
                        Select All
                      </button>
                      {selectedPlayers.size > 0 && (
                        <button
                          onClick={clearSelection}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
                        >
                          Clear ({selectedPlayers.size})
                        </button>
                      )}
                    </div>
                  </div>

                

                  <div className="space-y-3">
                    {availablePlayers.map((player) => (
                      <div
                        key={player.id}
                        onClick={() => togglePlayerSelection(player.id)}
                        className={`flex items-center justify-between p-3 sm:p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          selectedPlayers.has(player.id)
                            ? 'border-red-600 bg-red-50'
                            : 'border-gray-200 hover:border-red-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                              selectedPlayers.has(player.id)
                                ? 'bg-red-600 border-red-600'
                                : 'border-gray-300'
                            }`}
                          >
                            {selectedPlayers.has(player.id) && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="text-sm sm:text-base font-semibold text-gray-900 truncate">{player.name}</p>
                              {getRoleBadge(player)}
                              <span
                                className={`px-2 py-0.5 text-xs font-bold rounded-full flex-shrink-0 ${
                                  player.status === 'Active'
                                    ? 'bg-green-50 text-green-700 border border-green-200'
                                    : 'bg-orange-50 text-orange-700 border border-orange-200'
                                }`}
                              >
                                {player.status}
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-600 truncate">{player.email}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-200">
                  <button
                    onClick={handleAddPlayers}
                    disabled={selectedPlayers.size === 0 || processing}
                    className="w-full px-6 py-3 sm:py-4 bg-red-600 hover:bg-red-700 text-white font-bold text-sm sm:text-base rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing
                      ? 'Adding Participants & Creating Payments...'
                      : `Add ${selectedPlayers.size} Participant${selectedPlayers.size !== 1 ? 's' : ''} & Create Payment Records`}
                  </button>
                </div>
              </>
            )}
          </>
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
