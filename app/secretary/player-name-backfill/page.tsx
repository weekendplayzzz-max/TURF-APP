'use client';

import { useState } from 'react';
import { backfillPlayerNames } from '@/lib/backfillPlayerNames';

function Spinner() {
  return (
    <div className="inline-block">
      <div className="relative w-5 h-5">
        <div className="absolute inset-0 border-2 border-white/30 rounded-full" />
        <div className="absolute inset-0 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

export default function PlayerNameBackfillPage() {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState(false);

  const handleRun = async () => {
    try {
      setLoading(true);
      setDone(false);
      setStatus('Updating saved player names across all collections...');
      const result = await backfillPlayerNames();
      setStatus(result);
      setDone(true);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || 'Something went wrong while running the backfill.'}`);
      setDone(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 sm:px-5 py-4">
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">
            Secretary Tool
          </p>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900">
            Player Name Backfill
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            One-time migration to sync old stored player names from userProfiles.
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto w-full px-4 sm:px-5 py-5 space-y-4">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-red-600" />
          <div className="p-5">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
              What this updates
            </p>

            <div className="space-y-2.5">
              {[
                'Reads correct full names from userProfiles using userId and guestId.',
                'Updates old saved names in playerStats.',
                'Updates old saved names in seasonPlayerStats.',
                'Updates winner snapshot names inside seasons documents.',
                'Updates match team player names inside matches.',
                'Updates goal scorer names inside match results.',
                'Updates playerName inside eventParticipants.',
                'Updates displayName in authorizedUsers when a correct canonical name exists.',
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-2.5 text-sm text-gray-700 font-medium"
                >
                  <div className="w-5 h-5 mt-0.5 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-3 h-3 text-red-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 rounded-3xl border border-yellow-200 p-4">
          <p className="text-sm font-black text-yellow-800 mb-1">Run once only</p>
          <p className="text-xs sm:text-sm text-yellow-700 font-medium leading-relaxed">
            This is mainly for fixing old saved data. It is safe to rerun, but normally you should
            only need it once after deploying the updated save logic.
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
            Confirmation
          </p>

          {!done ? (
            <button
              type="button"
              onClick={() => setConfirmed((v) => !v)}
              className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-2xl border text-left transition-colors ${
                confirmed
                  ? 'border-red-200 bg-red-50'
                  : 'border-gray-200 bg-white active:bg-gray-50'
              }`}
            >
              <div
                className={`w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                  confirmed ? 'bg-red-600 border-red-600' : 'border-gray-300'
                }`}
              >
                {confirmed && (
                  <svg
                    className="w-3 h-3 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  I understand this will update old saved player names
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  This will change stored names in historical documents so all modules show the same
                  correct player name.
                </p>
              </div>
            </button>
          ) : (
            <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl border border-green-200 bg-green-50">
              <div className="w-5 h-5 mt-0.5 rounded-md bg-green-600 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-3 h-3 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">Backfill finished</p>
                <p className="text-xs text-green-700 mt-1">
                  Old saved names were synced from the canonical userProfiles data.
                </p>
              </div>
            </div>
          )}
        </div>

        {status && (
          <div
            className={`rounded-3xl p-4 border shadow-sm ${
              done
                ? 'bg-green-50 border-green-200'
                : status.startsWith('Error')
                ? 'bg-red-50 border-red-200'
                : 'bg-blue-50 border-blue-200'
            }`}
          >
            <p className="text-[11px] font-black uppercase tracking-widest mb-2 text-gray-500">
              Status
            </p>
            <p
              className={`text-sm font-semibold whitespace-pre-wrap leading-relaxed ${
                done
                  ? 'text-green-800'
                  : status.startsWith('Error')
                  ? 'text-red-800'
                  : 'text-blue-800'
              }`}
            >
              {status}
            </p>
          </div>
        )}

        {!done ? (
          <button
            onClick={handleRun}
            disabled={loading || !confirmed}
            className="w-full min-h-[52px] px-4 py-4 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Spinner />
                <span>Running Backfill...</span>
              </>
            ) : (
              'Run Player Name Backfill'
            )}
          </button>
        ) : (
          <div className="w-full min-h-[52px] px-4 py-4 bg-green-600 text-white font-bold rounded-2xl text-sm text-center flex items-center justify-center">
            Backfill Complete
          </div>
        )}
      </div>
    </div>
  );
}