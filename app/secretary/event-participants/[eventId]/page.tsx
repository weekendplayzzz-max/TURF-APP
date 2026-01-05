'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { collection, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';

interface Participant {
  id: string;
  playerId: string;
  playerName: string;
  playerEmail: string;
  playerType?: 'regular' | 'guest';
  playerRole?: string;
  playerStatus?: string;
  parentId?: string;
  parentName?: string;
  joinedAt: Timestamp;
}

interface Event {
  title: string;
  date: Timestamp;
  time: string;
  status: string;
  participantCount: number;
}

export default function EventParticipants() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const eventId = params?.eventId as string;

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [event, setEvent] = useState<Event | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && role !== 'secretary') {
      router.push('/login');
    }
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'secretary' && eventId) {
      fetchEventAndParticipants();
    }
  }, [role, eventId]);

  const fetchEventAndParticipants = async () => {
    try {
      setLoadingData(true);

      // Fetch event details
      const eventDoc = await getDoc(doc(db, 'events', eventId));
      if (eventDoc.exists()) {
        const eventData = eventDoc.data();
        setEvent({
          title: eventData.title,
          date: eventData.date,
          time: eventData.time,
          status: eventData.status,
          participantCount: eventData.participantCount || 0,
        });
      }

      // Fetch participants
      const participantsRef = collection(db, 'eventParticipants');
      const participantsSnapshot = await getDocs(participantsRef);

      const participantsList: Participant[] = [];
      participantsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.eventId === eventId && data.currentStatus === 'joined') {
          participantsList.push({
            id: docSnap.id,
            playerId: data.playerId,
            playerName: data.playerName,
            playerEmail: data.playerEmail,
            playerType: data.playerType || 'regular',
            playerRole: data.playerRole,
            playerStatus: data.playerStatus,
            parentId: data.parentId,
            parentName: data.parentName,
            joinedAt: data.joinedAt,
          });
        }
      });

      // Sort by joined date
      participantsList.sort((a, b) => {
        return a.joinedAt?.toMillis() - b.joinedAt?.toMillis();
      });

      setParticipants(participantsList);
    } catch (error) {
      console.error('Error fetching participants:', error);
    } finally {
      setLoadingData(false);
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

  // Helper function to get role/type badge
  const getParticipantBadge = (participant: Participant) => {
    if (participant.playerType === 'guest') {
      return (
        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold rounded-full">
          Guest
        </span>
      );
    }

    const roleConfig: { [key: string]: { color: string; label: string } } = {
      'secretary': { color: 'bg-orange-50 text-orange-700 border-orange-200', label: 'Secretary' },
      'treasurer': { color: 'bg-green-50 text-green-700 border-green-200', label: 'Treasurer' },
      'player': { color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Player' },
    };

    const config = roleConfig[participant.playerRole || 'player'] || roleConfig['player'];

    return (
      <span className={`px-2 py-0.5 border text-xs font-bold rounded-full ${config.color}`}>
        {config.label}
      </span>
    );
  };

  // Count participants by type
  const regularCount = participants.filter(p => p.playerType === 'regular').length;
  const guestCount = participants.filter(p => p.playerType === 'guest').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
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
                  Event Participants
                </h1>
                {event && (
                  <p className="text-xs sm:text-sm text-gray-600 truncate">
                    {event.title} • {event.date?.toDate().toLocaleDateString('en-IN', {
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
            {/* Summary Card */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-xl p-3 sm:p-4">
                  <p className="text-xs text-gray-600 mb-1">Total Participants</p>
                  <p className="text-xl sm:text-2xl font-bold text-blue-600">
                    {participants.length}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 sm:p-4">
                  <p className="text-xs text-gray-600 mb-1">Users</p>
                  <p className="text-xl sm:text-2xl font-bold text-purple-600">
                    {regularCount}
                  </p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 sm:p-4">
                  <p className="text-xs text-gray-600 mb-1">Guests</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-600">
                    {guestCount}
                  </p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 sm:p-4">
                  <p className="text-xs text-gray-600 mb-1">Event Status</p>
                  <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold border ${
                    event?.status === 'open'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : event?.status === 'closed'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-gray-100 text-gray-700 border-gray-200'
                  }`}>
                    {event?.status?.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Participants List */}
            {participants.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 sm:p-12 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <p className="text-lg sm:text-xl font-bold text-gray-900 mb-2">No participants yet</p>
                <p className="text-sm sm:text-base text-gray-600">
                  {event?.status === 'open'
                    ? 'Players can join this event until the deadline'
                    : 'No players joined this event'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                {/* Mobile View - Cards */}
                <div className="block md:hidden divide-y divide-gray-200">
                  {participants.map((participant, index) => (
                    <div key={participant.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">
                              {participant.playerName}
                            </p>
                            <p className="text-xs text-gray-600 truncate">
                              {participant.playerType === 'guest' 
                                ? `Managed by ${participant.parentName || 'Unknown'}`
                                : participant.playerEmail}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        {getParticipantBadge(participant)}
                        {participant.playerStatus && (
                          <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                            participant.playerStatus === 'Active'
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-orange-50 text-orange-700 border border-orange-200'
                          }`}>
                            {participant.playerStatus}
                          </span>
                        )}
                        <span className="text-xs text-gray-500 ml-auto">
                          {participant.joinedAt?.toDate().toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop View - Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-red-600 text-white">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-bold">#</th>
                        <th className="px-4 py-3 text-left text-sm font-bold">Participant</th>
                        <th className="px-4 py-3 text-left text-sm font-bold">Contact / Parent</th>
                        <th className="px-4 py-3 text-center text-sm font-bold">Type</th>
                        <th className="px-4 py-3 text-center text-sm font-bold">Status</th>
                        <th className="px-4 py-3 text-left text-sm font-bold">Joined On</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {participants.map((participant, index) => (
                        <tr key={participant.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                              {index + 1}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-bold text-gray-900">{participant.playerName}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-600">
                              {participant.playerType === 'guest' 
                                ? `Managed by ${participant.parentName || 'Unknown'}`
                                : participant.playerEmail}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getParticipantBadge(participant)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {participant.playerStatus ? (
                              <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full ${
                                participant.playerStatus === 'Active'
                                  ? 'bg-green-50 text-green-700 border border-green-200'
                                  : 'bg-orange-50 text-orange-700 border border-orange-200'
                              }`}>
                                {participant.playerStatus}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {participant.joinedAt?.toDate().toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
