'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { collection, query, where, getDocs, Timestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Statistics {
  eventsRegistered: number;
  eventsAttended: number;
  totalPayments: number;
}

interface UserProfile {
  fullName: string;
  jerseyNumber: number;
  position: 'GK' | 'DEF' | 'MID' | 'FORWARD';
}

interface UserData {
  createdAt: Timestamp;
}

// Helper function to format position
const formatPosition = (pos: string): string => {
  const positionMap: { [key: string]: string } = {
    'GK': 'Goalkeeper',
    'DEF': 'Defender',
    'MID': 'Midfielder',
    'FORWARD': 'Forward'
  };
  return positionMap[pos] || pos;
};

export default function PlayerInfo() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [statistics, setStatistics] = useState<Statistics>({
    eventsRegistered: 0,
    eventsAttended: 0,
    totalPayments: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loadingUserData, setLoadingUserData] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'player') router.push('/login');
  }, [role, loading, user, router]);

  // Fetch user data from users collection (for createdAt)
  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;

      try {
        setLoadingUserData(true);
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const data = userSnap.data();
          setUserData({
            createdAt: data.createdAt
          });
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoadingUserData(false);
      }
    };

    if (role === 'player' && user) {
      fetchUserData();
    }
  }, [user, role]);

  // Fetch player profile from userProfiles collection
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      try {
        setLoadingProfile(true);
        const profileRef = doc(db, 'userProfiles', user.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          const data = profileSnap.data();
          setProfileData({
            fullName: data.fullName,
            jerseyNumber: data.jerseyNumber,
            position: data.position
          });
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoadingProfile(false);
      }
    };

    if (role === 'player' && user) {
      fetchProfile();
    }
  }, [user, role]);

  // Fetch player statistics (unchanged)
  useEffect(() => {
    const fetchStatistics = async () => {
      if (!user) return;

      try {
        setLoadingStats(true);

        // Query eventParticipants collection for this player
        const participantsRef = collection(db, 'eventParticipants');
        const playerQuery = query(
          participantsRef,
          where('playerId', '==', user.uid),
          where('currentStatus', '==', 'joined')
        );
        const participantsSnapshot = await getDocs(playerQuery);

        // Get unique event IDs that the player has joined
        const eventIds = new Set<string>();
        participantsSnapshot.forEach((doc) => {
          const data = doc.data();
          eventIds.add(data.eventId);
        });

        const eventsRegistered = eventIds.size;

        // Fetch events to determine which are past (attended)
        const eventsRef = collection(db, 'events');
        const eventsSnapshot = await getDocs(eventsRef);
        
        let eventsAttended = 0;
        let totalPayments = 0;

        eventsSnapshot.forEach((doc) => {
          const data = doc.data();
          const eventId = doc.id;
          
          // Check if player joined this event
          if (eventIds.has(eventId)) {
            const eventDate = data.date as Timestamp;
            const now = Timestamp.now();

            // Count as attended if event date has passed
            if (eventDate.toMillis() < now.toMillis()) {
              eventsAttended++;
            }

            // Calculate payments from totalCollected if event is closed/locked
            if (data.status !== 'open' && data.participantCount > 0) {
              const perPlayerAmount = Math.ceil(data.totalAmount / data.participantCount);
              totalPayments += perPlayerAmount;
            }
          }
        });

        setStatistics({
          eventsRegistered,
          eventsAttended,
          totalPayments,
        });
      } catch (error) {
        console.error('Error fetching statistics:', error);
      } finally {
        setLoadingStats(false);
      }
    };

    if (role === 'player' && user) {
      fetchStatistics();
    }
  }, [user, role]);

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
            <h1 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900 truncate">
              Profile Information
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        <div className="space-y-4 sm:space-y-6">
          {/* Profile Header Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Avatar with Jersey Number */}
              <div className="relative flex-shrink-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="Profile"
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-gray-200"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center">
                    <span className="text-xl sm:text-2xl font-bold text-gray-600">
                      {(profileData?.fullName || user.email || 'P')[0].toUpperCase()}
                    </span>
                  </div>
                )}
                
                {/* Jersey Number Badge */}
                {!loadingProfile && profileData && (
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 sm:w-8 sm:h-8 bg-gray-900 text-white rounded-full flex items-center justify-center border-2 border-white">
                    <span className="text-xs sm:text-sm font-bold">
                      {profileData.jerseyNumber}
                    </span>
                  </div>
                )}
              </div>

              {/* User Info */}
              <div className="flex-1 min-w-0">
                {loadingProfile ? (
                  <div className="space-y-2">
                    <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded w-48 animate-pulse"></div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                        {profileData?.fullName || user.displayName || 'Player'}
                      </h2>
                      <svg 
                        className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path 
                          d="M10.5213 2.62368C11.3147 1.75255 12.6853 1.75255 13.4787 2.62368L14.4989 3.74391C14.8998 4.18418 15.4761 4.42288 16.0709 4.39508L17.5845 4.32435C18.7614 4.26934 19.7307 5.23857 19.6757 6.41553L19.605 7.92905C19.5772 8.52388 19.8158 9.10016 20.2561 9.50111L21.3763 10.5213C22.2475 11.3147 22.2475 12.6853 21.3763 13.4787L20.2561 14.4989C19.8158 14.8998 19.5772 15.4761 19.605 16.0709L19.6757 17.5845C19.7307 18.7614 18.7614 19.7307 17.5845 19.6757L16.0709 19.605C15.4761 19.5772 14.8998 19.8158 14.4989 20.2561L13.4787 21.3763C12.6853 22.2475 11.3147 22.2475 10.5213 21.3763L9.50111 20.2561C9.10016 19.8158 8.52388 19.5772 7.92905 19.605L6.41553 19.6757C5.23857 19.7307 4.26934 18.7614 4.32435 17.5845L4.39508 16.0709C4.42288 15.4761 4.18418 14.8998 3.74391 14.4989L2.62368 13.4787C1.75255 12.6853 1.75255 11.3147 2.62368 10.5213L3.74391 9.50111C4.18418 9.10016 4.42288 8.52388 4.39508 7.92905L4.32435 6.41553C4.26934 5.23857 5.23857 4.26934 6.41554 4.32435L7.92905 4.39508C8.52388 4.42288 9.10016 4.18418 9.50111 3.74391L10.5213 2.62368Z" 
                          fill="#1D9BF0"
                        />
                        <path 
                          d="M9 12L11 14L15 10" 
                          stroke="white" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-600 mb-2 break-all">
                      {user.email}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full text-xs font-medium text-green-700">
                        <span className="w-1.5 h-1.5 bg-green-600 rounded-full"></span>
                        Active
                      </span>
                      {profileData && (
                        <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-full text-xs font-medium text-gray-700">
                          {formatPosition(profileData.position)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Player Details Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Player Details</h3>
            
            {loadingProfile || loadingUserData ? (
              <div className="space-y-4">
                <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6 animate-pulse"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
                  <p className="text-sm text-gray-900">
                    {profileData?.fullName || 'Not set'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                  <p className="text-sm text-gray-900 break-all">
                    {user.email}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Role</label>
                  <p className="text-sm text-gray-900 capitalize">
                    Player
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Position</label>
                  <p className="text-sm text-gray-900">
                    {profileData ? formatPosition(profileData.position) : 'Not set'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Jersey Number</label>
                  <p className="text-sm text-gray-900">
                    #{profileData?.jerseyNumber || 'Not set'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Member Since</label>
                  <p className="text-sm text-gray-900">
                    {userData?.createdAt 
                      ? new Date(userData.createdAt.toDate()).toLocaleDateString('en-US', { 
                          month: 'long', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })
                      : 'Not available'
                    }
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Statistics Card */}
          {/* <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 sm:mb-6">Account Statistics</h3>
            {loadingStats ? (
              <div className="flex items-center justify-center py-8">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:gap-6">
                <div className="text-center p-3 sm:p-6 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">
                    {statistics.eventsRegistered}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600 font-medium">Turfs Registered</p>
                </div>
                <div className="text-center p-3 sm:p-6 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">
                    {statistics.eventsAttended}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600 font-medium">Turfs Attended</p>
                </div>
                <div className="text-center p-3 sm:p-6 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">
                    ₹{statistics.totalPayments.toLocaleString()}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600 font-medium">Total Payments</p>
                </div>
              </div>
            )}
          </div> */}

          {/* Security Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Security</h3>
            <div className="flex items-start sm:items-center justify-between py-3 gap-3">
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
  );
}
