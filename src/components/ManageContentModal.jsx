// src/components/ManageContentModal.jsx

import React, { useState, useEffect, useRef } from 'react';
import { functions } from '../firebase';
import ThumbnailAdjustModal from './ThumbnailAdjustModal';
import { compressImage, uploadToR2 } from '../utils/r2Upload';

function ManageContentModal({ item, onSave, onClose, showMessage }) {
    // --- STATE MANAGEMENT ---
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [applyMonetization, setApplyMonetization] = useState(false); // NEW STATE
    const [customThumbnailFile, setCustomThumbnailFile] = useState(null);
    const [thumbnailPreview, setThumbnailPreview] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef(null);

    // State for the cropping modal
    const [imageToCrop, setImageToCrop] = useState(null);
    const [showCropModal, setShowCropModal] = useState(false);

    // --- EFFECTS ---
    // Populate the form with the existing item's data when the modal opens
    useEffect(() => {
        if (item) {
            setTitle(item.title || '');
            setDescription(item.description || '');
            setThumbnailPreview(item.customThumbnailUrl || '');
        }
    }, [item]);

    // Clean up blob URLs to prevent memory leaks
    useEffect(() => {
        return () => {
            if (imageToCrop && imageToCrop.startsWith('blob:')) {
                URL.revokeObjectURL(imageToCrop);
            }
        };
    }, [imageToCrop]);

    // --- HANDLERS ---
    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageToCrop(URL.createObjectURL(file));
            setShowCropModal(true);
        }
        e.target.value = null; // Reset input
    };

    const handleCropComplete = (imageBlob) => {
        if (imageBlob) {
            const croppedFile = new File([imageBlob], 'new_thumbnail.jpg', { type: 'image/jpeg' });
            setCustomThumbnailFile(croppedFile);
            setThumbnailPreview(URL.createObjectURL(croppedFile)); // Update preview with cropped image
        }
        setShowCropModal(false);
        setImageToCrop(null);
    };

    const handleCropCancel = () => {
        if (imageToCrop) {
            URL.revokeObjectURL(imageToCrop);
        }
        setShowCropModal(false);
        setImageToCrop(null);
    };

    const handleSaveChanges = async () => {
        if (!title.trim()) {
            showMessage("Title cannot be empty.");
            return;
        }
        setIsSaving(true);
        showMessage("Saving changes...");

        const updates = {};
        let newThumbnailUrl = null;

        try {
            // Step 1: If a new thumbnail was provided, upload it first.
            if (customThumbnailFile) {
                showMessage("Compressing and uploading new thumbnail to R2...");
                
                // 1. Native Compression (1080px max, 0.85 quality)
                const compressedFile = await compressImage(customThumbnailFile, 1080, 0.85);
                
                // 2. Static Overwrite Path mapped to the item's ID (Zero dust rule)
                const filePath = `content_thumbnails/${item.creatorId}/thumb_${item.id}.jpg`;
                
                // 3. Centralized R2 Upload (Handles secure handshake, PUT, and cache-busting)
                const rawUrl = await uploadToR2(compressedFile, filePath, functions);
                
                // Keep the cache-buster ?t= so the UI updates instantly after an overwrite
                newThumbnailUrl = rawUrl;
                
                showMessage("Thumbnail updated via R2!");
            }

            // Step 2: Build the 'updates' object with only the changed fields.
            if (title.trim() !== item.title) {
                updates.title = title.trim();
            }
            if (description.trim() !== (item.description || '')) {
                updates.description = description.trim();
            }
            if (newThumbnailUrl) {
                updates.customThumbnailUrl = newThumbnailUrl;
            }
            if (applyMonetization && item.monetizationStatus !== 'approved' && item.monetizationStatus !== 'pending') {
                updates.monetizationStatus = 'pending';
                updates.isMonetizationRequest = true;
                // We no longer unpublish it. It stays exactly where the user put it.
            }

            // Step 3: If there are changes, call the onSave prop function.
            if (Object.keys(updates).length > 0) {
                await onSave(item.id, updates);
            } else {
                showMessage("No changes were made.");
            }
            
            onClose(); // Close the modal on success

        } catch (error) {
            showMessage(`Error saving changes: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (!item) return null;

    return (
        <>
            <div className="confirmationModalOverlay" style={{ zIndex: 2000 }}>
                <div className="confirmationModalContent" style={{ textAlign: 'left', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
                    <p className="confirmationModalTitle">Manage Content</p>
                    
                    <div className="formGroup">
                        <label className="formLabel">Title:</label>
                        <input type="text" className="formInput" value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>
                    
                    <div className="formGroup">
                        <label className="formLabel">Description:</label>
                        <textarea className="formTextarea" value={description} onChange={(e) => setDescription(e.target.value)} rows="4"></textarea>
                    </div>

                    {item.monetizationStatus !== 'approved' && item.monetizationStatus !== 'pending' && (
                        <div style={{ background: 'rgba(255, 215, 0, 0.05)', border: '1px solid rgba(255, 215, 0, 0.2)', padding: '12px 16px', borderRadius: '12px', marginBottom: '15px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', margin: 0 }}>
                                <input 
                                    type="checkbox" 
                                    checked={applyMonetization} 
                                    onChange={(e) => setApplyMonetization(e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: '#FFD700', cursor: 'pointer', margin: 0 }}
                                />
                                <span style={{ color: '#FFF', fontSize: '14px', fontWeight: 'bold' }}>Submit for monetization</span>
                            </label>
                        </div>
                    )}

                    <div className="formGroup">
                        <label className="formLabel">Main URL (Cannot be changed):</label>
                        <input type="text" className="formInput" value={item.mainUrl} readOnly disabled style={{ backgroundColor: '#2A2A2A', cursor: 'not-allowed' }} />
                    </div>

                    <div className="formGroup">
                        <label className="formLabel">Current Thumbnail:</label>
                        <img src={thumbnailPreview} alt="Thumbnail Preview" style={{ maxWidth: '240px', borderRadius: '8px', marginTop: '5px', border: '1px solid #444' }} />
                    </div>

                    <div className="formGroup">
                        <label className="formLabel">Upload New Thumbnail (Optional):</label>
                        <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" style={{ display: 'none' }} />
                        <button type="button" className="button" onClick={() => fileInputRef.current.click()} style={{ width: '100%', backgroundColor: '#3A3A3A' }}>
                            <span className="buttonText">Choose New Image</span>
                        </button>
                    </div>

                    <div className="confirmationModalButtons">
                        <button className="confirmationButton cancel" onClick={onClose} disabled={isSaving}>Cancel</button>
                        <button className="confirmationButton confirm" onClick={handleSaveChanges} disabled={isSaving}>
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>

            {showCropModal && (
                <ThumbnailAdjustModal 
                    imageUrl={imageToCrop} 
                    onSave={handleCropComplete} 
                    onCancel={handleCropCancel} 
                    showMessage={showMessage} 
                    isUploading={isSaving} 
                />
            )}
        </>
    );
}

export default ManageContentModal;