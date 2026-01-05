'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

export default function AddPlayers() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    if (!loading && role !== 'secretary') {
      router.push('/login');
    }
  }, [role, loading, router]);

  const validateEmail = (email: string): boolean => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    // Validation
    if (!email) {
      setMessage({ type: 'error', text: 'Email is required' });
      return;
    }

    if (!validateEmail(email)) {
      setMessage({ type: 'error', text: 'Please enter a valid email address' });
      return;
    }

    try {
      setSubmitting(true);

      // Check if email already exists in users collection
      const usersRef = collection(db, 'users');
      const usersQuery = query(usersRef, where('email', '==', email));
      const existingUsers = await getDocs(usersQuery);

      if (!existingUsers.empty) {
        setMessage({ type: 'error', text: 'This email is already registered in the system' });
        setSubmitting(false);
        return;
      }

      // Check if email exists in authorizedUsers collection
      const authRef = collection(db, 'authorizedUsers');
      const authQuery = query(authRef, where('email', '==', email));
      const existingAuth = await getDocs(authQuery);

      if (!existingAuth.empty) {
        setMessage({ type: 'error', text: 'This email is already authorized' });
        setSubmitting(false);
        return;
      }

      // Add to authorizedUsers collection (without displayName)
      await addDoc(collection(db, 'authorizedUsers'), {
        email: email,
        displayName: null,
        role: 'player',
        isAuthorized: true,
        profileCompleted: false,
        appointedBy: user?.uid || null,
        appointedByEmail: user?.email || null,
        appointedByRole: 'secretary',
        createdAt: serverTimestamp(),
      });

      // Show success modal
      setShowSuccessModal(true);
      
      // Reset form
      setEmail('');

    } catch (error) {
      console.error('Error adding player:', error);
      setMessage({ type: 'error', text: 'Failed to add Player. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMore = () => {
    setShowSuccessModal(false);
    setMessage({ type: '', text: '' });
  };

  const handleViewPlayers = () => {
    router.push('/secretary/view-players');
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
                Add Player
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                Authorize player emails to access the system
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form - Centered */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8">
        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Add Player Email</h2>
              <p className="text-sm text-gray-600">
                Enter the player's email address. They will complete their profile details after logging in for the first time.
              </p>
            </div>

            {/* Error Message */}
            {message.type === 'error' && message.text && (
              <div className="mb-6 p-4 rounded-lg border-l-4 bg-red-50 border-red-500 text-red-800">
                <p className="text-sm font-medium">{message.text}</p>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Email */}
              <div className="mb-6">
                <label htmlFor="email" className="block text-sm font-semibold text-gray-900 mb-2">
                  Player Email Address <span className="text-red-600">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="player@example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-base text-gray-900"
                  required
                />
                <p className="text-xs text-gray-500 mt-2">
                  This email will be authorized to access the Player dashboard
                </p>
              </div>

              {/* Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      Adding...
                    </>
                  ) : (
                    'Add Player'
                  )}
                </button>
                
                <button
                  type="button"
                  onClick={() => router.push('/secretary/view-players')}
                  className="px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition-colors text-base"
                >
                  View All Players
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
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
              Player Added Successfully!
            </h3>
            <p className="text-sm text-gray-600 text-center mb-6">
              The player can now log in and complete their profile using the authorized email.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleAddMore}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add More Players
              </button>
              
              <button
                onClick={handleViewPlayers}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                View All Players
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add animation keyframe in global CSS or style tag */}
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
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
