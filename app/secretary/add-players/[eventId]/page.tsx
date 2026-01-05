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
  role: string; // Added role field
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

  useEffect(() => {
    if (!loading && role !== 'secretary') {
      router.push('/login');
    }
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'secretary' && eventId) {
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

      // Fetch all authorized players, secretary, and treasurer
      const players: Player[] = [];
      const playerEmailsSet = new Set<string>();

      // 1. Get users from users collection (already logged in) - players, secretary, treasurer
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);

      usersSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const email = data.email;
        const userRole = data.role;
        
        // Include players, secretary, and treasurer
        if (!['player', 'secretary', 'treasurer'].includes(userRole)) {
          return;
        }
        
        if (participantIds.has(docSnap.id) || participantEmails.has(email) || playerEmailsSet.has(email)) {
          return;
        }

        playerEmailsSet.add(email);
        players.push({
          id: docSnap.id,
          name: data.displayName || data.name || email?.split('@')[0] || 'User',
          email: email,
          status: 'Active',
          role: userRole,
        });
      });

      // 2. Get users from authorizedUsers collection (not yet logged in) - players, secretary, treasurer
      const authUsersRef = collection(db, 'authorizedUsers');
      const authUsersSnapshot = await getDocs(authUsersRef);

      authUsersSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const email = data.email;
        const userRole = data.role;
        
        // Include players, secretary, and treasurer
        if (!['player', 'secretary', 'treasurer'].includes(userRole)) {
          return;
        }
        
        if (participantEmails.has(email) || playerEmailsSet.has(email)) {
          return;
        }

        playerEmailsSet.add(email);
        players.push({
          id: docSnap.id,
          name: data.displayName || email?.split('@')[0] || 'User',
          email: email,
          status: 'Pending',
          role: userRole,
        });
      });

      // Sort by role (secretary, treasurer, then players) and then by name
      players.sort((a, b) => {
        const roleOrder = { secretary: 1, treasurer: 2, player: 3 };
        const roleCompare = (roleOrder[a.role as keyof typeof roleOrder] || 4) - (roleOrder[b.role as keyof typeof roleOrder] || 4);
        if (roleCompare !== 0) return roleCompare;
        return a.name.localeCompare(b.name);
      });

      console.log('✅ Available Users to Add:', {
        count: players.length,
        players: players.map(p => ({ name: p.name, email: p.email, status: p.status, role: p.role })),
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

  const handleAddPlayers = async () => {
    if (selectedPlayers.size === 0) {
      setMessage('Please select at least one person');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    if (!confirm(`Add ${selectedPlayers.size} participant(s) to this event? This will recalculate all payments.`)) {
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

        // Create participant record
        const participantRef = doc(collection(db, 'eventParticipants'));
        await setDoc(participantRef, {
          eventId: eventId,
          playerId: playerId,
          playerName: player.name,
          playerEmail: player.email,
          playerStatus: player.status,
          playerRole: player.role, // Store the role
          joinedAt: Timestamp.now(),
          currentStatus: 'joined',
          addedAfterClose: true,
          addedBy: user?.uid,
          addedByRole: 'secretary',
        });

        // Create payment record immediately
        const paymentRef = doc(collection(db, 'eventPayments'));
        await setDoc(paymentRef, {
          eventId: eventId,
          eventTitle: event?.title,
          eventDate: event?.date,
          eventTime: event?.time,
          playerId: playerId,
          playerName: player.name,
          playerRole: player.role, // Store the role
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
        });

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

      // Recalculate all existing payments
      if (event) {
        await recalculatePayments(eventId, event.totalAmount, newParticipantCount);
      }

      setMessage(`Successfully added ${selectedPlayers.size} participant(s) with payment records (pending status)`);
      
      // Clear selection
      setSelectedPlayers(new Set());
      
      setTimeout(() => setMessage(''), 3000);

    } catch (error) {
      console.error('Error adding participants:', error);
      setMessage('Failed to add participants');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setProcessing(false);
    }
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

  // Helper function to get role badge
  const getRoleBadge = (playerRole: string) => {
    switch (playerRole) {
      case 'secretary':
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-50 text-purple-700 border border-purple-200">
            Secretary
          </span>
        );
      case 'treasurer':
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-50 text-orange-700 border border-orange-200">
            Treasurer
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            Player
          </span>
        );
    }
  };

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
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900">
                Add Participants
              </h1>
              {event && (
                <p className="text-xs sm:text-sm text-gray-600 truncate">
                  {event.title} • {event.date.toDate().toLocaleDateString('en-IN')} • {event.time}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-10">
        {message && (
          <div className={`mb-6 p-4 rounded-lg border-l-4 ${
            message.includes('Successfully')
              ? 'bg-green-50 border-green-500 text-green-800'
              : message.includes('Please')
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
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Turf Details</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Current Participants</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">
                    {currentParticipants.size}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Total Amount</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">₹{event?.totalAmount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Status</p>
                  <span className={`inline-block px-2 sm:px-3 py-1 rounded-lg text-xs font-semibold ${
                    event?.status === 'open' ? 'bg-green-50 text-green-700 border border-green-200' :
                    event?.status === 'closed' ? 'bg-red-50 text-red-700 border border-red-200' :
                    'bg-gray-100 text-gray-700 border border-gray-200'
                  }`}>
                    {event?.status.toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Selected to Add</p>
                  <p className="text-xl sm:text-2xl font-bold text-red-600">{selectedPlayers.size}</p>
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
                  All authorized users are already in this event
                </p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 mb-6">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
                    Available Participants ({availablePlayers.length})
                  </h2>
                  
                 

                  <div className="space-y-2 sm:space-y-3">
                    {availablePlayers.map((player) => (
                      <div
                        key={player.id}
                        onClick={() => togglePlayerSelection(player.id)}
                        className={`flex items-center justify-between p-3 sm:p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                          selectedPlayers.has(player.id)
                            ? 'border-red-600 bg-red-50'
                            : 'border-gray-200 hover:border-red-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center flex-1 min-w-0 mr-3">
                          <div
                            className={`w-5 h-5 sm:w-6 sm:h-6 rounded border-2 mr-3 sm:mr-4 flex items-center justify-center flex-shrink-0 ${
                              selectedPlayers.has(player.id)
                                ? 'bg-red-600 border-red-600'
                                : 'border-gray-300'
                            }`}
                          >
                            {selectedPlayers.has(player.id) && (
                              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="text-sm sm:text-base font-semibold text-gray-900 truncate">{player.name}</p>
                              {getRoleBadge(player.role)}
                              <span
                                className={`px-2 py-0.5 text-xs font-semibold rounded-full flex-shrink-0 ${
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
                        <span className="text-xs sm:text-sm text-red-600 font-semibold flex-shrink-0">
                          {selectedPlayers.has(player.id) ? 'Selected' : 'Select'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <button
                      onClick={handleAddPlayers}
                      disabled={selectedPlayers.size === 0 || processing}
                      className="flex-1 px-4 sm:px-6 py-3 sm:py-4 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm sm:text-base rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processing
                        ? 'Adding Participants...'
                        : selectedPlayers.size > 0
                        ? `Add ${selectedPlayers.size} Participant${selectedPlayers.size !== 1 ? 's' : ''}`
                        : 'Select Participants to Add'}
                    </button>
                    <button
                      onClick={() => setSelectedPlayers(new Set())}
                      disabled={selectedPlayers.size === 0 || processing}
                      className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm sm:text-base rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
