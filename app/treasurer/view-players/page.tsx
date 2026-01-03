'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, Timestamp } from 'firebase/firestore';

interface AppointedPlayer {
  id: string;
  playerId: string;
  playerName: string;
  playerEmail: string;
  appointedBy: string;
  appointedAt: Timestamp;
}

export default function ViewPlayers() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<AppointedPlayer[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  const fetchPlayers = useCallback(async () => {
    try {
      setLoadingData(true);
      const playersRef = collection(db, 'appointedPlayers');
      const playersSnapshot = await getDocs(playersRef);
      
      const playersList: AppointedPlayer[] = [];
      playersSnapshot.forEach((doc) => {
        const data = doc.data();
        playersList.push({
          id: doc.id,
          playerId: data.playerId,
          playerName: data.playerName,
          playerEmail: data.playerEmail,
          appointedBy: data.appointedBy,
          appointedAt: data.appointedAt,
        });
      });

      setPlayers(playersList);
    } catch (error) {
      console.error('Error fetching players:', error);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'treasurer') {
      fetchPlayers();
    }
  }, [role, fetchPlayers]);

  if (loading || !user || role !== 'treasurer') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">👥 View Players</h1>
              <p className="text-purple-100 text-base">
                Total Players: <span className="font-bold">{players.length}</span>
              </p>
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
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 text-lg font-medium">Loading players...</p>
            </div>
          </div>
        ) : players.length === 0 ? (
          <div className="bg-white p-12 rounded-xl text-center shadow-lg border border-gray-200">
            <div className="text-6xl mb-4">👥</div>
            <p className="text-xl text-gray-600 font-semibold">No players appointed yet</p>
            <p className="text-gray-500 mt-2">Players will appear here once the Secretary appoints them</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-purple-600 to-purple-700 text-white">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-bold uppercase">#</th>
                    <th className="px-6 py-4 text-left text-sm font-bold uppercase">Player Name</th>
                    <th className="px-6 py-4 text-left text-sm font-bold uppercase">Email</th>
                    <th className="px-6 py-4 text-left text-sm font-bold uppercase">Appointed Date</th>
                    <th className="px-6 py-4 text-left text-sm font-bold uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {players.map((player, index) => (
                    <tr key={player.id} className="hover:bg-purple-50 transition">
                      <td className="px-6 py-5 text-gray-900 font-semibold text-lg">
                        {index + 1}
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold mr-3">
                            {player.playerName.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-gray-900 font-semibold text-base">
                            {player.playerName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-gray-700 text-base">
                        {player.playerEmail}
                      </td>
                      <td className="px-6 py-5 text-gray-600 text-base">
                        {new Date(player.appointedAt.toDate()).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-5">
                        <span className="px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-bold">
                          ✓ Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
