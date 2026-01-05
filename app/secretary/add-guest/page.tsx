'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { collection, addDoc, serverTimestamp, getDocs, doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';

interface Player {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'Active' | 'Pending';
}

export default function AddGuests() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  
  // Form fields
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  
  // Parent selection
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [selectedParents, setSelectedParents] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  
  // UI states
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [addedGuestInfo, setAddedGuestInfo] = useState<{
    name: string;
    parentCount: number;
  } | null>(null);

  useEffect(() => {
    if (!loading && role !== 'secretary') {
      router.push('/login');
    }
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'secretary') {
      fetchAllPlayers();
    }
  }, [role]);

  const fetchAllPlayers = async () => {
    try {
      setLoadingPlayers(true);
      const players: Player[] = [];
      const playerEmailsSet = new Set<string>();

      // Fetch from users collection (logged in users)
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);

      usersSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const email = data.email;
        
        if (playerEmailsSet.has(email)) return;

        playerEmailsSet.add(email);
        players.push({
          id: docSnap.id,
          name: data.displayName || data.name || email?.split('@')[0] || 'User',
          email: email,
          role: data.role || 'player',
          status: 'Active',
        });
      });

      // Fetch from authorizedUsers collection (pending users)
      const authUsersRef = collection(db, 'authorizedUsers');
      const authUsersSnapshot = await getDocs(authUsersRef);

      authUsersSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const email = data.email;
        
        if (playerEmailsSet.has(email)) return;

        playerEmailsSet.add(email);
        players.push({
          id: docSnap.id,
          name: data.displayName || email?.split('@')[0] || 'User',
          email: email,
          role: data.role || 'player',
          status: 'Pending',
        });
      });

      // Sort alphabetically
      players.sort((a, b) => a.name.localeCompare(b.name));

      setAllPlayers(players);
    } catch (error) {
      console.error('Error fetching players:', error);
      setMessage({ type: 'error', text: 'Failed to load players' });
    } finally {
      setLoadingPlayers(false);
    }
  };

  const toggleParent = (playerId: string) => {
    const newSelected = new Set(selectedParents);
    if (newSelected.has(playerId)) {
      newSelected.delete(playerId);
    } else {
      newSelected.add(playerId);
    }
    setSelectedParents(newSelected);
  };

  const selectAll = () => {
    setSelectedParents(new Set(filteredPlayers.map(p => p.id)));
  };

  const clearSelection = () => {
    setSelectedParents(new Set());
  };

  const validateForm = (): boolean => {
    if (!guestName.trim() || guestName.length < 2) {
      setMessage({ type: 'error', text: 'Guest name is required (minimum 2 characters)' });
      return false;
    }

    if (selectedParents.size === 0) {
      setMessage({ type: 'error', text: 'Please select at least one parent account' });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (!validateForm()) return;

    try {
      setSubmitting(true);

      // Get current timestamp once
      const now = Timestamp.now();

      // Prepare parent data array (use Timestamp.now() instead of serverTimestamp())
      const linkedParentsData = Array.from(selectedParents).map(parentId => {
        const parent = allPlayers.find(p => p.id === parentId);
        return {
          parentId: parentId,
          parentName: parent?.name || '',
          parentEmail: parent?.email || '',
          parentRole: parent?.role || 'player',
          linkedAt: now,
          linkedBy: user?.uid || ''
        };
      });

      // Create guest player document
      const guestRef = await addDoc(collection(db, 'guestPlayers'), {
        guestName: guestName.trim(),
        notes: notes.trim() || null,
        linkedParents: linkedParentsData,
        parentIds: Array.from(selectedParents),
        playerType: 'guest',
        isActive: true,
        addedBy: user?.uid || '',
        addedByEmail: user?.email || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        totalEventsPlayed: 0,
        lastPlayedAt: null
      });

      // Update each parent's linkedGuests array
      for (const parentId of selectedParents) {
        // Update in users collection if they exist there
        const userRef = doc(db, 'users', parentId);
        try {
          await updateDoc(userRef, {
            linkedGuests: arrayUnion({
              guestId: guestRef.id,
              guestName: guestName.trim(),
              linkedAt: now
            })
          });
        } catch (error) {
          // If user doesn't exist in users collection, that's okay
          console.log('User not in users collection yet:', parentId);
        }
      }

      // Store guest info for success modal
      setAddedGuestInfo({
        name: guestName.trim(),
        parentCount: selectedParents.size
      });

      // Show success modal
      setShowSuccessModal(true);

      // Reset form
      setGuestName('');
      setNotes('');
      setSelectedParents(new Set());
      setSearchTerm('');

    } catch (error) {
      console.error('Error adding guest:', error);
      setMessage({ type: 'error', text: 'Failed to add guest player. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMore = () => {
    setShowSuccessModal(false);
    setAddedGuestInfo(null);
    setMessage({ type: '', text: '' });
  };

  const handleViewGuests = () => {
    router.push('/secretary/view-players');
  };

  // Filter players based on search
  const filteredPlayers = allPlayers.filter(player => 
    player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => router.push('/secretary')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer flex-shrink-0"
              title="Go to Dashboard"
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
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900">
                Add Guest Player
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                Add guests and link them to parent accounts
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form - Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 md:p-8">
            
            {/* Error Message */}
            {message.type === 'error' && message.text && (
              <div className="mb-6 p-4 rounded-lg border-l-4 bg-red-50 border-red-500 text-red-800 animate-slideDown">
                <p className="text-sm font-medium">{message.text}</p>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Guest Information Section */}
              <div className="mb-8">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Guest Player Information</h2>
                
                {/* Guest Name */}
                <div className="mb-4">
                  <label htmlFor="guestName" className="block text-sm font-semibold text-gray-900 mb-2">
                    Guest Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    id="guestName"
                    name="guestName"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Enter guest player name"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-base text-gray-900"
                    required
                  />
                </div>

                {/* Notes */}
                <div className="mb-4">
                  <label htmlFor="notes" className="block text-sm font-semibold text-gray-900 mb-2">
                    Additional Notes <span className="text-gray-500 text-xs">(Optional)</span>
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any special information about this guest player..."
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-base text-gray-900"
                  />
                </div>
              </div>

              {/* Parent Selection Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    Link to Parent Account(s) <span className="text-red-600">*</span>
                  </h2>
                  {selectedParents.size > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAll}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors border border-blue-200"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Clear ({selectedParents.size})
                      </button>
                    </div>
                  )}
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 rounded-lg">
                  <p className="text-xs sm:text-sm text-blue-800 font-semibold mb-2">
                    Guest players can be linked to multiple parents
                  </p>
                  <ul className="text-xs sm:text-sm text-blue-700 space-y-1 list-disc list-inside">
                    <li>Select all family members who can add this guest to events</li>
                    <li>Guest will appear in all selected parents' event join options</li>
                    <li>At least one parent is required</li>
                  </ul>
                </div>

                {/* Search Box */}
                <div className="mb-4">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search by name or email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-4 py-3 pl-10 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                    />
                    <svg className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {selectedParents.size === 0 
                      ? 'No parents selected yet' 
                      : `${selectedParents.size} parent${selectedParents.size > 1 ? 's' : ''} selected`}
                  </p>
                </div>

                {/* Players List */}
                {loadingPlayers ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <div className="relative w-12 h-12 mx-auto mb-3">
                        <div className="absolute inset-0 border-3 border-red-600/20 rounded-full"></div>
                        <div className="absolute inset-0 border-3 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                      <p className="text-sm text-gray-600">Loading players...</p>
                    </div>
                  </div>
                ) : filteredPlayers.length === 0 ? (
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-lg">
                    <p className="text-sm text-yellow-800 font-semibold">
                      {searchTerm ? 'No players found matching your search' : 'No players available'}
                    </p>
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="text-xs text-yellow-700 underline mt-2"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto border-2 border-gray-200 rounded-lg p-3">
                    {filteredPlayers.map((player) => (
                      <div
                        key={player.id}
                        onClick={() => toggleParent(player.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          selectedParents.has(player.id)
                            ? 'border-red-600 bg-red-50'
                            : 'border-gray-200 hover:border-red-300 bg-white'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                            selectedParents.has(player.id)
                              ? 'bg-red-600 border-red-600'
                              : 'border-gray-300'
                          }`}
                        >
                          {selectedParents.has(player.id) && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm sm:text-base font-semibold text-gray-900 truncate">{player.name}</p>
                            <span
                              className={`px-2 py-0.5 text-xs font-bold rounded-full flex-shrink-0 ${
                                player.status === 'Active'
                                  ? 'bg-green-50 text-green-700 border border-green-200'
                                  : 'bg-orange-50 text-orange-700 border border-orange-200'
                              }`}
                            >
                              {player.status}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-gray-600 truncate">{player.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  disabled={submitting || loadingPlayers}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      Adding Guest...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                      Add Guest Player
                    </>
                  )}
                </button>
                
                <button
                  type="button"
                  onClick={() => router.push('/secretary/view-players')}
                  className="px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition-colors text-base"
                >
                  View All Particpants
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && addedGuestInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 animate-scale-in">
            {/* Success Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            {/* Success Message */}
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-2">
              Guest Player Added!
            </h3>
            <div className="text-center mb-6">
              <p className="text-lg font-semibold text-gray-900 mb-1">{addedGuestInfo.name}</p>
              <p className="text-sm text-gray-600 mt-2">
                Linked to {addedGuestInfo.parentCount} parent{addedGuestInfo.parentCount > 1 ? 's' : ''}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleAddMore}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add More Guests
              </button>
              
              <button
                onClick={handleViewGuests}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                View All Guests
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style jsx>{`
        @keyframes scale-in {
          0% {
            opacity: 0;
            transform: scale(0.9);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
        
        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
