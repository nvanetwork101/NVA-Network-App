// src/components/PostOpportunityForm.jsx

import React, { useState, useEffect, useRef } from 'react';
import { storage, functions, httpsCallable } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import ThumbnailAdjustModal from './ThumbnailAdjustModal';
import { extractVideoInfo } from '../firebase'; // Assuming this is exported from your firebase.js

const PostOpportunityForm = ({ showMessage, setActiveScreen, currentUser, creatorProfile, setOpportunityToPromote }) => {
    const [title, setTitle] = useState('');
    const [providerName, setProviderName] = useState(creatorProfile?.creatorName || '');
    const [mainUrl, setMainUrl] = useState('');
    const [opportunityType, setOpportunityType] = useState('Casting Call');
    const [compensationType, setCompensationType] = useState('Paid');
    const [equipmentProvided, setEquipmentProvided] = useState('Not Applicable');
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');
    const [howToApply, setHowToApply] = useState('');
    const [listingDuration, setListingDuration] = useState(7);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [flyerFile, setFlyerFile] = useState(null);
    const [flyerPreview, setFlyerPreview] = useState('');
    const flyerInputRef = useRef(null);

    const [showImageAdjustModal, setShowImageAdjustModal] = useState(false);
    const [imageFileToAdjust, setImageFileToAdjust] = useState(null);
    
    const isVerified = creatorProfile?.isVerifiedAdvertiser && creatorProfile.verifiedAdvertiserExpiresAt?.toDate() > new Date();
    const [isPromotedInFeed, setIsPromotedInFeed] = useState(false);
    const [mainUrlPreview, setMainUrlPreview] = useState('');

    useEffect(() => {
        if (!mainUrl) { setMainUrlPreview(''); return; }
        const handler = setTimeout(() => {
            const info = extractVideoInfo(mainUrl);
            setMainUrlPreview(info.thumbnailUrl || '');
        }, 800);
        return () => clearTimeout(handler);
    }, [mainUrl]);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            // THE FIX: Create a blob URL here, just like the working component.
            setImageFileToAdjust(URL.createObjectURL(file));
            setShowImageAdjustModal(true);
        }
    };

    const handleSaveAdjustedImage = (adjustedBlob) => {
        const newFile = new File([adjustedBlob], "flyer.png", { type: "image/png" });
        setFlyerFile(newFile);
        setFlyerPreview(URL.createObjectURL(newFile));
        setShowImageAdjustModal(false);
        // THE FIX: Perform the full and complete cleanup.
        setImageFileToAdjust(null);
        if (flyerInputRef.current) {
            flyerInputRef.current.value = null;
        }
    };

    const handleCancelAdjust = () => {
        setImageFileToAdjust(null);
        setShowImageAdjustModal(false);
        if (flyerInputRef.current) flyerInputRef.current.value = null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        // THE FIX: Prioritize the flyerFile, but fall back to the auto-fetched preview.
        let finalFlyerImageUrl = mainUrlPreview; 

        if (flyerFile) {
            showMessage("Uploading custom flyer...");
            try {
                const path = `opportunity_flyers/${currentUser.uid}/${Date.now()}.png`;
                const storageRef = ref(storage, path);
                const snapshot = await uploadBytes(storageRef, flyerFile);
                finalFlyerImageUrl = await getDownloadURL(snapshot.ref); // Overwrite with the uploaded URL
            } catch (error) { 
                showMessage(`Flyer upload failed: ${error.message}`); 
                setIsSubmitting(false); 
                return; 
            }
        }

        try {
            const createOpportunityFunction = httpsCallable(functions, 'createOpportunity');
            const result = await createOpportunityFunction({
                title, providerName, 
                mainUrl: isVerified ? mainUrl : '',
                opportunityType, compensationType, equipmentProvided, location, description, howToApply,
                listingDuration: parseInt(listingDuration), 
                flyerImageUrl: finalFlyerImageUrl, // Send the final, decided-upon URL
                listingTier: isPromotedInFeed && isVerified ? 'promoted' : 'standard'
            });

            if (result.data.success && result.data.opportunityId) {
                if (isVerified) { 
                    setOpportunityToPromote(result.data.opportunityId);
                    setActiveScreen('PostSubmissionUpsell');
                } else {
                    showMessage("Your opportunity has been submitted for review.");
                    setActiveScreen('MyListings');
                }
            } else {
                throw new Error(result.data.message || "Failed to get new opportunity ID from server.");
            }
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const opportunityCategories = ['Casting Call', 'Film & Video Crew', 'Modeling', 'Events & Production Staff', 'Design & Creative', 'Music & Audio', 'Collaboration / TFP', 'Other'];

    return (
        <>
            <div className="screenContainer">
                <p className="heading">Post an Opportunity</p>
                <p className="subHeading">Your listing will be submitted for review before going live in Creator Connect.</p>
                <form onSubmit={handleSubmit}>
                    <div className="formGroup"><label className="formLabel">Listing Title</label><input type="text" className="formInput" value={title} onChange={e => setTitle(e.target.value)} required /></div>
                    <div className="formGroup"><label className="formLabel">Your Company/Provider Name</label><input type="text" className="formInput" value={providerName} onChange={e => setProviderName(e.target.value)} required /></div>
                    
                    {isVerified && (
                        <div className="formGroup">
                            <label className="formLabel">Project URL (Optional, Advertiser Only)</label>
                            <input type="url" className="formInput" value={mainUrl} onChange={e => setMainUrl(e.target.value)} placeholder="e.g., YouTube video, project page" />
                            {mainUrlPreview && (
                                <div style={{marginTop: '10px'}}>
                                    <p className="formLabel" style={{fontSize: '12px', color: '#AAA'}}>URL Preview:</p>
                                    <img src={mainUrlPreview} alt="URL preview" style={{maxWidth: '200px', borderRadius: '8px'}} />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="formGroup"><label className="formLabel">Location</label><input type="text" className="formInput" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g., Georgetown, Remote" required /></div>
                    <div className="formGroup"><label className="formLabel">Opportunity Type</label><select className="formInput" value={opportunityType} onChange={e => setOpportunityType(e.target.value)}>{opportunityCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                    <div className="formGroup"><label className="formLabel">Compensation</label><select className="formInput" value={compensationType} onChange={e => setCompensationType(e.target.value)}><option value="Paid">Paid</option><option value="Volunteer">Volunteer</option><option value="Stipend">Stipend</option><option value="Collaboration/TFP">Collaboration/TFP</option></select></div>
                    
                    <div className="formGroup"><label className="formLabel">Listing Duration</label><select className="formInput" value={listingDuration} onChange={e => setListingDuration(e.target.value)}><option value="7">1 Week</option><option value="14">2 Weeks</option><option value="21">3 Weeks</option><option value="30">30 Days</option></select></div>
                    
                    {isVerified && (
                        <div className="formGroup" style={{border: '1px solid #FFD700', borderRadius: '8px', padding: '15px', backgroundColor: '#1A1A1A'}}>
                            <div className="checkboxItem"><input type="checkbox" id="isPromotedInFeed" checked={isPromotedInFeed} onChange={(e) => setIsPromotedInFeed(e.target.checked)} /><label htmlFor="isPromotedInFeed" style={{fontWeight: 'bold', color: '#FFD700'}}>Promote this listing within the feed</label></div>
                        </div>
                    )}
                    <div className="formGroup"><label className="formLabel">Detailed Description</label><textarea className="formTextarea" value={description} onChange={e => setDescription(e.target.value)} required></textarea></div>
                    <div className="formGroup"><label className="formLabel">How to Apply</label><textarea className="formTextarea" value={howToApply} onChange={e => setHowToApply(e.target.value)} required></textarea></div>
                    
                    <div className="formGroup">
                        <label className="formLabel">Upload Flyer/Thumbnail (Optional)</label>
                        <input type="file" ref={flyerInputRef} onChange={handleFileSelect} accept="image/*" style={{display: 'none'}} />
                        <button type="button" className="button" onClick={() => flyerInputRef.current.click()} style={{ width: '100%', backgroundColor: '#3A3A3A' }}><span className="buttonText light">Upload Custom Image</span></button>
                        {flyerPreview && <img src={flyerPreview} alt="Flyer preview" style={{maxWidth: '200px', borderRadius: '8px', marginTop: '10px'}} />}
                    </div>

                    <button type="submit" className="button" disabled={isSubmitting}><span className="buttonText">{isSubmitting ? 'Submitting...' : 'Submit for Review'}</span></button>
                </form>
            </div>
            {showImageAdjustModal && imageFileToAdjust && (
                <ThumbnailAdjustModal imageUrl={imageFileToAdjust} onSave={handleSaveAdjustedImage} onCancel={handleCancelAdjust} showMessage={showMessage} isUploading={isSubmitting} />
            )}

        </>
    );
};

export default PostOpportunityForm;