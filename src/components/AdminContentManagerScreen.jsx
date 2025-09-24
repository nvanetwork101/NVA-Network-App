// src/components/AdminContentManagerScreen.jsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, functions, httpsCallable, storage, ref, uploadBytes, getDownloadURL, extractVideoInfo } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from 'firebase/firestore'; // <-- FIX: Add doc and updateDoc
import AdminCurationModal from './AdminCurationModal';
import AdminFeaturedContentManager from './AdminFeaturedContentManager';
import ThumbnailAdjustModal from './ThumbnailAdjustModal';
import ManageContentModal from './ManageContentModal';

function AdminContentManagerScreen({ showMessage, setActiveScreen, featuredContentSlots, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction }) {
    // --- STATE MANAGEMENT ---
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [mainUrl, setMainUrl] = useState('');
    const [creatorName, setCreatorName] = useState('');
    const [contentType, setContentType] = useState('Live Feed'); // Default to Live Feed
    const [orderIndex, setOrderIndex] = useState(0);
    const [isActive, setIsActive] = useState(true);
    const [customThumbnailFile, setCustomThumbnailFile] = useState(null);
    const [thumbnailPreview, setThumbnailPreview] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null); 

    const [imageToCrop, setImageToCrop] = useState(null);
    const [showCropModal, setShowCropModal] = useState(false);
    
    const [contentItems, setContentItems] = useState([]);
    const [loadingContent, setLoadingContent] = useState(true);
    const [isContentListExpanded, setIsContentListExpanded] = useState(true);

    const [showCurationModal, setShowCurationModal] = useState(false);
    const [curationTarget, setCurationTarget] = useState('');
    const [showManageModal, setShowManageModal] = useState(false);
    const [itemToManage, setItemToManage] = useState(null);

    // --- THIS IS THE NEW DYNAMIC CATEGORY LOGIC ---
    const [dynamicCategories, setDynamicCategories] = useState([]);

    useEffect(() => {
        const categoriesRef = collection(db, "content_categories");
        const q = query(categoriesRef, orderBy("orderIndex"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedCategories = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(cat => cat.id !== 'live_premieres' && cat.isActive); // Exclude special doc and inactive cats
            setDynamicCategories(fetchedCategories);
        });
        return () => unsubscribe();
    }, []);

    const availableCategories = useMemo(() => {
        // Combine the special hardcoded option with the dynamic list
        return ['Live Feed', ...dynamicCategories.map(cat => cat.name)];
    }, [dynamicCategories]);
    // --- END OF NEW LOGIC ---

    useEffect(() => {
        setLoadingContent(true);
        const contentRef = collection(db, `artifacts/production-app-id/public/data/content_items`);
        const q = query(contentRef, orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setContentItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoadingContent(false);
        }, (error) => {
            console.error("Error fetching content items:", error);
            showMessage("Failed to load content library.");
            setLoadingContent(false);
        });
        return () => unsubscribe();
    }, []);
    
    useEffect(() => {
        if (customThumbnailFile) {
            const objectUrl = URL.createObjectURL(customThumbnailFile);
            setThumbnailPreview(objectUrl);
            return () => URL.revokeObjectURL(objectUrl);
        }
        if (!mainUrl) {
            setThumbnailPreview('');
            return;
        }
        const videoInfo = extractVideoInfo(mainUrl);
        if (videoInfo && videoInfo.thumbnailUrl) {
            setThumbnailPreview(videoInfo.thumbnailUrl);
        } else {
            setThumbnailPreview('');
        }
    }, [mainUrl, customThumbnailFile]);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageToCrop(URL.createObjectURL(file));
            setShowCropModal(true);
        }
    };

    const handleSaveCroppedImage = (imageBlob) => {
        if (imageBlob) {
            const croppedFile = new File([imageBlob], 'cropped_thumbnail.png', { type: 'image/png' });
            setCustomThumbnailFile(croppedFile);
        }
        setShowCropModal(false);
        setImageToCrop(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleClearForm = () => {
        setTitle('');
        setDescription('');
        setMainUrl('');
        setCreatorName('');
        setContentType('Live Feed'); // Reset to default
        setOrderIndex(0);
        setIsActive(true);
        setCustomThumbnailFile(null);
        setThumbnailPreview('');
        if (fileInputRef.current) {
            fileInputRef.current.value = ""; 
        }
    };
    
    const handleAddContent = async (e) => {
        e.preventDefault();
        if (!title || !mainUrl || !creatorName) {
            showMessage("Title, URL, and Creator Name are required.");
            return;
        }
        setIsUploading(true);
        showMessage("Processing content item...");
        
        let finalThumbnailUrl = '';
        const videoInfo = extractVideoInfo(mainUrl);

        try {
            if (customThumbnailFile) {
                showMessage("Uploading custom thumbnail...");
                const filePath = `content_thumbnails/${Date.now()}_${customThumbnailFile.name}`;
                const storageRef = ref(storage, filePath);
                const snapshot = await uploadBytes(storageRef, customThumbnailFile);
                finalThumbnailUrl = await getDownloadURL(snapshot.ref);
                showMessage("Thumbnail uploaded successfully.");
            } else {
                finalThumbnailUrl = videoInfo.thumbnailUrl || 'https://placehold.co/300x200/2A2A2A/FFF?text=NVA';
            }
            
            // The 'addContentToLibrary' function is now used for ALL content types.
            const addContentFunction = httpsCallable(functions, 'addContentToLibrary');
            const result = await addContentFunction({ 
                contentData: {
                    title, description, mainUrl, customThumbnailUrl: finalThumbnailUrl,
                    embedUrl: videoInfo.embedUrl || '', videoPlatform: videoInfo.platform || 'unknown',
                    creatorName, contentType, orderIndex, isActive,
                }, 
                appId: "production-app-id" 
            });
            
            showMessage(result.data.message);
            handleClearForm();

        } catch (error) {
            console.error("Error adding content:", error);
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleToggleActive = (item) => {
        const action = item.isActive ? "Deactivate" : "Activate";

        // First, define the function that will perform the action.
        const toggleActiveAction = async () => {
            showMessage(`${action}ing...`);
            try {
                const itemRef = doc(db, `artifacts/production-app-id/public/data/content_items`, item.id);
                await updateDoc(itemRef, { isActive: !item.isActive });
                showMessage("Status updated successfully.");
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        };

        // Then, configure the modal and give it the action function.
        setConfirmationTitle(`${action} Content?`);
        setConfirmationMessage(`Are you sure you want to ${action.toLowerCase()} "${item.title}"?`);
        setOnConfirmationAction(() => toggleActiveAction); // This correctly stores the function in state.
        setShowConfirmationModal(true);
    };

    const handleDelete = (item) => {
        // First, define the function that will perform the deletion.
        const deleteAction = async () => {
            showMessage("Deleting...");
            try {
                const deleteCallable = httpsCallable(functions, 'deleteContentItem');
                await deleteCallable({ contentId: item.id, appId: 'production-app-id' });
                showMessage("Content deleted successfully.");
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        };

        // Then, configure the modal and give it the action function.
        setConfirmationTitle("Delete Content?");
        setConfirmationMessage(`Are you sure you want to permanently delete "${item.title}"? This will also remove its thumbnail from storage. This cannot be undone.`);
        setOnConfirmationAction(() => deleteAction); // This correctly stores the function in state.
        setShowConfirmationModal(true);
    };
    const openCurationModal = (target) => { setCurationTarget(target); setShowCurationModal(true); };

    const handleOpenManageModal = (item) => {
        setItemToManage(item);
        setShowManageModal(true);
    };

    const handleCloseManageModal = () => {
        setItemToManage(null);
        setShowManageModal(false);
    };

    const handleSaveChanges = async (contentId, updates) => {
        try {
            // We use the existing 'updateContentDetails' function.
            // This is secure because the admin is the 'owner' of curated content.
            const updateFunction = httpsCallable(functions, 'updateContentDetails');
            await updateFunction({
                appId: "production-app-id",
                contentId: contentId,
                updates: updates
            });
            showMessage("Content updated successfully!");
        } catch (error) {
            showMessage(`Update failed: ${error.message}`);
            throw error; // Re-throw to keep the modal open on failure
        }
    };

    return (
        <>
            {showCropModal && <ThumbnailAdjustModal imageUrl={imageToCrop} onSave={handleSaveCroppedImage} onCancel={() => { setShowCropModal(false); setImageToCrop(null); }} showMessage={showMessage} isUploading={isUploading} />}
            {showCurationModal && <AdminCurationModal curationTarget={curationTarget} showMessage={showMessage} onCancel={() => setShowCurationModal(false)} contentItems={contentItems} />}
            
                {showManageModal && (
                <ManageContentModal
                    item={itemToManage}
                    onSave={handleSaveChanges}
                    onClose={handleCloseManageModal}
                    showMessage={showMessage}
                />
            )}

            <p className="heading">Manage Content</p>
            <p className="subHeading">Curate the home screen and add new videos to the content library.</p>
            
            <AdminFeaturedContentManager featuredContentSlots={featuredContentSlots} showMessage={showMessage} contentItems={contentItems} />

            <div className="dashboardSection" style={{ border: '2px solid #00FF00', marginTop: '20px' }}>
                <p className="dashboardSectionTitle" style={{color: '#00FF00'}}>Home Screen Curation</p>
                <p className="dashboardItem" style={{ color: '#AAA', marginBottom: '15px' }}>Manually add, remove, and reorder content for the main sections on the Home screen.</p>
                <div style={{ display: 'flex', justifyContent: 'space-around', gap: '10px', marginTop: '15px' }}>
                    <button type="button" className="button" onClick={() => openCurationModal('Featured')}><span className="buttonText">Manage Featured</span></button>
                    <button type="button" className="button" onClick={() => openCurationModal('Trending')}><span className="buttonText">Manage Trending</span></button>
                </div>
            </div>

            <div className="dashboardSection" style={{ marginTop: '20px' }}>
                <p className="dashboardSectionTitle">Add New Content to Library</p>
                <form onSubmit={handleAddContent}>
                    <div className="formGroup"><label htmlFor="contentTitle" className="formLabel">Title:</label><input type="text" id="contentTitle" className="formInput" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
                    <div className="formGroup"><label htmlFor="contentDescription" className="formLabel">Description:</label><textarea id="contentDescription" className="formTextarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description for the content item"></textarea></div>
                    <div className="formGroup"><label htmlFor="mainUrl" className="formLabel">Main Content URL:</label><input type="url" id="mainUrl" className="formInput" value={mainUrl} onChange={(e) => {setMainUrl(e.target.value); setCustomThumbnailFile(null); if(fileInputRef.current) fileInputRef.current.value = "";}} placeholder="e.g., YouTube link, Facebook video" required /><p className="smallText" style={{textAlign: 'left', marginTop: '5px', color: '#AAA'}}>We'll try to extract a thumbnail from this link.</p></div>
                    
                    <div className="formGroup"><label htmlFor="customThumbnailFile" className="formLabel">Custom Thumbnail Image (Optional):</label><input type="file" id="customThumbnailFile" className="formInput" accept="image/*" style={{padding: '10px 0', border: 'none', backgroundColor: 'transparent'}} ref={fileInputRef} onChange={handleFileSelect} /><p className="smallText" style={{textAlign: 'left', marginTop: '5px', color: '#AAA'}}>Upload an image to override the thumbnail. You will be asked to crop it.</p></div>
                    
                    {thumbnailPreview && (
                        <div className="formGroup">
                            <label className="formLabel">Final Thumbnail Preview:</label>
                            <img src={thumbnailPreview} alt="Preview" style={{ maxWidth: '240px', borderRadius: '8px', marginTop: '5px', border: '1px solid #444' }} onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/240x135/555/FFF?text=No+Preview'; }} />
                        </div>
                    )}

                    <div className="formGroup"><label htmlFor="creatorName" className="formLabel">Creator Name:</label><input type="text" id="creatorName" className="formInput" value={creatorName} onChange={(e) => setCreatorName(e.target.value)} required /></div>
                    
                    {/* THIS IS THE DYNAMIC DROPDOWN */}
                    <div className="formGroup">
                        <label htmlFor="contentType" className="formLabel">Content Type:</label>
                        <select id="contentType" className="formInput" value={contentType} onChange={(e) => setContentType(e.target.value)} required>
                            {availableCategories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                        </select>
                    </div>

                    <div className="formGroup"><label htmlFor="orderIndex" className="formLabel">Display Order Index:</label><input type="number" id="orderIndex" className="formInput" value={orderIndex} onChange={(e) => setOrderIndex(parseInt(e.target.value, 10))} min="0" /></div>
                    <div className="formGroup"><div className="checkboxItem"><input type="checkbox" id="isActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /><label htmlFor="isActive">Is Active</label></div></div>
                    
                    <button type="submit" className="button" disabled={isUploading}>{isUploading ? 'Processing...' : 'Add Content Item'}</button>
                    <button type="button" className="button" style={{ backgroundColor: '#555', color: '#FFF', marginLeft: '10px' }} onClick={handleClearForm} disabled={isUploading}>Clear Form</button>
                </form>
            </div>

            <div className="dashboardSection" style={{ marginTop: '30px' }}>
                <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsContentListExpanded(!isContentListExpanded)}>
                    <p className="dashboardSectionTitle" style={{ marginBottom: 0 }}>Existing Content Items ({contentItems.length})</p>
                    <span className="text-xl font-bold text-white">{isContentListExpanded ? '▼' : '▶'}</span>
                </div>
                
                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isContentListExpanded ? 'max-h-[3000px] mt-4' : 'max-h-0'}`}>
                    <div className="pt-4 border-t" style={{borderColor: '#3A3A3A'}}>
                        {loadingContent ? <p>Loading...</p> : (
                            <div className="dashboardContentList" style={{ maxHeight: '500px', overflowY: 'auto', paddingRight: '10px' }}>
                                {contentItems.map(item => (
                                    <div key={item.id} className="adminDashboardItem">
                                        <img src={item.customThumbnailUrl || 'https://placehold.co/50x50/3A3A3A/FFF?text=X'} alt="Thumbnail" style={{ width: '50px', height: '50px', borderRadius: '5px', objectFit: 'cover', marginRight: '10px' }} />
                                        <div style={{ flexGrow: 1 }}>
                                            <p className="adminDashboardItemTitle">{item.title}</p>
                                            <p style={{ fontSize: '12px', color: '#CCC' }}>Creator: {item.creatorName} | Type: {item.contentType}</p>
                                            <p style={{ fontSize: '12px', color: item.isActive ? '#00FF00' : '#DC3545' }}>Status: {item.isActive ? 'Active' : 'Inactive'}</p>
                                        </div>
                                        <button className="adminActionButton" onClick={() => handleToggleActive(item)} style={{ backgroundColor: item.isActive ? '#DC3545' : '#008000', color: '#FFF' }}>
                                            {item.isActive ? 'Deactivate' : 'Activate'}
                                        </button>
                                       
                                            {item.isCurated && (
                                            <button className="adminActionButton" onClick={() => handleOpenManageModal(item)}>Manage</button>
                                        )}

                                        <button className="adminActionButton reject" onClick={() => handleDelete(item)}>Delete</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

export default AdminContentManagerScreen;