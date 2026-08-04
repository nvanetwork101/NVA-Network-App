import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where, limit, orderBy } from "firebase/firestore";
import { db } from '../firebase'; 

function HeaderLiveButton({ setActiveScreen, showMessage, isLive }) {
    const [upcomingEvent, setUpcomingEvent] = useState(null);
    const [eventTimeLeft, setEventTimeLeft] = useState('');
    const [eventIsLive, setEventIsLive] = useState(false);

    useEffect(() => {
        // THE FIX: Unified Smart Scanner with Override Priority. Bypasses the single-slot bottleneck.
        const q = query(collection(db, "events"), where("status", "in", ["upcoming", "live"]));
        const unsubscribe = onSnapshot(q, (snap) => {
            if (!snap.empty) {
                const nowMs = Date.now();
                const allEvents = snap.docs.map(d => {
                    const data = d.data();
                    const sTime = data.scheduledStartTime;
                    const startTimeMs = sTime?.toMillis ? sTime.toMillis() : (sTime?.seconds ? sTime.seconds * 1000 : (typeof sTime === 'string' ? new Date(sTime).getTime() : 0));
                    return {
                        id: d.id,
                        ...data,
                        extractedTimeMs: isNaN(startTimeMs) ? 0 : startTimeMs,
                        isLiveNow: data.status === 'live',
                        isPromoted: data.isPromotedToBillboard === true // Flag for manual override
                    };
                }).filter(e => e.isLiveNow || e.extractedTimeMs > nowMs); // Drop past events

                // Advanced Sorting Engine
                allEvents.sort((a, b) => {
                    if (a.isLiveNow && !b.isLiveNow) return -1;
                    if (!a.isLiveNow && b.isLiveNow) return 1;
                    if (a.isPromoted && !b.isPromoted) return -1;
                    if (!a.isPromoted && b.isPromoted) return 1;
                    return a.extractedTimeMs - b.extractedTimeMs; // Sort by closest date
                });

                if (allEvents.length > 0) {
                    setUpcomingEvent(allEvents[0]);
                } else {
                    setUpcomingEvent(null);
                }
            } else {
                setUpcomingEvent(null);
            }
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!upcomingEvent) return;
        const updateTimer = () => {
            const now = Date.now();

            // MUSIC PREMIERE DURATION AUTO-EXPIRE (Isolated 0-Risk Shield for Music Videos Only)
            if (upcomingEvent.type === 'musicVideoPremiere') {
                const durSecs = Number(upcomingEvent.durationTotalSec) || ((Number(upcomingEvent.durationMinutes) || 3) * 60 + (Number(upcomingEvent.durationSeconds) || 0));
                const windowMs = durSecs > 0 ? (durSecs * 1000) : (15 * 60 * 1000);
                
                if (upcomingEvent.extractedTimeMs > 0 && now >= (upcomingEvent.extractedTimeMs + windowMs)) {
                    setUpcomingEvent(null);
                    setEventIsLive(false);
                    return;
                }
            }

            // If the event is active live in the database, bypass the countdown comparison
            if (upcomingEvent.status === 'live' || upcomingEvent.isLiveNow) {
                setEventTimeLeft('LIVE NOW!');
                setEventIsLive(true);
                return;
            }

            const diff = upcomingEvent.extractedTimeMs - now;

            if (diff <= (3 * 60 * 60 * 1000) && diff > 0) {
                const toastKey = `toasted_${upcomingEvent.id}`;
                if (!sessionStorage.getItem(toastKey)) {
                    sessionStorage.setItem(toastKey, "true");
                    const msg = `🎬 Doors are open for ${upcomingEvent.eventTitle}! Get your tickets now.`;
                    window.dispatchEvent(new CustomEvent('showGlobalToast', { detail: msg }));
                    if (typeof showMessage === 'function') { try { showMessage(msg); } catch (e) {} }
                }
            }

            if (diff <= 0) {
                setEventTimeLeft('LIVE NOW!');
                setEventIsLive(true);
            } else {
                const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                const m = Math.floor((diff / 1000 / 60) % 60);
                setEventTimeLeft(`${d > 0 ? d + 'd ' : ''}${h}h ${m}m`);
                setEventIsLive(false);
            }
        };

        updateTimer(); 
        const interval = setInterval(updateTimer, 1000); // Ticks every second
        return () => clearInterval(interval);
    }, [upcomingEvent, showMessage, isLive]);

    // ABSOLUTE AUTHORITY: Render when an upcoming or live premiere exists
    if (!upcomingEvent || !eventTimeLeft || upcomingEvent.status === 'completed' || upcomingEvent.status === 'archived_vod') return null; 

    const activeCountdown = isLive ? 'LIVE NOW!' : eventTimeLeft;
    const activeIsLive = isLive || eventIsLive || upcomingEvent?.status === 'live' || upcomingEvent?.isLiveNow;

    return (
        <div 
            onClick={() => {
            sessionStorage.setItem('nva_target_discover_tab', 'Premieres');
            // THE FIX: Forces routing into the Multiplex Lobby by clearing the targeted event ID
            sessionStorage.setItem('nva_target_premiere_event_id', 'none');
            window.dispatchEvent(new CustomEvent('setPremiereActiveEvent', { detail: { eventId: null } }));
            window.dispatchEvent(new CustomEvent('switchDiscoverTab', { detail: 'Premieres' }));
            setActiveScreen('Discover');
        }}
            style={{
                background: activeIsLive ? 'linear-gradient(135deg, rgba(220,53,69,0.8), rgba(255,0,0,0.6))' : 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(4, 120, 87, 0.4))',
                backdropFilter: 'blur(12px)',
                border: activeIsLive ? '1px solid rgba(255,100,100,0.6)' : '1px solid rgba(16, 185, 129, 0.9)',
                boxShadow: activeIsLive ? '0 0 15px rgba(220,53,69,0.6)' : '0 0 20px rgba(16, 185, 129, 0.6)',
                padding: '4px 10px', borderRadius: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#FFF',
                animation: activeIsLive ? 'pulse 2s infinite' : 'pulse 3s infinite', transition: 'all 0.3s ease'
            }}
        >
            <span style={{ fontSize: '12px', filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.5))' }}>{activeIsLive ? '🔴' : '⏳'}</span>
            <span style={{ fontWeight: '900', letterSpacing: '0.5px', fontSize: '11px', color: activeIsLive ? '#FFF' : '#4ADE80' }}>                {activeIsLive ? activeCountdown : `Premieres In: ${activeCountdown}`}
            </span>
        </div>
    );
}

export default HeaderLiveButton;