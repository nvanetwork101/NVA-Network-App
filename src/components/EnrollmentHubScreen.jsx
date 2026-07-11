import { useState, useEffect, useMemo } from 'react';
import { db, functions } from '../firebase';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore'; // <-- ADDED getDoc
import { httpsCallable } from 'firebase/functions';

const EnrollmentHubScreen = ({ setActiveScreen, currentUser, creatorProfile, showMessage }) => {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedOptions, setSelectedOptions] = useState([]);
    const [existingApp, setExistingApp] = useState(null);
    const [phoneInput, setPhoneInput] = useState(''); 
    const [ageInput, setAgeInput] = useState(''); 
    const [experienceInput, setExperienceInput] = useState(''); 

    useEffect(() => {
        const unsub = onSnapshot(doc(db, "settings", "enrollmentConfig"), (snap) => {
            if (snap.exists()) {
                setConfig(snap.data());
            }
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // Store full existing document to parse track states independently
    useEffect(() => {
        if (!currentUser) return;
        getDoc(doc(db, "enrollmentApplications", currentUser.uid)).then((docSnap) => {
            if (docSnap.exists()) {
                setExistingApp(docSnap.data());
            }
        });
    }, [currentUser]);

    // --- TRACK LOCKOUT & COOLDOWN AUDIT ---
    const statusLower = existingApp?.status?.toLowerCase() || '';
    const existingOpts = existingApp?.selectedOptions || [];
    const history = existingApp?.history || [];

    // 1. Identify if a user was previously approved or enrolled in history
    const wasPreviouslyApprovedOrEnrolled = useMemo(() => {
        return history.some(h => {
            const hStatus = h.status?.toLowerCase() || '';
            return hStatus === 'approved' || hStatus === 'enrolled' || hStatus === 'paymentpending';
        });
    }, [history]);

    // 2. Identify if an admin has manually cleared the hold
    const isHoldCleared = useMemo(() => {
        const lastEntry = history[history.length - 1];
        return lastEntry?.status?.toLowerCase() === 'hold_cleared';
    }, [history]);

    // 3. Helper to check specific track cooldowns
    const isTrackOnCooldown = (trackName) => {
        const schemaTrackName = trackName === 'film' ? 'filmClub' : 'docuSeries';
        
        // Check new track-specific cooldowns
        if (creatorProfile?.cooldowns?.[schemaTrackName]) {
            const trackCooldown = new Date(creatorProfile.cooldowns[schemaTrackName]).getTime();
            if (!isNaN(trackCooldown) && Date.now() < trackCooldown) return true;
        }

        // Fallback for legacy global hold
        if (creatorProfile?.cooldownUntil) {
            const globalCooldown = new Date(creatorProfile.cooldownUntil).getTime();
            if (!isNaN(globalCooldown) && Date.now() < globalCooldown) return true;
        }

        // Check active document-level cooldown holds
        const isCurrentlyInLockStatus = ['declined', 'cancelled', 'rejected', 'revoked'].includes(statusLower);
        if (!isHoldCleared && (isCurrentlyInLockStatus || existingApp?.hasRevokedTrack || existingApp?.hasDeclinedTrack)) {
            // THE TRACK-SPECIFIC FIX: Check if THIS specific track is in the declinedOptions array
            const schemaTrackName = trackName === 'film' ? 'filmClub' : 'docuSeries';
            const isSpecificallyDeclined = existingApp?.declinedOptions?.includes(schemaTrackName);

            if (isSpecificallyDeclined) {
                const updateTime = existingApp?.updatedAt 
                    ? new Date(existingApp.updatedAt).getTime() 
                    : (existingApp?.declinedAt ? (existingApp.declinedAt.toDate ? existingApp.declinedAt.toDate().getTime() : new Date(existingApp.declinedAt).getTime()) : 0);

                if (updateTime !== 0) {
                    const cooldownMs = wasPreviouslyApprovedOrEnrolled ? (30 * 24 * 60 * 60 * 1000) : (3 * 24 * 60 * 60 * 1000);
                    if ((Date.now() - updateTime) < cooldownMs) return true;
                }
            }
        }
        return false;
    };

    // 4. Calculate locked state for each individual option safely
    const isTrackLocked = (trackName) => {
        const badges = Array.isArray(creatorProfile?.badges) ? creatorProfile.badges : [];
        
        if (trackName === 'film') {
            if (creatorProfile?.isFilmClub || creatorProfile?.isClassMember || badges.includes('Class Member') || badges.includes('Film Club')) return true;
        } else if (trackName === 'docu') {
            if (creatorProfile?.isContestant || badges.includes('Contestant')) return true;
        }

        const hasAppliedToTrack = existingOpts.some(o => typeof o === 'string' && o.toLowerCase().includes(trackName));
        if (hasAppliedToTrack) {
            const isActiveState = ['pending', 'paymentpending', 'approved', 'enrolled', 'paid', 'success'].includes(statusLower);
            if (isActiveState) return true;
        }

        return isTrackOnCooldown(trackName);
    };

    const isFilmClubLocked = isTrackLocked('film');
    const isDocuSeriesLocked = isTrackLocked('docu');

    const toggleOption = (option) => {
        if (option === 'filmClub' && isFilmClubLocked) return;
        if (option === 'docuSeries' && isDocuSeriesLocked) return;

        setSelectedOptions(prev =>
            prev.includes(option)
                ? prev.filter(o => o !== option)
                : [...prev, option]
        );
    };

    const calculateTotal = () => {
        if (!config) return 0;
        let total = 0;
        if (selectedOptions.includes('filmClub')) total += config.filmClubFee || 2500;
        if (selectedOptions.includes('docuSeries')) total += config.docuSeriesFee || 500;
        if (selectedOptions.length === 2 && config.bothDiscount) {
            total -= config.bothDiscount;
        }
        return total;
    };

    const checkProfileComplete = () => {
        if (!creatorProfile) return { complete: false, missing: ['Profile not loaded'] };
        const missing = [];
        if (config?.requireProfilePhoto && !creatorProfile.profilePictureUrl) {
            missing.push('Profile photo');
        }
        if (config?.requireExperience && (!creatorProfile.bio || creatorProfile.bio.length < 10)) {
            missing.push('Performing arts experience / bio');
        }
        return { complete: missing.length === 0, missing };
    };

    const handleApply = async () => {
        if (!currentUser) {
            showMessage("Please log in to apply.");
            setActiveScreen('Login');
            return;
        }
        if (selectedOptions.length === 0) {
            showMessage("Please select an available service.");
            return;
        }

        const profileCheck = checkProfileComplete();
        if (!profileCheck.complete) {
            const missingList = profileCheck.missing.join(', ');
            showMessage(`Please complete your profile before applying. Missing: ${missingList}`);
            setTimeout(() => setActiveScreen('CreatorDashboard'), 2000);
            return;
        }

        if (config?.requirePhone && !phoneInput.trim()) {
            showMessage("Please enter your phone number to apply.");
            return;
        }
        if (!ageInput.trim()) {
            showMessage("Please enter your age to apply.");
            return;
        }
        if (!experienceInput.trim()) {
            showMessage("Please describe your performing arts experience.");
            return;
        }
        try {
            const submitApplication = httpsCallable(functions, 'submitEnrollmentApplication');
            const mergedOptions = Array.from(new Set([...existingOpts, ...selectedOptions]));
            
            await submitApplication({
                selectedOptions: mergedOptions,
                totalAmount: calculateTotal(),
                phoneNumber: phoneInput.trim() || "Not Provided",
                age: Number(ageInput.trim()) || 0,
                experience: experienceInput.trim() || "Not Provided"
            });
            
            setExistingApp(prev => ({ ...prev, status: 'pending', selectedOptions: mergedOptions }));
            setSelectedOptions([]);
            showMessage("Application submitted! Pending admin review.");
        } catch (error) {
            console.error("Application error:", error);
            showMessage(error.message || "Failed to submit application. Please try again.");
        }
    };

    if (loading) {
        return (
            <div className="screenContainer" style={{ textAlign: 'center', paddingTop: '50px' }}>
                <p className="heading">Loading...</p>
            </div>
        );
    }

    // DEFINITIVE FIX: Handle both boolean (true) and string ("true") to prevent the admin dashboard toggle bug
    const isFilmClubOpen = config?.filmClubOpen === true || String(config?.filmClubOpen).toLowerCase() === "true";
    const isDocuSeriesOpen = config?.docuSeriesOpen === true || String(config?.docuSeriesOpen).toLowerCase() === "true";

    const profileCheck = checkProfileComplete();
    const total = calculateTotal();

    return (
        <div className="screenContainer">
            <p className="heading">NVA Film Club Enrollment</p>
            <p className="subHeading">Select your path and submit your application.</p>

            {/* Profile completeness warning */}
            {!profileCheck.complete && (
                <div style={{
                    backgroundColor: 'rgba(255, 140, 0, 0.15)',
                    border: '1px solid #FF8C00',
                    borderRadius: '10px',
                    padding: '15px',
                    marginBottom: '20px'
                }}>
                    <p style={{ color: '#FF8C00', fontWeight: 'bold', margin: '0 0 8px 0' }}>
                        Complete Your Profile to Apply
                    </p>
                    <p style={{ color: '#CCC', fontSize: '13px', margin: '0 0 10px 0' }}>
                        Missing: {profileCheck.missing.join(', ')}
                    </p>
                    <button
                        className="button"
                        onClick={() => setActiveScreen('CreatorDashboard')}
                        style={{ margin: 0, backgroundColor: '#FF8C00', fontSize: '13px', padding: '8px 16px' }}
                    >
                        <span className="buttonText">Go to Profile</span>
                    </button>
                </div>
            )}

            {/* Film Club Card */}
            {isFilmClubOpen && (
                <div
                    onClick={() => toggleOption('filmClub')}
                    style={{
                        border: selectedOptions.includes('filmClub') ? '2px solid #FFD700' : '1px solid #444',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '15px',
                        cursor: isFilmClubLocked ? 'not-allowed' : 'pointer',
                        backgroundColor: selectedOptions.includes('filmClub') ? 'rgba(255, 215, 0, 0.08)' : (isFilmClubLocked ? '#121212' : '#1A1A1A'),
                        opacity: isFilmClubLocked ? 0.4 : 1,
                        transition: 'all 0.2s ease'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                        <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            border: selectedOptions.includes('filmClub') ? '6px solid #FFD700' : '2px solid #666',
                            backgroundColor: selectedOptions.includes('filmClub') ? '#FFD700' : 'transparent',
                            flexShrink: 0,
                            transition: 'all 0.2s ease'
                        }} />
                        <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#FFF' }}>
                                NVA Film Club Classes {isFilmClubLocked && <span style={{fontSize: '12px', color: '#888', fontWeight: 'normal'}}>(Locked)</span>}
                            </p>
                            <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 'bold', color: '#FFD700' }}>
                                ${config.filmClubFee?.toLocaleString() || '2,500'} GYD
                            </p>
                        </div>
                        {selectedOptions.length === 2 && (
                            <span style={{
                                backgroundColor: '#FFD700',
                                color: '#0A0A0A',
                                padding: '4px 10px',
                                borderRadius: '10px',
                                fontSize: '11px',
                                fontWeight: 'bold'
                            }}>
                                BUNDLE
                            </span>
                        )}
                    </div>
                    <p style={{ color: '#AAA', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>
                        {config.filmClubInfo || "Professional acting classes, scene study, character development, and audition preparation with industry mentors."}
                    </p>
                </div>
            )}

            {/* Docu-Series Card */}
            {isDocuSeriesOpen && (
                <div
                    onClick={() => toggleOption('docuSeries')}
                    style={{
                        border: selectedOptions.includes('docuSeries') ? '2px solid #FFD700' : '1px solid #444',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '15px',
                        cursor: isDocuSeriesLocked ? 'not-allowed' : 'pointer',
                        backgroundColor: selectedOptions.includes('docuSeries') ? 'rgba(255, 215, 0, 0.08)' : (isDocuSeriesLocked ? '#121212' : '#1A1A1A'),
                        opacity: isDocuSeriesLocked ? 0.4 : 1,
                        transition: 'all 0.2s ease'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                        <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            border: selectedOptions.includes('docuSeries') ? '6px solid #FFD700' : '2px solid #666',
                            backgroundColor: selectedOptions.includes('docuSeries') ? '#FFD700' : 'transparent',
                            flexShrink: 0,
                            transition: 'all 0.2s ease'
                        }} />
                        <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#FFF' }}>
                                Film Club Docu-Series Challenge {isDocuSeriesLocked && <span style={{fontSize: '12px', color: '#888', fontWeight: 'normal'}}>(Locked)</span>}
                            </p>
                            <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 'bold', color: '#FFD700' }}>
                                ${config.docuSeriesFee?.toLocaleString() || '500'} GYD
                            </p>
                        </div>
                    </div>
                    <p style={{ color: '#AAA', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>
                        {config.docuSeriesInfo || "Participate in a documentary series showcasing your acting journey. Compete for featured roles and industry exposure."}
                    </p>
                </div>
            )}

            {/* Total Section */}
            {selectedOptions.length > 0 && (
                <div style={{
                    backgroundColor: '#0A0A0A',
                    border: '1px solid #FFD700',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '20px',
                    position: 'sticky',
                    bottom: '10px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p style={{ margin: 0, color: '#AAA', fontSize: '13px' }}>
                                Selected: {selectedOptions.map(o => o === 'filmClub' ? 'Film Club' : 'Docu-Series').join(' + ')}
                            </p>
                            {selectedOptions.length === 2 && config?.bothDiscount > 0 && (
                                <p style={{ margin: '4px 0 0', color: '#00FF00', fontSize: '12px' }}>
                                    Bundle discount applied: -${config.bothDiscount.toLocaleString()} GYD
                                </p>
                            )}
                        </div>
                        <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#FFD700' }}>
                            ${total.toLocaleString()} GYD
                        </p>
                    </div>
                </div>
            )}

            {/* Existing Track Notifications */}
            {statusLower === 'pending' && (
                <div style={{ backgroundColor: 'rgba(255, 215, 0, 0.1)', border: '1px solid #FFD700', borderRadius: '10px', padding: '12px', marginBottom: '15px', textAlign: 'center' }}>
                    <p style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '13px', margin: 0 }}>
                        ⏳ You hold a track currently pending administrative review.
                    </p>
                </div>
            )}

            {statusLower === 'approved' && (
                <div style={{ backgroundColor: 'rgba(0, 255, 0, 0.1)', border: '1px solid #00FF00', borderRadius: '10px', padding: '15px', marginBottom: '15px', textAlign: 'center' }}>
                    <p style={{ color: '#00FF00', fontWeight: 'bold', fontSize: '14px', margin: '0 0 10px 0' }}>
                        🎉 A track was approved! Complete payment to enroll.
                    </p>
                    <button className="button" onClick={() => setActiveScreen('EnrollmentPayment')} style={{ margin: 0 }}>
                        <span className="buttonText">Make Payment</span>
                    </button>
                </div>
            )}

            {/* Red banner now only shows if the CURRENTLY SELECTED track is on hold */}
            {selectedOptions.some(opt => isTrackOnCooldown(opt === 'filmClub' ? 'film' : 'docu')) && (
                <div style={{ backgroundColor: 'rgba(220, 53, 69, 0.1)', border: '1px solid #DC3545', borderRadius: '10px', padding: '12px', marginBottom: '15px', textAlign: 'center' }}>
                    <p style={{ color: '#DC3545', fontWeight: 'bold', fontSize: '13px', margin: 0 }}>
                        🚫 Re-application hold is active for your selection. This track is locked under penalty.
                    </p>
                </div>
            )}

            {/* Contact & Demographics Input Fields (Accessible whenever at least one track remains open) */}
            {(!isFilmClubLocked || !isDocuSeriesLocked) && (
                <>
                    {config?.requirePhone && (
                        <div className="formGroup" style={{ marginTop: '20px' }}>
                            <label className="formLabel" style={{ color: '#FFD700' }}>Contact Phone Number:</label>
                            <input
                                type="tel"
                                inputMode="tel"
                                className="formInput"
                                value={phoneInput}
                                onChange={(e) => setPhoneInput(e.target.value)}
                                placeholder="e.g., 592-600-1234"
                                required
                            />
                        </div>
                    )}
                    <div className="formGroup" style={{ marginTop: '20px' }}>
                        <label className="formLabel" style={{ color: '#FFD700' }}>Applicant Age:</label>
                        <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min="1"
                            step="1"
                            className="formInput"
                            value={ageInput}
                            onChange={(e) => setAgeInput(e.target.value)}
                            placeholder="Enter your age"
                            required
                        />
                    </div>
                    <div className="formGroup" style={{ marginTop: '20px', marginBottom: '20px' }}>
                        <label className="formLabel" style={{ color: '#FFD700' }}>Performing Arts Experience (Years / Details):</label>
                        <textarea
                            className="formTextarea"
                            value={experienceInput}
                            onChange={(e) => setExperienceInput(e.target.value)}
                            placeholder="Describe your experience in acting, theatre, or film..."
                            required
                        />
                    </div>
                </>
            )}

            {/* Action Buttons */}
            <button
                className="button"
                onClick={handleApply}
                disabled={selectedOptions.length === 0}
                style={{
                    marginTop: '10px',
                    opacity: selectedOptions.length === 0 ? 0.5 : 1
                }}
            >
                <span className="buttonText">
                    {selectedOptions.length === 0 ? 'Select Available Service' : 'Submit Application'}
                </span>
            </button>

            <button
                className="button"
                onClick={() => setActiveScreen('Home')}
                style={{ backgroundColor: '#3A3A3A', marginTop: '15px' }}
            >
                <span className="buttonText light">Back to Home</span>
            </button>
        </div>
    );
};

export default EnrollmentHubScreen;