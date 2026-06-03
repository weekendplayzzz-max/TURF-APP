'use client';

import { useState } from 'react';
import { backfillSeasons } from '@/lib/backfillSeasons';

export default function BackfillPage() {
  const [status, setStatus]   = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleBackfill = async () => {
    try {
      setLoading(true);
      setStatus('Running backfill... please wait.');
      const result = await backfillSeasons();
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

      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16M10 11v6M14 11v6" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-black text-gray-900">Season Backfill</h1>
            <p className="text-xs text-gray-500">Secretary Tool · One-time operation</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-6 space-y-4">

        {/* What this does */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <p className="text-11px font-black text-gray-400 uppercase tracking-widest mb-3">
            What This Does
          </p>
          <div className="space-y-3">
            {[
              'Reads all existing completed matches from Firestore',
              'Groups them into seasons of 15 matches each',
              'Writes season-level player stats for every player',
              'Creates season records for all completed + current seasons',
              'Computes best forward & best defender for past seasons',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-9px font-black text-red-600">{i + 1}</span>
                </div>
                <p className="text-sm text-gray-700 font-medium">{item}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Warning */}
        <div className="bg-yellow-50 rounded-3xl border border-yellow-200 p-5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-black text-yellow-800 mb-1">Run this only once</p>
              <p className="text-xs text-yellow-700 font-medium leading-relaxed">
                This is a one-time setup operation after deploying the season feature.
                It is safe to re-run — it will automatically skip if seasons already exist.
                Do not run this repeatedly as it may cause duplicate data.
              </p>
            </div>
          </div>
        </div>

        {/* Confirm checkbox */}
        {!done && (
          <div
            onClick={() => setConfirmed(p => !p)}
            className="flex items-center gap-3 px-4 py-3.5 bg-white rounded-2xl border border-gray-200 cursor-pointer active:bg-gray-50 transition-colors select-none"
          >
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
              confirmed ? 'bg-red-600 border-red-600' : 'border-gray-300'
            }`}>
              {confirmed && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-700">
              I understand this is a one-time operation
            </p>
          </div>
        )}

        {/* Status message */}
        {status && (
          <div className={`rounded-2xl p-4 border ${
            done
              ? 'bg-green-50 border-green-200'
              : status.startsWith('Error')
              ? 'bg-red-50 border-red-200'
              : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-start gap-3">
              {done ? (
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : status.startsWith('Error') ? (
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <div className="w-5 h-5 flex-shrink-0 mt-0.5">
                  <div className="relative w-5 h-5">
                    <div className="absolute inset-0 border-2 border-blue-600/20 rounded-full" />
                    <div className="absolute inset-0 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                </div>
              )}
              <p className={`text-sm font-semibold ${
                done ? 'text-green-800'
                : status.startsWith('Error') ? 'text-red-800'
                : 'text-blue-800'
              }`}>
                {status}
              </p>
            </div>
          </div>
        )}

        {/* Action button */}
        {!done ? (
          <button
            onClick={handleBackfill}
            disabled={loading || !confirmed}
            className="w-full py-4 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="relative w-4 h-4">
                  <div className="absolute inset-0 border-2 border-white/30 rounded-full" />
                  <div className="absolute inset-0 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
                Running Backfill...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Run Season Backfill
              </>
            )}
          </button>
        ) : (
          <div className="w-full py-4 bg-green-600 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Backfill Complete
          </div>
        )}

      </div>
    </div>
  );
}