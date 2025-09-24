// src/components/ManageOpportunityModal.jsx

import React, { useState, useEffect, useRef } from 'react';
import { storage, ref, uploadBytes, getDownloadURL } from '../firebase';
import ThumbnailAdjustModal from './ThumbnailAdjustModal';

function ManageOpportunityModal({ opportunity, onSave, onClose, showMessage }) {
    // --- STATE MANAGEMENT ---
    // THE FIX for 'uncontrolled input': Initialize all form fields to prevent 'undefined' values.
    const [formData, setFormData] = useState({
        title: '',
        providerName: '',
        opportunityType: 'Other',
        compensationType: 'Unpaid',
        equipmentProvided: 'Not Provided',
        location: '',
        description: '',
        howToApply: '',
    });
    const [flyerImageFile, setFlyerImageFile] = useState(null);
    const [flyerImagePreview, setFlyerImagePreview] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef(null);

    // Cropping Modal State
    const [imageToCrop, setImageToCrop] = useState(null);
    const [showCropModal, setShowCropModal] = useState(false);

    // --- EFFECTS ---
    useEffect(() => {
        if (opportunity) {
            setFormData({
                title: opportunity.title || '',
                providerName: opportunity.providerName || '',
                opportunityType: opportunity.opportunityType || 'Other',
                compensationType: opportunity.compensationType || 'Unpaid',
                equipmentProvided: opportunity.equipmentProvided || 'Not Provided',
                location: opportunity.location || '',
                description: opportunity.description || '',
                howToApply: opportunity.howToApply || '',
            });
            setFlyerImagePreview(opportunity.flyerImageUrl || '');
        }
    }, [opportunity]);

    useEffect(() => {
        return () => {
            if (imageToCrop && imageToCrop.startsWith('blob:')) {
                URL.revokeObjectURL(imageToCrop);
            }
        };
    }, [imageToCrop]);

    // --- HANDLERS ---
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageToCrop(URL.createObjectURL(file));
            setShowCropModal(true);
        }
        e.target.value = null;
    };

    const handleCropComplete = (imageBlob) => {
        if (imageBlob) {
            const croppedFile = new File([imageBlob], 'new_flyer.png', { type: 'image/png' });
            setFlyerImageFile(croppedFile);
            setFlyerImagePreview(URL.createObjectURL(croppedFile));
        }
        setShowCropModal(false);
        setImageToCrop(null);
    };

    const handleCropCancel = () => {
        if (imageToCrop) URL.revokeObjectURL(imageToCrop);
        setShowCropModal(false);
        setImageToCrop(null);
    };

    const handleSaveChanges = async () => {
        if (!formData.title || !formData.providerName || !formData.description || !formData.howToApply) {
            showMessage("Title, Provider Name, Description, and How to Apply are required fields.");
            return;
        }
        setIsSaving(true);
        showMessage("Saving changes...");

        const updates = {};
        let newFlyerUrl = null;

        try {
            if (flyerImageFile) {
                showMessage("Uploading new flyer image...");
                const filePath = `opportunity_flyers/${opportunity.postedByUid}/${Date.now()}-managed.png`;
                const storageRef = ref(storage, filePath);
                const snapshot = await uploadBytes(storageRef, flyerImageFile);
                newFlyerUrl = await getDownloadURL(snapshot.ref);
                showMessage("Image uploaded.");
            }

            for (const key in formData) {
                if (formData[key] !== (opportunity[key] || '')) {
                    updates[key] = formData[key];
                }
            }
            if (newFlyerUrl) {
                updates.flyerImageUrl = newFlyerUrl;
            }

            if (Object.keys(updates).length > 0) {
                await onSave(opportunity.id, updates);
            } else {
                showMessage("No changes were made.");
            }
            
            onClose();

        } catch (error) {
            showMessage(`Error saving changes: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (!opportunity) return null;

    return (
        <>
            <div className="confirmationModalOverlay" style={{ zIndex: 2000 }}>
                <div className="confirmationModalContent" style={{ textAlign: 'left', maxWidth: '600px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
                    <p className="confirmationModalTitle" style={{ flexShrink: 0 }}>Manage Opportunity Listing</p>
                    
                    {/* THE FIX for Overflow: This new div wraps the form and is scrollable */}
                    <div className="modal-body" style={{ overflowY: 'auto', padding: '10px 20px' }}>
                        <div className="formGroup"><label className="formLabel">Title:</label><input type="text" name="title" className="formInput" value={formData.title} onChange={handleChange} /></div>
                        <div className="formGroup"><label className="formLabel">Provider Name:</label><input type="text" name="providerName" className="formInput" value={formData.providerName} onChange={handleChange} /></div>
                        <div className="formGroup"><label className="formLabel">Description:</label><textarea name="description" className="formTextarea" value={formData.description} onChange={handleChange} rows="5"></textarea></div>
                        <div className="formGroup"><label className="formLabel">How to Apply:</label><textarea name="howToApply" className="formTextarea" value={formData.howToApply} onChange={handleChange} rows="3"></textarea></div>
                        <div className="formGroup"><label className="formLabel">Location:</label><input type="text" name="location" className="formInput" value={formData.location} onChange={handleChange} /></div>
                        
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px'}}>
                            <div className="formGroup"><label className="formLabel">Opportunity Type:</label><select name="opportunityType" className="formInput" value={formData.opportunityType} onChange={handleChange}><option>Music Video</option><option>Short Film</option><option>Skit</option><option>Event Coverage</option><option>Other</option></select></div>
                            <div className="formGroup"><label className="formLabel">Compensation:</label><select name="compensationType" className="formInput" value={formData.compensationType} onChange={handleChange}><option>Paid</option><option>Unpaid</option><option>Stipend</option><option>Profit Share</option></select></div>
                        </div>
                        <div className="formGroup"><label className="formLabel">Equipment:</label><select name="equipmentProvided" className="formInput" value={formData.equipmentProvided} onChange={handleChange}><option>Provided</option><option>Not Provided</option></select></div>

                        <div className="formGroup"><label className="formLabel">Current Flyer:</label><img src={flyerImagePreview} alt="Flyer" style={{ maxWidth: '200px', borderRadius: '8px', marginTop: '5px' }} /></div>
                        <div className="formGroup"><label className="formLabel">Upload New Flyer (Optional):</label><input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" style={{ display: 'none' }} /><button type="button" className="button" onClick={() => fileInputRef.current.click()} style={{ width: '100%', backgroundColor: '#3A3A3A' }}><span className="buttonText">Choose New Image</span></button></div>
                    </div>

                    <div className="confirmationModalButtons" style={{ flexShrink: 0 }}>
                        <button className="confirmationButton cancel" onClick={onClose} disabled={isSaving}>Cancel</button>
                        <button className="confirmationButton confirm" onClick={handleSaveChanges} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</button>
                    </div>
                </div>
            </div>

            {showCropModal && <ThumbnailAdjustModal imageUrl={imageToCrop} onSave={handleCropComplete} onCancel={handleCropCancel} showMessage={showMessage} isUploading={isSaving} />}
        </>
    );
}

export default ManageOpportunityModal;