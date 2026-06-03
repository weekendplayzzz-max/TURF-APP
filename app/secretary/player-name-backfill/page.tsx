'use client';

import { useState } from 'react';
import { backfillPlayerNames } from '@/lib/backfillPlayerNames';

export default function PlayerNameBackfillPage() {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState(false);

  const handleRun = async () => {
    try {
      setLoading(true);
      setStatus('Updating old player names...');
      const result = await backfillPlayerNames();
      setStatus(result);
      setDone(true);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-lg font-black text-gray-900">Player Name Backfill</h1>
          <p className="text-xs text-gray-500">Secretary tool · one-time migration</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto w-full px-4 py-6 space-y-4">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
            What this does
          </p>
          <div className="space-y-2 text-sm text-gray-700 font-medium">
            <p>Reads names from userProfiles using userId and guestId.</p>
            <p>Updates old saved names in playerStats.</p>
            <p>Updates old saved names in seasonPlayerStats.</p>
            <p>Updates saved award winner names inside seasons docs.</p>
          </div>
        </div>

        <div className="bg-yellow-50 rounded-3xl border border-yellow-200 p-4">
          <p className="text-sm font-black text-yellow-800 mb-1">Run once only</p>
          <p className="text-xs text-yellow-700 font-medium">
            This fixes old saved names. Safe to rerun, but normally you should only need it once after deployment.
          </p>
        </div>

        {!done && (
          <div
            onClick={() => setConfirmed(v => !v)}
            className="flex items-center gap-3 px-4 py-3.5 bg-white rounded-2xl border border-gray-200 cursor-pointer"
          >
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
              confirmed ? 'bg-red-600 border-red-600' : 'border-gray-300'
            }`}>
              {confirmed && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-700">
              I understand this will update old saved names
            </p>
          </div>
        )}

        {status && (
          <div className={`rounded-2xl p-4 border ${
            done
              ? 'bg-green-50 border-green-200'
              : status.startsWith('Error')
              ? 'bg-red-50 border-red-200'
              : 'bg-blue-50 border-blue-200'
          }`}>
            <p className={`text-sm font-semibold ${
              done ? 'text-green-800' :
              status.startsWith('Error') ? 'text-red-800' :
              'text-blue-800'
            }`}>
              {status}
            </p>
          </div>
        )}

        {!done ? (
          <button
            onClick={handleRun}
            disabled={loading || !confirmed}
            className="w-full py-4 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-colors text-sm"
          >
            {loading ? 'Running...' : 'Run Player Name Backfill'}
          </button>
        ) : (
          <div className="w-full py-4 bg-green-600 text-white font-bold rounded-2xl text-sm text-center">
            Backfill Complete
          </div>
        )}
      </div>
    </div>
  );
}