'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

interface FormState {
  email: string;
  displayName: string;
}

export default function AddSecretary() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState<FormState>({
    email: '',
    displayName: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!loading && role !== 'superadmin') {
      router.push('/login');
    }
  }, [role, loading, router]);

  const validateEmail = (email: string): boolean => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(email);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    // Validation
    if (!formData.email || !formData.displayName) {
      setMessage({ type: 'error', text: '❌ All fields are required' });
      return;
    }

    if (!validateEmail(formData.email)) {
      setMessage({ type: 'error', text: '❌ Please enter a valid email address' });
      return;
    }

    try {
      setSubmitting(true);

      // Check if email already exists
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', formData.email));
      const existingUsers = await getDocs(q);

      if (!existingUsers.empty) {
        setMessage({ type: 'error', text: '❌ This email is already registered in the system' });
        setSubmitting(false);
        return;
      }

      // Check if email exists in authorizedUsers
      const authRef = collection(db, 'authorizedUsers');
      const authQuery = query(authRef, where('email', '==', formData.email));
      const existingAuth = await getDocs(authQuery);

      if (!existingAuth.empty) {
        setMessage({ type: 'error', text: '❌ This email is already authorized' });
        setSubmitting(false);
        return;
      }

      // Check if secretary already exists
      const secretaryQuery = query(usersRef, where('role', '==', 'secretary'));
      const secretarySnap = await getDocs(secretaryQuery);

      if (!secretarySnap.empty) {
        setMessage({ 
          type: 'error', 
          text: '❌ A Secretary is already assigned. Please remove the current Secretary first.' 
        });
        setSubmitting(false);
        return;
      }

      // Add to authorizedUsers collection
      await addDoc(collection(db, 'authorizedUsers'), {
        email: formData.email,
        displayName: formData.displayName,
        role: 'secretary',
        isAuthorized: true,
        appointedBy: user?.uid || null,
        appointedByEmail: user?.email || null,
        appointedByRole: 'superadmin',
        createdAt: serverTimestamp(),
      });

      setMessage({ 
        type: 'success', 
        text: '✅ Secretary added successfully! They can now log in to the system.' 
      });
      
      // Reset form
      setFormData({ email: '', displayName: '' });

      // Redirect after 2 seconds
      setTimeout(() => {
        router.push('/superadmin');
      }, 2000);
    } catch (error) {
      console.error('Error adding secretary:', error);
      setMessage({ type: 'error', text: '❌ Failed to add Secretary. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user || role !== 'superadmin') return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">📋 Add Secretary</h1>
              <p className="text-purple-100 text-sm mt-1">Authorize a new Secretary to manage players</p>
            </div>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-white text-purple-600 font-semibold rounded-lg hover:bg-gray-100 transition"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Secretary Information</h2>
            <p className="text-gray-600 text-sm">
              Enter the details of the person you want to assign as Secretary. They will be able to add and manage players.
            </p>
          </div>

          {/* Message */}
          {message.text && (
            <div
              className={`mb-6 p-4 rounded-lg border ${
                message.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <p className="font-semibold">{message.text}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Display Name */}
            <div className="mb-6">
              <label htmlFor="displayName" className="block text-gray-700 font-semibold mb-2">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="displayName"
                name="displayName"
                value={formData.displayName}
                onChange={handleChange}
                placeholder="Enter full name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                required
              />
            </div>

            {/* Email */}
            <div className="mb-6">
              <label htmlFor="email" className="block text-gray-700 font-semibold mb-2">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="secretary@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                required
              />
              <p className="text-xs text-gray-500 mt-2">
                This email will be authorized to access the Secretary dashboard
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-purple-800 font-semibold mb-2">ℹ️ Important Notes:</p>
              <ul className="text-xs text-purple-700 space-y-1 list-disc list-inside">
                <li>Only one Secretary can be assigned at a time</li>
                <li>The Secretary will be able to add and manage Players</li>
                <li>They must sign in with the Google account associated with this email</li>
              </ul>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  Adding Secretary...
                </>
              ) : (
                <>
                  <span>📋</span>
                  Add Secretary
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
