'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import Image from 'next/image';
import Link from 'next/link';
import GlobalStatsTab from '@/components/match-stats/GlobalStatsTab';
import SeasonTab from '@/components/match-stats/SeasonTab';
import AwardsTab from '@/components/match-stats/AwardsTab';

type ActiveTab = 'player' | 'secretary' | 'overall' | 'season' | 'awards';

export default function SecretaryDashboard() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('player');
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'secretary') router.push('/login');
  }, [loading, user, role, router]);

  useEffect(() => {
    if (role === 'secretary') setPageLoading(false);
  }, [role]);

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
          <div className="relative w-14 h-14 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  const displayName = user.displayName || user.email?.split('@')[0] || 'Secretary';

  const tabs: {
    id: ActiveTab;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'player',
      label: 'Player',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      ),
    },
    {
      id: 'secretary',
      label: 'Secretary',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      ),
    },
    {
      id: 'overall',
      label: 'Overall',
      icon: (
        <>
          <circle cx="12" cy="12" r="9" strokeWidth={2} stroke="currentColor" fill="none" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3c0 0 2.5 3.5 2.5 9S12 21 12 21M12 3c0 0-2.5 3.5-2.5 9S12 21 12 21M3.6 9h16.8M3.6 15h16.8"
          />
        </>
      ),
    },
    {
      id: 'season',
      label: 'Season',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      ),
    },
    {
      id: 'awards',
      label: 'Awards',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
        />
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0">
              <Image
                src="/logo.png"
                alt="Logo"
                width={36}
                height={36}
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-gray-900 leading-tight">
                Dashboard
              </h1>
              <p className="text-xs text-gray-400 truncate">
                Welcome, <span className="font-semibold text-gray-600">{displayName}</span>
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-red-50 active:bg-red-100 text-gray-600 hover:text-red-600 font-semibold rounded-xl transition-colors cursor-pointer text-xs flex-shrink-0 border border-gray-200 hover:border-red-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span className="hidden sm:inline">Sign Out</span>
              <span className="sm:hidden">Out</span>
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4">
          <div className="flex border-t border-gray-100 overflow-x-auto scrollbar-hide">
            {tabs.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-1.5 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  activeTab === id
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}
              >
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {icon}
                </svg>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {activeTab === 'player' && (
          <div className="animate-fadeIn space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Quick Actions
              </p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: 'Join Turf',
                    sub: 'Browse & join events',
                    path: '/secretary/events',
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    ),
                  },
                  {
                    label: 'Match Stats',
                    sub: 'View standings & results',
                    path: '/secretary/view-match-stats',
                    icon: (
                      <>
                        <circle
                          cx="12"
                          cy="12"
                          r="9"
                          strokeWidth={2}
                          stroke="currentColor"
                          fill="none"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 3c0 0 2.5 3.5 2.5 9S12 21 12 21M12 3c0 0-2.5 3.5-2.5 9S12 21 12 21M3.6 9h16.8M3.6 15h16.8"
                        />
                      </>
                    ),
                  },
                  {
                    label: 'My Payments',
                    sub: 'View payment history',
                    path: '/secretary/payment',
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                      />
                    ),
                  },
                  {
                    label: 'Team Fund',
                    sub: 'View team finances',
                    path: '/secretary/team-fund',
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    ),
                  },
                  {
                    label: 'My Profile',
                    sub: 'View player profile',
                    path: '/secretary/profile',
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    ),
                  },
                ].map(({ label, sub, path, icon }) => (
                  <Link key={path} href={path}>
                    <div className="group p-3 sm:p-4 border-2 border-gray-200 hover:border-red-600 active:border-red-700 rounded-xl transition-all cursor-pointer bg-gray-50 hover:bg-red-50">
                      <div className="w-8 h-8 mb-2.5 bg-white rounded-lg flex items-center justify-center border border-gray-200 group-hover:border-red-200 group-hover:bg-red-50 transition-colors">
                        <svg
                          className="w-4 h-4 text-gray-500 group-hover:text-red-600 transition-colors"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          {icon}
                        </svg>
                      </div>
                      <p className="text-xs sm:text-sm font-bold text-gray-800 group-hover:text-red-700 transition-colors">
                        {label}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'secretary' && (
          <div className="animate-fadeIn space-y-4">
            {pageLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
                  <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Actions
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                  {[
                    {
                      label: 'Create Turf',
                      sub: 'Schedule a new event',
                      path: '/secretary/create-event',
                      icon: (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                        />
                      ),
                    },
                    {
                      label: 'Manage Turf',
                      sub: 'Edit or close events',
                      path: '/secretary/manage-events',
                      icon: (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                        />
                      ),
                    },
                    {
                      label: 'Manage Match',
                      sub: 'Create & manage matches',
                      path: '/secretary/manage-match',
                      icon: (
                        <>
                          <circle
                            cx="12"
                            cy="12"
                            r="9"
                            strokeWidth={2}
                            stroke="currentColor"
                            fill="none"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 3c0 0 2.5 3.5 2.5 9S12 21 12 21M12 3c0 0-2.5 3.5-2.5 9S12 21 12 21M3.6 9h16.8M3.6 15h16.8"
                          />
                        </>
                      ),
                    },
                    {
                      label: 'Add Players',
                      sub: 'Appoint new players',
                      path: '/secretary/add-players',
                      icon: (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                        />
                      ),
                    },
                    {
                      label: 'Add Guests',
                      sub: 'Register guest players',
                      path: '/secretary/add-guest',
                      icon: (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                        />
                      ),
                    },
                    {
                      label: 'View Players',
                      sub: 'Browse player roster',
                      path: '/secretary/view-players',
                      icon: (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                        />
                      ),
                    },
                    {
                      label: 'View Expenses',
                      sub: 'Full expense history',
                      path: '/secretary/view-expenses',
                      icon: (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      ),
                    },
                  ].map(({ label, sub, path, icon }) => (
                    <Link key={path} href={path}>
                      <div className="group p-3 sm:p-4 border-2 border-gray-200 hover:border-red-600 active:border-red-700 rounded-xl transition-all cursor-pointer bg-gray-50 hover:bg-red-50">
                        <div className="w-8 h-8 mb-2.5 bg-white rounded-lg flex items-center justify-center border border-gray-200 group-hover:border-red-200 group-hover:bg-red-50 transition-colors">
                          <svg
                            className="w-4 h-4 text-gray-500 group-hover:text-red-600 transition-colors"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            {icon}
                          </svg>
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-gray-800 group-hover:text-red-700 transition-colors leading-tight">
                          {label}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 leading-tight hidden sm:block">
                          {sub}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'overall' && (
          <div className="animate-fadeIn">
            <GlobalStatsTab />
          </div>
        )}

        {activeTab === 'season' && (
          <div className="animate-fadeIn">
            <SeasonTab />
          </div>
        )}

        {activeTab === 'awards' && (
          <div className="animate-fadeIn">
            <AwardsTab />
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}