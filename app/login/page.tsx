'use client';

import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';

interface LoginState {
  error: string | null;
  signingIn: boolean;
  unauthorized: boolean;
}

export default function Login() {
  const { user, loading, isAuthorized, signInWithGoogle } = useAuth();
  const router = useRouter();

  const [state, setState] = useState<LoginState>({
    error: null,
    signingIn: false,
    unauthorized: false,
  });

  useEffect(() => {
    if (!loading && user && isAuthorized) {
      router.push('/dashboard');
    }
  }, [user, loading, isAuthorized, router]);

  const handleSignIn = async () => {
    try {
      setState({ error: null, signingIn: true, unauthorized: false });
      await signInWithGoogle();
      
      setTimeout(() => {
        if (!user) {
          setState({
            error: 'Access Denied: Your email is not authorized to access this application.',
            signingIn: false,
            unauthorized: true,
          });
        }
      }, 2000);
    } catch (err) {
      console.error('Sign-in error:', err);
      setState({
        error: 'Failed to sign in. Please try again.',
        signingIn: false,
        unauthorized: false,
      });
    }
  };

  if (loading) {
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      {/* Main Card Container */}
      <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8 md:p-10">
        
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="inline-block mb-5 group">
            <div className="relative w-24 h-24 xs:w-28 xs:h-28 sm:w-32 sm:h-32 transition-transform duration-300 group-hover:scale-105">
              <Image
                src="/logo.png"
                alt="Art of War Logo"
                width={128}
                height={128}
                className="w-full h-full object-contain"
                priority
              />
            </div>
          </div>
          
          <h1 className="text-2xl xs:text-3xl sm:text-4xl font-bold text-gray-900 mb-2 tracking-tight">
            Art of War
          </h1>
          <p className="text-gray-600 text-sm sm:text-base">Welcome back to your Football center</p>
        </div>

        {/* Error Messages */}
        {state.error && (
          <div className={`mb-6 p-4 rounded-lg border-l-4 ${
            state.unauthorized 
              ? 'bg-red-50 border-red-500' 
              : 'bg-red-50 border-red-500'
          }`}>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-800 break-words">
                  {state.error}
                </p>
                {state.unauthorized && (
                  <p className="text-xs text-red-600 mt-2">
                    Please contact the Secretary to request access.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sign In Button */}
        <button
          onClick={handleSignIn}
          disabled={state.signingIn}
          className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold py-3 sm:py-3.5 px-4 sm:px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 sm:gap-3 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm sm:text-base touch-manipulation"
        >
          {state.signingIn ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="truncate">Sign in with Google</span>
            </>
          )}
        </button>

        {/* Divider */}
        <div className="relative my-6 sm:my-7">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-xs sm:text-sm">
            <span className="px-3 bg-white text-gray-500 font-medium"></span>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
            <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-xs sm:text-sm">Protected by Google Authentication</span>
          </div>
          
          <p className="text-xs text-gray-400 px-2">
            Your data is encrypted and secure
          </p>
        </div>
      </div>
    </div>
  );
}
