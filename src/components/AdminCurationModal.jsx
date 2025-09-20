// src/components/AdminCurationModal.jsx

import React, { useState, useEffect, useRef } from 'react';
import { db, functions, httpsCallable, collection, onSnapshot, query, where, orderBy, doc, getDoc, setDoc, uploadBytes, ref, getDownloadURL, storage, extractVideoInfo } from '../firebase';
import ThumbnailAdjustModal from './ThumbnailAdjustModal';

// --- Sub-Components defined inside for encapsulation ---

const AddExternalLinkModal = ({ showMessage, onSave, onCancel }) => {
    const [title, setTitle] = useState('');
    const [destinationUrl, setDestinationUrl] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const [imageToCrop, setImageToCrop] = useState(null);
    const [showCropModal, setShowCropModal] = useState(false);

        // --- THIS IS THE FIX ---
    // This effect ensures that the temporary blob URL for the cropper
    // is always cleaned up when the component unmounts or the state changes.
    useEffect(() => {
        return () => {
            if (imageToCrop && imageToCrop.startsWith('blob:')) {
                URL.revokeObjectURL(imageToCrop);
            }
        };
    }, [imageToCrop]);

    useEffect(() => {
        // If a file is selected, create a blob URL for it.
        if (imageFile) {
            const objectUrl = URL.createObjectURL(imageFile);
            setImagePreview(objectUrl);

            // This is the cleanup function. It runs when the component unmounts
            // or when imageFile changes again, preventing memory leaks and errors.
            return () => URL.revokeObjectURL(objectUrl);
        }
        
        // If no file is selected, fall back to getting a thumbnail from the destination URL.
        if (!destinationUrl) {
            setImagePreview('');
            return;
        }

        const videoInfo = extractVideoInfo(destinationUrl);
        if (videoInfo && videoInfo.thumbnailUrl !== 'https://placehold.co/300x200/2A2A2A/FFF?text=NVA') {
            setImagePreview(videoInfo.thumbnailUrl);
        } else {
            setImagePreview('');
        }
    }, [imageFile, destinationUrl]);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageToCrop(URL.createObjectURL(file));
            setShowCropModal(true);
        }
        // Clear the input value so the same file can be selected again
        e.target.value = null; 
    };

    const handleCropComplete = (imageBlob) => {
        if (imageBlob) {
            const croppedFile = new File([imageBlob], 'cropped_thumbnail.png', { type: 'image/png' });
            setImageFile(croppedFile);
        }
        setShowCropModal(false);
        setImageToCrop(null);
    };

        const handleCropCancel = () => {
        // THE FIX: Revoke the blob URL to prevent memory leaks and errors.
        if (imageToCrop) {
            URL.revokeObjectURL(imageToCrop);
        }
        setShowCropModal(false);
        setImageToCrop(null);
    };

    const handleSave = async () => {
        if (!title || !destinationUrl) {
            showMessage("A Title and Destination URL are required.");
            return;
        }

        if (imageFile) {
            setIsUploading(true);
            showMessage("Uploading custom image...");
            try {
                const filePath = `curated_thumbnails/${Date.now()}_${imageFile.name}`;
                const storageRef = ref(storage, filePath);
                const snapshot = await uploadBytes(storageRef, imageFile);
                const finalImageUrl = await getDownloadURL(snapshot.ref);
                showMessage("Image uploaded successfully!");
                
                onSave({
                    type: 'external',
                    title,
                    externalLink: destinationUrl,
                    imageUrl: finalImageUrl,
                    orderIndex: Date.now()
                });
                setIsUploading(false);
                onCancel();

            } catch (error) {
                showMessage(`Image upload failed: ${error.message}`);
                setIsUploading(false);
            }
        } else {
            onSave({
                type: 'external',
                title,
                externalLink: destinationUrl,
                imageUrl: imagePreview || 'https://placehold.co/300x200/2A2A2A/FFF?text=NVA',
                orderIndex: Date.now()
            });
            onCancel();
        }
    };

    return (
        <div className="confirmationModalOverlay" style={{ zIndex: 3000 }}>
            <div className="confirmationModalContent" style={{ textAlign: 'left', maxWidth: '500px' }}>
                <p className="confirmationModalTitle">Add External Link</p>
                <div className="formGroup"><label className="formLabel">Title:</label><input type="text" className="formInput" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Summer Festival Tickets" required/></div>
                <div className="formGroup"><label className="formLabel">Destination URL:</label><input type="url" className="formInput" value={destinationUrl} onChange={(e) => { setDestinationUrl(e.target.value); setImageFile(null); }} placeholder="https://www.externalsite.com/page" required/><p className="smallText" style={{textAlign: 'left', color: '#AAA', marginTop: '5px'}}>The app will try to fetch a preview from this link.</p></div>
                <hr style={{borderColor: '#333', margin: '15px 0'}}/>
                <div className="formGroup"><label className="formLabel">Upload Custom Image (Overrides Preview):</label><input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" style={{ display: 'none' }} /><button type="button" className="button" onClick={() => fileInputRef.current.click()} style={{ width: '100%', backgroundColor: '#3A3A3A' }}><span className="buttonText">Choose Image File</span></button>
                    {imagePreview && (<div style={{marginTop: '15px'}}><p className="formLabel">Final Preview:</p><img src={imagePreview} alt="Preview" style={{ maxWidth: '200px', borderRadius: '8px', marginTop: '5px' }} onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/200x120/555/FFF?text=No+Preview'; }} /></div>)}
                </div>
                <div className="confirmationModalButtons"><button className="confirmationButton cancel" onClick={onCancel}>Cancel</button><button className="confirmationButton confirm" onClick={handleSave} disabled={isUploading}>{isUploading ? 'Uploading...' : 'Save Link'}</button></div>
                
                {showCropModal && <ThumbnailAdjustModal imageUrl={imageToCrop} onSave={handleCropComplete} onCancel={handleCropCancel} showMessage={showMessage} isUploading={isUploading} />}
            </div>
        </div>
    );
};

const ContentSelectorModal = ({ onSelect, onCancel, showMessage }) => {
    const [contentItems, setContentItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const contentCollectionRef = collection(db, `artifacts/production-app-id/public/data/content_items`);
        const q = query(contentCollectionRef, orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setContentItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (error) => {
            showMessage("Failed to load content library.");
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const filteredItems = contentItems.filter(item => item.title.toLowerCase().includes(searchTerm.toLowerCase()) || item.creatorName.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="confirmationModalOverlay" style={{ zIndex: 4000 }}>
            <div className="confirmationModalContent" style={{ maxWidth: '600px', textAlign: 'left' }}>
                <p className="confirmationModalTitle">Select Content from Library</p>
                <div className="formGroup"><input type="text" className="formInput" placeholder="Search by title or creator..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                <div className="dashboardContentList" style={{ maxHeight: '40vh', overflowY: 'auto', marginBottom: '20px' }}>
                    {loading ? <p>Loading...</p> : filteredItems.map(item => (
                        <div key={item.id} className="adminDashboardItem" style={{ cursor: 'pointer' }} onClick={() => onSelect(item)}>
                            <img src={item.customThumbnailUrl} style={{ width: '80px', height: '45px', objectFit: 'cover', borderRadius: '4px' }} alt={item.title} />
                            <div style={{ flexGrow: 1, marginLeft: '10px' }}><p className="adminDashboardItemTitle">{item.title}</p><p style={{ fontSize: '12px', color: '#AAA' }}>by {item.creatorName}</p></div>
                            <button className="adminActionButton approve">Select</button>
                        </div>
                    ))}
                </div>
                <div className="confirmationModalButtons"><button className="confirmationButton cancel" onClick={onCancel}>Cancel</button></div>
            </div>
        </div>
    );
};

// --- Main Curation Modal Component ---
function AdminCurationModal({ curationTarget, showMessage, onCancel, onSelect, contentItems }) {
    // If we only want the content selector, render it immediately.
    if (curationTarget === 'ContentSelectorOnly') {
        return <ContentSelectorModal showMessage={showMessage} onSelect={onSelect} onCancel={onCancel} />;
    }
    const [curatedItems, setCuratedItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showContentSelector, setShowContentSelector] = useState(false);
    const [showExternalLinkModal, setShowExternalLinkModal] = useState(false);

    const targetField = `${curationTarget.toLowerCase().replace(' ', '')}Items`;
    const appId = "production-app-id";

    // ====================== START: MODIFIED CODE BLOCK ======================
    // This useEffect hook now ONLY runs when the modal is opened (when curationTarget changes).
    // It no longer depends on `contentItems`, which fixes the race condition.
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            const layoutDocRef = doc(db, "settings", "homeScreenLayout");
            try {
                const docSnap = await getDoc(layoutDocRef);
                if (docSnap.exists()) {
                    const itemsFromDB = docSnap.data()[targetField] || [];
                    const enrichedItems = itemsFromDB.map(item => {
                        if (item.type === 'internal') {
                            const fullContent = contentItems.find(ci => ci.id === item.contentId);
                            return fullContent ? { ...item, ...fullContent } : null;
                        }
                        return item;
                    }).filter(Boolean);
                    setCuratedItems(enrichedItems);
                } else {
                    setCuratedItems([]);
                }
            } catch (error) {
                showMessage("Error fetching curation data: " + error.message);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, [curationTarget]); // <--- THE ONLY CHANGE IS HERE. `contentItems` has been removed.
    // ======================= END: MODIFIED CODE BLOCK =======================

    const handleMove = (index, direction) => {
        const newItems = [...curatedItems];
        const item = newItems[index];
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= newItems.length) return;
        newItems.splice(index, 1);
        newItems.splice(newIndex, 0, item);
        setCuratedItems(newItems);
    };

    const handleRemove = (index) => {
        setCuratedItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleSelectInternalContent = (selectedContent) => {
        const isAlreadyInList = curatedItems.some(item => item.contentId === selectedContent.id);
        if (isAlreadyInList) {
            showMessage("This content is already in the list.");
            return;
        }
        const newItem = { type: 'internal', contentId: selectedContent.id, orderIndex: curatedItems.length, ...selectedContent };
        setCuratedItems(prev => [...prev, newItem]);
        setShowContentSelector(false);
    };
    
    const handleSaveExternalLink = async (newLinkData) => {
        setShowExternalLinkModal(false);
        setIsSaving(true);
        showMessage("Promoting external link to library...");
        try {
            const promoteFunction = httpsCallable(functions, 'promoteExternalLink');
            const result = await promoteFunction({ title: newLinkData.title, externalLink: newLinkData.externalLink, imageUrl: newLinkData.imageUrl, appId: appId });
            if (result.data && result.data.newItem) {
                const newItem = { ...result.data.newItem, type: 'internal', contentId: result.data.newItem.id };
                setCuratedItems(prev => [...prev, newItem]);
                showMessage("Link successfully promoted and added to list!");
            } else {
                throw new Error("Invalid response from server.");
            }
        } catch (error) {
            showMessage(`Error promoting link: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        showMessage("Saving changes...");
        const itemsToSave = curatedItems.map((item, index) => {
            const id = item.contentId || item.id;
            if (!id) return null;
            return { type: 'internal', contentId: id, orderIndex: index };
        }).filter(item => item !== null);

        try {
            const layoutDocRef = doc(db, "settings", "homeScreenLayout");
            await setDoc(layoutDocRef, { [targetField]: itemsToSave }, { merge: true });
            showMessage("Curation saved successfully!");
            onCancel();
        } catch (error) {
            showMessage(`Error saving: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="confirmationModalOverlay" style={{ zIndex: 2500 }}>
            <div className="confirmationModalContent" style={{ maxWidth: '700px', textAlign: 'left' }}>
                <p className="confirmationModalTitle">Manage {curationTarget} Section</p>
                <div className="dashboardContentList" style={{ maxHeight: '40vh', overflowY: 'auto', marginBottom: '20px' }}>
                    {loading || isSaving ? <p>Loading...</p> : 
                        curatedItems.length === 0 ? <p className="dashboardItem">This section is empty.</p> :
                        curatedItems.map((item, index) => (
                            <div key={item.id || item.title + index} className="adminDashboardItem">
                                <img src={item.customThumbnailUrl || item.imageUrl} style={{width: '80px', height: '45px', objectFit: 'cover', borderRadius: '4px'}} alt={item.title}/>
                                <div style={{flexGrow: 1, marginLeft: '10px'}}><p className="adminDashboardItemTitle">{item.title}</p><p style={{fontSize: '12px', color: '#AAA'}}>by {item.creatorName || '...loading'}</p></div>
                                <div style={{display: 'flex', gap: '5px'}}><button onClick={() => handleMove(index, -1)} disabled={index === 0} className="adminActionButton" style={{width: '30px'}}>▲</button><button onClick={() => handleMove(index, 1)} disabled={index === curatedItems.length - 1} className="adminActionButton" style={{width: '30px'}}>▼</button><button onClick={() => handleRemove(index)} className="adminActionButton reject">Remove</button></div>
                            </div>
                        ))
                    }
                </div>
                <div className="flex justify-around gap-4 my-4"><button className="button" onClick={() => setShowContentSelector(true)} disabled={isSaving}><span className="buttonText">Add from Library</span></button><button className="button" onClick={() => setShowExternalLinkModal(true)} disabled={isSaving}><span className="buttonText">Add External URL</span></button></div>
                <div className="confirmationModalButtons"><button className="confirmationButton cancel" onClick={onCancel}>Cancel</button><button className="confirmationButton confirm" onClick={handleSaveChanges} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</button></div>
                {showContentSelector && <ContentSelectorModal showMessage={showMessage} onSelect={handleSelectInternalContent} onCancel={() => setShowContentSelector(false)} />}
                {showExternalLinkModal && <AddExternalLinkModal showMessage={showMessage} onSave={handleSaveExternalLink} onCancel={() => setShowExternalLinkModal(false)} />}
            </div>
        </div>
    );
}

export default AdminCurationModal;