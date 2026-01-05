'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Image from 'next/image';

export default function PlayerDashboard() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'player') router.push('/login');
  }, [role, loading, user, router]);

  const handleLogout = async () => {
    try {
      const { signOut } = await import('firebase/auth');
      const { auth } = await import('@/lib/firebase');
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading || !user || role !== 'player') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-base text-gray-700 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 flex-shrink-0">
                <Image
                  src="/logo.png"
                  alt="Art of War Logo"
                  width={56}
                  height={56}
                  className="w-full h-full object-contain"
                />
              </div>
              {/* Show full title only on desktop */}
              <div className="hidden sm:block">
                <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">
                  Player Dashboard
                </h1>
                <p className="text-xs md:text-sm text-gray-600 mt-0.5">
                  Welcome, <span className="font-semibold">{user.displayName || user.email?.split('@')[0] || 'Player'}</span>
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="px-3 py-2 sm:px-4 sm:py-2.5 md:px-6 md:py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer text-xs sm:text-sm md:text-base"
              >
                <span className="hidden sm:inline">Sign Out</span>
                <span className="sm:hidden">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 md:py-10">
        {/* Quick Actions */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-5 sm:p-6 md:p-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 sm:mb-8">Quick Actions</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
            {/* View Events */}
            <button
              onClick={() => router.push('/player/events')}
              className="group p-5 sm:p-6 bg-white border-2 border-gray-200 hover:border-red-600 rounded-xl transition-all duration-200 shadow-sm hover:shadow-lg cursor-pointer text-left"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 mb-4 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-red-50 transition-colors duration-200">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 text-gray-700 group-hover:text-red-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1 sm:mb-2">Turf</h3>
              <p className="text-xs sm:text-sm text-gray-600">Browse and register for turf</p>
            </button>

            {/* My Payments */}
            <button
              onClick={() => router.push('/player/payments')}
              className="group p-5 sm:p-6 bg-white border-2 border-gray-200 hover:border-red-600 rounded-xl transition-all duration-200 shadow-sm hover:shadow-lg cursor-pointer text-left"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 mb-4 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-red-50 transition-colors duration-200">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 text-gray-700 group-hover:text-red-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1 sm:mb-2">Payments</h3>
              <p className="text-xs sm:text-sm text-gray-600">View payment history</p>
            </button>

            {/* Team Transactions */}
            <button
              onClick={() => router.push('/player/team-transactions')}
              className="group p-5 sm:p-6 bg-white border-2 border-gray-200 hover:border-red-600 rounded-xl transition-all duration-200 shadow-sm hover:shadow-lg cursor-pointer text-left"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 mb-4 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-red-50 transition-colors duration-200">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 text-gray-700 group-hover:text-red-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1 sm:mb-2">Team Fund</h3>
              <p className="text-xs sm:text-sm text-gray-600">Manage team finances</p>
            </button>

            {/* Profile */}
            <button
              onClick={() => router.push('/player/profile')}
              className="group p-5 sm:p-6 bg-white border-2 border-gray-200 hover:border-red-600 rounded-xl transition-all duration-200 shadow-sm hover:shadow-lg cursor-pointer text-left"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 mb-4 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-red-50 transition-colors duration-200">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 text-gray-700 group-hover:text-red-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1 sm:mb-2">Profile</h3>
              <p className="text-xs sm:text-sm text-gray-600">View and edit your profile</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
