'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
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
      setMessage('❌ Please fill all fields');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // Validate deadline is before event date
    const eventDateTime = new Date(`${formData.date}T${formData.time}`);
    const deadlineDateTime = new Date(`${formData.deadlineDate}T${formData.deadlineTime}`);

    if (deadlineDateTime >= eventDateTime) {
      setMessage('❌ Deadline must be before event date/time');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // Validate event is in future
    const now = new Date();
    if (eventDateTime <= now) {
      setMessage('❌ Event must be in the future');
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

      setMessage('✅ Event created successfully!');
      setTimeout(() => {
        router.push('/treasurer/manage-events');
      }, 1500);
    } catch (error) {
      console.error('Error creating event:', error);
      setMessage('❌ Failed to create event');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user || role !== 'treasurer') {
    return null;
  }

  // Get today's date for min date picker
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-xl">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">🏆 Create New Event</h1>
              <p className="text-blue-100 text-base">
                Schedule a turf match for your team
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="px-6 py-3 bg-white text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition shadow-md"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg text-center font-bold text-lg ${
              message.includes('✅')
                ? 'bg-green-100 text-green-800 border-2 border-green-300'
                : 'bg-red-100 text-red-800 border-2 border-red-300'
            }`}
          >
            {message}
          </div>
        )}

        {/* Form */}
        <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Event Title */}
            <div>
              <label className="block text-gray-700 font-bold mb-2 text-base">
                Event Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-base"
                placeholder="e.g., Saturday Turf Match"
                required
              />
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-gray-700 font-bold mb-2 text-base">
                  Event Date *
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  min={today}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-base"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-2 text-base">
                  Event Time *
                </label>
                <input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-base"
                  required
                />
              </div>
            </div>

            {/* Amount & Duration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-gray-700 font-bold mb-2 text-base">
                  Total Amount (₹) *
                </label>
                <input
                  type="number"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-base"
                  placeholder="1500"
                  min="0"
                  step="10"
                  required
                />
                <p className="text-sm text-gray-500 mt-1">Total turf booking cost</p>
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-2 text-base">
                  Duration (Hours) *
                </label>
                <input
                  type="number"
                  value={formData.durationHours}
                  onChange={(e) => setFormData({ ...formData, durationHours: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-base"
                  placeholder="2"
                  min="0.5"
                  step="0.5"
                  required
                />
                <p className="text-sm text-gray-500 mt-1">Match duration</p>
              </div>
            </div>

            {/* Deadline */}
            <div className="bg-yellow-50 p-6 rounded-lg border-2 border-yellow-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                ⏰ Poll Deadline
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Players can join/leave until this deadline. Poll will auto-close at this time.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-gray-700 font-bold mb-2 text-base">
                    Deadline Date *
                  </label>
                  <input
                    type="date"
                    value={formData.deadlineDate}
                    onChange={(e) => setFormData({ ...formData, deadlineDate: e.target.value })}
                    min={today}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-yellow-500 focus:outline-none text-base"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-2 text-base">
                    Deadline Time *
                  </label>
                  <input
                    type="time"
                    value={formData.deadlineTime}
                    onChange={(e) => setFormData({ ...formData, deadlineTime: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-yellow-500 focus:outline-none text-base"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-lg hover:from-blue-700 hover:to-blue-800 transition shadow-lg text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '⏳ Creating Event...' : '✓ Create Event'}
            </button>
          </form>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-green-50 border-2 border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-bold text-green-900 mb-2">📌 Important Notes</h3>
          <ul className="text-sm text-green-800 space-y-2">
            <li>• Event will appear on all players dashboards immediately</li>
            <li>• Players can join/leave until the deadline</li>
            <li>• Poll auto-closes at deadline or can be closed manually</li>
            <li>• After closing, you can add players and edit amount/duration/title</li>
            <li>• Event auto-locks after match day passes</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
