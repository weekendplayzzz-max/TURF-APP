'use client';

import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface LoginState {
  error: string | null;
  signingIn: boolean;
}

export default function Login() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  const [state, setState] = useState<LoginState>({
    error: null,
    signingIn: false,
  });

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleSignIn = async () => {
    try {
      setState({ error: null, signingIn: true });
      await signInWithGoogle();
    } catch (err) {
      console.error('Sign-in error:', err);
      setState({
        error: 'Failed to sign in. Please try again.',
        signingIn: false,
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-lg text-gray-700">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome</h1>
          <p className="text-gray-600">Sign in to access your personal space</p>
        </div>

        {state.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">{state.error}</p>
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={state.signingIn}
          className="w-full bg-white border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 transition flex items-center justify-center gap-3 shadow-sm disabled:opacity-50"
        >
          {state.signingIn ? 'Signing in...' : 'Sign in with Google'}
        </button>

        <p className="text-sm text-gray-500 text-center mt-6">
          Secure authentication powered by Google
        </p>
      </div>
    </div>
  );
}
