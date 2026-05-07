'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Image from 'next/image';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import Link from 'next/link';

export default function PlayerDashboard() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'player') router.push('/login');
  }, [role, loading, user, router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading || !user || role !== 'player') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const displayName = user.displayName || user.email?.split('@')[0] || 'Player';

  const actions = [
    {
      label: 'Join Turf',
      sub: 'Browse & join events',
      path: '/player/events',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
    },
    {
      label: 'My Payments',
      sub: 'View payment history',
      path: '/player/payments',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />,
    },
    {
      label: 'Team Fund',
      sub: 'View team finances',
      path: '/player/team-transactions',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />,
    },
    {
      label: 'My Profile',
      sub: 'View your profile',
      path: '/player/profile',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sticky Header ── */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-2">

            {/* Logo */}
            <div className="w-8 h-8 flex-shrink-0">
              <Image src="/logo.png" alt="Logo" width={32} height={32} className="w-full h-full object-contain" />
            </div>

            {/* Title */}
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold text-gray-900 leading-tight">Dashboard</h1>
              <p className="text-xs text-gray-400 truncate">
                Welcome, <span className="font-semibold text-gray-600">{displayName}</span>
              </p>
            </div>

            {/* Sign out — matches treasurer exactly */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-red-50 active:bg-red-100 text-gray-600 hover:text-red-600 font-semibold rounded-xl transition-colors cursor-pointer text-xs flex-shrink-0 border border-gray-200 hover:border-red-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-lg mx-auto px-3 py-4 pb-12">
        <div className="animate-fadeIn space-y-4">

          {/* ── Quick Actions ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
              Quick Actions
            </p>

            {/* 
              grid-rows-[1fr_1fr] forces both rows to be equal height.
              Each Link is h-full so the inner div stretches to fill it.
            */}
            <div className="grid grid-cols-2 grid-rows-2 gap-3">
              {actions.map(({ label, sub, path, icon }) => (
                <Link key={path} href={path} className="h-full">
                  <div className="group h-full p-3 border-2 border-gray-200 hover:border-red-600 active:border-red-700 rounded-xl transition-all cursor-pointer bg-gray-50 hover:bg-red-50 flex flex-col">
                    {/* Icon box — fixed size, never grows */}
                    <div className="w-8 h-8 mb-2.5 flex-shrink-0 bg-white rounded-lg flex items-center justify-center border border-gray-200 group-hover:border-red-200 group-hover:bg-red-50 transition-colors">
                      <svg className="w-4 h-4 text-gray-500 group-hover:text-red-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {icon}
                      </svg>
                    </div>
                    {/* Text — grows to fill remaining space */}
                    <div className="flex-1 flex flex-col justify-end">
                      <p className="text-xs font-bold text-gray-800 group-hover:text-red-700 transition-colors leading-tight">
                        {label}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-tight">
                        {sub}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
      `}</style>
    </div>
  );
}