'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import NewMatchTab from './components/NewMatchTab';
import ManageMatchTab from './components/ManageMatchTab';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'new' | 'manage';

// ─── Page Spinner ─────────────────────────────────────────────────────────────

function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
        <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManageMatchPage() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>('new');
  const [toast, setToast] = useState('');

  // ── Refresh signal: NewMatchTab → ManageMatchTab
  // When a new match is created in Tab 1, we flip this to true.
  // ManageMatchTab watches it, refreshes, then calls onRefreshDone to flip back.
  const [refreshManageTab, setRefreshManageTab] = useState(false);

  // ─── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && role !== 'treasurer' && role !== 'secretary') {
      router.push('/login');
    }
  }, [role, loading, router]);

  // ─── Toast helper (shared across both tabs) ────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ─── Guard ─────────────────────────────────────────────────────────────────
  if (loading || !user || (role !== 'treasurer' && role !== 'secretary')) {
    return <PageSpinner />;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Global toast ── */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 bg-gray-900 text-white text-xs font-semibold rounded-2xl shadow-lg animate-slideDown whitespace-nowrap pointer-events-none">
          {toast}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STICKY HEADER
      ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4">

          {/* Top row: back + logo + title */}
          <div className="flex items-center gap-3 py-3">
            <button
              onClick={() => router.back()}
              className="p-2.5 rounded-xl bg-gray-100 active:bg-gray-200 cursor-pointer flex-shrink-0"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

            <div className="w-7 h-7 flex-shrink-0">
              <Image
                src="/logo.png"
                alt="Logo"
                width={28}
                height={28}
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-black text-gray-900 leading-tight">Manage Match</h1>
              <p className="text-xs text-gray-400">
                {activeTab === 'new' ? 'Create a new match' : 'View & edit existing matches'}
              </p>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('new')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer border-b-2 -mb-px ${
                activeTab === 'new'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {/* Plus icon */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              New Match
            </button>

            <button
              onClick={() => setActiveTab('manage')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer border-b-2 -mb-px ${
                activeTab === 'manage'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {/* Clipboard icon */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Manage Match
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB CONTENT
      ══════════════════════════════════════════════════════════════════ */}
      <div className="max-w-lg mx-auto px-3 py-4 pb-24">

        {activeTab === 'new' && (
          <div className="animate-fadeIn">
            <NewMatchTab
              userId={user.uid}
              showToast={showToast}
              onMatchCreated={() => {
                // Signal ManageMatchTab to refresh its list
                setRefreshManageTab(true);
              }}
            />
          </div>
        )}

        {activeTab === 'manage' && (
          <div className="animate-fadeIn">
            <ManageMatchTab
              shouldRefresh={refreshManageTab}
              onRefreshDone={() => setRefreshManageTab(false)}
              showToast={showToast}
            />
          </div>
        )}
      </div>

      {/* ── Global animations ── */}
      <style jsx>{`
        @keyframes fadeIn    { from { opacity: 0 }                               to { opacity: 1 } }
        @keyframes slideUp   { from { opacity: 0; transform: translateY(20px) }  to { opacity: 1; transform: translateY(0) } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px) }  to { opacity: 1; transform: translateY(0) } }
        .animate-fadeIn    { animation: fadeIn    0.2s  ease-out; }
        .animate-slideUp   { animation: slideUp   0.25s ease-out; }
        .animate-slideDown { animation: slideDown 0.2s  ease-out; }
      `}</style>
    </div>
  );
}