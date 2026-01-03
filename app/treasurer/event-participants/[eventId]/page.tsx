'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, Timestamp} from 'firebase/firestore';

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
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'treasurer' && eventId) {
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

  if (loading || !user || role !== 'treasurer') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">👥 Event Participants</h1>
              {event && (
                <p className="text-blue-100 text-base">
                  {event.title} • {event.date?.toDate().toLocaleDateString('en-IN')} • {event.time}
                </p>
              )}
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

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 text-lg font-medium">Loading participants...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Summary Card */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <p className="text-gray-600 text-sm font-medium mb-2">Total Participants</p>
                  <p className="text-4xl font-bold text-blue-600">{participants.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600 text-sm font-medium mb-2">Event Status</p>
                  <span
                    className={`inline-block px-6 py-2 rounded-full text-lg font-bold ${
                      event?.status === 'open'
                        ? 'bg-green-100 text-green-800'
                        : event?.status === 'closed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {event?.status?.toUpperCase()}
                  </span>
                </div>
                <div className="text-center">
                  <p className="text-gray-600 text-sm font-medium mb-2">Event Date</p>
                  <p className="text-xl font-bold text-gray-800">
                    {event?.date?.toDate().toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Participants List */}
            {participants.length === 0 ? (
              <div className="bg-white p-12 rounded-xl text-center shadow-lg border border-gray-200">
                <div className="text-6xl mb-4">👥</div>
                <p className="text-xl text-gray-600 font-semibold">No participants yet</p>
                <p className="text-gray-500 mt-2">
                  {event?.status === 'open'
                    ? 'Players can join this event until the deadline'
                    : 'No players joined this event'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-blue-600 text-white">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-bold uppercase">#</th>
                        <th className="px-6 py-4 text-left text-sm font-bold uppercase">
                          Player Name
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold uppercase">Email</th>
                        <th className="px-6 py-4 text-left text-sm font-bold uppercase">
                          Joined On
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {participants.map((participant, index) => (
                        <tr
                          key={participant.id}
                          className="hover:bg-blue-50 transition"
                        >
                          <td className="px-6 py-4 text-gray-900 font-semibold">
                            {index + 1}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-3">
                                {participant.playerName.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-gray-900 font-semibold">
                                {participant.playerName}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600">{participant.playerEmail}</td>
                          <td className="px-6 py-4 text-gray-600">
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
