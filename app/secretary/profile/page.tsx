'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { collection, query, where, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Statistics {
  eventsOrganized: number;
  eventsCompleted: number;
  totalCollections: number;
}

interface UserProfile {
  fullName: string;
  jerseyNumber: number;
  position: 'GK' | 'DEF' | 'MID' | 'FORWARD';
}

const POSITION_MAP: Record<string, string> = {
  GK:      'Goalkeeper',
  DEF:     'Defender',
  MID:     'Midfielder',
  FORWARD: 'Forward',
};

export default function SecretaryInfo() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [profile,        setProfile]        = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [memberSince,    setMemberSince]    = useState<string>('');
  const [statistics,     setStatistics]     = useState<Statistics>({ eventsOrganized: 0, eventsCompleted: 0, totalCollections: 0 });
  const [loadingStats,   setLoadingStats]   = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'secretary') router.push('/login');
  }, [role, loading, user, router]);

  // Fetch userProfiles (jersey + position) + users (createdAt)
  useEffect(() => {
    if (!user || role !== 'secretary') return;
    (async () => {
      try {
        setLoadingProfile(true);
        const [profileSnap, userSnap] = await Promise.all([
          getDoc(doc(db, 'userProfiles', user.uid)),
          getDoc(doc(db, 'users', user.uid)),
        ]);
        if (profileSnap.exists()) {
          const d = profileSnap.data();
          setProfile({ fullName: d.fullName, jerseyNumber: d.jerseyNumber, position: d.position });
        }
        if (userSnap.exists()) {
          const createdAt: Timestamp = userSnap.data().createdAt;
          if (createdAt) {
            setMemberSince(createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }));
          }
        }
      } catch (e) { console.error(e); }
      finally { setLoadingProfile(false); }
    })();
  }, [user, role]);

  // Fetch statistics
  useEffect(() => {
    if (!user || role !== 'secretary') return;
    (async () => {
      try {
        setLoadingStats(true);
        const snap = await getDocs(query(collection(db, 'events'), where('secretaryId', '==', user.uid)));
        let eventsCompleted = 0;
        let totalCollections = 0;
        snap.forEach(d => {
          const data = d.data();
          if (data.status !== 'open') {
            eventsCompleted++;
            if (data.totalCollected) totalCollections += data.totalCollected;
          }
        });
        setStatistics({ eventsOrganized: snap.size, eventsCompleted, totalCollections });
      } catch (e) { console.error(e); }
      finally { setLoadingStats(false); }
    })();
  }, [user, role]);

  if (loading || !user || role !== 'secretary') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const displayName = profile?.fullName || user.displayName || user.email?.split('@')[0] || 'Secretary';
  const initial     = displayName[0].toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()}
            className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 cursor-pointer flex-shrink-0 transition-colors">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-7 h-7 flex-shrink-0">
            <Image src="/logo.png" alt="Logo" width={28} height={28} className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-gray-900 leading-tight">My Profile</h1>
            <p className="text-xs text-gray-400">Secretary account</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3 py-4 pb-12 space-y-3">

        {/* ── Identity dark card ── */}
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
          <span className="text-xl font-black text-white">{initial}</span>
        </div>
      )}

      {/* Verified badge — replaces jersey number badge */}
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
          <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Secretary</span>
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

        {/* ── Account details ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Account Details</p>
          <div className="space-y-0 divide-y divide-gray-100">
            {[
              { label: 'Full Name',    value: profile?.fullName || user.displayName || 'Not set' },
              { label: 'Email',        value: user.email || '—'                                  },
              { label: 'Position',     value: profile ? (POSITION_MAP[profile.position] ?? profile.position) : 'Not set' },
              { label: 'Jersey No.',   value: profile ? `#${profile.jerseyNumber}` : 'Not set'   },
              { label: 'Role',         value: 'Secretary'                                        },
              { label: 'Member Since', value: memberSince || 'Not available'                     },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2.5 gap-3">
                <p className="text-xs font-bold text-gray-400 flex-shrink-0">{label}</p>
                <p className="text-xs font-semibold text-gray-800 text-right truncate">{value}</p>
              </div>
            ))}
          </div>
        </div>

       

        {/* ── Security ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Security</p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-800">Email Verification</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Your email address is verified</p>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-full flex-shrink-0">
              <svg className="w-3 h-3 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-[10px] font-black text-gray-500">Verified</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}