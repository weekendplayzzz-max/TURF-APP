'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { collection, doc, setDoc, Timestamp } from 'firebase/firestore';

export default function CreateEvent() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: '',
    date: '',
    time: '',
    totalAmount: '',
    durationHours: '',
    deadlineDate: '',
    deadlineTime: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!loading && role !== 'treasurer') {
      router.push('/login');
    }
  }, [role, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.date || !formData.time || !formData.totalAmount || !formData.durationHours || !formData.deadlineDate || !formData.deadlineTime) {
      setMessage('Please fill all fields');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // Validate deadline is before event date
    const eventDateTime = new Date(`${formData.date}T${formData.time}`);
    const deadlineDateTime = new Date(`${formData.deadlineDate}T${formData.deadlineTime}`);

    if (deadlineDateTime >= eventDateTime) {
      setMessage('Deadline must be before event date/time');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // Validate event is in future
    const now = new Date();
    if (eventDateTime <= now) {
      setMessage('Event must be in the future');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    try {
      setSubmitting(true);

      const eventRef = doc(collection(db, 'events'));
      await setDoc(eventRef, {
        title: formData.title,
        date: Timestamp.fromDate(new Date(`${formData.date}T${formData.time}`)),
        time: formData.time,
        totalAmount: parseFloat(formData.totalAmount),
        durationHours: parseFloat(formData.durationHours),
        deadline: Timestamp.fromDate(deadlineDateTime),
        status: 'open',
        participantCount: 0,
        originalParticipantCount: 0,
        teamFund: 0,
        editHistory: [],
        createdBy: user?.uid || '',
        createdByRole: 'treasurer',
        createdAt: Timestamp.now(),
        closedAt: null,
        autoLockedAt: null,
        lastEditedAt: Timestamp.now(),
      });

      setMessage('Event created successfully!');
      setTimeout(() => {
        router.push('/treasurer/manage-events');
      }, 1500);
    } catch (error) {
      console.error('Error creating event:', error);
      setMessage('Failed to create event');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user || role !== 'treasurer') {
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

  // Get today's date for min date picker
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header - Fixed alignment like other pages */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
            <div>
              <h1 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900">
                Create Turf Match
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                Schedule a new match
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-10">
        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg border-l-4 ${
            message.includes('successfully')
              ? 'bg-green-50 border-green-500 text-green-800'
              : 'bg-red-50 border-red-500 text-red-800'
          }`}>
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Event Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Turf Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
                placeholder="e.g., Saturday Turf Match"
                required
              />
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Turf Date *
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  min={today}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm text-gray-900"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Turf Time *
                </label>
                <input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm text-gray-900"
                  required
                />
              </div>
            </div>

            {/* Amount & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Total Amount (₹) *
                </label>
                <input
                  type="number"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
                  placeholder="1500"
                  min="0"
                  step="10"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Total turf booking cost</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Duration (Hours) *
                </label>
                <input
                  type="number"
                  value={formData.durationHours}
                  onChange={(e) => setFormData({ ...formData, durationHours: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
                  placeholder="2"
                  min="0.5"
                  step="0.5"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Match duration</p>
              </div>
            </div>

            {/* Deadline */}
            <div className="bg-gray-50 p-4 sm:p-6 rounded-xl border border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-base sm:text-lg font-bold text-gray-900">
                  Registration Deadline
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mb-4">
                Players can join/leave until this deadline. Poll will auto-close at this time.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Deadline Date *
                  </label>
                  <input
                    type="date"
                    value={formData.deadlineDate}
                    onChange={(e) => setFormData({ ...formData, deadlineDate: e.target.value })}
                    min={today}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm text-gray-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Deadline Time *
                  </label>
                  <input
                    type="time"
                    value={formData.deadlineTime}
                    onChange={(e) => setFormData({ ...formData, deadlineTime: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm text-gray-900"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-6 py-3 sm:py-3.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
            >
              {submitting ? 'Creating Turf...' : 'Create Turf'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
