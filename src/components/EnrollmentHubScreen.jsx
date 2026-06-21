import { useState, useEffect } from 'react';
import { db, functions } from '../firebase';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

const EnrollmentHubScreen = ({ setActiveScreen, currentUser, creatorProfile, showMessage }) => {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedOptions, setSelectedOptions] = useState([]);
    const [applicationStatus, setApplicationStatus] = useState(null); // 'pending' | 'approved' | 'declined' | null
    const [phoneInput, setPhoneInput] = useState(''); // <-- ADD THIS LINE

    useEffect(() => {
        const unsub = onSnapshot(doc(db, "settings", "enrollmentConfig"), (snap) => {
            if (snap.exists()) {
                setConfig(snap.data());
            }
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // Check existing application status
    useEffect(() => {
        if (!currentUser) return;
        const q = query(
            collection(db, "enrollmentApplications"),
            where("userId", "==", currentUser.uid)
        );
        getDocs(q).then((snapshot) => {
            if (!snapshot.empty) {
                const app = snapshot.docs[0].data();
                setApplicationStatus(app.status);
                if (app.selectedOptions) {
                    setSelectedOptions(app.selectedOptions);
                }
            }
        });
    }, [currentUser]);

    const toggleOption = (option) => {
        if (applicationStatus === 'pending') return; // Can't change while pending
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
            showMessage("Please select at least one option.");
            return;
        }
        if (applicationStatus === 'pending') {
            showMessage("Your application is already pending review.");
            return;
        }

        const profileCheck = checkProfileComplete();
        if (!profileCheck.complete) {
            const missingList = profileCheck.missing.join(', ');
            showMessage(`Please complete your profile before applying. Missing: ${missingList}`);
            // Give user a moment to see the message, then redirect to dashboard
            setTimeout(() => setActiveScreen('CreatorDashboard'), 2000);
            return;
        }

        if (config?.requirePhone && !phoneInput.trim()) {
            showMessage("Please enter your phone number to apply.");
            return;
        }

        try {
            const submitApplication = httpsCallable(functions, 'submitEnrollmentApplication');
            await submitApplication({
                selectedOptions: selectedOptions,
                totalAmount: calculateTotal(),
                phoneNumber: phoneInput.trim()
            });
            setApplicationStatus('pending');
            showMessage("Application submitted! Pending admin review.");
        } catch (error) {
            console.error("Application error:", error);
            showMessage("Failed to submit application. Please try again.");
        }
    };

    if (loading) {
        return (
            <div className="screenContainer" style={{ textAlign: 'center', paddingTop: '50px' }}>
                <p className="heading">Loading...</p>
            </div>
        );
    }

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
            {config?.filmClubOpen && (
                <div
                    onClick={() => toggleOption('filmClub')}
                    style={{
                        border: selectedOptions.includes('filmClub') ? '2px solid #FFD700' : '1px solid #444',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '15px',
                        cursor: applicationStatus === 'pending' ? 'not-allowed' : 'pointer',
                        backgroundColor: selectedOptions.includes('filmClub') ? 'rgba(255, 215, 0, 0.08)' : '#1A1A1A',
                        opacity: applicationStatus === 'pending' && !selectedOptions.includes('filmClub') ? 0.6 : 1,
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
                                NVA Film Club Classes
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
            {config?.docuSeriesOpen && (
                <div
                    onClick={() => toggleOption('docuSeries')}
                    style={{
                        border: selectedOptions.includes('docuSeries') ? '2px solid #FFD700' : '1px solid #444',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '15px',
                        cursor: applicationStatus === 'pending' ? 'not-allowed' : 'pointer',
                        backgroundColor: selectedOptions.includes('docuSeries') ? 'rgba(255, 215, 0, 0.08)' : '#1A1A1A',
                        opacity: applicationStatus === 'pending' && !selectedOptions.includes('docuSeries') ? 0.6 : 1,
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
                                Film Club Docu-Series Challenge
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

            {/* Application Status */}
            {applicationStatus === 'pending' && (
                <div style={{
                    backgroundColor: 'rgba(255, 215, 0, 0.1)',
                    border: '1px solid #FFD700',
                    borderRadius: '10px',
                    padding: '15px',
                    marginBottom: '20px',
                    textAlign: 'center'
                }}>
                    <p style={{ color: '#FFD700', fontWeight: 'bold', margin: 0 }}>
                        Your application is pending admin review.
                    </p>
                </div>
            )}

            {applicationStatus === 'approved' && (
                <div style={{
                    backgroundColor: 'rgba(0, 255, 0, 0.1)',
                    border: '1px solid #00FF00',
                    borderRadius: '10px',
                    padding: '15px',
                    marginBottom: '20px',
                    textAlign: 'center'
                }}>
                    <p style={{ color: '#00FF00', fontWeight: 'bold', margin: '0 0 10px 0' }}>
                        Approved! Complete your payment to enroll.
                    </p>
                    <button
                        className="button"
                        onClick={() => setActiveScreen('EnrollmentPayment')}
                        style={{ margin: 0 }}
                    >
                        <span className="buttonText">Make Payment</span>
                    </button>
                </div>
            )}

            {applicationStatus === 'declined' && (
                <div style={{
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    border: '1px solid #DC3545',
                    borderRadius: '10px',
                    padding: '15px',
                    marginBottom: '20px',
                    textAlign: 'center'
                }}>
                    <p style={{ color: '#DC3545', fontWeight: 'bold', margin: 0 }}>
                        Your application was not approved at this time.
                    </p>
                </div>
            )}

            {/* Phone Input field on application page */}
            {config?.requirePhone && applicationStatus !== 'pending' && (
                <div className="formGroup" style={{ marginTop: '20px', marginBottom: '20px' }}>
                    <label className="formLabel" style={{ color: '#FFD700' }}>Contact Phone Number (Management Use Only):</label>
                    <input
                        type="tel"
                        className="formInput"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="e.g., 592-600-1234"
                        required
                    />
                </div>
            )}

            {/* Action Buttons */}
            <button
                className="button"
                onClick={handleApply}
                disabled={selectedOptions.length === 0 || applicationStatus === 'pending'}
                style={{
                    marginTop: '10px',
                    opacity: selectedOptions.length === 0 || applicationStatus === 'pending' ? 0.5 : 1
                }}
            >
                <span className="buttonText">
                    {applicationStatus === 'pending' ? 'Application Submitted' : 'Submit Application'}
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