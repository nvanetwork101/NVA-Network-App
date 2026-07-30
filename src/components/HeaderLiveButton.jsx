import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where, limit, orderBy } from "firebase/firestore";
import { db } from '../firebase'; 

function HeaderLiveButton({ setActiveScreen, showMessage, isLive }) {
    const [upcomingEvent, setUpcomingEvent] = useState(null);
    const [eventTimeLeft, setEventTimeLeft] = useState('');
    const [eventIsLive, setEventIsLive] = useState(false);

    useEffect(() => {
        let masterUnsubscribe = () => {};

        const billboardUnsubscribe = onSnapshot(doc(db, "settings", "liveEvent"), (docSnap) => {
            masterUnsubscribe(); // Clean up previous master listener
            
            if (docSnap.exists() && docSnap.data().status !== 'no_event_scheduled' && docSnap.data().eventId) {
                const billboardData = docSnap.data();
                
                masterUnsubscribe = onSnapshot(doc(db, "events", billboardData.eventId), (masterDoc) => {
                    if (masterDoc.exists()) {
                        const data = masterDoc.data();
                        const sTime = data.scheduledStartTime;
                        const startTimeMs = sTime?.toMillis ? sTime.toMillis() : (sTime?.seconds ? sTime.seconds * 1000 : new Date(sTime).getTime());
                        const validTime = isNaN(startTimeMs) ? 0 : startTimeMs;

                        setUpcomingEvent({ 
                            id: masterDoc.id, 
                            ...data, 
                            extractedTimeMs: validTime, 
                            isLiveNow: data.status === 'live' 
                        });
                    } else {
                        setUpcomingEvent(null);
                    }
                });
            } else {
                // Priority scan for active live events first, then fall back to upcoming
                const fallbackQuery = query(collection(db, "events"), where("status", "in", ["upcoming", "live"]), limit(10));
                masterUnsubscribe = onSnapshot(fallbackQuery, (snap) => {
                    if (!snap.empty) {
                        const allEvents = snap.docs.map(d => {
                            const data = d.data();
                            const sTime = data.scheduledStartTime;
                            const startTimeMs = sTime?.toMillis ? sTime.toMillis() : (sTime?.seconds ? sTime.seconds * 1000 : (typeof sTime === 'string' ? new Date(sTime).getTime() : 0));
                            return {
                                id: d.id,
                                ...data,
                                extractedTimeMs: isNaN(startTimeMs) ? Date.now() + 3600000 : startTimeMs,
                                isLiveNow: data.status === 'live'
                            };
                        });
                        const liveActive = allEvents.find(e => e.status === 'live');
                        if (liveActive) {
                            setUpcomingEvent(liveActive);
                        } else {
                            allEvents.sort((a, b) => a.extractedTimeMs - b.extractedTimeMs);
                            setUpcomingEvent(allEvents[0] || null);
                        }
                    } else {
                        setUpcomingEvent(null);
                    }
                });
            }
        });

        return () => {
            billboardUnsubscribe();
            masterUnsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!upcomingEvent) return;
        const updateTimer = () => {
            const now = Date.now();

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
    if (!upcomingEvent || !eventTimeLeft) return null; 

    const activeCountdown = isLive ? 'LIVE NOW!' : eventTimeLeft;
    const activeIsLive = isLive || eventIsLive || upcomingEvent?.status === 'live' || upcomingEvent?.isLiveNow;

    return (
        <div 
            onClick={() => {
            sessionStorage.setItem('nva_target_discover_tab', 'Premieres');
            if (upcomingEvent?.id) {
                sessionStorage.setItem('nva_target_premiere_event_id', upcomingEvent.id);
                window.dispatchEvent(new CustomEvent('setPremiereActiveEvent', { detail: { eventId: upcomingEvent.id } }));
            }
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