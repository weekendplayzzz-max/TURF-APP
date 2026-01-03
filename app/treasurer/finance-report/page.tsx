'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, Timestamp } from 'firebase/firestore';

interface Finance {
  id: string;
  playerId: string;
  playerName: string;
  amount: number;
  type: 'contribution' | 'expense';
  description: string;
  date: Timestamp;
}

interface PlayerSummary {
  playerId: string;
  playerName: string;
  totalContributions: number;
  totalExpenses: number;
  balance: number;
}

export default function FinanceReport() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [finances, setFinances] = useState<Finance[]>([]);
  const [playerSummaries, setPlayerSummaries] = useState<PlayerSummary[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [totalContributions, setTotalContributions] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);

  // 🔐 Role protection
  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  // 📊 Fetch finance report
  const fetchReport = useCallback(async () => {
    try {
      setLoadingData(true);

      const snapshot = await getDocs(collection(db, 'finances'));

      const financeList: Finance[] = [];
      const playerMap = new Map<string, PlayerSummary>();

      let contributions = 0;
      let expenses = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();

        const finance: Finance = {
          id: doc.id,
          playerId: data.playerId,
          playerName: data.playerName,
          amount: Number(data.amount) || 0,
          type: data.type,
          description: data.description || '',
          date: data.date,
        };

        financeList.push(finance);

        if (finance.type === 'contribution') {
          contributions += finance.amount;
        } else {
          expenses += finance.amount;
        }

        if (!playerMap.has(finance.playerId)) {
          playerMap.set(finance.playerId, {
            playerId: finance.playerId,
            playerName: finance.playerName,
            totalContributions: 0,
            totalExpenses: 0,
            balance: 0,
          });
        }

        const summary = playerMap.get(finance.playerId)!;

        if (finance.type === 'contribution') {
          summary.totalContributions += finance.amount;
        } else {
          summary.totalExpenses += finance.amount;
        }

        summary.balance =
          summary.totalContributions - summary.totalExpenses;
      });

      setFinances(financeList);
      setPlayerSummaries(Array.from(playerMap.values()));
      setTotalContributions(contributions);
      setTotalExpenses(expenses);
    } catch (err) {
      console.error('Error fetching finance report:', err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'treasurer') {
      fetchReport();
    }
  }, [role, fetchReport]);

  if (loading || !user || role !== 'treasurer') return null;

  const balance = totalContributions - totalExpenses;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-800 text-white">
        <div className="max-w-7xl mx-auto px-6 py-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold">📈 Finance Report</h1>
            <p className="text-green-100">
              Detailed financial overview
            </p>
          </div>
          <button
            onClick={() => router.back()}
            className="bg-white text-green-700 px-6 py-3 rounded-lg font-bold"
          >
            ← Back
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {loadingData ? (
          <div className="text-center py-20">
            <div className="animate-spin h-12 w-12 border-4 border-green-600 border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-gray-600">Loading report...</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid md:grid-cols-3 gap-6 mb-10">
              <SummaryCard title="Total Contributions" value={totalContributions} color="green" />
              <SummaryCard title="Total Expenses" value={totalExpenses} color="red" />
              <SummaryCard title="Net Balance" value={balance} color="blue" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// 🔹 Reusable summary card
function SummaryCard({
  title,
  value,
  color,
}: {
  title: string;
  value: number;
  color: 'green' | 'red' | 'blue';
}) {
  return (
    <div className={`p-8 rounded-xl shadow border bg-${color}-50`}>
      <p className="text-sm font-bold uppercase text-gray-600">{title}</p>
      <p className={`text-4xl font-black text-${color}-700 mt-3`}>
        ₹{value.toLocaleString()}
      </p>
    </div>
  );
}
