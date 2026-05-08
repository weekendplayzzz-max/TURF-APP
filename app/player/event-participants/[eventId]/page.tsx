'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import {
  collection, getDocs, doc, getDoc,
  query, where, Timestamp,
} from 'firebase/firestore';

interface Participant {
  id: string;
  playerId: string;
  playerName: string;
  playerEmail: string;
  playerType: 'regular' | 'guest';
  parentId?: string;
  joinedAt: Timestamp;
}

interface Event {
  title: string;
  date: Timestamp;
  time: string;
  status: string;
  totalAmount: number;
  durationHours: number;
}

export default function PlayerEventParticipants() {
  const { role, loading, user } = useAuth();
  const router  = useRouter();
  const params  = useParams();
  const eventId = params?.eventId as string;

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [event,        setEvent]        = useState<Event | null>(null);
  const [loadingData,  setLoadingData]  = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  useEffect(() => {
    if (!loading && role !== 'player') router.push('/login');
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'player' && eventId) fetchEventAndParticipants();
  }, [role, eventId]);

  const fetchEventAndParticipants = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoadingData(true);

      // ── Fetch event ──────────────────────────────────────────────────────
      const eventDoc = await getDoc(doc(db, 'events', eventId));
      if (eventDoc.exists()) {
        const d = eventDoc.data();
        setEvent({
          title: d.title, date: d.date, time: d.time,
          status: d.status, totalAmount: d.totalAmount || 0,
          durationHours: d.durationHours || 0,
        });
      }

      // ── Fetch participants ────────────────────────────────────────────────
      const snap = await getDocs(query(
        collection(db, 'eventParticipants'),
        where('eventId', '==', eventId),
        where('currentStatus', '==', 'joined')
      ));

      const rawList: Participant[] = [];
      snap.forEach(d => {
        const data = d.data();
        rawList.push({
          id:          d.id,
          playerId:    data.playerId,
          playerName:  data.playerName,
          playerEmail: data.playerEmail,
          playerType:  data.playerType || 'regular',
          parentId:    data.parentId,
          joinedAt:    data.joinedAt,
        });
      });

      // ── Resolve fullName from userProfiles for regular players ───────────
      // Collect unique playerIds of non-guest participants
      const regularIds = [
        ...new Set(
          rawList
            .filter(p => p.playerType !== 'guest')
            .map(p => p.playerId)
        ),
      ];

      // Batch-fetch userProfiles docs
      const profileMap = new Map<string, string>(); // uid → fullName
      await Promise.all(
        regularIds.map(async uid => {
          try {
            const profileSnap = await getDoc(doc(db, 'userProfiles', uid));
            if (profileSnap.exists()) {
              const fullName = profileSnap.data().fullName?.trim();
              if (fullName) profileMap.set(uid, fullName);
            }
          } catch {
            // silently skip — fallback to stored playerName
          }
        })
      );

      // ── Resolve fullName for guest players from guestPlayers collection ──
      const guestIds = [
        ...new Set(
          rawList
            .filter(p => p.playerType === 'guest')
            .map(p => p.playerId)
        ),
      ];

      const guestNameMap = new Map<string, string>(); // guestId → fullName
      await Promise.all(
        guestIds.map(async gid => {
          try {
            const guestSnap = await getDoc(doc(db, 'guestPlayers', gid));
            if (guestSnap.exists()) {
              const fullName =
                guestSnap.data().fullName?.trim() ||
                guestSnap.data().guestName?.trim();
              if (fullName) guestNameMap.set(gid, fullName);
            }
          } catch {
            // silently skip
          }
        })
      );

      // ── Merge resolved names ──────────────────────────────────────────────
      const resolvedList: Participant[] = rawList.map(p => ({
        ...p,
        playerName:
          p.playerType === 'guest'
            ? (guestNameMap.get(p.playerId) ?? p.playerName)
            : (profileMap.get(p.playerId)  ?? p.playerName),
      }));

      resolvedList.sort((a, b) => a.joinedAt?.toMillis() - b.joinedAt?.toMillis());
      setParticipants(resolvedList);
    } catch (e) {
      console.error('Error fetching participants:', e);
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  };

  if (loading || !user || role !== 'player') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const myEntry     = participants.find(p => p.playerId === user.uid);
  const myGuests    = participants.filter(p => p.parentId === user.uid);

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
            <h1 className="text-sm font-bold text-gray-900 leading-tight">Participants</h1>
            {event && <p className="text-xs text-gray-400 truncate">{event.title}</p>}
          </div>
          {event?.status === 'open' && !loadingData && (
            <button
              onClick={() => fetchEventAndParticipants(true)}
              disabled={refreshing}
              className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 cursor-pointer flex-shrink-0 transition-colors disabled:opacity-50"
            >
              <svg
                className={`w-4 h-4 text-gray-600 ${refreshing ? 'animate-spin' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3 py-4 pb-12 space-y-3">

        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : (
          <>
            {/* ── Event info — dark card ── */}
            {event && (
              <div className="relative overflow-hidden bg-gray-900 rounded-2xl p-4 text-white">
                <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full border-[18px] border-red-600/20 pointer-events-none" />
                <div className="absolute right-2 -bottom-8 w-20 h-20 rounded-full border-[14px] border-red-600/10 pointer-events-none" />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Event</p>
                      <h2 className="text-base font-black text-white leading-snug">{event.title}</h2>
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                      event.status === 'open'
                        ? 'bg-red-600/20 text-red-400 border-red-600/30'
                        : 'bg-white/10 text-gray-400 border-white/10'
                    }`}>
                      {event.status}
                    </span>
                  </div>

                  {/* Meta chips */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
                    {[
                      {
                        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
                        text: event.date?.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
                      },
                      {
                        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
                        text: `${event.time} · ${event.durationHours}h`,
                      },
                      {
                        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />,
                        text: `₹${event.totalAmount.toLocaleString()}`,
                      },
                    ].map(({ icon, text }, i) => (
                      <div key={i} className="flex items-center gap-1 text-xs text-gray-400">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>

                  {/* Stats pills */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Players',   value: String(participants.length) },
                      { label: 'Turf Cost', value: `₹${event.totalAmount.toLocaleString()}` },
                      { label: 'Duration',  value: `${event.durationHours}h` },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white/[0.07] rounded-xl px-2 py-2 text-center border border-white/10">
                        <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                        <p className="text-sm font-black text-white mt-0.5 leading-none">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Live notice ── */}
            {event?.status === 'open' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3 animate-slideDown">
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
                </span>
                <p className="text-xs font-semibold text-gray-600 flex-1">
                  Live list — tap the refresh icon in the header to update
                </p>
              </div>
            )}

            {/* ── Participant list ── */}
            {participants.length === 0 ? (
              <div className="bg-white rounded-3xl border border-gray-100 p-10 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-sm font-bold text-gray-900">No participants yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  {event?.status === 'open' ? 'Be the first to join!' : 'No players joined this event'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">

                {/* Section header */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-black text-gray-700 uppercase tracking-wide">Player List</p>
                  <span className="text-[10px] font-black px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                    {participants.length}
                  </span>
                </div>

                <div className="divide-y divide-gray-50">
                  {participants.map((participant, index) => {
                    const isMe      = participant.playerId === user.uid;
                    const isMyGuest = participant.parentId === user.uid;
                    const isGuest   = participant.playerType === 'guest';
                    const highlight = isMe || isMyGuest;

                    return (
                      <div key={participant.id}
                        className={`px-4 py-3 flex items-center gap-3 ${highlight ? 'bg-red-50/40' : ''}`}>

                        {/* Index */}
                        <span className="text-[11px] font-black text-gray-300 w-5 text-center flex-shrink-0">
                          {index + 1}
                        </span>

                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 ${
                          highlight ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {participant.playerName.charAt(0).toUpperCase()}
                        </div>

                        {/* Name + meta */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-gray-900 leading-tight">
                              {participant.playerName}
                            </p>
                            {isMe && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 bg-red-600 text-white rounded-full leading-none">
                                YOU
                              </span>
                            )}
                            {isMyGuest && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded-full leading-none">
                                Your Guest
                              </span>
                            )}
                            {isGuest && !isMyGuest && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-full leading-none">
                                Guest
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            Joined{' '}
                            {participant.joinedAt?.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            {' · '}
                            {participant.joinedAt?.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer summary */}
                {(myEntry || myGuests.length > 0) && (
                  <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                    <p className="text-[10px] text-gray-400 font-semibold">Your participation</p>
                    <div className="flex items-center gap-2">
                      {myEntry && (
                        <span className="text-[10px] font-bold text-gray-600">
                          #{participants.findIndex(p => p.playerId === user.uid) + 1} joined
                        </span>
                      )}
                      {myGuests.length > 0 && (
                        <span className="text-[10px] font-bold text-gray-500">
                          + {myGuests.length} guest{myGuests.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes slideDown { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: translateY(0) } }
        .animate-slideDown { animation: slideDown 0.2s ease-out; }
      `}</style>
    </div>
  );
}