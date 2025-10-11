// src/components/CompetitionEntryForm.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { functions, httpsCallable, storage, ref, uploadBytes, getDownloadURL, extractVideoInfo } from '../firebase';
import ThumbnailAdjustModal from './ThumbnailAdjustModal';

function CompetitionEntryForm({ competition, currentUser, showMessage, onClose }) {
    // --- STATE MANAGEMENT ---
    const [entryTitle, setEntryTitle] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    const [bio, setBio] = useState('');
    const [submissionUrl, setSubmissionUrl] = useState('');
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [photoFile, setPhotoFile] = useState(null);
    const [photoPreview, setPhotoPreview] = useState('');
    const [customThumbnailFile, setCustomThumbnailFile] = useState(null);
    const [thumbnailPreview, setThumbnailPreview] = useState('');
    
    const [imageToCrop, setImageToCrop] = useState(null);
    const [showCropModal, setShowCropModal] = useState(false);

    const photoInputRef = useRef(null);
    const thumbnailInputRef = useRef(null);

    // --- UNIFIED PREVIEW LOGIC ---
    useEffect(() => {
        if (customThumbnailFile) {
            const objectUrl = URL.createObjectURL(customThumbnailFile);
            setThumbnailPreview(objectUrl);
            return () => URL.revokeObjectURL(objectUrl);
        }
        if (!submissionUrl) {
            setThumbnailPreview('');
            return;
        }
        const videoInfo = extractVideoInfo(submissionUrl);
        setThumbnailPreview(videoInfo.thumbnailUrl || '');
    }, [submissionUrl, customThumbnailFile]);

    // --- STABILIZED HANDLERS ---
    const handlePhotoSelect = useCallback((e) => {
        const file = e.target.files[0];
        if (file) {
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    }, []);
    
    const handleThumbnailSelect = useCallback((e) => {
        const file = e.target.files[0];
        if (file) {
            setCustomThumbnailFile(file); // Directly set the file, bypassing the crop modal
        }
        e.target.value = null; // Reset input to allow selecting the same file again
    }, []);
    
    const handleCropComplete = useCallback((imageBlob) => {
        if (imageBlob) {
            const croppedFile = new File([imageBlob], 'custom_thumbnail.png', { type: 'image/png' });
            setCustomThumbnailFile(croppedFile);
        }
        setShowCropModal(false);
        setImageToCrop(null);
    }, []);

const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        if (!agreedToTerms) {
            showMessage("You must agree to the competition rules.");
            return;
        }
        if (competition.competitionType?.toLowerCase().trim() === 'photo' && !photoFile) {
            showMessage("You must select a photo to submit for this competition.");
            return;
        }
        setIsSubmitting(true);
        showMessage("Uploading your entry... Please wait.");
        try {
            let finalPhotoUrl = '';
            let finalThumbnailUrl = ''; // Initialize as empty
            if (competition.competitionType?.toLowerCase().trim() === 'photo' && photoFile) {
                const photoPath = `competition_entries/${competition.id}/${currentUser.uid}/submission_${Date.now()}`;
                const photoStorageRef = ref(storage, photoPath);
                const photoSnapshot = await uploadBytes(photoStorageRef, photoFile);
                finalPhotoUrl = await getDownloadURL(photoSnapshot.ref);
            }
            // This block is now the ONLY way finalThumbnailUrl is set.
            if (customThumbnailFile) {
                const thumbPath = `competition_entries/${competition.id}/${currentUser.uid}/thumbnail_${Date.now()}`;
                const thumbStorageRef = ref(storage, thumbPath);
                const thumbSnapshot = await uploadBytes(thumbStorageRef, customThumbnailFile);
                finalThumbnailUrl = await getDownloadURL(thumbSnapshot.ref);
            }
            const entryData = {
                competitionId: competition.id,
                title: entryTitle,
                contactNumber,
                bio,
                submissionUrl: competition.competitionType?.toLowerCase().trim() !== 'photo' ? submissionUrl : '',
                photoUrl: finalPhotoUrl,
                customThumbnailUrl: finalThumbnailUrl, // Will be empty if no custom thumb was uploaded
            };
            const submitEntryFunction = httpsCallable(functions, 'submitCompetitionEntry');
            await submitEntryFunction(entryData);
            showMessage("Your entry has been submitted successfully!");
            onClose();
        } catch (error) {
            console.error("Error submitting entry:", error);
            showMessage(`Submission failed: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    }, [agreedToTerms, bio, competition, contactNumber, customThumbnailFile, currentUser, entryTitle, onClose, photoFile, showMessage, submissionUrl, thumbnailPreview]);

    return (
        <>
            {showCropModal && <ThumbnailAdjustModal imageUrl={imageToCrop} onSave={handleCropComplete} onCancel={() => setShowCropModal(false)} showMessage={showMessage} isUploading={isSubmitting} />}
            <div className="confirmationModalOverlay" style={{ zIndex: 3000 }}>
                <div className="confirmationModalContent" style={{ textAlign: 'left', maxWidth: '500px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p className="confirmationModalTitle">Enter: {competition.title}</p>
                        <button className="closeButton" onClick={onClose} style={{ position: 'static' }}>×</button>
                    </div>
                    <form onSubmit={handleSubmit}>
                        <p className="subHeading" style={{ textAlign: 'left', fontSize: '14px', margin: '0 0 15px 0' }}>Your entry will be publicly visible.</p>
                        
                        {competition.competitionType?.toLowerCase().trim() === 'photo' ? (
                            <div className="formGroup">
                                <label className="formLabel">Your Photo Submission (Required)</label>
                                <input type="file" ref={photoInputRef} className="formInput" accept="image/*" required onChange={handlePhotoSelect} />
                                {photoPreview && <img src={photoPreview} alt="Photo preview" style={{ maxWidth: '150px', borderRadius: '8px', marginTop: '10px' }} />}
                            </div>
                        ) : (
                            <div className="formGroup">
                                <label className="formLabel">Submission URL (Required)</label>
                                <input type="url" className="formInput" value={submissionUrl} onChange={e => setSubmissionUrl(e.target.value)} placeholder="https://youtube.com/your-video" required />
                            </div>
                        )}
                        
                        {competition.competitionType?.toLowerCase().trim() !== 'photo' && (
                             <div className="formGroup">
                                <label className="formLabel">Custom Thumbnail (Optional)</label>
                                <p className="smallText" style={{textAlign: 'left', color: '#AAA', marginTop: '5px'}}>Upload a custom 16:9 image to represent your entry.</p>
                                <input type="file" ref={thumbnailInputRef} className="formInput" accept="image/*" onChange={handleThumbnailSelect} style={{display: 'none'}} />
                                <button type="button" className="button" style={{ width: '100%', backgroundColor: '#3A3A3A' }} onClick={() => thumbnailInputRef.current.click()}><span className="buttonText light">Upload Custom Thumbnail</span></button>
                                {thumbnailPreview && <img src={thumbnailPreview} alt="Thumbnail preview" style={{ maxWidth: '150px', borderRadius: '8px', marginTop: '10px' }} />}
                            </div>
                        )}
                      
                        <div className="formGroup"><label className="formLabel">Entry Title (Public)</label><input type="text" className="formInput" value={entryTitle} onChange={e => setEntryTitle(e.target.value)} placeholder="e.g., Sunset Over the Demerara" required /></div>
                        <div className="formGroup"><label className="formLabel">Contact Number (Mandatory)</label><input type="tel" className="formInput" value={contactNumber} onChange={e => setContactNumber(e.target.value)} placeholder="e.g., 592-600-1234" required /></div>
                        <div className="formGroup"><label className="formLabel">Brief Bio (Optional, Public)</label><textarea className="formTextarea" value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell us about yourself or your entry." /></div>
                        <div className="formGroup"><div className="checkboxItem"><input type="checkbox" id="agreeCompTerms" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} required /><label htmlFor="agreeCompTerms" style={{marginLeft: '8px'}}>I have read and agree to the competition rules.</label></div></div>

                        <div className="confirmationModalButtons">
                            <button type="button" className="confirmationButton cancel" onClick={onClose}>Cancel</button>
                            <button type="submit" className="confirmationButton confirm" disabled={isSubmitting}>{isSubmitting ? 'Submitting...' : 'Submit Entry'}</button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
}

export default CompetitionEntryForm;