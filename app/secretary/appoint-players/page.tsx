'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';

interface Player {
  id: string;
  name: string;
  email: string;
  isAppointed: boolean;
  appointedBy?: string;
  appointedAt?: Timestamp;
}

export default function AppointPlayers() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [message, setMessage] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && role !== 'secretary') {
      router.push('/login');
    }
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'secretary') {
      fetchPlayers();
    }
  }, [role]);

  const fetchPlayers = async () => {
    try {
      setLoadingData(true);
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);

      const playersList: Player[] = [];
      usersSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.role === 'player') {
          playersList.push({
            id: docSnap.id,
            name: data.displayName || data.name || data.email?.split('@')[0] || 'Player',
            email: data.email,
            isAppointed: data.isAppointed === true, // ✅ Strict check
            appointedBy: data.appointedBy,
            appointedAt: data.appointedAt,
          });
        }
      });

      setPlayers(playersList);
    } catch (error) {
      console.error('Error fetching players:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const appointPlayer = async (playerId: string, playerName: string) => {
    if (!user) return;

    try {
      setProcessing(playerId);

      // ✅ FIX: Properly update to true
      await updateDoc(doc(db, 'users', playerId), {
        isAppointed: true, // ✅ Boolean true
        appointedBy: user.uid,
        appointedAt: Timestamp.now(),
      });

      setMessage(`✅ ${playerName} has been appointed`);
      setTimeout(() => {
        setMessage('');
        fetchPlayers(); // ✅ Refresh list
      }, 1500);
    } catch (error) {
      console.error('Error appointing player:', error);
      setMessage('❌ Failed to appoint player');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setProcessing(null);
    }
  };

  const removeAppointment = async (playerId: string, playerName: string) => {
    if (!confirm(`Remove appointment for ${playerName}?`)) {
      return;
    }

    try {
      setProcessing(playerId);

      // ✅ FIX: Set to false (not null) so they appear in "Available Players"
      await updateDoc(doc(db, 'users', playerId), {
        isAppointed: false, // ✅ Boolean false
        appointedBy: null,
        appointedAt: null,
      });

      setMessage(`✅ Removed appointment for ${playerName}`);
      setTimeout(() => {
        setMessage('');
        fetchPlayers(); // ✅ Refresh list
      }, 1500);
    } catch (error) {
      console.error('Error removing appointment:', error);
      setMessage('❌ Failed to remove appointment');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setProcessing(null);
    }
  };

  if (loading || !user || role !== 'secretary') {
    return null;
  }

  const appointedPlayers = players.filter((p) => p.isAppointed === true);
  const notAppointedPlayers = players.filter((p) => p.isAppointed === false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">👥 Appoint Players</h1>
              <p className="text-purple-100 text-base">Manage appointed players for events</p>
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

        {/* Summary */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
          <div className="grid grid-cols-2 gap-6 text-center">
            <div>
              <p className="text-gray-600 text-sm font-medium mb-2">Appointed Players</p>
              <p className="text-4xl font-bold text-green-600">{appointedPlayers.length}</p>
            </div>
            <div>
              <p className="text-gray-600 text-sm font-medium mb-2">Not Appointed</p>
              <p className="text-4xl font-bold text-gray-600">{notAppointedPlayers.length}</p>
            </div>
          </div>
        </div>

        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 text-lg font-medium">Loading players...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Appointed Players */}
            {appointedPlayers.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                  <span className="text-green-600 mr-2">✓</span>
                  Appointed Players ({appointedPlayers.length})
                </h2>
                <div className="space-y-3">
                  {appointedPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-4 rounded-lg border-2 border-green-200 bg-green-50"
                    >
                      <div>
                        <p className="text-base font-semibold text-gray-900">{player.name}</p>
                        <p className="text-sm text-gray-600">{player.email}</p>
                        {player.appointedAt && (
                          <p className="text-xs text-gray-500 mt-1">
                            Appointed on {player.appointedAt.toDate().toLocaleDateString('en-IN')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeAppointment(player.id, player.name)}
                        disabled={processing === player.id}
                        className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                      >
                        {processing === player.id ? '⏳' : '✗ Remove'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Not Appointed Players */}
            {notAppointedPlayers.length > 0 ? (
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  Available Players ({notAppointedPlayers.length})
                </h2>
                <div className="space-y-3">
                  {notAppointedPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-4 rounded-lg border-2 border-gray-200 hover:border-purple-300 transition"
                    >
                      <div>
                        <p className="text-base font-semibold text-gray-900">{player.name}</p>
                        <p className="text-sm text-gray-600">{player.email}</p>
                      </div>
                      <button
                        onClick={() => appointPlayer(player.id, player.name)}
                        disabled={processing === player.id}
                        className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                      >
                        {processing === player.id ? '⏳ Appointing...' : '✓ Appoint'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              appointedPlayers.length > 0 && (
                <div className="bg-white p-12 rounded-xl text-center shadow-lg border border-gray-200">
                  <div className="text-6xl mb-4">🎉</div>
                  <p className="text-xl text-gray-600 font-semibold">All players are appointed!</p>
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
