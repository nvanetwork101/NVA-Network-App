// src/components/PromotedStatusScreen.jsx

import React, { useState, useEffect, useRef } from 'react';
import { db, storage, functions, collection, query, where, orderBy, onSnapshot, httpsCallable, ref, uploadBytes, getDownloadURL } from '../firebase';
import { extractVideoInfo } from '../firebase'; // Ensure this is exported from your firebase.js

// Placeholder for the ProfilePictureAdjustModal, assuming it's imported
const ProfilePictureAdjustModal = ({ isUploading, imageUrl, onSave, onCancel, showMessage }) => {
    const handleSave = () => { fetch(imageUrl).then(res => res.blob()).then(blob => onSave(blob)); };
    return (
        <div className="imageAdjustModalOverlay">
            <div className="imageAdjustModalContent">
                <p className="heading">Adjust Thumbnail</p>
                <img src={imageUrl} alt="Preview" style={{ maxWidth: '200px', borderRadius: '8px' }} />
                <div className="modalButtons">
                    <button className="modalButton" onClick={handleSave} disabled={isUploading}>{isUploading ? 'Uploading...' : 'Save'}</button>
                    <button className="modalButton cancel" onClick={onCancel} disabled={isUploading}>Cancel</button>
                </div>
            </div>
        </div>
    );
};

const PromotedStatusScreen = ({ 
    showMessage, 
    setActiveScreen, 
    currentUser, 
    setShowConfirmationModal, 
    setConfirmationTitle, 
    setConfirmationMessage, 
    setOnConfirmationAction 
}) => {
    const [myBookings, setMyBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedBooking, setSelectedBooking] = useState(null);

    const [deletingId, setDeletingId] = useState(null);

    // State for the content submission modal form
    const [title, setTitle] = useState('');
    const [mainUrl, setMainUrl] = useState('');
    const [flyerFile, setFlyerFile] = useState(null);
    const [flyerPreview, setFlyerPreview] = useState('');
    const [autoThumbnail, setAutoThumbnail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const flyerInputRef = useRef(null);
    
    // State for image adjustment modal
    const [showImageAdjustModal, setShowImageAdjustModal] = useState(false);
    const [imageFileToAdjust, setImageFileToAdjust] = useState(null);

    useEffect(() => {
        if (!currentUser) { setLoading(false); return; }
        const statusesRef = collection(db, "promotedStatuses");
        const q = query(statusesRef, where("postedByUid", "==", currentUser.uid), orderBy("startTime", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMyBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsubscribe();
    }, [currentUser]);
    
    useEffect(() => {
        if (!mainUrl) { setAutoThumbnail(''); return; }
        const handler = setTimeout(async () => {
            const info = extractVideoInfo(mainUrl);
            if (info && info.thumbnailUrl && info.thumbnailUrl !== 'https://placehold.co/300x200/2A2A2A/FFF?text=NVA') {
                setAutoThumbnail(info.thumbnailUrl);
            }
        }, 800);
        return () => clearTimeout(handler);
    }, [mainUrl]);
    
    const handleSelectBooking = (booking) => {
        setSelectedBooking(booking);
        // Pre-fill form if content exists from a previous submission
        setTitle(booking.content?.title || '');
        setMainUrl(booking.content?.destinationUrl || booking.content?.adVideoUrl || '');
        setFlyerFile(null);
        setFlyerPreview(booking.content?.flyerImageUrl || '');
        setAutoThumbnail('');
        if(flyerInputRef.current) flyerInputRef.current.value = null;
    };
    
    const handleSubmitContent = async (e) => {
        e.preventDefault();
        if (!selectedBooking || !title.trim() || !mainUrl.trim()) { showMessage("Ad Title and a URL are required."); return; }
        
        setIsSubmitting(true);
        let finalFlyerUrl = flyerPreview || autoThumbnail;

        if (flyerFile) {
            showMessage("Uploading flyer...");
            try {
                const filePath = `promo_flyers/${currentUser.uid}/${Date.now()}_${flyerFile.name}`;
                const storageRef = ref(storage, filePath);
                const snapshot = await uploadBytes(storageRef, flyerFile);
                finalFlyerUrl = await getDownloadURL(snapshot.ref);
            } catch (error) { showMessage(`Flyer upload failed: ${error.message}`); setIsSubmitting(false); return; }
        }

        if (!finalFlyerUrl) {
            showMessage("A thumbnail is required. Please upload one or use a link that provides a preview.");
            setIsSubmitting(false);
            return;
        }

        const info = extractVideoInfo(mainUrl);
        const submissionData = {
            bookingId: selectedBooking.id,
            title: title.trim(),
            destinationUrl: info.platform === 'generic' ? mainUrl : '',
            adVideoUrl: info.platform !== 'generic' ? mainUrl : '',
            flyerImageUrl: finalFlyerUrl
        };

        try {
            const submitContentFunction = httpsCallable(functions, 'submitStatusContent');
            await submitContentFunction(submissionData);
            showMessage("Content submitted successfully for review!");
            setSelectedBooking(null);
        } catch (error) { showMessage(`Submission failed: ${error.message}`);
        } finally { setIsSubmitting(false); }
    };

    const handleDeleteBooking = (booking) => {
        setConfirmationTitle("Delete Booking?");
        setConfirmationMessage(`Are you sure you want to permanently delete your booking for ${new Date(booking.startTime.toDate()).toLocaleDateString()}? This action cannot be undone.`);
        setOnConfirmationAction(() => async () => {
            
            setDeletingId(booking.id);

            try {
                const deleteFunction = httpsCallable(functions, 'deleteBooking');
                await deleteFunction({ bookingId: booking.id });
                showMessage("Booking deleted successfully.");
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };
    
    const getStatusStyle = (status) => {
        switch (status) {
            case 'approved_and_scheduled': return { color: '#00FF00', text: 'Approved & Scheduled' };
            case 'content_review_pending': return { color: '#FFD700', text: 'Content Review Pending' };
            case 'content_pending': return { color: '#FFA500', text: 'Awaiting Content Submission' };
            case 'expired': return { color: '#888', text: 'Expired' };
            
            case 'content_rejected': return { color: '#DC3545', text: 'Content Rejected' };

            case 'cancelled': return { color: '#AAA', text: 'Cancelled' };
            case 'rejected': return { color: '#DC3545', text: 'Content Rejected' };
            default: return { color: '#CCC', text: status.replace(/_/g, ' ').toUpperCase() };
        }
    };
    
    const handleFileSelect = (e) => { const file = e.target.files[0]; if (file) { setImageFileToAdjust(file); setShowImageAdjustModal(true); }};
    const handleSaveAdjustedImage = (adjustedBlob) => { const newFile = new File([adjustedBlob], "promo_flyer.png", { type: "image/png" }); setFlyerFile(newFile); setFlyerPreview(URL.createObjectURL(newFile)); setShowImageAdjustModal(false); };
    const handleCancelAdjust = () => { setImageFileToAdjust(null); setShowImageAdjustModal(false); if (flyerInputRef.current) flyerInputRef.current.value = null; };
    const finalPreview = flyerPreview || autoThumbnail;

    return (
        <>
            <div className="screenContainer">
                <p className="heading">My Promoted Status Bookings</p>
                <p className="subHeading">Manage content for your upcoming "Billboard" slots.</p>

                {loading ? <p>Loading your bookings...</p> : 
                    myBookings.length === 0 ? (
                        <div className="dashboardSection" style={{textAlign: 'center'}}>
                            <p className="dashboardItem">You have no upcoming bookings.</p>
                            <button className="button" style={{ backgroundColor: '#0A0A0A', border: '1px solid #00FFFF', color: '#00FFFF' }} onClick={() => setActiveScreen('BookStatus')}>Book a New Slot</button>
                        </div>
                    ) : (
                        <div className="allCampaignsList">
                            {myBookings.map(booking => {
                                const statusInfo = getStatusStyle(booking.status);
                                const isActionable = booking.status === 'content_pending' || booking.status === 'rejected';
                               
                                return (
                                    <div key={booking.id} className="allCampaignsListItem" style={{flexDirection: 'column', alignItems: 'stretch'}}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                                            <p className="campaignListTitle" style={{color: '#FFF'}}>Booking for: {new Date(booking.startTime.toDate()).toLocaleDateString()}</p>
                                            <span style={{color: statusInfo.color, fontSize: '12px', fontWeight: 'bold'}}>{statusInfo.text}</span>
                                        </div>
                                        {booking.content && (
                                            <div className="vertical-carousel-item" style={{backgroundColor: '#1A1A1A', padding: '10px', margin: '10px 0', borderRadius: '8px'}}>
                                                <img src={booking.content.flyerImageUrl} alt={booking.content.title} className="liveFeedThumbnail" />
                                                <div className="liveFeedContent">
                                                    <p className="liveFeedTitle" style={{fontSize: '14px'}}>{booking.content.title}</p>
                                                    <p className="liveFeedCreator" style={{fontSize: '12px'}}>Content Submitted</p>
                                                </div>
                                            </div>
                                        )}
                                        <div style={{display: 'flex', gap: '10px', marginTop: '10px', justifyContent: 'flex-end'}}>
                                            {isActionable && (
                                                <button className="button" style={{flex: 1, margin: 0}} onClick={() => handleSelectBooking(booking)}>
                                                    <span className="buttonText">{booking.status === 'rejected' ? 'Re-Submit Content' : 'Submit Content'}</span>
                                                </button>
                                            )}
                                                                                        
                                            <button className="button" style={{flex: 1, margin: 0, backgroundColor: '#555'}} onClick={() => handleDeleteBooking(booking)} disabled={deletingId === booking.id}>
                                                <span className="buttonText light">{deletingId === booking.id ? 'Deleting...' : 'Delete'}</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                }
                <button className="button" onClick={() => setActiveScreen('CreatorDashboard')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}><span className="buttonText light">Back to Dashboard</span></button>
            </div>

            {selectedBooking && (
                <div className="confirmationModalOverlay" style={{zIndex: 2500}}>
                    <div className="confirmationModalContent" style={{textAlign: 'left', maxWidth: '500px'}}>
                        <p className="confirmationModalTitle">Submit Content for {new Date(selectedBooking.startTime.toDate()).toLocaleDateString()}</p>
                        <form onSubmit={handleSubmitContent}>
                            <div className="formGroup"><label className="formLabel">Ad Title</label><input type="text" className="formInput" value={title} onChange={e => setTitle(e.target.value)} required /></div>
                            <div className="formGroup"><label className="formLabel">URL (Video or External Link)</label><input type="url" className="formInput" value={mainUrl} onChange={e => setMainUrl(e.target.value)} placeholder="Paste your ad's main link here" required /></div>
                            <div className="formGroup">
                                <label className="formLabel">Thumbnail / Flyer</label>
                                {finalPreview && <img src={finalPreview} alt="Ad preview" style={{maxWidth: '200px', borderRadius: '8px', marginBottom: '10px'}} />}
                                <input type="file" className="formInput" ref={flyerInputRef} style={{display:'none'}} onChange={handleFileSelect} accept="image/*" />
                                <button type="button" className="button" onClick={() => flyerInputRef.current.click()} style={{ width: '100%', backgroundColor: '#3A3A3A' }}><span className="buttonText light">Upload Custom Image</span></button>
                                <p className="smallText" style={{textAlign: 'left'}}>Upload to override the auto-fetched preview.</p>
                            </div>
                            <div className="confirmationModalButtons">
                                <button type="button" className="confirmationButton cancel" onClick={() => setSelectedBooking(null)}>Cancel</button>
                                <button type="submit" className="confirmationButton confirm" disabled={isSubmitting}>{isSubmitting ? 'Submitting...' : 'Submit for Review'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            
            {showImageAdjustModal && imageFileToAdjust && (
                <ProfilePictureAdjustModal
                    imageUrl={URL.createObjectURL(imageFileToAdjust)}
                    onSave={handleSaveAdjustedImage}
                    onCancel={handleCancelAdjust}
                    showMessage={showMessage}
                    isUploading={isSubmitting}
                />
            )}
        </>
    );
};

export default PromotedStatusScreen;