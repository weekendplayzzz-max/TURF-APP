'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import Link from 'next/link';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function SecretaryDashboard() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState({
    totalPlayers: 0,
    appointedPlayers: 0,
    availableUsers: 0,
  });

  const [pageLoading, setPageLoading] = useState(true);

  /* 🔐 Role protection */
  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'secretary') {
      router.push('/login');
    }
  }, [loading, user, role, router]);

  /* 📊 Fetch all dashboard stats */
  const fetchStats = useCallback(async () => {
    try {
      setPageLoading(true);

      /** Users collection */
      const usersRef = collection(db, 'users');

      // Total players
      const playersQuery = query(usersRef, where('role', '==', 'player'));
      const playersSnap = await getDocs(playersQuery);

      // Available users (exclude secretary & superadmin)
      const allUsersSnap = await getDocs(usersRef);
      const availableUsers = allUsersSnap.docs.filter(
        (doc) =>
          !['secretary', 'superadmin'].includes(doc.data().role)
      ).length;

      /** Appointed players collection */
      const appointedRef = collection(db, 'appointedPlayers');
      const appointedSnap = await getDocs(appointedRef);

      setStats({
        totalPlayers: playersSnap.size,
        appointedPlayers: appointedSnap.size,
        availableUsers,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'secretary') {
      fetchStats();
    }
  }, [role, fetchStats]);

  /* 🚪 Logout */
  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading || !user || role !== 'secretary') {
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
                  Secretary Dashboard
                </h1>
                <p className="text-xs md:text-sm text-gray-600 mt-0.5">
                  Welcome, <span className="font-semibold">{user.displayName || user.email?.split('@')[0] || 'Secretary'}</span>
                </p>
              </div>
            </div>

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

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 md:py-10">
        {pageLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-base text-gray-700 font-medium">Loading dashboard...</p>
            </div>
          </div>
        ) : (
          <>
         

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-5 sm:p-6 md:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 sm:mb-8">Quick Actions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
                <ActionButton
                  label="Create Turf"
                  path="/secretary/create-event"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  }
                />
                <ActionButton
                  label="Manage Turf"
                  path="/secretary/manage-events"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  }
                />
                 <ActionButton
                  label="Join Turf"
                  path="/secretary/events"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                />
                <ActionButton
                  label="Add Players"
                  path="/secretary/add-players"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  }
                />
                <ActionButton
                  label="Add Guests"
                  path="/secretary/add-guest"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  }
                />
                <ActionButton
                  label="View Players"
                  path="/secretary/view-players"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  }
                />
               
                <ActionButton
                  label="View Expenses"
                  path="/secretary/view-expenses"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  }
                />
                <ActionButton
                  label="View Payments"
                  path="/secretary/payment"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  }
                />
                <ActionButton
                  label="View Profile"
                  path="/secretary/profile"
                  icon={
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  }
                />
                
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Reusable Components ---------- */

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-50 rounded-lg flex items-center justify-center text-gray-700">
          {icon}
        </div>
      </div>
      <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">{title}</p>
      <p className="text-3xl sm:text-4xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  path,
}: {
  label: string;
  icon: React.ReactNode;
  path: string;
}) {
  return (
    <Link href={path}>
      <div className="group p-5 sm:p-6 bg-white border-2 border-gray-200 hover:border-red-600 rounded-xl transition-all duration-200 shadow-sm hover:shadow-lg cursor-pointer text-left">
        <div className="w-12 h-12 sm:w-14 sm:h-14 mb-4 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-red-50 transition-colors duration-200 text-gray-700 group-hover:text-red-600">
          {icon}
        </div>
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1 sm:mb-2">{label}</h3>
        <p className="text-xs sm:text-sm text-gray-600">Manage {label.toLowerCase()}</p>
      </div>
    </Link>
  );
}
