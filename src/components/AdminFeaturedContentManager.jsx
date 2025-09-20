// src/components/AdminFeaturedContentManager.jsx

import React, { useState } from 'react';
import { db, doc, updateDoc, functions, httpsCallable } from '../firebase';
import AdminCurationModal from './AdminCurationModal';

const AdminFeaturedContentManager = ({ featuredContentSlots, showMessage, contentItems }) => {
    const [showModal, setShowModal] = useState(false);
    const [editingSlot, setEditingSlot] = useState(null);
    const [isSaving, setIsSaving] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    const handleUnlock = async (slotKey) => {
        setIsSaving(slotKey);
        
        try {
            const slotsDocRef = doc(db, "settings", "featuredContentSlots");
            const payload = {
                [`${slotKey}.isLocked`]: false,
                [`${slotKey}.content`]: null
            };
            
            await updateDoc(slotsDocRef, payload);
            showMessage(`Slot #${slotKey.split('_')[1]} unlocked.`);
        } catch (error) {
            
            showMessage("Error unlocking slot: " + error.message);
        } finally {
            setIsSaving(null);
        }
    };

    const handleSelectContent = async (selectedContent) => {
        if (!editingSlot) return;
        setIsSaving(editingSlot);
        setShowModal(false);
        
        try {
            const slotsDocRef = doc(db, "settings", "featuredContentSlots");
            const contentToSave = {
                ...selectedContent,
                id: selectedContent.id,
                title: selectedContent.title || 'Untitled',
                creatorName: selectedContent.creatorName || 'Unknown',
                viewCount: selectedContent.viewCount || 0,
                likeCount: selectedContent.likeCount || 0
            };
            const payload = {
                [`${editingSlot}.content`]: contentToSave,
                [`${editingSlot}.isLocked`]: true
            };
            
            await updateDoc(slotsDocRef, payload);
            showMessage(`Slot #${editingSlot.split('_')[1]} has been manually set and locked.`);
        } catch (error) {
            
            showMessage("Error updating slot: " + error.message);
        } finally {
            setIsSaving(null);
            setEditingSlot(null);
        }
    };

    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        
        showMessage("Requesting immediate refresh of automatic slots...");
        try {
            const triggerUpdate = httpsCallable(functions, 'triggerTopPerformersUpdate');
            const result = await triggerUpdate();
            
            showMessage(result.data.message);
        } catch (error) {
            
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsRefreshing(false);
        }
    };
    
    const slotKeys = Array.from({ length: 6 }, (_, i) => `slot_${i + 1}`);
    const slots = featuredContentSlots ? slotKeys.map(key => ({ key, ...featuredContentSlots[key] })) : [];

    return (
        <div className="dashboardSection" style={{border: '2px solid #FFD700'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                <p className="dashboardSectionTitle" style={{margin: 0}}>Top Creators Content Slots</p>
                <button className="button" onClick={handleManualRefresh} disabled={isRefreshing} style={{margin: 0, padding: '8px 15px', backgroundColor: '#555'}}>
                    <span className="buttonText light">{isRefreshing ? 'Refreshing...' : 'Refresh Slots'}</span>
                </button>
            </div>
            <p className="dashboardItem" style={{color: '#AAA', marginBottom: '15px'}}>Manually override the content featured on the "Top Creators" screen.</p>
            
            <div className="dashboardContentList">
                {slots.map((slot, index) => (
                    <div key={slot.key} className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'flex-start', gap: '10px'}}>
                        <p className="adminDashboardItemTitle">Slot #{index + 1} <span style={{fontSize: '12px', color: slot.isLocked ? '#00FF00' : '#FFD700'}}>({slot.isLocked ? 'Manually Locked' : 'Automatic'})</span></p>
                        <div style={{display: 'flex', width: '100%', alignItems: 'center', gap: '10px'}}>
                            <div style={{flexGrow: 1, display: 'flex', alignItems: 'center', gap: '10px'}}>
                                {slot.content ? (
                                    <>
                                        <img src={slot.content?.customThumbnailUrl || 'https://placehold.co/80x45/3A3A3A/FFF?text=N/A'} style={{width: '80px', height: '45px', objectFit: 'cover', borderRadius: '4px'}} alt={slot.content?.title || 'No Title'} />
                                        <div>
                                            <p style={{fontWeight: 'bold'}}>{slot.content?.title || 'Untitled'}</p>
                                            <p style={{fontSize: '12px', color: '#CCC'}}>by {slot.content?.creatorName || 'Unknown Creator'}</p>
                                        </div>
                                    </>
                                ) : <p className="dashboardItem">This slot is empty and will be filled automatically.</p>}
                            </div>
                            <div style={{display: 'flex', gap: '10px'}}>
                                {isSaving === slot.key ? <p>Saving...</p> : <>
                                    {slot.isLocked && <button className="adminActionButton" onClick={() => handleUnlock(slot.key)}>Unlock</button>}
                                    <button className="adminActionButton approve" onClick={() => { setEditingSlot(slot.key); setShowModal(true); }}>Change</button>
                                </>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            
            {showModal && <AdminCurationModal onSelect={handleSelectContent} onCancel={() => setShowModal(false)} showMessage={showMessage} curationTarget="ContentSelectorOnly" contentItems={contentItems} />}
        </div>
    );
};

export default AdminFeaturedContentManager;