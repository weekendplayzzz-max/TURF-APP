'use client';

console.log('✅ ProfileCompleteModal.tsx FILE LOADED');

import { useState, useEffect } from 'react';
import { getUserLinkedGuests, saveUserProfile, GuestProfile } from '@/lib/profileManagement';

interface ProfileCompleteModalProps {
  userId: string;
  email: string;
  onComplete: () => void;
}

export default function ProfileCompleteModal({ 
  userId, 
  email, 
  onComplete 
}: ProfileCompleteModalProps) {
  console.log('🎭 ProfileCompleteModal MOUNTED', { userId, email });

  // Parent profile state
  const [fullName, setFullName] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [position, setPosition] = useState<'GK' | 'DEF' | 'MID' | 'FORWARD' | ''>('');

  // Guest profiles state
  const [linkedGuests, setLinkedGuests] = useState<Array<{
    guestId: string;
    guestName: string;
  }>>([]);
  const [guestProfiles, setGuestProfiles] = useState<{ [key: string]: {
    fullName: string;
    jerseyNumber: string;
    position: 'GK' | 'DEF' | 'MID' | 'FORWARD' | '';
  } }>({});

  // UI state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLinkedGuests();
  }, [userId]);

  const fetchLinkedGuests = async () => {
    try {
      setLoading(true);
      const guests = await getUserLinkedGuests(userId);
      setLinkedGuests(guests);

      // Initialize guest profiles state
      const initialGuestProfiles: { [key: string]: any } = {};
      guests.forEach(guest => {
        initialGuestProfiles[guest.guestId] = {
          fullName: guest.guestName,
          jerseyNumber: '',
          position: '',
        };
      });
      setGuestProfiles(initialGuestProfiles);
    } catch (error) {
      console.error('Error fetching guests:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateGuestProfile = (guestId: string, field: string, value: string) => {
    setGuestProfiles(prev => ({
      ...prev,
      [guestId]: {
        ...prev[guestId],
        [field]: value,
      },
    }));
  };

  const validateForm = (): boolean => {
    setError('');

    // Validate parent profile
    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Your full name must be at least 2 characters');
      return false;
    }

    if (!jerseyNumber || parseInt(jerseyNumber) < 1 || parseInt(jerseyNumber) > 99) {
      setError('Your jersey number must be between 1 and 99');
      return false;
    }

    if (!position) {
      setError('Please select your position');
      return false;
    }

    // Validate guest profiles
    for (const guest of linkedGuests) {
      const guestProfile = guestProfiles[guest.guestId];
      
      if (!guestProfile.fullName.trim() || guestProfile.fullName.trim().length < 2) {
        setError(`Full name for ${guest.guestName} must be at least 2 characters`);
        return false;
      }

      if (!guestProfile.position) {
        setError(`Please select position for ${guest.guestName}`);
        return false;
      }

      // Jersey number is optional for guests, but if provided, validate
      if (guestProfile.jerseyNumber) {
        const num = parseInt(guestProfile.jerseyNumber);
        if (num < 1 || num > 99) {
          setError(`Jersey number for ${guest.guestName} must be between 1 and 99`);
          return false;
        }
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      setError('');

      // Prepare guest profiles array
      const guestProfilesArray: GuestProfile[] = linkedGuests.map(guest => ({
        guestId: guest.guestId,
        guestName: guest.guestName,
        fullName: guestProfiles[guest.guestId].fullName.trim(),
        jerseyNumber: guestProfiles[guest.guestId].jerseyNumber 
          ? parseInt(guestProfiles[guest.guestId].jerseyNumber) 
          : null,
        position: guestProfiles[guest.guestId].position as 'GK' | 'DEF' | 'MID' | 'FORWARD',
      }));

      // Save profile
      const result = await saveUserProfile(
        userId,
        email,
        fullName.trim(),
        parseInt(jerseyNumber),
        position as 'GK' | 'DEF' | 'MID' | 'FORWARD',
        guestProfilesArray
      );

      if (result.success) {
        onComplete();
      } else {
        setError(result.message);
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center z-[9999]">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-base text-gray-700 font-medium">Loading profile form...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col z-[9999] overflow-y-auto">
      {/* Header - Fixed */}
      <div className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-600 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">
                Complete Your Profile
              </h1>
              <p className="text-xs sm:text-sm text-gray-600">
                Required to use the app
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* Info Alert */}
          <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm text-yellow-800 font-medium">
                Fill this information once to continue using the app. You can edit it later.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 animate-slideDown">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-semibold text-red-800">{error}</p>
                </div>
              </div>
            )}

            {/* Parent Profile Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 sm:px-6 py-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    1
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900">Your Profile</h2>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                {/* Full Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Full Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full px-4 py-2.5 sm:py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm sm:text-base text-gray-900"
                    required
                  />
                </div>

                {/* Jersey Number */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Jersey Number <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(e.target.value)}
                    placeholder="1-99"
                    min="1"
                    max="99"
                    className="w-full px-4 py-2.5 sm:py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm sm:text-base text-gray-900"
                    required
                  />
                </div>

                {/* Position */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Position <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value as any)}
                    className="w-full px-4 py-2.5 sm:py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm sm:text-base bg-white text-gray-900"
                    required
                  >
                    <option value="">Select your position</option>
                    <option value="GK">Goalkeeper (GK)</option>
                    <option value="DEF">Defender (DEF)</option>
                    <option value="MID">Midfielder (MID)</option>
                    <option value="FORWARD">Forward (FWD)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Guest Profiles Section */}
            {linkedGuests.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-1">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900">
                    Your Guest Players ({linkedGuests.length})
                  </h3>
                </div>

                {linkedGuests.map((guest, index) => (
                  <div
                    key={guest.guestId}
                    className="bg-white rounded-xl shadow-sm border border-blue-200 overflow-hidden"
                  >
                    <div className="bg-blue-50 px-4 sm:px-6 py-4 border-b border-blue-200">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {index + 2}
                        </div>
                        <h2 className="text-base sm:text-lg font-bold text-gray-900">
                          Guest: {guest.guestName}
                        </h2>
                      </div>
                    </div>

                    <div className="p-4 sm:p-6 space-y-4">
                      {/* Guest Full Name */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Full Name <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="text"
                          value={guestProfiles[guest.guestId]?.fullName || ''}
                          onChange={(e) => updateGuestProfile(guest.guestId, 'fullName', e.target.value)}
                          placeholder="Enter guest's full name"
                          className="w-full px-4 py-2.5 sm:py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base bg-white text-gray-900"
                          required
                        />
                      </div>

                      {/* Guest Jersey Number (Optional) */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Jersey Number <span className="text-gray-500 text-xs">(Optional)</span>
                        </label>
                        <input
                          type="number"
                          value={guestProfiles[guest.guestId]?.jerseyNumber || ''}
                          onChange={(e) => updateGuestProfile(guest.guestId, 'jerseyNumber', e.target.value)}
                          placeholder="1-99 (optional)"
                          min="1"
                          max="99"
                          className="w-full px-4 py-2.5 sm:py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base bg-white text-gray-900"
                        />
                      </div>

                      {/* Guest Position */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Position <span className="text-red-600">*</span>
                        </label>
                        <select
                          value={guestProfiles[guest.guestId]?.position || ''}
                          onChange={(e) => updateGuestProfile(guest.guestId, 'position', e.target.value)}
                          className="w-full px-4 py-2.5 sm:py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base bg-white text-gray-900"
                          required
                        >
                          <option value="">Select position</option>
                          <option value="GK">Goalkeeper (GK)</option>
                          <option value="DEF">Defender (DEF)</option>
                          <option value="MID">Midfielder (MID)</option>
                          <option value="FORWARD">Forward (FWD)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Submit Button */}
            <div className="sticky bottom-0 bg-gradient-to-t from-gray-50 to-transparent pt-6 pb-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 sm:py-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-base sm:text-lg shadow-sm"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-2 sm:border-3 border-white border-t-transparent"></div>
                    <span>Saving Profile...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Save Profile & Continue</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
