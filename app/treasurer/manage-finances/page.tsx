'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';

interface Finance {
  id: string;
  playerId: string;
  playerName: string;
  amount: number;
  type: 'contribution' | 'expense';
  description: string;
  date: Timestamp;
  addedBy: string;
}

interface Player {
  id: string;
  playerName: string;
  playerEmail: string;
}

export default function ManageFinances() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [finances, setFinances] = useState<Finance[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    playerId: '',
    playerName: '',
    amount: '',
    type: 'contribution' as 'contribution' | 'expense',
    description: '',
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  const fetchData = useCallback(async () => {
    try {
      setLoadingData(true);

      // Fetch players
      const playersRef = collection(db, 'appointedPlayers');
      const playersSnapshot = await getDocs(playersRef);
      const playersList: Player[] = [];
      playersSnapshot.forEach((doc) => {
        const data = doc.data();
        playersList.push({
          id: data.playerId,
          playerName: data.playerName,
          playerEmail: data.playerEmail,
        });
      });
      setPlayers(playersList);

      // Fetch finances
      const financesRef = collection(db, 'finances');
      const financesSnapshot = await getDocs(financesRef);
      const financesList: Finance[] = [];
      financesSnapshot.forEach((doc) => {
        const data = doc.data();
        financesList.push({
          id: doc.id,
          playerId: data.playerId || '',
          playerName: data.playerName || 'Unknown',
          amount: Number(data.amount) || 0,
          type: data.type || 'contribution',
          description: data.description || '',
          date: data.date || Timestamp.now(),
          addedBy: data.addedBy || '',
        });
      });
      setFinances(financesList);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'treasurer') {
      fetchData();
    }
  }, [role, fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.playerId || !formData.amount || !formData.description) {
      setMessage('❌ Please fill all fields');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    try {
      const selectedPlayer = players.find((p) => p.id === formData.playerId);
      
      const financeRef = doc(collection(db, 'finances'));
      await setDoc(financeRef, {
        playerId: formData.playerId,
        playerName: selectedPlayer?.playerName || 'Unknown',
        amount: parseFloat(formData.amount),
        type: formData.type,
        description: formData.description,
        date: Timestamp.now(),
        addedBy: user?.uid || '',
        createdAt: Timestamp.now(),
      });

      setMessage('✅ Transaction added successfully');
      setFormData({
        playerId: '',
        playerName: '',
        amount: '',
        type: 'contribution',
        description: '',
      });
      setShowForm(false);
      setTimeout(() => {
        fetchData();
        setMessage('');
      }, 1500);
    } catch (error) {
      console.error('Error adding transaction:', error);
      setMessage('❌ Failed to add transaction');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transaction?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'finances', id));
      setMessage('✅ Transaction deleted');
      setTimeout(() => {
        fetchData();
        setMessage('');
      }, 1500);
    } catch (error) {
      console.error('Error deleting transaction:', error);
      setMessage('❌ Failed to delete transaction');
      setTimeout(() => setMessage(''), 3000);
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
              <h1 className="text-4xl font-bold mb-2">💵 Manage Finances</h1>
              <p className="text-blue-100 text-base">
                Add and manage financial transactions
              </p>
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
        {/* Message */}
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

        {/* Add Transaction Button */}
        <div className="mb-8">
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-8 py-4 bg-gradient-to-r from-green-600 to-green-700 text-white font-bold rounded-xl hover:from-green-700 hover:to-green-800 transition shadow-lg text-lg"
          >
            {showForm ? '✕ Cancel' : '+ Add New Transaction'}
          </button>
        </div>

        {/* Add Transaction Form */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-10 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">New Transaction</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-base">
                    Select Player *
                  </label>
                  <select
                    value={formData.playerId}
                    onChange={(e) =>
                      setFormData({ ...formData, playerId: e.target.value })
                    }
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-base"
                    required
                  >
                    <option value="">-- Choose Player --</option>
                    {players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.playerName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-base">
                    Transaction Type *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        type: e.target.value as 'contribution' | 'expense',
                      })
                    }
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-base"
                  >
                    <option value="contribution">💵 Contribution (Money In)</option>
                    <option value="expense">💸 Expense (Money Out)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-base">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    value={formData.amount}
                    onChange={(e) =>
                      setFormData({ ...formData, amount: e.target.value })
                    }
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-base"
                    placeholder="Enter amount"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-base">
                    Description *
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-base"
                    placeholder="e.g., Monthly fee, Equipment"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full px-6 py-4 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition shadow-md text-lg"
              >
                ✓ Add Transaction
              </button>
            </form>
          </div>
        )}

        {/* Transactions List */}
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 text-lg font-medium">Loading transactions...</p>
            </div>
          </div>
        ) : finances.length === 0 ? (
          <div className="bg-white p-12 rounded-xl text-center shadow-lg border border-gray-200">
            <div className="text-6xl mb-4">💰</div>
            <p className="text-xl text-gray-600 font-semibold">No transactions yet</p>
            <p className="text-gray-500 mt-2">Add your first transaction above</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-bold uppercase">Date</th>
                    <th className="px-6 py-4 text-left text-sm font-bold uppercase">Player</th>
                    <th className="px-6 py-4 text-left text-sm font-bold uppercase">Type</th>
                    <th className="px-6 py-4 text-left text-sm font-bold uppercase">Description</th>
                    <th className="px-6 py-4 text-left text-sm font-bold uppercase">Amount</th>
                    <th className="px-6 py-4 text-left text-sm font-bold uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {finances.map((finance) => (
                    <tr key={finance.id} className="hover:bg-blue-50 transition">
                      <td className="px-6 py-5 text-gray-700 text-base">
                        {finance.date ? new Date(finance.date.toDate()).toLocaleDateString('en-IN') : 'N/A'}
                      </td>
                      <td className="px-6 py-5 text-gray-900 font-semibold text-base">
                        {finance.playerName}
                      </td>
                      <td className="px-6 py-5">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-bold ${
                            finance.type === 'contribution'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {finance.type === 'contribution' ? '💵 In' : '💸 Out'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-gray-700 text-base">
                        {finance.description}
                      </td>
                      <td className="px-6 py-5">
                        <span
                          className={`font-bold text-lg ${
                            finance.type === 'contribution'
                              ? 'text-green-700'
                              : 'text-red-700'
                          }`}
                        >
                          ₹{(finance.amount || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <button
                          onClick={() => handleDelete(finance.id)}
                          className="px-4 py-2 bg-red-100 text-red-700 font-semibold rounded-lg hover:bg-red-200 transition text-sm"
                        >
                          Delete
                        </button>
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
