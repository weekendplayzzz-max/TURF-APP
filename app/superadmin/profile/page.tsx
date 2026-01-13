'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { collection, query, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Statistics {
  totalEvents: number;
  totalPlayers: number;
  totalSecretaries: number;
  totalCollections: number;
}

export default function SuperAdminInfo() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [statistics, setStatistics] = useState<Statistics>({
    totalEvents: 0,
    totalPlayers: 0,
    totalSecretaries: 0,
    totalCollections: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'superadmin') router.push('/login');
  }, [role, loading, user, router]);

  // Fetch superadmin statistics
  useEffect(() => {
    const fetchStatistics = async () => {
      if (!user) return;

      try {
        setLoadingStats(true);

        // Get all events
        const eventsRef = collection(db, 'events');
        const eventsSnapshot = await getDocs(eventsRef);
        const totalEvents = eventsSnapshot.size;
        let totalCollections = 0;

        // Calculate total collections from all closed events
        eventsSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.status !== 'open' && data.totalCollected) {
            totalCollections += data.totalCollected;
          }
        });

        // Get all eventParticipants to count unique players
        const participantsRef = collection(db, 'eventParticipants');
        const participantsSnapshot = await getDocs(participantsRef);
        const playerIds = new Set<string>();
        participantsSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.playerId) {
            playerIds.add(data.playerId);
          }
        });
        const totalPlayers = playerIds.size;

        // Count secretaries by checking unique secretaryIds from events
        const secretaryIds = new Set<string>();
        eventsSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.secretaryId) {
            secretaryIds.add(data.secretaryId);
          }
        });
        const totalSecretaries = secretaryIds.size;

        setStatistics({
          totalEvents,
          totalPlayers,
          totalSecretaries,
          totalCollections,
        });
      } catch (error) {
        console.error('Error fetching statistics:', error);
      } finally {
        setLoadingStats(false);
      }
    };

    if (role === 'superadmin' && user) {
      fetchStatistics();
    }
  }, [user, role]);

  if (loading || !user || role !== 'superadmin') {
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
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer flex-shrink-0"
              title="Go Back"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="w-9 h-9 sm:w-12 sm:h-12 flex-shrink-0">
              <Image
                src="/logo.png"
                alt="Art of War Logo"
                width={48}
                height={48}
                className="w-full h-full object-contain"
              />
            </div>
            <h1 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900 truncate">
              Admin Dashboard
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-10">
        <div className="space-y-4 sm:space-y-6">
          {/* Profile Overview Card */}
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 md:p-8">
            {/* Profile Header */}
            <div className="flex flex-col gap-4 mb-6 sm:mb-8">
              <div className="flex items-start gap-3 sm:gap-4">
                {/* Avatar with Admin Badge */}
                <div className="relative flex-shrink-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="Profile"
                      className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full object-cover border-2 border-gray-200"
                    />
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-red-500 to-red-600 border-2 border-gray-200 flex items-center justify-center">
                      <span className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                        {(user.displayName || user.email || 'A')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  
                  {/* Super Admin Badge */}
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-lg">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-1 truncate">
                    {user.displayName || user.email?.split('@')[0] || 'Super Admin'}
                  </h2>
                  <p className="text-xs sm:text-sm md:text-base text-gray-600 mb-2 break-all">
                    {user.email}
                  </p>
                  <span className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-bold text-red-800">
                    <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                    Super Admin
                  </span>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200 mb-6 sm:mb-8"></div>

            {/* Personal Information */}
            <div className="mb-6 sm:mb-8">
              <div className="space-y-4 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Full Name</label>
                  {isEditing ? (
                    <input
                      type="text"
                      defaultValue={user.displayName || ''}
                      className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                      placeholder="Enter your name"
                    />
                  ) : (
                    <p className="text-sm text-gray-900 py-2 sm:py-2.5">
                      {user.displayName || 'Not set'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                  <p className="text-sm text-gray-900 py-2 sm:py-2.5 break-all">
                    {user.email}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Role</label>
                  <p className="text-sm text-gray-900 py-2 sm:py-2.5 font-bold text-red-700">
                    Super Administrator
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Member Since</label>
                  <p className="text-sm text-gray-900 py-2 sm:py-2.5">
                    {new Date((user as any)?.metadata?.creationTime || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {isEditing && (
                <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row gap-3">
                  <button className="w-full sm:w-auto px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors cursor-pointer text-sm">
                    Save Changes
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="w-full sm:w-auto px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors cursor-pointer text-sm"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Statistics Card - 2x2 Grid for 4 metrics */}
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 md:p-8">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 sm:mb-6">Platform Statistics</h3>
            {loadingStats ? (
              <div className="flex items-center justify-center py-8">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
                <div className="text-center p-3 sm:p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg sm:rounded-xl border border-blue-200">
                  <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-blue-900 mb-1 sm:mb-2">
                    {statistics.totalEvents}
                  </p>
                  <p className="text-xs sm:text-sm text-blue-800 font-semibold">Total Events</p>
                </div>
                <div className="text-center p-3 sm:p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-lg sm:rounded-xl border border-green-200">
                  <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-green-900 mb-1 sm:mb-2">
                    {statistics.totalPlayers}
                  </p>
                  <p className="text-xs sm:text-sm text-green-800 font-semibold">Total Players</p>
                </div>
                <div className="text-center p-3 sm:p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg sm:rounded-xl border border-purple-200">
                  <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-purple-900 mb-1 sm:mb-2">
                    {statistics.totalSecretaries}
                  </p>
                  <p className="text-xs sm:text-sm text-purple-800 font-semibold">Total Secretaries</p>
                </div>
                <div className="text-center p-3 sm:p-6 bg-gradient-to-br from-red-50 to-red-100 rounded-lg sm:rounded-xl border border-red-200">
                  <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-red-900 mb-1 sm:mb-2">
                    ₹{statistics.totalCollections.toLocaleString()}
                  </p>
                  <p className="text-xs sm:text-sm text-red-800 font-semibold">Total Collections</p>
                </div>
              </div>
            )}
          </div>

          {/* Security Card */}
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 md:p-8">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 sm:mb-6">Security</h3>
            <div className="space-y-4">
              <div className="flex items-start sm:items-center justify-between py-3 border-b border-gray-200 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">Email Verification</p>
                  <p className="text-xs text-gray-600 mt-0.5">Your email address is verified</p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 bg-green-50 border border-green-200 rounded-full text-xs font-medium text-green-700 flex-shrink-0">
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Verified
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
