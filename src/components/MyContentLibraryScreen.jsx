// src/components/MyContentLibraryScreen.jsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, storage, functions, collection, query, where, orderBy, onSnapshot, httpsCallable } from '../firebase';

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import ThumbnailAdjustModal from './ThumbnailAdjustModal';
import ManageContentModal from './ManageContentModal';
import { extractVideoInfo } from '../firebase';

// --- Main Component ---
function MyContentLibraryScreen({
    showMessage,
    setActiveScreen,
    currentUser,
    creatorProfile,
    setCreatorProfile, // This prop is now required
    setShowConfirmationModal,
    setConfirmationTitle,
    setConfirmationMessage,
    setOnConfirmationAction,
    handleVideoPress
}) {
    // --- STATE MANAGEMENT ---
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [videoLinkInput, setVideoLinkInput] = useState('');
    const [contentType, setContentType] = useState('');
    const [isPublishing, setIsPublishing] = useState(false);
    const [customThumbnailFile, setCustomThumbnailFile] = useState(null);
    const [customThumbnailPreview, setCustomThumbnailPreview] = useState('');
    const [autoThumbnailPreview, setAutoThumbnailPreview] = useState('');
    const thumbnailFileInputRef = useRef(null);
    const [availableCategories, setAvailableCategories] = useState([]);
    const [libraryItems, setLibraryItems] = useState([]);
    const [loadingLibrary, setLoadingLibrary] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLibraryExpanded, setIsLibraryExpanded] = useState(true);
    const [isUpdatingPin, setIsUpdatingPin] = useState(null);
    const [isUpdatingFeature, setIsUpdatingFeature] = useState(null); // New state for feature button
    const [showImageAdjustModal, setShowImageAdjustModal] = useState(false);
    const [imageFileToAdjust, setImageFileToAdjust] = useState(null);
    const [showManageModal, setShowManageModal] = useState(false);
    const [itemToManage, setItemToManage] = useState(null);
    const appId = "production-app-id"; // Corrected appId

    // --- DATA FETCHING EFFECTS ---
    useEffect(() => {
        const categoriesRef = collection(db, "content_categories");
        const q = query(categoriesRef, where("isActive", "==", true), orderBy("orderIndex", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedCategories = snapshot.docs.map(doc => doc.data().name).filter(name => name !== 'Live Feed' && name !== 'Live Premieres');
            setAvailableCategories(fetchedCategories);
            if (fetchedCategories.length > 0 && !contentType) {
                setContentType(fetchedCategories[0]);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!currentUser) return;
        setLoadingLibrary(true);
        const contentRef = collection(db, `artifacts/${appId}/public/data/content_items`);
        const q = query(contentRef, where('creatorId', '==', currentUser.uid), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setLibraryItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoadingLibrary(false);
        });
        return () => unsubscribe();
    }, [currentUser]);

    useEffect(() => {
        setAutoThumbnailPreview('');
        if (!videoLinkInput) return;
        const handler = setTimeout(() => {
            const { thumbnailUrl } = extractVideoInfo(videoLinkInput);
            if (thumbnailUrl && thumbnailUrl !== 'https://placehold.co/300x200/2A2A2A/FFF?text=NVA') {
                setAutoThumbnailPreview(thumbnailUrl);
            } else {
                setAutoThumbnailPreview('');
            }
        }, 600);
        return () => clearTimeout(handler);
    }, [videoLinkInput]);

    // --- THIS IS THE FIX: Automatically clean up the blob URL when the user navigates away ---
    useEffect(() => {
        // This return function is the "cleanup" function.
        // It runs automatically when the component is unmounted (i.e., when you leave the screen).
        return () => {
            if (customThumbnailPreview && customThumbnailPreview.startsWith('blob:')) {
                URL.revokeObjectURL(customThumbnailPreview);
            }
        };
    }, [customThumbnailPreview]); // This effect depends on the preview URL.

    // --- DERIVED STATE ---
    const sortedAndFilteredItems = useMemo(() => {
        if (!creatorProfile) return [];
        const pinnedIds = new Set(creatorProfile.pinnedContent || []);
        return libraryItems
            .filter(item => item.title.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => {
                const aIsPinned = pinnedIds.has(a.id);
                const bIsPinned = pinnedIds.has(b.id);
                if (aIsPinned && !bIsPinned) return -1;
                if (!aIsPinned && bIsPinned) return 1;
                return 0;
            });
    }, [libraryItems, searchTerm, creatorProfile]);

    const currentThumbnail = customThumbnailPreview || autoThumbnailPreview;

    // --- HANDLER FUNCTIONS ---
    const resetForm = () => {
        setTitle(''); setDescription(''); setVideoLinkInput('');
        setContentType(availableCategories.length > 0 ? availableCategories[0] : '');
        setCustomThumbnailFile(null);
        // THE FIX: Explicitly revoke the old blob URL to release browser memory
        if (customThumbnailPreview && customThumbnailPreview.startsWith('blob:')) {
            URL.revokeObjectURL(customThumbnailPreview);
        }
        setCustomThumbnailPreview('');
        setAutoThumbnailPreview('');
        if (thumbnailFileInputRef.current) thumbnailFileInputRef.current.value = null;
    };
    
    const handleThumbnailFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            // THE FIX: Create a blob URL here, just like the working component.
            setImageFileToAdjust(URL.createObjectURL(file));
            setShowImageAdjustModal(true);
        }
    };
    
    const handleThumbnailSave = (adjustedBlob) => {
        const newFile = new File([adjustedBlob], "custom_thumbnail.png", { type: "image/png" });
        setCustomThumbnailFile(newFile);
        setCustomThumbnailPreview(URL.createObjectURL(newFile));
        setShowImageAdjustModal(false);
        setImageFileToAdjust(null);
        // THE FIX: Add the crucial line to reset the file input, ensuring a clean state every time.
        if (thumbnailFileInputRef.current) {
            thumbnailFileInputRef.current.value = null;
        }
    };

    const handleThumbnailCancel = () => {
        // THE FIX: Clean up the blob URL when the modal is cancelled.
        if (customThumbnailPreview && customThumbnailPreview.startsWith('blob:')) {
            URL.revokeObjectURL(customThumbnailPreview);
        }
        setCustomThumbnailPreview(''); // Also clear the preview state
        setImageFileToAdjust(null); 
        setShowImageAdjustModal(false);
        if (thumbnailFileInputRef.current) thumbnailFileInputRef.current.value = null;
    };

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
            const updateFunction = httpsCallable(functions, 'updateContentDetails');
            await updateFunction({
                appId: appId,
                contentId: contentId,
                updates: updates
            });
            // The backend now handles all data synchronization.
            // The onSnapshot listener in App.jsx will automatically update the UI.
            showMessage("Content updated successfully!");
        } catch (error) {
            showMessage(`Update failed: ${error.message}`);
            // Re-throw the error so the modal knows the save failed.
            throw error;
        }
    }; 

    // --- CORRECTED ACTION HANDLERS ---
    const handleAddToLibrary = async () => {
        if (!title.trim() || !contentType || !videoLinkInput.trim()) {
            showMessage('Title, Content Type, and a URL are required.');
            return;
        }
        // Use auto-preview only if no custom file is provided.
        if (!customThumbnailFile && !autoThumbnailPreview) {
            showMessage("Could not get a thumbnail from this URL. Please upload a custom image to continue.");
            return;
        }

        setIsPublishing(true);
        let finalThumbnailUrl = autoThumbnailPreview; // Default to the auto-fetched thumbnail.

        try {
            // THE FIX: If a custom thumbnail file exists, upload it to Storage first.
            if (customThumbnailFile) {
                showMessage("Uploading thumbnail...");
                const filePath = `content_thumbnails/${currentUser.uid}/${Date.now()}-${customThumbnailFile.name}`;
                const storageRef = ref(storage, filePath);
                const uploadResult = await uploadBytes(storageRef, customThumbnailFile);
                finalThumbnailUrl = await getDownloadURL(uploadResult.ref); // Get the permanent URL.
                showMessage("Thumbnail uploaded successfully!");
            }

            const addContentFunction = httpsCallable(functions, 'addContentToLibrary');
            await addContentFunction({
                appId: appId,
                contentData: {
                    title: title.trim(),
                    description: description.trim(),
                    mainUrl: videoLinkInput,
                    customThumbnailUrl: finalThumbnailUrl, // ALWAYS send a permanent URL.
                    contentType: contentType,
                    creatorName: creatorProfile.creatorName,
                    creatorProfilePictureUrl: creatorProfile.profilePictureUrl || ''
                }
            });

            showMessage(`"${title.trim()}" was added to your library.`);
            resetForm();
        } catch (error) {
            showMessage(`Failed to save content: ${error.message}`);
        } finally {
            setIsPublishing(false);
        }
    };
    
    const handleTogglePin = async (itemToPin) => {
        setIsUpdatingPin(itemToPin.id);
        try {
            const togglePinFunction = httpsCallable(functions, 'togglePinStatus');
            const result = await togglePinFunction({ contentId: itemToPin.id });
            // Optimistically update UI - NOTE: This requires setCreatorProfile from App.jsx
            const isCurrentlyPinned = creatorProfile?.pinnedContent?.includes(itemToPin.id);
            const updatedPins = isCurrentlyPinned
                ? (creatorProfile.pinnedContent || []).filter(id => id !== itemToPin.id)
                : [...(creatorProfile.pinnedContent || []), itemToPin.id];
            if (setCreatorProfile) {
                setCreatorProfile(prev => ({ ...prev, pinnedContent: updatedPins }));
            }
            showMessage(result.data.message);
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsUpdatingPin(null);
        }
    };

    const handleSetFeatured = async (itemToFeature) => {
        setIsUpdatingFeature(itemToFeature.id);
        try {
            const setFeaturedFunction = httpsCallable(functions, 'setFeaturedContent');
            const result = await setFeaturedFunction({ contentId: itemToFeature.id, appId: appId });
            showMessage(result.data.message);
        } catch (error) { showMessage(`Error: ${error.message}`);
        } finally { setIsUpdatingFeature(null); }
    };

    const handleRemoveFeatured = async () => {
        if (!creatorProfile.featuredVideoLink) return;
        setIsUpdatingFeature(creatorProfile.featuredVideoLink.liveFeedContentId);
        try {
            const removeFeaturedFunction = httpsCallable(functions, 'removeFeaturedContent');
            const result = await removeFeaturedFunction({ appId: appId });
            showMessage(result.data.message);
        } catch (error) { showMessage(`Error: ${error.message}`);
        } finally { setIsUpdatingFeature(null); }
    };

    const handleDelete = (itemToDelete) => {
        setConfirmationTitle("Delete Content?");
        setConfirmationMessage(`Are you sure you want to permanently delete "${itemToDelete.title}"? This cannot be undone.`);
        setOnConfirmationAction(() => async () => {
            try {
                const deleteFunction = httpsCallable(functions, 'deleteContentItem');
                await deleteFunction({ contentId: itemToDelete.id, appId: appId });
                showMessage("Content deleted successfully.");
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };

    if (!creatorProfile) {
        return <div className="screenContainer"><p className="heading">Loading...</p></div>;
    }

    return (
        <>
            <div className="screenContainer">
                <p className="heading">My Content Library</p>
                <p className="subHeading">Add to your portfolio and manage what's featured on your profile.</p>
                
                <div className="dashboardSection">
                    <p className="dashboardSectionTitle">Add New Content to Library</p>
                    <div className="videoLinkSection">
                        <div className="formGroup"><label htmlFor="contentTitle" className="formLabel">Title:</label><input type="text" id="contentTitle" className="formInput" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
                        <div className="formGroup"><label htmlFor="contentDescription" className="formLabel">Description (Optional):</label><textarea id="contentDescription" className="formTextarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A brief summary of your content"></textarea></div>
                        <div className="formGroup"><label htmlFor="contentType" className="formLabel">Content Type:</label><select id="contentType" className="formInput" value={contentType} onChange={(e) => setContentType(e.target.value)} required><option value="" disabled>-- Select a Category --</option>{availableCategories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}</select></div>
                        <div className="formGroup"><label htmlFor="videoLinkInput" className="formLabel">URL:</label><input type="url" id="videoLinkInput" className="formInput" value={videoLinkInput} onChange={(e) => setVideoLinkInput(e.target.value)} placeholder="Paste your video link here" /></div>
                        {currentThumbnail && <img src={currentThumbnail} alt="Thumbnail Preview" style={{maxWidth: '200px', borderRadius: '8px', marginBottom: '10px'}} />}
                        <div className="formGroup"><label className="formLabel">Custom Thumbnail (Overrides Preview):</label><input type="file" ref={thumbnailFileInputRef} onChange={handleThumbnailFileSelect} accept="image/*" style={{display: 'none'}} /><button type="button" className="button" onClick={() => thumbnailFileInputRef.current.click()} style={{width: '100%', backgroundColor: '#3A3A3A'}}><span className="buttonText light">Upload Custom Image</span></button></div>
                        <div className="videoActions"><button className="adminActionButton approve" onClick={handleAddToLibrary} disabled={isPublishing}>{isPublishing ? 'Saving...' : 'Add to Library'}</button></div>
                    </div>
                </div>

                <div className="dashboardSection" style={{ marginTop: '20px' }}>
                    <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsLibraryExpanded(!isLibraryExpanded)}>
                        <p className="dashboardSectionTitle" style={{ marginBottom: 0 }}>My Uploads ({libraryItems.length})</p>
                        <span className="text-xl font-bold text-white">{isLibraryExpanded ? '▼' : '▶'}</span>
                    </div>
                    <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isLibraryExpanded ? 'max-h-[5000px] mt-4' : 'max-h-0'}`}>
                        <div className="formGroup"><input type="text" className="formInput" placeholder="Search your library by title..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                        <div className="dashboardContentList" style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '10px' }}>
                            {loadingLibrary ? <p>Loading content...</p> : 
                                sortedAndFilteredItems.length === 0 ? <p className="dashboardItem">{searchTerm ? `No content matches "${searchTerm}".` : 'Your library is empty.'}</p> :
                                sortedAndFilteredItems.map(item => {
                                    const isPinned = creatorProfile?.pinnedContent?.includes(item.id);
                                    const isFeatured = creatorProfile.featuredVideoLink?.liveFeedContentId === item.id;
                                    return (
                                        <div key={item.id} className="library-item-card">
                                            <button className={`pin-icon-button ${isPinned ? 'pinned' : ''}`} onClick={() => handleTogglePin(item)} disabled={isUpdatingPin === item.id} title={isPinned ? 'Unpin from profile' : 'Pin to profile'}>
                                                <svg className="pin-svg" viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"></path></svg>
                                            </button>
                                            <div className="library-item-content">
                                                <img src={item.customThumbnailUrl} alt={item.title} className="library-item-thumbnail" onClick={() => handleVideoPress(item.embedUrl || item.mainUrl, item)} />
                                                <div className="library-item-info">
                                                    <p className="library-item-title">{item.title}</p>
                                                    <p className="library-item-status">Type: {item.contentType}{isPinned && <span style={{ color: '#FFD700', fontWeight: 'bold' }}> • Pinned</span>}{isFeatured && <span style={{ color: '#00FF00', fontWeight: 'bold' }}> • Featured</span>}</p>
                                                </div>
                                            </div>
                                            <div style={{ padding: '10px 0 5px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '15px', borderTop: '1px solid #2A2A2A', marginTop: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#AAA', fontSize: '12px' }}><svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'currentColor' }}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zM12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg><span>{item.viewCount || 0} Views</span></div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#AAA', fontSize: '12px' }}><svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: '#FFD700' }}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg><span>{item.likeCount || 0} Likes</span></div>
                                            </div>
                                            <div className="videoActions" style={{marginTop: '10px'}}>
                                                {isFeatured ? (
                                                    <button className="actionButton" onClick={handleRemoveFeatured} disabled={isUpdatingFeature === item.id} style={{backgroundColor: '#FF8C00'}}>Remove Featured</button>
                                                ) : (
                                                    <button 
                                                        className="actionButton" 
                                                        onClick={() => handleSetFeatured(item)} 
                                                        disabled={isUpdatingFeature === item.id} 
                                                        style={{
                                                            backgroundColor: '#4F46E5', // Indigo color
                                                            color: '#FFFFFF',
                                                            boxShadow: '0 0 8px rgba(79, 70, 229, 0.8)', // Glow effect
                                                            border: '1px solid #6366F1'
                                                        }}>
                                                        Set as Featured
                                                    </button>
                                                )}
                                                <button className="actionButton" onClick={() => handleOpenManageModal(item)}>Manage</button>
                                                <button className="actionButton remove" onClick={() => handleDelete(item)}>Delete</button>
                                            </div>
                                        </div>
                                    );
                                })
                            }
                        </div>
                    </div>
                </div>
                <button className="button" onClick={() => setActiveScreen('CreatorDashboard')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}><span className="buttonText light">Back to Dashboard</span></button>
            </div>
            
           {showImageAdjustModal && imageFileToAdjust && (
                <ThumbnailAdjustModal 
                    imageUrl={imageFileToAdjust}
                    onSave={handleThumbnailSave}
                    onCancel={handleThumbnailCancel}
                    showMessage={showMessage}
                    isUploading={isPublishing}
                />
            )}
            {showManageModal && (
                <ManageContentModal
                    item={itemToManage}
                    onSave={handleSaveChanges}
                    onClose={handleCloseManageModal}
                    showMessage={showMessage}
                />
            )}
        </>
    );
}

export default MyContentLibraryScreen;