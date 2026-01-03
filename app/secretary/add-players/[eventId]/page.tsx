'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { recalculatePayments } from '@/lib/eventManagement';

interface Player {
  id: string;
  name: string;
  email: string;
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
  const [appointedPlayers, setAppointedPlayers] = useState<Player[]>([]);
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
        setMessage('❌ Event not found');
        return;
      }

      const eventData = eventDoc.data();
      setEvent({
        id: eventDoc.id,
        title: eventData.title,
        date: eventData.date,
        time: eventData.time,
        totalAmount: eventData.totalAmount,
        participantCount: eventData.participantCount,
        status: eventData.status,
      });

      // Fetch current participants
      const participantsRef = collection(db, 'eventParticipants');
      const participantsSnapshot = await getDocs(participantsRef);
      const participantIds = new Set<string>();

      participantsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.eventId === eventId && data.currentStatus === 'joined') {
          participantIds.add(data.playerId);
        }
      });

      setCurrentParticipants(participantIds);

      // Fetch appointed players (not already in event)
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      const players: Player[] = [];

      usersSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.role === 'player' && data.isAppointed === true && !participantIds.has(docSnap.id)) {
          players.push({
            id: docSnap.id,
            name: data.name || data.email?.split('@')[0] || 'Player',
            email: data.email,
          });
        }
      });

      setAppointedPlayers(players);
    } catch (error) {
      console.error('Error fetching data:', error);
      setMessage('❌ Failed to load data');
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

const fetchData = async () => {
  try {
    setLoadingData(true);

    // ✅ Fetch event details with real-time read (no cache)
    const eventDoc = await getDoc(doc(db, 'events', eventId));
    if (!eventDoc.exists()) {
      setMessage('❌ Event not found');
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
      participantCount: eventData.participantCount || 0, // ✅ Default to 0
      status: eventData.status,
    });

    // ✅ Fetch current participants from eventParticipants collection
    const participantsRef = collection(db, 'eventParticipants');
    const participantsSnapshot = await getDocs(participantsRef);
    const participantIds = new Set<string>();

    participantsSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.eventId === eventId && data.currentStatus === 'joined') {
        participantIds.add(data.playerId);
      }
    });

    console.log('👥 Actual Participants in DB:', {
      count: participantIds.size,
      ids: Array.from(participantIds),
    });

    setCurrentParticipants(participantIds);

    // ✅ Fetch appointed players (not already in event)
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    const players: Player[] = [];

    usersSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.role === 'player' && data.isAppointed === true && !participantIds.has(docSnap.id)) {
        players.push({
          id: docSnap.id,
          name: data.displayName || data.name || data.email?.split('@')[0] || 'Player',
          email: data.email,
        });
      }
    });

    console.log('✅ Available Players to Add:', {
      count: players.length,
      players: players.map(p => p.name),
    });

    setAppointedPlayers(players);
  } catch (error) {
    console.error('❌ Error fetching data:', error);
    setMessage('❌ Failed to load data');
  } finally {
    setLoadingData(false);
  }
};


  if (loading || !user || role !== 'secretary') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">➕ Add Players</h1>
              {event && (
                <p className="text-purple-100 text-base">
                  {event.title} • {event.date.toDate().toLocaleDateString('en-IN')} • {event.time}
                </p>
              )}
            </div>
            <button
              onClick={() => router.back()}
              className="px-6 py-3 bg-white text-purple-600 font-bold rounded-lg hover:bg-purple-50 transition shadow-md"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg text-center font-bold text-lg ${
              message.includes('✅')
                ? 'bg-green-100 text-green-800 border-2 border-green-300'
                : message.includes('⚠️')
                ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-300'
                : 'bg-red-100 text-red-800 border-2 border-red-300'
            }`}
          >
            {message}
          </div>
        )}

        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 text-lg font-medium">Loading players...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Event Info */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Event Details</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-600">Current Players</p>
                  <p className="text-2xl font-bold text-purple-600">{event?.participantCount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Total Amount</p>
                  <p className="text-2xl font-bold text-gray-900">₹{event?.totalAmount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Status</p>
                  <span className="inline-block px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-bold">
                    {event?.status.toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Selected to Add</p>
                  <p className="text-2xl font-bold text-green-600">{selectedPlayers.size}</p>
                </div>
              </div>
            </div>

            {/* Players List */}
            {appointedPlayers.length === 0 ? (
              <div className="bg-white p-12 rounded-xl text-center shadow-lg border border-gray-200">
                <div className="text-6xl mb-4">👥</div>
                <p className="text-xl text-gray-600 font-semibold">No available players to add</p>
                <p className="text-gray-500 mt-2">
                  All appointed players are already in this event
                </p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    Available Appointed Players ({appointedPlayers.length})
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Select players to add to this closed event. Payments will be recalculated automatically.
                  </p>

                  <div className="space-y-3">
                    {appointedPlayers.map((player) => (
                      <div
                        key={player.id}
                        onClick={() => togglePlayerSelection(player.id)}
                        className={`flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition ${
                          selectedPlayers.has(player.id)
                            ? 'border-purple-600 bg-purple-50'
                            : 'border-gray-200 hover:border-purple-300'
                        }`}
                      >
                        <div className="flex items-center">
                          <div
                            className={`w-6 h-6 rounded border-2 mr-4 flex items-center justify-center ${
                              selectedPlayers.has(player.id)
                                ? 'bg-purple-600 border-purple-600'
                                : 'border-gray-300'
                            }`}
                          >
                            {selectedPlayers.has(player.id) && (
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <p className="text-base font-semibold text-gray-900">{player.name}</p>
                            <p className="text-sm text-gray-600">{player.email}</p>
                          </div>
                        </div>
                        <span className="text-sm text-purple-600 font-semibold">
                          {selectedPlayers.has(player.id) ? 'Selected' : 'Click to select'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                  <div className="flex gap-4">
                    <button
                      onClick={handleAddPlayers}
                      disabled={selectedPlayers.size === 0 || processing}
                      className="flex-1 px-6 py-4 bg-purple-600 text-white font-bold text-lg rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processing
                        ? '⏳ Adding Players...'
                        : `✓ Add ${selectedPlayers.size} Player${selectedPlayers.size !== 1 ? 's' : ''}`}
                    </button>
                    <button
                      onClick={() => setSelectedPlayers(new Set())}
                      disabled={selectedPlayers.size === 0 || processing}
                      className="px-6 py-4 bg-gray-300 text-gray-700 font-bold text-lg rounded-lg hover:bg-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Clear Selection
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
