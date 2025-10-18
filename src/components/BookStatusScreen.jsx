// src/components/BookStatusScreen.jsx

import React, { useState, useEffect, useRef } from 'react';
import { db, storage, functions, doc, getDoc, httpsCallable, ref, uploadBytes, getDownloadURL } from '../firebase';
import { extractVideoInfo } from '../firebase';
// --- START FIX #1: Import the formatCurrency utility and the ThumbnailAdjustModal ---
import formatCurrency from '../utils/formatCurrency';
import ThumbnailAdjustModal from './ThumbnailAdjustModal';
// --- END FIX #1 ---

const BookStatusScreen = ({ 
    showMessage, 
    setActiveScreen, 
    setPledgeIdForConfirmation, 
    currentUser, 
    creatorProfile, 
    opportunityToPromote,
    setOpportunityToPromote,
    previousScreen,
    // --- START FIX #2: Accept the currency props from App.jsx ---
    currencyRates,
    selectedCurrency
    // --- END FIX #2 ---
}) => {
    const [nextSlot, setNextSlot] = useState(null);
    const [bookingPrice, setBookingPrice] = useState(10.00);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state for manual booking
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [mainUrl, setMainUrl] = useState('');
    const [flyerFile, setFlyerFile] = useState(null);
    const [flyerPreview, setFlyerPreview] = useState('');
    const [autoThumbnail, setAutoThumbnail] = useState('');
    
    const [showImageAdjustModal, setShowImageAdjustModal] = useState(false);
    const [imageFileToAdjust, setImageFileToAdjust] = useState(null);
    const flyerInputRef = useRef(null);

    const isAuthorized = creatorProfile?.isVerifiedAdvertiser && creatorProfile.verifiedAdvertiserExpiresAt && creatorProfile.verifiedAdvertiserExpiresAt.toDate() > new Date();
    const isPromotingFromOpportunity = !!opportunityToPromote;

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFileToAdjust(URL.createObjectURL(file)); // Create blob URL
            setShowImageAdjustModal(true);
        }
    };

    const handleSaveAdjustedImage = (adjustedBlob) => {
        const newFile = new File([adjustedBlob], "promo_flyer.png", { type: "image/png" });
        setFlyerFile(newFile);
        setFlyerPreview(URL.createObjectURL(newFile));
        setShowImageAdjustModal(false);
        // Perform full cleanup
        setImageFileToAdjust(null);
        if (flyerInputRef.current) {
            flyerInputRef.current.value = null;
        }
    };
    const handleCancelAdjust = () => { setImageFileToAdjust(null); setShowImageAdjustModal(false); if (flyerInputRef.current) flyerInputRef.current.value = null; };

    useEffect(() => {
        if (!currentUser || !isAuthorized) {
            setLoading(false); return;
        }
        const getSlotAndPrice = async () => {
            setLoading(true);
            try {
                const getSlotFunction = httpsCallable(functions, 'getNextAvailableStatusSlot');
                const slotResult = await getSlotFunction();
                setNextSlot(new Date(slotResult.data.nextAvailable));

                const settingsRef = doc(db, "settings", "socialLinks");
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists() && typeof settingsSnap.data().promotedStatusPrice === 'number') {
                    setBookingPrice(settingsSnap.data().promotedStatusPrice);
                }
            } catch (error) {
                showMessage("Could not fetch booking details. Please try again.");
            } finally {
                setLoading(false);
            }
        };
        getSlotAndPrice();
    }, [currentUser, isAuthorized]);

    useEffect(() => {
        if (isPromotingFromOpportunity) return;
        if (!mainUrl) { setAutoThumbnail(''); return; }
        const handler = setTimeout(() => {
            const info = extractVideoInfo(mainUrl);
            if (info && info.thumbnailUrl && info.thumbnailUrl !== 'https://placehold.co/300x200/2A2A2A/FFF?text=NVA') {
                setAutoThumbnail(info.thumbnailUrl);
            } else { setAutoThumbnail(''); }
        }, 800);
        return () => clearTimeout(handler);
    }, [mainUrl, isPromotingFromOpportunity]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        let bookingDetails = {
            scheduledStartTime: nextSlot.toISOString(),
            scheduledEndTime: new Date(nextSlot.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            price: bookingPrice
        };
        let contentDetails = null;

        if (isPromotingFromOpportunity) {
            bookingDetails.sourceOpportunityId = opportunityToPromote;
        } else {
            // --- NEW CONDITIONAL VALIDATION LOGIC ---
            if (!title.trim()) {
                showMessage("An Ad Title is required to book.");
                return;
            }
            // A user must provide either a valid URL that generates a preview OR a custom flyer.
            if (!flyerFile && !autoThumbnail) {
                if (mainUrl.trim() && !autoThumbnail) {
                    showMessage("Could not get a preview from this URL. Please upload a custom flyer to continue.");
                } else {
                    showMessage("Please provide either a valid URL or upload a custom flyer to book a slot.");
                }
                return;
            }

            let uploadedFlyerUrl = autoThumbnail; // Default to the auto-fetched URL
            if (flyerFile) {
                setIsSubmitting(true);
                showMessage("Uploading flyer...");
                try {
                    const fileName = `${Date.now()}_booking.png`;
                    const folderPath = `promo_flyers/${currentUser.uid}`;
                    const filePath = `${folderPath}/${fileName}`;
                    const storageRef = ref(storage, filePath);
                    await uploadBytes(storageRef, flyerFile);

                    // THE PERMANENT FIX: Construct a clean, proxy-friendly URL
                    // This URL format is stable and avoids the security token, which causes scraper failure.
                    uploadedFlyerUrl = `https://firebasestorage.googleapis.com/v0/b/${storageRef.bucket}/o/${encodeURIComponent(filePath)}?alt=media`;
                    
                } catch (error) {
                    showMessage(`Flyer upload failed: ${error.message}`);
                    setIsSubmitting(false);
                    return;
                }
            }
            contentDetails = { 
                title: title.trim(), 
                description: description.trim(),
                mainUrl: mainUrl.trim(), 
                flyerImageUrl: uploadedFlyerUrl 
            };
        }

        setIsSubmitting(true);
        try {
            const unifiedBookingFunction = httpsCallable(functions, 'createBookingAndPledge');
            const result = await unifiedBookingFunction({ bookingDetails, contentDetails });
            setPledgeIdForConfirmation(result.data.pledgeId);
            setOpportunityToPromote(null);
            setActiveScreen('PendingConfirmation');
        } catch (error) {
            showMessage(`Booking failed: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const finalPreview = flyerPreview || autoThumbnail;

    if (loading) { return <div className="screenContainer"><p className="heading">Loading Booking Information...</p></div>; }
    if (!currentUser) { showMessage("Please log in to book a slot."); setActiveScreen('Login'); return null; }
    if (!isAuthorized) { showMessage("This feature is for Verified Advertisers only."); setActiveScreen('CreatorDashboard'); return null; }
    const backScreen = previousScreen === 'SupportUsScreen' ? 'SupportUsScreen' : 'CreatorDashboard';
    return (
        <>
            <div className="screenContainer">
                <p className="heading">Book Promoted Billboard</p>
                <p className="subHeading">{isPromotingFromOpportunity ? "Promote your existing opportunity listing." : "Complete all details to submit your booking for review."}</p>
                <form onSubmit={handleSubmit}>
                    <div className="dashboardSection">
                        <p className="dashboardSectionTitle">Step 1: Confirm Your Slot</p>
                        <p className="dashboardItem">Next Available 24-Hour Slot:</p>
                        <p className="heading" style={{color: '#FFF'}}>{nextSlot ? nextSlot.toLocaleString() : 'N/A'}</p>
                        <p className="dashboardItem" style={{marginTop: '10px'}}>Price:</p>
                        {/* --- START FIX #3: Use the formatCurrency function --- */}
                        <p className="premiumFeatureDescription" style={{fontSize: '24px', fontWeight: 'bold', textAlign: 'center', color: '#FFF'}}>
                            {formatCurrency(bookingPrice, selectedCurrency, currencyRates)}
                        </p>
                        {/* --- END FIX #3 --- */}
                    </div>

                    {isPromotingFromOpportunity ? (
                        <div className="dashboardSection" style={{marginTop: '20px'}}>
                            <p className="dashboardSectionTitle">Step 2: Content</p>
                            <p className="paragraph" style={{color: '#00FF00'}}>The title and image from your opportunity listing will be used automatically for this promotion.</p>
                        </div>
                    ) : (
                        <div className="dashboardSection" style={{marginTop: '20px'}}>
                            <p className="dashboardSectionTitle">Step 2: Provide Ad Content</p>
                            <div className="formGroup"><label className="formLabel">Ad Title</label><input type="text" className="formInput" value={title} onChange={e => setTitle(e.target.value)} required /></div>
                            
                             {/* --- SURGICAL FIX: ADD THIS BLOCK --- */}
                            <div className="formGroup">
                                <label className="formLabel">Ad Text / Description (Optional)</label>
                                <textarea className="formTextarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a short description for your ad..." />
                            </div>
                            {/* --- END OF FIX --- */}
                            
                            <div className="formGroup"><label className="formLabel">URL (Video or External Link) (Optional)</label><input type="url" className="formInput" value={mainUrl} onChange={e => setMainUrl(e.target.value)} placeholder="Paste your ad's main link here" /></div>
                            <div className="formGroup">
                                <label className="formLabel">Thumbnail / Flyer (Optional)</label>
                                {finalPreview && <img src={finalPreview} alt="Ad preview" style={{maxWidth: '200px', borderRadius: '8px', marginBottom: '10px'}} />}
                                <input type="file" className="formInput" ref={flyerInputRef} style={{display:'none'}} onChange={handleFileSelect} accept="image/*" />
                                <button type="button" className="button" onClick={() => flyerInputRef.current.click()} style={{ width: '100%', backgroundColor: '#3A3A3A' }}><span className="buttonText light">Upload Custom Image</span></button>
                                <p className="smallText" style={{textAlign: 'left'}}>Upload to override the auto-fetched preview.</p>
                            </div>
                        </div>
                    )}

                    <div className="dashboardSection" style={{marginTop: '20px', textAlign: 'center'}}>
                        <p className="dashboardSectionTitle">Step 3: Submit</p>
                        <p className="paragraph">This is a manual payment process. You will be given instructions to complete your payment after submitting your booking and content.</p>
                        <button type="submit" className="button" style={{ backgroundColor: '#0A0A0A', border: '1px solid #333' }} disabled={isSubmitting}>
                            <span className="buttonText" style={{color: '#00FFFF'}}>{isSubmitting ? 'Submitting...' : 'Submit Booking & Get Payment Info'}</span>
                        </button>
                    </div>
                </form>
                <button className="button" onClick={() => setActiveScreen(backScreen)} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}>
                    <span className="buttonText light">Back to {backScreen === 'SupportUsScreen' ? 'Support Hub' : 'Dashboard'}</span>
                </button>
            </div>
            {showImageAdjustModal && imageFileToAdjust && (
                <ThumbnailAdjustModal
                    imageUrl={imageFileToAdjust}
                    onSave={handleSaveAdjustedImage}
                    onCancel={handleCancelAdjust}
                    showMessage={showMessage}
                    isUploading={isSubmitting}
                />
            )}
        </>
    );
};

export default BookStatusScreen;