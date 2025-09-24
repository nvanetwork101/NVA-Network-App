// src/components/ManageContentModal.jsx

import React, { useState, useEffect, useRef } from 'react';
import { storage, ref, uploadBytes, getDownloadURL } from '../firebase';
import ThumbnailAdjustModal from './ThumbnailAdjustModal';

function ManageContentModal({ item, onSave, onClose, showMessage }) {
    // --- STATE MANAGEMENT ---
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
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
            const croppedFile = new File([imageBlob], 'new_thumbnail.png', { type: 'image/png' });
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
                showMessage("Uploading new thumbnail...");
                const filePath = `content_thumbnails/${item.creatorId}/${Date.now()}-managed.png`;
                const storageRef = ref(storage, filePath);
                const snapshot = await uploadBytes(storageRef, customThumbnailFile);
                newThumbnailUrl = await getDownloadURL(snapshot.ref);
                showMessage("Thumbnail uploaded.");
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
                <div className="confirmationModalContent" style={{ textAlign: 'left', maxWidth: '500px' }}>
                    <p className="confirmationModalTitle">Manage Content</p>
                    
                    <div className="formGroup">
                        <label className="formLabel">Title:</label>
                        <input type="text" className="formInput" value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>
                    
                    <div className="formGroup">
                        <label className="formLabel">Description:</label>
                        <textarea className="formTextarea" value={description} onChange={(e) => setDescription(e.target.value)} rows="4"></textarea>
                    </div>

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