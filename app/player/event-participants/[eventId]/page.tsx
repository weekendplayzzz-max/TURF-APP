'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { collection, getDocs, doc, getDoc, query, where, Timestamp } from 'firebase/firestore';

interface Participant {
  id: string;
  playerId: string;
  playerName: string;
  playerEmail: string;
  joinedAt: Timestamp;
}

interface Event {
  title: string;
  date: Timestamp;
  time: string;
  status: string;
  totalAmount: number;
  durationHours: number;
}

export default function PlayerEventParticipants() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const eventId = params?.eventId as string;

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [event, setEvent] = useState<Event | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!loading && role !== 'player') {
      router.push('/login');
    }
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'player' && eventId) {
      fetchEventAndParticipants();
    }
  }, [role, eventId]);

  const fetchEventAndParticipants = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoadingData(true);
      }

      // Fetch event details
      const eventDoc = await getDoc(doc(db, 'events', eventId));
      if (eventDoc.exists()) {
        const eventData = eventDoc.data();
        setEvent({
          title: eventData.title,
          date: eventData.date,
          time: eventData.time,
          status: eventData.status,
          totalAmount: eventData.totalAmount || 0,
          durationHours: eventData.durationHours || 0,
        });
      }

      // Fetch participants with optimized query
      const participantsRef = collection(db, 'eventParticipants');
      const participantsQuery = query(
        participantsRef,
        where('eventId', '==', eventId),
        where('currentStatus', '==', 'joined')
      );
      const participantsSnapshot = await getDocs(participantsQuery);

      const participantsList: Participant[] = [];
      participantsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        participantsList.push({
          id: docSnap.id,
          playerId: data.playerId,
          playerName: data.playerName,
          playerEmail: data.playerEmail,
          joinedAt: data.joinedAt,
        });
      });

      // Sort by joined date (earliest first)
      participantsList.sort((a, b) => {
        return a.joinedAt?.toMillis() - b.joinedAt?.toMillis();
      });

      setParticipants(participantsList);
    } catch (error) {
      console.error('Error fetching participants:', error);
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchEventAndParticipants(true);
  };

  if (loading || !user || role !== 'player') {
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
          <div className="flex items-center justify-between gap-3">
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
                <h1 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900 truncate">
                  Participants
                </h1>
                {event && (
                  <p className="text-xs sm:text-sm text-gray-600 truncate">
                    {event.title}
                  </p>
                )}
              </div>
            </div>

            {/* Refresh Button - Only for open events */}
            {event?.status === 'open' && !loadingData && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 sm:p-2.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh Participants"
              >
                <svg 
                  className={`w-5 h-5 sm:w-6 sm:h-6 text-gray-700 ${refreshing ? 'animate-spin' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
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
            {/* Event Info Card */}
            {event && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 break-words">
                      {event.title}
                    </h2>
                    <div className="flex flex-wrap gap-3 text-xs sm:text-sm text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>{event.date?.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
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
                    </div>
                  </div>
                  <span className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold ${
                    event.status === 'open'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : event.status === 'closed'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-gray-100 text-gray-700 border border-gray-200'
                  }`}>
                    {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="text-center">
                    <p className="text-xs text-gray-600 mb-1">Total Participants</p>
                    <div className="flex items-center justify-center gap-2">
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900">{participants.length}</p>
                      {event.status === 'open' && participants.length > 0 && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-600 mb-1">Turf Cost</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                      ₹{event.totalAmount.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-600 mb-1">Duration</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                      {event.durationHours}h
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Live Update Notice (for open events) */}
            {event?.status === 'open' && (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-lg animate-slideDown">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                  </span>
                  <p className="text-xs sm:text-sm text-blue-800 font-semibold">
                    Live participant list - Click refresh icon in header to update
                  </p>
                </div>
              </div>
            )}

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
                    ? 'Be the first to join this event!'
                    : 'No players joined this event'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                {/* Desktop Table View */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-900 text-white">
                      <tr>
                        <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm font-bold uppercase">#</th>
                        <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm font-bold uppercase">
                          Player Name
                        </th>
                        <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm font-bold uppercase">
                          Joined On
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {participants.map((participant, index) => (
                        <tr
                          key={participant.id}
                          className={`hover:bg-gray-50 transition ${
                            participant.playerId === user?.uid ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                          }`}
                        >
                          <td className="px-4 md:px-6 py-3 md:py-4 text-gray-900 font-semibold text-sm md:text-base">
                            {index + 1}
                          </td>
                          <td className="px-4 md:px-6 py-3 md:py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 md:w-10 md:h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm md:text-base flex-shrink-0">
                                {participant.playerName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className="text-gray-900 font-semibold text-sm md:text-base">
                                  {participant.playerName}
                                  {participant.playerId === user?.uid && (
                                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold border border-blue-200">
                                      YOU
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 md:px-6 py-3 md:py-4 text-gray-600 text-xs md:text-sm">
                            {participant.joinedAt?.toDate().toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                            <br className="hidden md:block" />
                            <span className="text-gray-500">
                              {participant.joinedAt?.toDate().toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="sm:hidden divide-y divide-gray-200">
                  {participants.map((participant, index) => (
                    <div
                      key={participant.id}
                      className={`p-4 ${
                        participant.playerId === user?.uid ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-gray-600 font-bold text-sm">#{index + 1}</span>
                        <div className="w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">
                          {participant.playerName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 font-semibold text-sm truncate">
                            {participant.playerName}
                          </p>
                          {participant.playerId === user?.uid && (
                            <span className="inline-block mt-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold border border-blue-200">
                              YOU
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-14 text-xs text-gray-600">
                        Joined: {participant.joinedAt?.toDate().toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}{' '}
                        at {participant.joinedAt?.toDate().toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
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

        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
