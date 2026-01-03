'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

interface Player {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export default function ViewPlayers() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (!user || role !== 'secretary') {
      router.push('/login');
      return;
    }

    fetchPlayers();
  }, [loading, role, user]);

  const fetchPlayers = async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'player'));
      const snap = await getDocs(q);

      const list = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Player))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      setPlayers(list);
    } catch (err) {
      console.error('Error fetching players:', err);
    } finally {
      setLoadingPlayers(false);
    }
  };

  if (loading || loadingPlayers) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-700 text-white p-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">View Players</h1>
          <p className="text-blue-200 text-sm">All appointed players</p>
        </div>
        <button
          onClick={() => router.back()}
          className="bg-white text-blue-700 px-4 py-2 rounded font-semibold"
        >
          ← Back
        </button>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto p-6">
        <div className="bg-white p-6 rounded shadow mb-6">
          <p className="text-sm text-gray-600">Total Players</p>
          <p className="text-4xl font-bold text-blue-600">{players.length}</p>
        </div>

        {players.length === 0 ? (
          <p className="text-center text-gray-600">No players appointed yet</p>
        ) : (
          <div className="bg-white rounded shadow overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Email</th>
                  <th className="px-6 py-3 text-left">Role</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.id} className={i % 2 ? 'bg-gray-50' : ''}>
                    <td className="px-6 py-3 font-medium">{p.displayName}</td>
                    <td className="px-6 py-3 text-sm text-gray-600">{p.email}</td>
                    <td className="px-6 py-3">
                      <span className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                        {p.role.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
