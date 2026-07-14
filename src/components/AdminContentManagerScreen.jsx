// src/components/AdminContentManagerScreen.jsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, functions, httpsCallable, storage, ref, uploadBytes, getDownloadURL, extractVideoInfo } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
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
    const [isScraping, setIsScraping] = useState(false); // Tracks auto-pulling state
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

    // --- Dynamic Header Ad states ---
    const [showAdManager, setShowAdManager] = useState(false);
    const [adTitle, setAdTitle] = useState('');
    const [adUrl, setAdUrl] = useState('');
    const [adDescription, setAdDescription] = useState('');
    const [adExpiresAt, setAdExpiresAt] = useState('');
    const [adFile, setAdFile] = useState(null);
    const [adPreview, setAdPreview] = useState('');
    const [adUploading, setAdUploading] = useState(false);
    const adFileInputRef = useRef(null);

    useEffect(() => {
        if (showAdManager) {
            const fetchAd = async () => {
                const docSnap = await getDoc(doc(db, "settings", "headerAd"));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setAdTitle(data.title || '');
                    setAdUrl(data.destinationUrl || '');
                    setAdDescription(data.description || '');
                    setAdPreview(data.imageUrl || '');
                    
                    // Pre-fill local date format for HTML datetime-local input safely
                    if (data.expiresAt) {
                        try {
                            const dateObj = new Date(data.expiresAt);
                            // Formats as YYYY-MM-DDTHH:MM
                            const formattedDate = dateObj.toISOString().slice(0, 16);
                            setAdExpiresAt(formattedDate);
                        } catch(e) { setAdExpiresAt(''); }
                    } else {
                        setAdExpiresAt('');
                    }
                }
            };
            fetchAd();
        }
    }, [showAdManager]);

    // Live Thumbnail Extractor Listener for Ads
    useEffect(() => {
        if (adFile) {
            const objectUrl = URL.createObjectURL(adFile);
            setAdPreview(objectUrl);
            return () => URL.revokeObjectURL(objectUrl);
        }
        
        if (!adUrl) {
            return;
        }

        const handler = setTimeout(() => {
            const videoInfo = extractVideoInfo(adUrl);
            // Only overwrite preview if a valid, non-placeholder thumbnail is successfully resolved
            if (videoInfo && videoInfo.thumbnailUrl && videoInfo.thumbnailUrl !== 'https://placehold.co/300x200/2A2A2A/FFF?text=NVA') {
                setAdPreview(videoInfo.thumbnailUrl);
            }
        }, 800);

        return () => clearTimeout(handler);
    }, [adUrl, adFile]);

    const handleDeleteHeaderAd = () => {
        setConfirmationTitle("Delete Billboard Ad?");
        setConfirmationMessage("Are you sure you want to permanently delete the current header billboard? This action cannot be undone.");
        setOnConfirmationAction(() => async () => {
            setAdUploading(true);
            showMessage("Deleting billboard...");
            try {
                await deleteDoc(doc(db, "settings", "headerAd"));
                setAdTitle('');
                setAdUrl('');
                setAdDescription('');
                setAdPreview('');
                setAdExpiresAt('');
                setAdFile(null);
                showMessage("Header Billboard Deleted!");
                setShowAdManager(false);
            } catch (err) {
                showMessage("Failed to delete billboard: " + err.message);
            } finally {
                setAdUploading(false);
            }
        });
        setShowConfirmationModal(true);
    };

    const handleSaveHeaderAd = async (e) => {
        e.preventDefault();
        setAdUploading(true);
        showMessage("Updating Header Billboard...");
        try {
            let finalImgUrl = adPreview;
            if (adFile) {
                const storageRef = ref(storage, `curated_thumbnails/headerAd_${Date.now()}`);
                const snap = await uploadBytes(storageRef, adFile);
                finalImgUrl = await getDownloadURL(snap.ref);
            }
            await setDoc(doc(db, "settings", "headerAd"), {
                title: adTitle.trim(),
                destinationUrl: (adUrl || '').trim(),
                description: adDescription.trim(),
                imageUrl: finalImgUrl,
                expiresAt: adExpiresAt ? new Date(adExpiresAt).toISOString() : null,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            showMessage("Header Ad Banner Saved!");
            setShowAdManager(false);
        } catch(err) {
            showMessage("Failed to save banner: " + err.message);
        } finally {
            setAdUploading(false);
        }
    };

    // --- NEW STATE for Search and Filter ---
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('All');

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

    // --- NEW FILTERING LOGIC ---
    const filteredContentItems = useMemo(() => {
        return contentItems.filter(item => {
            const searchTermLower = searchTerm.toLowerCase();
            const matchesSearchTerm = (
                item.title?.toLowerCase().includes(searchTermLower) ||
                item.creatorName?.toLowerCase().includes(searchTermLower)
            );
            const matchesFilterType = (
                filterType === 'All' || 
                item.contentType === filterType
            );
            return matchesSearchTerm && matchesFilterType;
        });
    }, [contentItems, searchTerm, filterType]);

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
        
        // Automated TikTok server-side scraper integration [1.1.2]
        const handlePull = async () => {
            setIsScraping(true); // Start active scanning state
            const videoInfo = extractVideoInfo(mainUrl);
            if (videoInfo && videoInfo.thumbnailUrl && videoInfo.thumbnailUrl !== 'https://placehold.co/300x200/2A2A2A/FFF?text=NVA') {
                setThumbnailPreview(videoInfo.thumbnailUrl);
                setIsScraping(false);
            } else if (mainUrl.includes('tiktok.com')) {
                try {
                    const getTikTok = httpsCallable(functions, 'getTikTokThumbnail');
                    const res = await getTikTok({ url: mainUrl });
                    if (res.data.thumbnailUrl) {
                        setThumbnailPreview(res.data.thumbnailUrl);
                    }
                } catch (e) {
                    console.error("TikTok link scrape failed:", e);
                } finally {
                    setIsScraping(false);
                }
            } else {
                setThumbnailPreview('');
                setIsScraping(false);
            }
        };
        handlePull();
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

            <div className="dashboardSection" style={{ 
                background: 'rgba(255, 255, 255, 0.02)', 
                backdropFilter: 'blur(16px)', 
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)', 
                borderRadius: '16px', 
                padding: '24px', 
                marginTop: '25px',
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255,255,255,0.03)'
            }}>
                <p className="dashboardSectionTitle" style={{ color: '#FFF', margin: 0, fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ⚡ Home Screen Curation & Billboards
                </p>
                <p style={{ color: '#888', fontSize: '12px', marginTop: '6px', marginBottom: '20px', lineHeight: '1.4' }}>
                    Manually curate your featured lists, manage trending content, and configure the high-impact Header Billboard Ad banner.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    <button 
                        type="button" 
                        className="button" 
                        style={{ 
                            flex: '1 1 150px', margin: 0, padding: '12px',
                            background: 'rgba(255, 255, 255, 0.03)', 
                            border: '1px solid rgba(255, 255, 255, 0.1)', 
                            borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s'
                        }} 
                        onClick={() => openCurationModal('Featured')}
                    >
                        <span className="buttonText light" style={{ fontSize: '13px', fontWeight: 'bold' }}>Manage Featured</span>
                    </button>
                    <button 
                        type="button" 
                        className="button" 
                        style={{ 
                            flex: '1 1 150px', margin: 0, padding: '12px',
                            background: 'rgba(255, 255, 255, 0.03)', 
                            border: '1px solid rgba(255, 255, 255, 0.1)', 
                            borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s'
                        }} 
                        onClick={() => openCurationModal('Trending')}
                    >
                        <span className="buttonText light" style={{ fontSize: '13px', fontWeight: 'bold' }}>Manage Trending</span>
                    </button>
                    <button 
                        type="button" 
                        className="button" 
                        style={{ 
                            flex: '1 1 180px', margin: 0, padding: '12px',
                            background: 'rgba(0, 255, 255, 0.08)', 
                            border: '2px solid #00FFFF', 
                            borderRadius: '8px', cursor: 'pointer', 
                            boxShadow: '0 0 15px rgba(0, 255, 255, 0.15)',
                            transition: 'all 0.2s'
                        }} 
                        onClick={() => setShowAdManager(true)}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.15)';
                            e.currentTarget.style.boxShadow = '0 0 25px rgba(0, 255, 255, 0.3)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.08)';
                            e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 255, 255, 0.15)';
                        }}
                    >
                        <span className="buttonText" style={{ color: '#FFF', fontSize: '13px', fontWeight: '900', letterSpacing: '0.5px' }}>
                            📺 HEADER BILLBOARD AD
                        </span>
                    </button>
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
                            <label className="formLabel" style={isScraping ? { color: '#00FFFF', animation: 'pulse 1.5s infinite' } : {}}>
                                {isScraping ? "Scanning Link..." : "Final Thumbnail Preview:"}
                            </label>
                            <img src={thumbnailPreview} alt="Preview" style={{ maxWidth: '240px', borderRadius: '8px', marginTop: '5px', border: '1px solid #444', filter: isScraping ? 'brightness(0.3)' : 'none', transition: 'filter 0.3s' }} onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/240x135/555/FFF?text=No+Preview'; }} />
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
                    <p className="dashboardSectionTitle" style={{ marginBottom: 0 }}>Existing Content Items ({filteredContentItems.length} / {contentItems.length})</p>
                    <span className="text-xl font-bold text-white">{isContentListExpanded ? '▼' : '▶'}</span>
                </div>
                
                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isContentListExpanded ? 'max-h-[3000px] mt-4' : 'max-h-0'}`}>
                    <div className="pt-4 border-t" style={{borderColor: '#3A3A3A'}}>
                        
                        {/* --- START: NEW FILTER CONTROLS --- */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div className="formGroup">
                                <label htmlFor="searchTerm" className="formLabel">Search by Title or Creator:</label>
                                <input
                                    type="text"
                                    id="searchTerm"
                                    className="formInput"
                                    placeholder="Start typing..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="formGroup">
                                <label htmlFor="filterType" className="formLabel">Filter by Content Type:</label>
                                <select
                                    id="filterType"
                                    className="formInput"
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                >
                                    <option value="All">All Types</option>
                                    {availableCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {/* --- END: NEW FILTER CONTROLS --- */}

                        {loadingContent ? <p>Loading...</p> : (
                            <div className="dashboardContentList" style={{ maxHeight: '500px', overflowY: 'auto', paddingRight: '10px' }}>
                                {filteredContentItems.length > 0 ? filteredContentItems.map(item => (
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
                                )) : <p className="text-center text-gray-400 mt-4">No content items match your current filters.</p>}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ====== GLASSMORPHIC HEADER AD BILLBOARD MODAL ====== */}
            {showAdManager && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                    zIndex: 1900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
                }}>
                    <form onSubmit={handleSaveHeaderAd} style={{
                        background: 'rgba(26, 26, 26, 0.65)', border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)', borderRadius: '16px',
                        padding: '30px', width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '15px'
                    }}>
                        <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#00FFFF', margin: 0, textShadow: '0 0 10px rgba(0,255,255,0.3)' }}>📺 Header Billboard Ad Controller</p>
                        <p style={{ fontSize: '12px', color: '#AAA', margin: 0 }}>This ad displays directly in the top header on all devices. Keep it concise!</p>

                        <div className="formGroup">
                            <label className="formLabel">Ad Campaign Title:</label>
                            <input type="text" className="formInput" value={adTitle} onChange={(e) => setAdTitle(e.target.value)} placeholder="e.g., Buy Festival Tickets!" required />
                        </div>

                        <div className="formGroup">
                            <label className="formLabel">Destination URL (Optional):</label>
                            <input type="url" className="formInput" value={adUrl} onChange={(e) => setAdUrl(e.target.value)} placeholder="https://www.targetsite.com" />
                        </div>

                        <div className="formGroup">
                            <label className="formLabel">Description:</label>
                            <textarea className="formTextarea" value={adDescription} onChange={(e) => setAdDescription(e.target.value)} placeholder="Enter details..." rows="2" style={{ resize: 'none' }}></textarea>
                        </div>

                        <div className="formGroup">
                            <label className="formLabel">Optional Banner Expiration Date & Time:</label>
                            <input type="datetime-local" className="formInput" value={adExpiresAt} onChange={(e) => setAdExpiresAt(e.target.value)} style={{ margin: 0 }} />
                        </div>

                        <div className="formGroup">
                            <label className="formLabel">Flyer Image (Upload):</label>
                            {adPreview && (
                                <img src={adPreview} alt="Preview" style={{ width: '100%', maxHeight: '110px', objectFit: 'contain', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.15)', background: '#000', marginBottom: '10px' }} />
                            )}
                            <input type="file" ref={adFileInputRef} accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) {
                                    setAdFile(file);
                                    setAdPreview(URL.createObjectURL(file));
                                }
                            }} />
                            <button type="button" className="button" onClick={() => adFileInputRef.current.click()} style={{ background: '#3A3A3A', width: '100%', margin: 0 }}>
                                <span className="buttonText light">Choose Ad Image File</span>
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                                <button type="button" className="confirmationButton cancel" onClick={() => setShowAdManager(false)} style={{ flex: 1, padding: '12px' }} disabled={adUploading}>Cancel</button>
                                <button type="submit" className="confirmationButton confirm" style={{ flex: 1, padding: '12px', background: '#00FFFF', color: '#000', fontWeight: 'bold' }} disabled={adUploading}>
                                    {adUploading ? 'Uploading...' : 'Save & Publish Ad'}
                                </button>
                            </div>
                            {adPreview && (
                                <button type="button" className="adminActionButton reject" onClick={handleDeleteHeaderAd} style={{ width: '100%', margin: 0, padding: '10px' }} disabled={adUploading}>
                                    🗑️ Delete Billboard Ad Completely
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            )}
        </>
    );
}

export default AdminContentManagerScreen;