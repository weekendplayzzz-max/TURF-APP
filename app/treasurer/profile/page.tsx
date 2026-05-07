'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Timestamp, doc, getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserProfile {
  fullName: string;
  jerseyNumber: number;
  position: 'GK' | 'DEF' | 'MID' | 'FORWARD';
}

interface UserData {
  createdAt: Timestamp;
}

const POSITION_MAP: Record<string, string> = {
  GK:      'Goalkeeper',
  DEF:     'Defender',
  MID:     'Midfielder',
  FORWARD: 'Forward',
};

const POSITION_COLOR: Record<string, string> = {
  GK:      'bg-yellow-50 text-yellow-700 border-yellow-200',
  DEF:     'bg-blue-50   text-blue-700   border-blue-200',
  MID:     'bg-green-50  text-green-700  border-green-200',
  FORWARD: 'bg-red-50    text-red-700    border-red-200',
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({
  photoURL,
  initials,
  jerseyNumber,
  loading,
}: {
  photoURL: string | null;
  initials: string;
  jerseyNumber?: number;
  loading: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const showImg = photoURL && !imgError;

  return (
    <div className="relative inline-block">
      <div className="w-24 h-24 rounded-full border-4 border-white shadow-xl overflow-hidden bg-gray-800 flex items-center justify-center">
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoURL}
            alt="Profile"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-3xl font-black text-white select-none">{initials}</span>
        )}
      </div>
      {!loading && jerseyNumber !== undefined && (
        <div className="absolute -bottom-1 -right-1 min-w-[26px] h-[26px] px-1 bg-red-600 text-white rounded-full border-2 border-white flex items-center justify-center shadow-sm">
          <span className="text-[11px] font-black leading-none">{jerseyNumber}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function TreasurerProfile() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [profile,        setProfile]        = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [userData,       setUserData]       = useState<UserData | null>(null);
  const [loadingUser,    setLoadingUser]    = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'treasurer') router.push('/login');
  }, [role, loading, user, router]);

  useEffect(() => {
    if (!user || role !== 'treasurer') return;
    (async () => {
      try {
        setLoadingUser(true);
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) setUserData({ createdAt: snap.data().createdAt });
      } catch (e) { console.error(e); }
      finally { setLoadingUser(false); }
    })();
  }, [user, role]);

  useEffect(() => {
    if (!user || role !== 'treasurer') return;
    (async () => {
      try {
        setLoadingProfile(true);
        const snap = await getDoc(doc(db, 'userProfiles', user.uid));
        if (snap.exists()) {
          const d = snap.data();
          setProfile({ fullName: d.fullName, jerseyNumber: d.jerseyNumber, position: d.position });
        }
      } catch (e) { console.error(e); }
      finally { setLoadingProfile(false); }
    })();
  }, [user, role]);

  if (loading || !user || role !== 'treasurer') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const displayName = profile?.fullName || user.displayName || 'Treasurer';
  const initials    = displayName.split(' ').map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
  const posColor    = profile ? (POSITION_COLOR[profile.position] ?? 'bg-gray-100 text-gray-600 border-gray-200') : '';
  const memberSince = userData?.createdAt
    ? userData.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2.5 rounded-xl bg-gray-100 active:bg-gray-200 cursor-pointer flex-shrink-0"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <p className="font-bold text-gray-900 text-sm">My Profile</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4 pb-12">

        {/* ══════════════════════════════════════
            HERO CARD
        ══════════════════════════════════════ */}
        <div className="relative overflow-hidden bg-gray-900 rounded-2xl text-white" style={{ minHeight: '100px' }}>

  {/* Ghost jersey number — right side, brighter red */}
  {!loadingProfile && profile?.jerseyNumber !== undefined && (
    <span
      className="absolute select-none pointer-events-none font-black leading-none"
      style={{
        fontSize: '130px',
        right: '-4px',
        bottom: '-18px',
        opacity: 0.35,
        color: '#ef4444',
        letterSpacing: '-4px',
      }}
    >
      {profile.jerseyNumber}
    </span>
  )}

  <div className="relative p-4 pr-24 flex items-center gap-3">

    {/* Avatar */}
    <div className="relative flex-shrink-0">
      {user.photoURL ? (
        <img src={user.photoURL} alt="Profile" referrerPolicy="no-referrer"
          className="w-14 h-14 rounded-2xl object-cover border-2 border-white/10" />
      ) : (
        <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
          <span className="text-xl font-black text-white">{initials}</span>
        </div>
      )}

      {/* Verified badge */}
      <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
          <path d="M10.5213 2.62368C11.3147 1.75255 12.6853 1.75255 13.4787 2.62368L14.4989 3.74391C14.8998 4.18418 15.4761 4.42288 16.0709 4.39508L17.5845 4.32435C18.7614 4.26934 19.7307 5.23857 19.6757 6.41553L19.605 7.92905C19.5772 8.52388 19.8158 9.10016 20.2561 9.50111L21.3763 10.5213C22.2475 11.3147 22.2475 12.6853 21.3763 13.4787L20.2561 14.4989C19.8158 14.8998 19.5772 15.4761 19.605 16.0709L19.6757 17.5845C19.7307 18.7614 18.7614 19.7307 17.5845 19.6757L16.0709 19.605C15.4761 19.5772 14.8998 19.8158 14.4989 20.2561L13.4787 21.3763C12.6853 22.2475 11.3147 22.2475 10.5213 21.3763L9.50111 20.2561C9.10016 19.8158 8.52388 19.5772 7.92905 19.605L6.41553 19.6757C5.23857 19.7307 4.26934 18.7614 4.32435 17.5845L4.39508 16.0709C4.42288 15.4761 4.18418 14.8998 3.74391 14.4989L2.62368 13.4787C1.75255 12.6853 1.75255 11.3147 2.62368 10.5213L3.74391 9.50111C4.18418 9.10016 4.42288 8.52388 4.39508 7.92905L4.32435 6.41553C4.26934 5.23857 5.23857 4.26934 6.41554 4.32435L7.92905 4.39508C8.52388 4.42288 9.10016 4.18418 9.50111 3.74391L10.5213 2.62368Z" fill="#1D9BF0" />
          <path d="M9 12L11 14L15 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>

    {/* Name + email + role/position */}
    <div className="flex-1 min-w-0">
      <p className="text-base font-black text-white leading-tight truncate">{displayName}</p>
      <p className="text-xs text-gray-400 mt-0.5 truncate">{user.email}</p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
          <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Treasurer</span>
        </div>
        {!loadingProfile && profile && (
          <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
            · {POSITION_MAP[profile.position] ?? profile.position}
          </span>
        )}
      </div>
    </div>
  </div>
</div>

        {/* ══════════════════════════════════════
            PLAYER DETAILS CARD
        ══════════════════════════════════════ */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Player Details</p>
          </div>

          {loadingProfile || loadingUser ? (
            <div className="px-5 py-4 space-y-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="flex justify-between items-center">
                  <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
                  <div className="h-3 w-28 bg-gray-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {[
                { label: 'Full Name',    value: profile?.fullName ?? 'Not set'                                           },
                { label: 'Email',        value: user.email ?? '—',                              small: true              },
                { label: 'Position',     value: profile ? (POSITION_MAP[profile.position] ?? profile.position) : 'Not set' },
                { label: 'Jersey No.',   value: profile ? `#${profile.jerseyNumber}` : 'Not set'                         },
                { label: 'Role',         value: 'Treasurer'                                                               },
                { label: 'Member Since', value: memberSince ?? 'Not available'                                            },
              ].map(({ label, value, small }) => (
                <div key={label} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <p className="text-xs font-semibold text-gray-400 flex-shrink-0 w-24">{label}</p>
                  <p className={`font-semibold text-gray-900 text-right flex-1 truncate ${small ? 'text-xs' : 'text-sm'}`}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════
            SECURITY CARD
        ══════════════════════════════════════ */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Security</p>
          </div>
          <div className="px-5 py-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Email Verification</p>
              <p className="text-xs text-gray-400 mt-0.5">Your email address is verified</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-xs font-semibold text-green-700">Verified</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}