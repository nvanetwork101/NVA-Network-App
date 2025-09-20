// src/components/CreatorDashboardScreen.jsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, storage, functions, doc, collection, query, where, orderBy, onSnapshot, updateDoc, getDoc, httpsCallable, ref, uploadBytes, getDownloadURL, deleteDoc } from '../firebase'; // Consolidated imports

// --- Child Component Imports ---
import ProfilePictureAdjustModal from './ProfilePictureAdjustModal';
import formatCurrency from '../utils/formatCurrency';

import DynamicThumbnail from './DynamicThumbnail';

// --- START: New Payout Request Modal Component ---
const PayoutRequestModal = ({
    campaign,
    onClose,
    showMessage,
    currencyRates,
    selectedCurrency
}) => {
    const [legalName, setLegalName] = useState('');
    const [mmgPhoneNumber, setMmgPhoneNumber] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const appId = "production-app-id";
    const PLATFORM_FEE_PERCENTAGE = 0.07;

    const netAmount = useMemo(() => {
        if (!campaign) return 0;
        return campaign.raised * (1 - PLATFORM_FEE_PERCENTAGE);
    }, [campaign]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!legalName.trim() || !mmgPhoneNumber.trim()) {
            showMessage("Please fill out all required fields.");
            return;
        }
        setIsSubmitting(true);
        try {
            const requestCallable = httpsCallable(functions, 'requestCampaignPayout');
            await requestCallable({
                campaignId: campaign.id,
                appId,
                legalName: legalName.trim(),
                mmgPhoneNumber: mmgPhoneNumber.trim()
            });
            showMessage("Payout request submitted successfully!");
            onClose();
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!campaign) return null;

    return (
        <div className="modal-backdrop">
            <div className="modal-content" style={{ maxWidth: '450px', border: '1px solid #00FFFF' }}>
                <div className="modal-header">
                    <p className="modal-title">Payout Request Form</p>
                    <button onClick={onClose} className="modal-close-button">&times;</button>
                </div>
                <div className="modal-body">
                    <p className="smallText" style={{ textAlign: 'center', color: '#FFD700', marginBottom: '20px', fontStyle: 'italic' }}>
                        Creators must be the owner of the MMG account. If not, additional information may be required.
                    </p>
                    <div className="invoice-style-box">
                        <div className="invoice-row">
                            <span>Campaign:</span>
                            <strong>{campaign.title}</strong>
                        </div>
                        <div className="invoice-row">
                            <span>Total Raised:</span>
                            <span>{formatCurrency(campaign.raised, selectedCurrency, currencyRates)}</span>
                        </div>
                        <div className="invoice-row">
                            <span>Platform Fee (7%):</span>
                            <span style={{color: '#DC3545'}}>-{formatCurrency(campaign.raised * PLATFORM_FEE_PERCENTAGE, selectedCurrency, currencyRates)}</span>
                        </div>
                        <hr style={{borderColor: '#444', margin: '10px 0'}} />
                        <div className="invoice-row" style={{fontSize: '1.1rem'}}>
                            <strong>Amount to Collect:</strong>
                            <strong style={{color: '#00FF00'}}>{formatCurrency(netAmount, selectedCurrency, currencyRates)}</strong>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="mt-4">
                        <div className="formGroup">
                            <label htmlFor="legalName" className="formLabel">Full Legal Name:</label>
                            <input
                                type="text"
                                id="legalName"
                                className="formInput"
                                value={legalName}
                                onChange={(e) => setLegalName(e.target.value)}
                                placeholder="e.g., John Doe"
                                required
                            />
                        </div>
                        <div className="formGroup">
                            <label htmlFor="mmgPhoneNumber" className="formLabel">MMG-Registered Phone Number:</label>
                            <input
                                type="tel"
                                id="mmgPhoneNumber"
                                className="formInput"
                                value={mmgPhoneNumber}
                                onChange={(e) => setMmgPhoneNumber(e.target.value)}
                                placeholder="e.g., 5926001234"
                                required
                            />
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="button" onClick={onClose} disabled={isSubmitting} style={{ backgroundColor: '#555' }}>
                                <span className="buttonText light">Cancel</span>
                            </button>
                            <button type="submit" className="button" disabled={isSubmitting}>
                                <span className="buttonText">{isSubmitting ? 'Submitting...' : 'Submit Payout Request'}</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
// --- END: New Payout Request Modal Component ---


// --- Main CreatorDashboardScreen Component ---
const CreatorDashboardScreen = ({
    showMessage,
    setActiveScreen,
    currentUser,
    creatorProfile,
    setCreatorProfile,
    setSelectedCampaignId,
    setShowConfirmationModal,
    setConfirmationTitle,
    setConfirmationMessage,
    setOnConfirmationAction,
    liveEvent,
    currencyRates,
    selectedCurrency
}) => {
    // --- STATE AND CONSTANTS ---
    const [payoutStatuses, setPayoutStatuses] = useState({});
    
    const [creatorCampaigns, setCreatorCampaigns] = useState([]);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    
    
    const [editCreatorName, setEditCreatorName] = useState('');
    const [editBio, setEditBio] = useState('');
    const [editCategories, setEditCategories] = useState([]);
    const [editExistingWorkLink, setEditExistingWorkLink] = useState('');
    const [showImageAdjustModal, setShowImageAdjustModal] = useState(false);
    const [imageFileToAdjust, setImageFileToAdjust] = useState(null);
    const [isUploadingPFP, setIsUploadingPFP] = useState(false);
    const profilePictureInputRef = useRef(null);
    const availableCategories = ['Skits', 'Short Films', 'Interviews', 'Live Premieres', 'Music', 'Documentary', 'Other'];
    const appId = "production-app-id";

    // --- NEW STATE for Payout Modal ---
    const [showPayoutModal, setShowPayoutModal] = useState(false);
    const [payoutCampaign, setPayoutCampaign] = useState(null);

    // --- MEMOIZED VALUES ---
    const isCampaignAdmin = useMemo(() => creatorProfile?.role === 'admin', [creatorProfile]);
    
    const isVerified = useMemo(() => creatorProfile?.isVerifiedAdvertiser && creatorProfile.verifiedAdvertiserExpiresAt?.toDate() > new Date(), [creatorProfile]);
    const isPremium = useMemo(() => creatorProfile?.premiumExpiresAt?.toDate() > new Date(), [creatorProfile]);
    const hasActiveOrPendingCampaign = useMemo(() => creatorCampaigns.some(c => c.status === 'active' || c.status === 'pending'), [creatorCampaigns]);
    
    
    const canCreateCampaign = useMemo(() => {
    if (isCampaignAdmin) return true; // Admins are exempt from all cooldowns/limits.
    if (hasActiveOrPendingCampaign) return false;
    if (creatorProfile?.canCreateCampaignAfter && creatorProfile.canCreateCampaignAfter.toDate() > new Date()) return false;
    return true;
        }, [hasActiveOrPendingCampaign, creatorProfile, isCampaignAdmin]);

    const hasValidTicket = useMemo(() => liveEvent?.eventId && creatorProfile?.purchasedTickets?.[liveEvent.eventId], [liveEvent, creatorProfile]);

    // --- DATA FETCHING ---
    
    useEffect(() => {
    if (!currentUser) return;
    const payoutQuery = query(collection(db, 'payoutRequests'), where('creatorId', '==', currentUser.uid));
    const unsubPayouts = onSnapshot(payoutQuery, (snapshot) => {
        const statuses = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.campaignId) {
                statuses[data.campaignId] = data.status;
            }
        });
        setPayoutStatuses(statuses);
    });
    return () => unsubPayouts();
}, [currentUser]);
    
    useEffect(() => {
        if (!currentUser) return;
        const campaignsQuery = query(collection(db, `artifacts/${appId}/public/data/campaigns`), where('creatorId', '==', currentUser.uid), orderBy('createdAt', 'desc'));
        const unsubCampaigns = onSnapshot(campaignsQuery, (snapshot) => {
            setCreatorCampaigns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubCampaigns();
    }, [currentUser, appId]);

    useEffect(() => {
        if (creatorProfile) {
            setEditCreatorName(creatorProfile.creatorName || '');
            setEditBio(creatorProfile.bio || '');
            setEditCategories(creatorProfile.categories || []);
            setEditExistingWorkLink(creatorProfile.existingWorkLink || '');
        }
    }, [creatorProfile]);

    // --- HELPER FUNCTIONS ---
    const formatDate = (dateValue) => {
        if (!dateValue) return 'N/A';
        const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    };
    
    // --- HANDLER FUNCTIONS ---
    const handleSaveProfile = async () => { if (!editCreatorName) { showMessage("Creator name cannot be empty."); return; } try { const creatorRef = doc(db, "creators", currentUser.uid); await updateDoc(creatorRef, { creatorName: editCreatorName, bio: editBio, categories: editCategories, existingWorkLink: editExistingWorkLink, updatedAt: new Date().toISOString() }); setCreatorProfile(prev => ({ ...prev, creatorName: editCreatorName, bio: editBio, categories: editCategories, existingWorkLink: editExistingWorkLink })); setIsEditingProfile(false); showMessage('Profile updated successfully!'); } catch (error) { showMessage(`Failed to update profile: ${error.message}`); } };
    const handleCancelEdit = () => { if (creatorProfile) { setEditCreatorName(creatorProfile.creatorName || ''); setEditBio(creatorProfile.bio || ''); setEditCategories(creatorProfile.categories || []); setEditExistingWorkLink(creatorProfile.existingWorkLink || ''); } setIsEditingProfile(false); };
    const handleProfileCategoryChange = (e) => { const { value, checked } = e.target; setEditCategories(prev => checked ? [...prev, value] : prev.filter(cat => cat !== value)); };
    const triggerProfilePictureUpload = (e) => { const file = e.target.files[0]; if (file) { setImageFileToAdjust(file); setShowImageAdjustModal(true); } };
    const handleSaveAdjustedProfilePicture = async (adjustedBlob) => { if (!currentUser || !adjustedBlob) return; setIsUploadingPFP(true); showMessage("Uploading..."); try { const filePath = `profile_pictures/${currentUser.uid}/profile_${Date.now()}.png`; const storageRefPath = ref(storage, filePath); const snapshot = await uploadBytes(storageRefPath, adjustedBlob); const downloadURL = await getDownloadURL(snapshot.ref); const creatorRef = doc(db, "creators", currentUser.uid); await updateDoc(creatorRef, { profilePictureUrl: downloadURL }); setCreatorProfile(prev => ({ ...prev, profilePictureUrl: downloadURL })); setShowImageAdjustModal(false); showMessage("Profile picture updated!"); } catch (error) { showMessage(`Failed to update profile picture: ${error.message}`); } finally { if (profilePictureInputRef.current) { profilePictureInputRef.current.value = null; } setIsUploadingPFP(false); } };
    const handleCancelAdjust = () => { setImageFileToAdjust(null); setShowImageAdjustModal(false); };
    
    const endCampaignEarlyLogic = async (campaignId) => { try { const endCampaignCallable = httpsCallable(functions, 'endCampaignEarly'); await endCampaignCallable({ campaignId, appId }); showMessage("Campaign ended successfully!"); } catch (error) { showMessage(`Error: ${error.message}`); } };
    const confirmEndCampaignEarly = (campaign) => { setConfirmationTitle("End Campaign Early?"); setConfirmationMessage(`This will end your campaign "${campaign.title}" and start your 30-day cooldown. Are you sure?`); setOnConfirmationAction(() => () => endCampaignEarlyLogic(campaign.id)); setShowConfirmationModal(true); };
    
    const deleteCampaignLogic = async (campaignId) => { try { const deleteCallable = httpsCallable(functions, 'deleteCampaign'); await deleteCallable({ campaignId, appId }); showMessage("Campaign deleted successfully."); } catch (error) { showMessage(`Error: ${error.message}`); } };
    const confirmDeleteCampaign = (campaign) => { setConfirmationTitle("Delete Campaign?"); setConfirmationMessage(`Are you sure you want to permanently delete "${campaign.title}"? This cannot be undone.`); setOnConfirmationAction(() => () => deleteCampaignLogic(campaign.id)); setShowConfirmationModal(true); };

    // --- UPDATED Payout Logic ---
   const handleOpenPayoutModal = (campaign) => {
        
        setPayoutCampaign(campaign);
        setShowPayoutModal(true);
    };


    if (!creatorProfile) {
        return <div className="screenContainer" style={{ textAlign: 'center', paddingTop: '50px' }}><p className="heading">Loading Your Dashboard...</p></div>;
    }

    // --- RENDER ---
    // --- STYLES UPDATED with background colors ---
    const modernButtonStyles = `
        .modal-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            backdrop-filter: blur(5px);
        }
        /* This is the main modal content box */
        .modal-content {
            background-color: #1E1E1E; /* A textured, off-black */
            border-radius: 12px;
            border: 1px solid #444;
            box-shadow: 0 5px 25px rgba(0,0,0,0.5);
            padding: 0; /* Remove default padding to use header/body/footer */
            width: 90%;
            max-width: 480px; /* A better max-width */
        }
        /* Styles for the header section */
        .modal-header {
            padding: 15px 20px;
            border-bottom: 1px solid #333;
            display: flex;
            justify-content: center; /* Center the title */
            align-items: center;
            position: relative;
        }
        /* Styles for the title text */
        .modal-title {
            margin: 0;
            font-size: 1.5rem; /* Larger title */
            font-weight: bold;
            color: #FFFFFF;
            text-align: center;
        }
        /* Styles for the 'X' close button */
        .modal-close-button {
            position: absolute;
            right: 15px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            font-size: 2rem;
            color: #888;
            cursor: pointer;
        }
        .modal-close-button:hover {
            color: #FFF;
        }
        /* Styles for the main body/content area */
        .modal-body {
            padding: 20px 25px; /* Generous padding */
        }
        /* Styles for the footer/button area */
        .modal-footer {
            padding: 15px 25px;
            border-top: 1px solid #333;
            display: flex;
            justify-content: flex-end; /* Align buttons to the right */
            gap: 10px;
        }
        /* The invoice-style box inside the modal */
        .invoice-style-box {
            background-color: rgba(0, 0, 0, 0.3);
            border-radius: 8px;
            padding: 20px;
            border: 1px solid #444;
            margin-bottom: 25px;
        }
        .invoice-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            font-size: 1rem;
        }
        .invoice-row:last-child {
            margin-bottom: 0;
        }
        /* === MODAL STYLES END === */
        .modern-button {
            border: 1px solid rgba(255, 255, 255, 0.7);
            color: #FFFFFF;
            font-weight: bold;
            transition: all 0.2s ease-in-out;
            padding: 6px 12px;
            font-size: 12px;
            border-radius: 20px;
        }
        .modern-button:hover {
            color: #FFFFFF;
            border-color: #FFFFFF;
        }
        .modern-button.delete { 
            background-color: rgba(220, 53, 69, 0.25);
            border-color: rgba(220, 53, 69, 0.7); 
        }
        .modern-button.delete:hover { 
            background-color: rgba(220, 53, 69, 0.4); 
            border-color: #f5c6cb; 
        }
        .modern-button.delete:active {
            box-shadow: 0 0 15px 3px rgba(220, 53, 69, 0.6);
            border-color: rgba(220, 53, 69, 0.8);
            transform: scale(0.98);
        }

        .modern-button.end-early { 
            background-color: rgba(75, 0, 130, 0.25);
            border-color: rgba(123, 104, 238, 0.7); 
        }
        .modern-button.end-early:hover { 
            background-color: rgba(75, 0, 130, 0.4); 
            border-color: #c6bfff; 
        }
        .modern-button.end-early:active {
            box-shadow: 0 0 15px 3px rgba(75, 0, 130, 0.7);
            border-color: rgba(123, 104, 238, 0.8);
            transform: scale(0.98);
        }
        
        .modern-button.payout { 
            background-color: rgba(0, 255, 255, 0.15);
            border-color: rgba(0, 200, 200, 0.7); 
        }
        .modern-button.payout:hover { 
            background-color: rgba(0, 255, 255, 0.25); 
            border-color: #82fafa; 
        }
        .modern-button.payout:active {
            box-shadow: 0 0 15px 3px rgba(0, 255, 255, 0.6);
            border-color: rgba(0, 255, 255, 0.8);
            transform: scale(0.98);
        }
    `;

    return (
        <>
            <style>{modernButtonStyles}</style>
            <div className="screenContainer">
                
                {/* ... Profile section remains unchanged ... */}
                <p className="heading">Dashboard</p>
                <p className="subHeading">Welcome, {creatorProfile.creatorName || currentUser.email}!</p>
                 <div className="dashboardSection">
                    <div className="flex justify-between items-center"><p className="dashboardSectionTitle" style={{marginBottom: 0}}>Your Profile</p>{!isEditingProfile ? (<button className="dashboardButton" onClick={() => setIsEditingProfile(true)}>Edit Profile</button>) : (<div><button className="dashboardButton" onClick={handleSaveProfile} style={{backgroundColor: '#008000'}}>Save</button><button className="dashboardButton" onClick={handleCancelEdit} style={{backgroundColor: '#555', color: '#FFF'}}>Cancel</button></div>)}</div>
                    <div className="pt-4 border-t" style={{borderColor: '#3A3A3A', marginTop: '1rem'}}>
                         {isEditingProfile ? (
                             <>
                                <div className="formGroup"><label htmlFor="editCreatorName" className="formLabel">Creator Name:</label><input type="text" id="editCreatorName" className="formInput" value={editCreatorName} onChange={(e) => setEditCreatorName(e.target.value)} required /></div>
                                <div className="formGroup"><label htmlFor="editBio" className="formLabel">Bio:</label><textarea id="editBio" className="formTextarea" value={editBio} onChange={(e) => setEditBio(e.target.value)}></textarea></div>
                                <div className="checkboxGroup"><p className="checkboxLabel">My Content Categories:</p>{availableCategories.map((cat) => (<div key={cat} className="checkboxItem"><input type="checkbox" id={`edit-cat-${cat}`} value={cat} checked={editCategories.includes(cat)} onChange={handleProfileCategoryChange} /><label htmlFor={`edit-cat-${cat}`}>{cat}</label></div>))}</div>
                                <div className="formGroup"><label htmlFor="editExistingWork" className="formLabel">External Link:</label><input type="url" id="editExistingWork" className="formInput" value={editExistingWorkLink} onChange={(e) => setEditExistingWorkLink(e.target.value)} /></div>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center mb-4">
                                    <div className="relative"><img src={creatorProfile.profilePictureUrl || 'https://placehold.co/100x100/555/FFF?text=P'} alt="Profile" style={{width: '100px', height: '100px', borderRadius: '50%', border: '2px solid #FFD700', objectFit: 'cover'}} /><input type="file" ref={profilePictureInputRef} onChange={triggerProfilePictureUpload} accept="image/*" style={{ display: 'none' }} /><button onClick={() => profilePictureInputRef.current.click()} style={{backgroundColor: '#FFD700', color: '#0A0A0A', width: '30px', height: '30px', borderRadius: '50%', border: 'none', cursor: 'pointer', position: 'absolute', bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>✏️</button></div>
                                    <div style={{marginLeft: '1rem', flexGrow: 1}}>
                                        <p className="dashboardItem" style={{fontSize: '18px', fontWeight: 'bold', color: '#FFF'}}>{creatorProfile.creatorName}</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
                                            <p className="dashboardItem" style={{fontSize: '12px', color: '#AAA', margin: 0}}>Role: {creatorProfile.role}</p>
                                            {isPremium && <span style={{ backgroundColor: '#FFD700', color: '#0A0A0A', padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold'}}>👑 Premium</span>}
                                            {isVerified && <span style={{ backgroundColor: '#00FFFF', color: '#0A0A0A', padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold'}}>✔ Verified</span>}
                                            {hasValidTicket && (
                                            <span style={{
                                            backgroundColor: '#FFFFFF',
                                            color: '#0A0A0A',
                                            padding: '3px 8px',
                                            borderRadius: '10px',
                                            fontSize: '10px',
                                            fontWeight: 'bold',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                            }}>
                                            <span>🎟️</span> Event Ticket
                                            </span>
                                            )}
                                        </div>
                                        <div style={{display: 'flex', gap: '15px', marginTop: '10px'}}><div className="dashboardItem termsLink" style={{cursor: 'pointer'}} onClick={() => setActiveScreen('Followers')}><strong>{creatorProfile.followerCount || 0}</strong> Followers</div><div className="dashboardItem termsLink" style={{cursor: 'pointer'}} onClick={() => setActiveScreen('MyFollows')}><strong>{creatorProfile.followingCount || 0}</strong> Following</div></div>
                                    </div>
                                </div>
                                <p className="dashboardItem"><strong>Bio:</strong> {creatorProfile.bio || "No bio set."}</p><p className="dashboardItem"><strong>Categories:</strong> {creatorProfile.categories?.length > 0 ? creatorProfile.categories.join(', ') : "No categories set."}</p><p className="dashboardItem"><strong>External Link:</strong> {creatorProfile.existingWorkLink ? <a href={creatorProfile.existingWorkLink} target="_blank" rel="noopener noreferrer" className="termsLink">{creatorProfile.existingWorkLink}</a> : "No link set."}</p>
                            </>
                        )}
                    </div>
                </div>


                {/* === CROWDFUNDING SECTION === */}
                <div className="dashboardSection">
                    <div className="flex justify-between items-center">
                        <p className="dashboardSectionTitle" style={{marginBottom: 0}}>My Crowdfunding Campaigns</p>
                        <button className="dashboardButton" onClick={() => setActiveScreen('CreateCampaign')} disabled={!canCreateCampaign} style={!canCreateCampaign ? {cursor: 'not-allowed', backgroundColor: '#555', color: '#999'} : {}}>Create New</button>
                    </div>
                    <div className="pt-4 border-t mt-4" style={{borderColor: '#3A3A3A'}}>
                        {!canCreateCampaign && <p className="smallText" style={{textAlign: 'center', color: '#FFD700', marginBottom: '15px'}}>{hasActiveOrPendingCampaign ? "You can only have one active/pending campaign at a time." : "Your 30-day campaign cooldown is active."}</p>}
                        {creatorCampaigns.length === 0 ? (<p className="dashboardItem">You have not created any campaigns yet.</p>) : (
                            creatorCampaigns.map(campaign => (
                                <div key={campaign.id} className="creator-campaign-list-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                    <div onClick={() => { setSelectedCampaignId(campaign.id); setActiveScreen('CampaignDetails'); }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%' }}>
                                        <img src={campaign.imageUrl || 'https://placehold.co/80x50/3A3A3A/FFF?text=NVA'} alt={campaign.title} className="creator-campaign-thumbnail" />
                                        <div className="creator-campaign-info">
                                            <p className="creator-campaign-title">{campaign.title}</p>
                                            <p className={`creator-campaign-status status-${campaign.status}`}>Status: {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}</p>
                                            <p className="smallText" style={{color: '#999'}}>
                                                {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
                                            </p>
                                        </div>
                                    </div>
                                    <div style={{width: '100%', marginTop: '10px'}}>
                                        <div className="campaignProgressContainer" style={{ height: '8px' }}>
                                            <div className="campaignProgressBar" style={{ width: `${(campaign.raised / campaign.goal) * 100}%` }}></div>
                                        </div>
                                        <div className="campaignListStats" style={{marginTop: '4px'}}>
                                            <span>Raised: <span className="campaignListRaised">{formatCurrency(campaign.raised, selectedCurrency, currencyRates)}</span></span>
                                            <span>Goal: <span className="campaignListGoal">{formatCurrency(campaign.goal, selectedCurrency, currencyRates)}</span></span>
                                        </div>
                                        
                                        {/* --- THIS IS THE FIX: START OF CREATOR TRANSPARENCY BLOCK --- */}
                                        {campaign.status === 'ended' && campaign.raised > 0 && (
                                            <div className="campaignListStats" style={{marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #2A2A2A'}}>
                                                <span style={{color: '#DC3545'}}>Fee (7%): -{formatCurrency(campaign.raised * 0.07, selectedCurrency, currencyRates)}</span>
                                                <span style={{color: '#00FF00', fontWeight: 'bold'}}>Net Payout: {formatCurrency(campaign.raised * 0.93, selectedCurrency, currencyRates)}</span>
                                            </div>
                                        )}
                                        {/* --- END OF CREATOR TRANSPARENCY BLOCK --- */}
                                    </div>
                                    <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', width: '100%', marginTop: '15px', borderTop: '1px solid #2A2A2A', paddingTop: '10px'}}>
                                        {/* --- Conditional Button Logic --- */}
                                        {campaign.status === 'active' && campaign.raised >= campaign.goal && (
                                            <button className="modern-button end-early" onClick={(e) => { e.stopPropagation(); confirmEndCampaignEarly(campaign); }}>End Campaign Early</button>
                                        )}
                                        {campaign.status === 'ended' && !payoutStatuses[campaign.id] && (
    <button className="modern-button payout" onClick={(e) => { e.stopPropagation(); handleOpenPayoutModal(campaign); }}>Collect Funds</button>
)}
{campaign.status === 'ended' && payoutStatuses[campaign.id] === 'pending' && (
    <p className="smallText" style={{color: '#00FFFF'}}>Payout Requested</p>
)}
{campaign.status === 'ended' && payoutStatuses[campaign.id] === 'paid' && (
    <p className="smallText" style={{color: '#00FF00'}}>Paid</p>
)}
{campaign.status === 'ended' && payoutStatuses[campaign.id] === 'dismissed' && (
    <p className="smallText" style={{color: '#DC3545'}}>Dismissed</p>
)}
                                        {campaign.status !== 'active' && (
                                            <button className="modern-button delete" onClick={(e) => { e.stopPropagation(); confirmDeleteCampaign(campaign); }}>Delete</button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ... Rest of dashboard sections remain unchanged ... */}
                <div className="dashboardSection">
                    <p className="dashboardSectionTitle">My Featured Link</p>
                    <p className="dashboardItem" style={{color: '#AAA', lineHeight: 1.4, marginBottom: '15px'}}> This is the content currently featured on your profile and in the Live Feed. Use the manager to change it.</p>
                    {creatorProfile.featuredVideoLink ? (
                        <div className="vertical-carousel-item" style={{backgroundColor: '#1A1A1A'}}>
                            <div style={{width: '80px', height: '60px', flexShrink: 0, marginRight: '10px'}}>
                                {/* THE FIX: Use the correct 'customThumbnailUrl' property from the featuredVideoLink object */}
                                <DynamicThumbnail item={{ imageUrl: creatorProfile.featuredVideoLink.customThumbnailUrl }} onClick={() => showMessage("This would open the video player.")} />
                            </div>
                            <div className="liveFeedContent">
                                {/* THE FIX: Use the dynamic 'title' from the featuredVideoLink object */}
                                <p className="liveFeedTitle">{`Currently Featuring: ${creatorProfile.featuredVideoLink.title}`}</p>
                                <p className="liveFeedCreator" style={{color: '#FFD700'}}>Visible on your profile</p>
                            </div>
                        </div>
                    ) : (
                        <p className="dashboardItem">You do not have a featured link set. Go to your library to set one.</p>
                    )}
                    <button className="button" onClick={() => setActiveScreen('MyContentLibrary')} style={{marginTop: '15px'}}><span className="buttonText">Manage My Content Library</span></button>
                </div>
                 {isVerified && (
                    <div className="dashboardSection" style={{border: '1px solid #00FFFF'}}>
                        <p className="dashboardSectionTitle" style={{color: '#00FFFF'}}>Promoted Status Billboard</p>
                        <p className="dashboardItem" style={{color: '#AAA', lineHeight: 1.4, marginBottom: '15px'}}>
                            Manage your existing bookings or reserve a new 24-hour "Billboard" slot on the Home page.
                        </p>
                        <div style={{display: 'flex', gap: '10px', marginTop: '15px'}}>
                            <button className="button" onClick={() => setActiveScreen('PromotedStatus')} style={{flex: 1, margin: 0, backgroundColor: '#3A3A3A'}}>
                                <span className="buttonText light">Manage Bookings</span>
                            </button>
                            <button className="button" onClick={() => setActiveScreen('BookStatus')} style={{flex: 1, margin: 0}}>
                                <span className="buttonText">Book New Slot</span>
                            </button>
                        </div>
                    </div>
                )}
                {(isVerified || isPremium) && (<div className="dashboardSection"><p className="dashboardSectionTitle">My Opportunity Listings</p><p className="dashboardItem" style={{color: '#AAA', lineHeight: 1.4, marginBottom: '15px'}}>Manage your posts for the Creator Connect hub.</p><button className="button" onClick={() => setActiveScreen('MyListings')} style={{marginTop: '0px'}}><span className="buttonText">Manage My Listings</span></button></div>)}
                <div className="dashboardSection"><p className="dashboardSectionTitle">My Saved Opportunities</p><p className="dashboardItem" style={{color: '#AAA', lineHeight: 1.4, marginBottom: '15px'}}>View the listings you have bookmarked.</p><button className="button" onClick={() => setActiveScreen('SavedOpportunities')} style={{marginTop: '0px'}}><span className="buttonText">View Saved</span></button><p className="dashboardSectionTitle" style={{marginTop: '20px'}}>Account Settings</p><button className="button" onClick={() => setActiveScreen('BlockedList')} style={{marginTop: '0px', backgroundColor: '#555'}}><span className="buttonText light">Manage Blocked Users</span></button></div>
                <button className="button" onClick={() => setActiveScreen('Home')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}><span className="buttonText light">Back to Home</span></button>
            </div>
            
            {showImageAdjustModal && imageFileToAdjust && (
            <ProfilePictureAdjustModal isUploading={isUploadingPFP} imageFile={imageFileToAdjust} onSave={handleSaveAdjustedProfilePicture} onCancel={() => handleCancelAdjust()} showMessage={showMessage} />
                )}

            {/* --- RENDER THE NEW PAYOUT MODAL --- */}
            {showPayoutModal && payoutCampaign && (
                <PayoutRequestModal
                    campaign={payoutCampaign}
                    onClose={() => setShowPayoutModal(false)}
                    showMessage={showMessage}
                    currencyRates={currencyRates}
                    selectedCurrency={selectedCurrency}
                />
            )}
        </>
    );
};

export default CreatorDashboardScreen;