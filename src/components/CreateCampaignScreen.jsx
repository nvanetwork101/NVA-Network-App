// src/components/CreateCampaignScreen.jsx

import React, { useState, useEffect, useRef } from 'react';
import { db, storage, addDoc, collection, query, where, getDocs, ref, uploadBytes, getDownloadURL } from '../firebase';
// --- FIX: Import the correct modal ---
import ThumbnailAdjustModal from './ThumbnailAdjustModal'; 
import { extractVideoInfo } from '../firebase';

const CreateCampaignScreen = ({ showMessage, setActiveScreen, currentUser, creatorProfile }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [goal, setGoal] = useState('');
    const [duration, setDuration] = useState(30);
    const [projectLink, setProjectLink] = useState('');
    const [customThumbnailFile, setCustomThumbnailFile] = useState(null);
    const [customThumbnailPreview, setCustomThumbnailPreview] = useState('');
    const [autoThumbnailPreview, setAutoThumbnailPreview] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const thumbnailInputRef = useRef(null);
    
    // --- FIX: State now holds a blob URL, just like the working example ---
    const [showImageAdjustModal, setShowImageAdjustModal] = useState(false);
    const [imageFileToAdjust, setImageFileToAdjust] = useState(null);
    const appId = "production-app-id";

    // --- FIX: Logic now mirrors the working component ---
    const handleThumbnailFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFileToAdjust(URL.createObjectURL(file)); // Create blob URL immediately
            setShowImageAdjustModal(true);
        }
    };

    // --- FIX: Logic now mirrors the working component ---
    const handleThumbnailSave = (adjustedBlob) => {
        const newFile = new File([adjustedBlob], "campaign_thumbnail.png", { type: "image/png" });
        setCustomThumbnailFile(newFile);
        setCustomThumbnailPreview(URL.createObjectURL(newFile));
        setShowImageAdjustModal(false);
        setImageFileToAdjust(null);
        if (thumbnailInputRef.current) {
            thumbnailInputRef.current.value = null; // Crucial reset
        }
    };

    // --- FIX: Logic now mirrors the working component ---
    const handleThumbnailCancel = () => {
        if (customThumbnailPreview && customThumbnailPreview.startsWith('blob:')) {
            URL.revokeObjectURL(customThumbnailPreview);
        }
        setCustomThumbnailPreview('');
        setImageFileToAdjust(null);
        setShowImageAdjustModal(false);
        if (thumbnailInputRef.current) {
            thumbnailInputRef.current.value = null;
        }
    };

    useEffect(() => {
        if (!projectLink) {
            setAutoThumbnailPreview('');
            return;
        }
        const handler = setTimeout(() => {
            const { thumbnailUrl } = extractVideoInfo(projectLink);
            if (thumbnailUrl && thumbnailUrl !== 'https://placehold.co/300x200/2A2A2A/FFF?text=NVA') {
                setAutoThumbnailPreview(thumbnailUrl);
            } else {
                setAutoThumbnailPreview('');
            }
        }, 800);
        return () => clearTimeout(handler);
    }, [projectLink]);

    useEffect(() => {
        return () => {
            if (customThumbnailPreview && customThumbnailPreview.startsWith('blob:')) {
                URL.revokeObjectURL(customThumbnailPreview);
            }
        };
    }, [customThumbnailPreview]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title || !description || !goal) {
            showMessage('Please fill in all required fields: Title, Description, and Funding Goal.');
            return;
        }
        if (isNaN(goal) || parseFloat(goal) <= 0) {
            showMessage('Funding Goal must be a positive number.');
            return;
        }
        setIsUploading(true);
        let finalImageUrl = autoThumbnailPreview;
        if (customThumbnailFile) {
            showMessage("Uploading custom thumbnail...");
            try {
                const filePath = `campaign_thumbnails/${currentUser.uid}/${Date.now()}_${customThumbnailFile.name}`;
                const storageRef = ref(storage, filePath);
                const snapshot = await uploadBytes(storageRef, customThumbnailFile);
                finalImageUrl = await getDownloadURL(snapshot.ref);
            } catch (error) {
                showMessage(`Thumbnail upload failed: ${error.message}`);
                setIsUploading(false);
                return;
            }
        }
        if (projectLink && !finalImageUrl) {
            showMessage("Could not get a thumbnail from the Project Link. Please upload a custom thumbnail to continue.");
            setIsUploading(false);
            return;
        }
        const campaignsCollectionRef = collection(db, `artifacts/${appId}/public/data/campaigns`);
        const q = query(campaignsCollectionRef, where('creatorId', '==', currentUser.uid), where('status', 'in', ['active', 'pending']));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            showMessage('You can only have one active or pending crowdfunding campaign at a time.');
            setIsUploading(false);
            return;
        }
        try {
            const createdAt = new Date();
            const endDate = new Date(createdAt);
            endDate.setDate(createdAt.getDate() + parseInt(duration, 10));
            await addDoc(campaignsCollectionRef, {
                creatorId: currentUser.uid,
                creatorName: creatorProfile.creatorName || currentUser.email,
                creatorProfilePictureUrl: creatorProfile.profilePictureUrl || '',
                title, description, goal: parseFloat(goal), raised: 0,
                projectLink: projectLink, imageUrl: finalImageUrl,
                createdAt: createdAt.toISOString(), endDate: endDate.toISOString(),
                status: 'pending'
            });
            showMessage(`Campaign "${title}" submitted for review!`);
            setActiveScreen('CreatorDashboard');
        } catch (error) {
            showMessage(`Failed to create campaign: ${error.message}.`);
        } finally {
            setIsUploading(false);
        }
    };
    
    const currentPreview = customThumbnailPreview || autoThumbnailPreview;

    return (
        <>
            <div className="screenContainer">
                <p className="heading">Create New Campaign</p>
                <p className="subHeading">Tell us about your project. It will be reviewed before going live.</p>
                <form onSubmit={handleSubmit}>
                    {/* Form fields remain the same */}
                    <div className="formGroup"><label htmlFor="campaignTitle" className="formLabel">Campaign Title:</label><input type="text" id="campaignTitle" className="formInput" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
                    <div className="formGroup"><label htmlFor="campaignDescription" className="formLabel">Description:</label><textarea id="campaignDescription" className="formTextarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your project, what you need funding for, etc." required></textarea></div>
                    <div className="formGroup"><label htmlFor="campaignGoal" className="formLabel">Funding Goal (USD):</label><input type="number" id="campaignGoal" className="formInput" value={goal} onChange={(e) => setGoal(e.target.value)} min="1" step="any" placeholder="e.g., 500" required /></div>
                    <div className="formGroup"><label htmlFor="campaignDuration" className="formLabel">Campaign Duration:</label><select id="campaignDuration" className="formInput" value={duration} onChange={(e) => setDuration(e.target.value)}><option value="7">1 Week</option><option value="14">2 Weeks</option><option value="21">3 Weeks</option><option value="30">30 Days (Max)</option></select></div>
                    <div className="formGroup"><label htmlFor="projectLink" className="formLabel">Project Link (Optional):</label><input type="url" id="projectLink" className="formInput" value={projectLink} onChange={(e) => setProjectLink(e.target.value)} placeholder="e.g., YouTube, Facebook video link" /><p className="smallText" style={{textAlign: 'left', color: '#AAA', marginTop: '5px'}}>We'll try to generate a thumbnail from this link.</p></div>
                    <div className="formGroup"><label className="formLabel">Campaign Thumbnail:</label>{currentPreview && ( <div style={{ marginBottom: '15px' }}><img src={currentPreview} alt="Thumbnail Preview" style={{ maxWidth: '100%', borderRadius: '8px', border: '2px solid #FFD700' }} /></div>)}
                        <input type="file" ref={thumbnailInputRef} onChange={handleThumbnailFileSelect} accept="image/*" style={{ display: 'none' }} />
                        <button type="button" className="button" onClick={() => thumbnailInputRef.current.click()} style={{ width: '100%', backgroundColor: '#3A3A3A' }}><span className="buttonText light">{customThumbnailFile ? 'Change Custom Thumbnail' : 'Upload Custom Thumbnail'}</span></button>
                         <p className="smallText" style={{textAlign: 'center', color: '#AAA', marginTop: '5px'}}>Recommended size: 1280x720 pixels.</p>
                    </div>
                    <div className="formGroup"><p className="smallText" style={{textAlign: 'center', color: '#FFD700', lineHeight: 1.5}}>Please note: Upon successful completion or expiration of a campaign, a 30-day cooldown will apply before you can create a new one.</p></div>
                    <button type="submit" className="button" disabled={isUploading}><span className="buttonText">{isUploading ? 'Submitting...' : 'Submit for Review'}</span></button>
                </form>
                <button className="button" onClick={() => setActiveScreen('CreatorDashboard')} style={{ backgroundColor: '#555', marginTop: '20px' }}><span className="buttonText light">Back to Dashboard</span></button>
            </div>
            
            {/* --- FIX: Call the correct modal component with the correct props --- */}
            {showImageAdjustModal && imageFileToAdjust && (
                <ThumbnailAdjustModal
                    imageUrl={imageFileToAdjust}
                    onSave={handleThumbnailSave}
                    onCancel={handleThumbnailCancel}
                    showMessage={showMessage}
                    isUploading={isUploading}
                />
            )}
        </>
    );
};

export default CreateCampaignScreen;