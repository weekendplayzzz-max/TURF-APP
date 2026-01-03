'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

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

  if (loading || !user || role !== 'player') return null;

    return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">⚽ Player Dashboard</h1>
              <p className="text-green-100 text-base">
                Welcome, <span className="font-semibold">{user.displayName || user.email}</span>
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-6 py-3 bg-white text-green-600 font-bold rounded-lg hover:bg-green-50 transition shadow-md"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Profile Section */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-10 border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <span className="text-3xl mr-3">👤</span>
            Your Profile
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Information */}
            <div>
              <h3 className="text-lg font-bold text-gray-800 mb-4">Information</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Name:</p>
                  <p className="text-base font-semibold text-gray-900">
                    {user.displayName || user.email?.split('@')[0] || 'Player'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Email:</p>
                  <p className="text-base font-semibold text-gray-900">{user.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Role:</p>
                  <p className="text-base font-semibold text-green-600 capitalize">Player</p>
                </div>
              </div>
            </div>

            {/* Statistics */}
            <div>
              <h3 className="text-lg font-bold text-gray-800 mb-4">Statistics</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Events Registered:</p>
                  <p className="text-base font-semibold text-gray-900">0</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Events Attended:</p>
                  <p className="text-base font-semibold text-gray-900">0</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status:</p>
                  <p className="text-base font-semibold text-green-600">Active</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <span className="text-3xl mr-3">⚡</span>
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <button
              onClick={() => router.push('/player/events')}
              className="p-6 bg-gradient-to-r from-green-600 to-green-700 text-white font-bold rounded-xl hover:from-green-700 hover:to-green-800 transition shadow-md hover:shadow-xl text-lg"
            >
              <div className="text-4xl mb-3">🏆</div>
              View Events
            </button>
            <button
              onClick={() => router.push('/player/payments')}
              className="p-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-md hover:shadow-xl text-lg"
            >
              <div className="text-4xl mb-3">💰</div>
              My Payments
            </button>
            <button
              onClick={() => router.push('/player/profile')}
              className="p-6 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-bold rounded-xl hover:from-purple-700 hover:to-purple-800 transition shadow-md hover:shadow-xl text-lg"
            >
              <div className="text-4xl mb-3">⚙️</div>
              Settings
            </button>
          </div>
        </div>

        {/* Info Card */}
        <div className="mt-8 bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-bold text-blue-900 mb-2">📌 Getting Started</h3>
          <ul className="text-sm text-blue-800 space-y-2">
            <li>• Click &quot;View Events&quot; to see upcoming turf matches</li>
            <li>• Join events before the deadline to secure your spot</li>
            <li>• Check &quot;My Payments&quot; to view your payment status</li>
            <li>• Stay updated with notifications about new events</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
