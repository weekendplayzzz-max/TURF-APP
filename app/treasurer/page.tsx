'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import Image from 'next/image';
import { getFinancialSummary } from '@/lib/eventManagement';
import Link from 'next/link';
import GlobalStatsTab from '@/components/match-stats/GlobalStatsTab';
import SeasonTab from '@/components/match-stats/SeasonTab';
import AwardsTab from '@/components/match-stats/AwardsTab';

interface FinanceSummary {
  totalIncome: number;
  totalExpenses: number;
  availableBalance: number;
}

type ActiveTab = 'player' | 'treasurer' | 'overall' | 'season' | 'awards';

export default function TreasurerDashboard() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('player');

  const [summary, setSummary] = useState<FinanceSummary>({
    totalIncome: 0,
    totalExpenses: 0,
    availableBalance: 0,
  });

  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'treasurer') router.push('/login');
  }, [loading, user, role, router]);

  const fetchSummary = useCallback(async () => {
    try {
      setPageLoading(true);
      const financialData = await getFinancialSummary();
      setSummary({
        totalIncome: financialData.totalIncome,
        totalExpenses: financialData.totalExpenses,
        availableBalance: financialData.availableBalance,
      });
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'treasurer') fetchSummary();
  }, [role, fetchSummary]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading || !user || role !== 'treasurer') {
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

  const displayName = user.displayName || user.email?.split('@')[0] || 'Treasurer';

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
      id: 'treasurer',
      label: 'Treasurer',
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
          d="M16 3H8v3H5v2a5 5 0 005 5h4a5 5 0 005-5V6h-3V3zM8 8V5h8v3a3 3 0 01-3 3h-2a3 3 0 01-3-3zM9 14h6v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM8 20h8"
        />
      ),
    },
  ];

  const playerActions = [
    {
      label: 'Join Turf',
      sub: 'Browse & join events',
      path: '/treasurer/events',
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
      path: '/treasurer/view-match-stats',
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
      label: 'My Payments',
      sub: 'View payment history',
      path: '/treasurer/payment',
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
  label: 'My Stats',
  sub: 'View ratings & performance',
  path: '/treasurer/my-stats',
  icon: (
    <>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 19h14"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 16V11"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 16V7"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 16V9"
      />
      <circle cx="7" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17" cy="7" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
},
{
  label: 'Overall Player Stats',
  sub: 'View global ratings & rankings',
  path: '/treasurer/global-ovr',
  icon: (
    <>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 19h14"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 16V11"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 16V7"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 16V9"
      />
      <circle cx="7" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17" cy="7" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
},
    {
      label: 'My Profile',
      sub: 'View player profile',
      path: '/treasurer/profile',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      ),
    },
  ];

  const treasurerActions = [
    {
      label: 'Create Turf',
      sub: 'Schedule a new event',
      path: '/treasurer/create-event',
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
      path: '/treasurer/manage-events',
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
      label: 'Mark Payments',
      sub: 'Update player dues',
      path: '/treasurer/manage-payments',
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
      label: 'Manage Match',
      sub: 'Create & manage matches',
      path: '/treasurer/manage-match',
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
      label: 'Add Income',
      sub: 'Record new income',
      path: '/treasurer/add-income',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      ),
    },
    {
      label: 'Manage Income',
      sub: 'View and manage income records',
      path: '/treasurer/view-income',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      ),
    },
    {
      label: 'Add Expense',
      sub: 'Log a new expense',
      path: '/treasurer/team-expenses',
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
      label: 'View Expenses',
      sub: 'Full expense history',
      path: '/treasurer/view-expenses',
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
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
                className={`flex items-center justify-center gap-1 px-3 sm:px-4 py-2.5 sm:py-3 text-[11px] sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 min-w-fit ${
                  activeTab === id
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}
              >
                <svg
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {icon}
                </svg>
                <span>{label}</span>
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
                {playerActions.map(({ label, sub, path, icon }) => (
                  <Link key={path} href={path}>
                    <div className="group p-3 sm:p-4 border-2 border-gray-200 hover:border-red-600 active:border-red-700 rounded-xl transition-all cursor-pointer bg-gray-50 hover:bg-red-50 h-full">
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
                      <p className="text-xs text-gray-400 mt-0.5 leading-tight">{sub}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'treasurer' && (
          <div className="animate-fadeIn space-y-4">
            {pageLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
                  <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
            ) : (
              <>
                <div className="relative overflow-hidden bg-gray-900 rounded-2xl sm:rounded-3xl p-4 sm:p-5 text-white shadow-sm">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.18),transparent_35%)] pointer-events-none" />
                  <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border-[20px] border-red-600/20 pointer-events-none" />
                  <div className="absolute right-4 -bottom-10 w-24 h-24 rounded-full border-[16px] border-red-600/10 pointer-events-none" />

                  <div className="relative z-10 flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <p className="text-[11px] sm:text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">
                        Available Balance
                      </p>
                      <p className="text-2xl sm:text-4xl font-black leading-tight break-words">
                        ₹{summary.availableBalance.toLocaleString()}
                      </p>
                    </div>

                    <div className="w-10 h-10 sm:w-11 sm:h-11 bg-red-600/20 rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0 border border-red-500/20">
                      <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                  </div>

                  <div className="relative z-10 grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="bg-white/8 rounded-xl sm:rounded-2xl px-3 py-3 border border-white/10 min-w-0">
                      <p className="text-[11px] text-gray-400 mb-1">Total In</p>
                      <p className="text-sm sm:text-base font-bold break-words">
                        ₹{summary.totalIncome.toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-white/8 rounded-xl sm:rounded-2xl px-3 py-3 border border-white/10 min-w-0">
                      <p className="text-[11px] text-gray-400 mb-1">Total Out</p>
                      <p className="text-sm sm:text-base font-bold break-words">
                        ₹{summary.totalExpenses.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Actions
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                    {treasurerActions.map(({ label, sub, path, icon }) => (
                      <Link key={path} href={path}>
                        <div className="group p-3 sm:p-4 border-2 border-gray-200 hover:border-red-600 active:border-red-700 rounded-xl transition-all cursor-pointer bg-gray-50 hover:bg-red-50 h-full">
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
              </>
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