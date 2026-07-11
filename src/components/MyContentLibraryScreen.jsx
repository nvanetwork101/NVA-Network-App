// src/components/MyContentLibraryScreen.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, storage, functions, collection, query, where, orderBy, onSnapshot, httpsCallable, doc, updateDoc, setDoc } from '../firebase';

// Pinterest masonry slot aspect ratio configurations (Width / Height)
const SLOT_ASPECT_RATIOS = {
    0: 2 / 3,  // Tall large
    1: 2 / 1,  // Wide medium
    2: 1 / 2,  // Tall thin
    3: 1 / 2,  // Tall thin
    4: 4 / 1   // Ultra wide banner
};
import ThumbnailAdjustModal from './ThumbnailAdjustModal';
import ManageContentModal from './ManageContentModal';
import { extractVideoInfo } from '../firebase';
import { compressImage, uploadToR2 } from '../utils/r2Upload';

function MyContentLibraryScreen({
    showMessage,
    setActiveScreen,
    currentUser,
    creatorProfile,
    setCreatorProfile,
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
    const [contentType, setContentType] = useState('Film & Video'); 
    const [applyMonetization, setApplyMonetization] = useState(false); 
    const [isPublishing, setIsPublishing] = useState(false);
    const [customThumbnailFile, setCustomThumbnailFile] = useState(null);
    const [customThumbnailPreview, setCustomThumbnailPreview] = useState('');
    const [autoThumbnailPreview, setAutoThumbnailPreview] = useState('');
    const thumbnailFileInputRef = useRef(null);
    
    const [availableCategories, setAvailableCategories] = useState([]);

    // (Duplicate useEffect removed to prevent category state conflicts)
    
    const [libraryItems, setLibraryItems] = useState([]);
    const [loadingLibrary, setLoadingLibrary] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLibraryExpanded, setIsLibraryExpanded] = useState(true);
    const [isUpdatingPin, setIsUpdatingPin] = useState(null);
    const [isUpdatingFeature, setIsUpdatingFeature] = useState(null);
    const [showImageAdjustModal, setShowImageAdjustModal] = useState(false);
    const [imageFileToAdjust, setImageFileToAdjust] = useState(null);
    const [showManageModal, setShowManageModal] = useState(false);
    const [itemToManage, setItemToManage] = useState(null);
    const appId = "production-app-id";

    // --- STUDIO GALLERY STATE ---
    const [isUploadingGallery, setIsUploadingGallery] = useState(false);
    const galleryInputRef = useRef(null);
    const [activeGallerySlot, setActiveGallerySlot] = useState(null);
    const [galleryAdjustments, setGalleryAdjustments] = useState({});

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

    useEffect(() => {
        return () => {
            if (customThumbnailPreview && customThumbnailPreview.startsWith('blob:')) {
                URL.revokeObjectURL(customThumbnailPreview);
            }
        };
    }, [customThumbnailPreview]);

    // --- DERIVED STATE & ROLE LOGIC ---
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

    // Evaluate dynamic role color out here to keep JSX clean
    const roleColor = useMemo(() => {
        const roleColors = {
            'Comedian': '#FF4500', 'Craft': '#D2691E', 'Health & Fitness': '#20B2AA',
            'Designer': '#FF1493', 'Influencer': '#00BFFF', 'Poet': '#9370DB',
            'Musician': '#32CD32', 'Filmmaker': '#FFD700', 'Actor': '#DC143C'
        };
        return roleColors[creatorProfile?.creatorField] || '#444444';
    }, [creatorProfile]);

    // --- HANDLER FUNCTIONS ---
    const resetForm = () => {
        setTitle(''); setDescription(''); setVideoLinkInput('');
        setContentType(availableCategories.length > 0 ? availableCategories[0] : '');
        setCustomThumbnailFile(null);
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
            setImageFileToAdjust(URL.createObjectURL(file));
            setShowImageAdjustModal(true);
        }
    };
    
    const handleThumbnailSave = (adjustedBlob) => {
        const newFile = new File([adjustedBlob], "custom_thumbnail.jpg", { type: "image/jpeg" });
        setCustomThumbnailFile(newFile);
        setCustomThumbnailPreview(URL.createObjectURL(newFile));
        setShowImageAdjustModal(false);
        setImageFileToAdjust(null);
        if (thumbnailFileInputRef.current) {
            thumbnailFileInputRef.current.value = null;
        }
    };

    const handleThumbnailCancel = () => {
        if (customThumbnailPreview && customThumbnailPreview.startsWith('blob:')) {
            URL.revokeObjectURL(customThumbnailPreview);
        }
        setCustomThumbnailPreview('');
        setImageFileToAdjust(null); 
        setShowImageAdjustModal(false);
        if (thumbnailFileInputRef.current) thumbnailFileInputRef.current.value = null;
    };

    const triggerGalleryUpload = (slotIndex) => {
        setActiveGallerySlot(slotIndex);
        if (galleryInputRef.current) galleryInputRef.current.click();
    };

    const handleGalleryFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFileToAdjust(URL.createObjectURL(file));
            setShowImageAdjustModal(true);
        }
    };

    const handleGallerySave = async (adjustedBlob, finalScale, finalPosition) => {
        setIsUploadingGallery(true);
        showMessage("Saving and uploading cropped image...");
        try {
            // iOVERLORD: CLOUDFLARE R2 STATIC OVERWRITE
            const filePath = `studio_gallery/${currentUser.uid}/slot_${activeGallerySlot}.jpg`;
            
            // 1. Convert blob to File and compress natively
            const rawFile = new File([adjustedBlob], `slot_${activeGallerySlot}.jpg`, { type: 'image/jpeg' });
            const compressedFile = await compressImage(rawFile, 1080, 0.85);
            
            // 2. Centralized R2 Upload (Handles PUT and returns cache-busted URL)
            const url = await uploadToR2(compressedFile, filePath, functions);

            const currentGallery = creatorProfile.studioGallery || {};
            const updatedGallery = { ...currentGallery, [activeGallerySlot]: url };
            
            // Safe merge save in Firestore with authorized rules fields
            await setDoc(doc(db, "creators", currentUser.uid), {
                studioGallery: updatedGallery
            }, { merge: true });

            // Store current crop settings in local memory state for seamless tweaks
            setGalleryAdjustments(prev => ({
                ...prev,
                [activeGallerySlot]: { scale: finalScale, position: finalPosition }
            }));
            
            if (setCreatorProfile) {
                setCreatorProfile(prev => ({ ...prev, studioGallery: updatedGallery }));
            }
            showMessage("Studio Gallery updated successfully!");
        } catch (err) {
            console.error("Gallery Save Error:", err);
            showMessage(`Save failed: ${err.message}`);
        } finally {
            setIsUploadingGallery(false);
            setActiveGallerySlot(null);
            setShowImageAdjustModal(false);
            setImageFileToAdjust(null);
            if (galleryInputRef.current) galleryInputRef.current.value = null;
        }
    };

    const handleGalleryCancel = () => {
        setActiveGallerySlot(null);
        setShowImageAdjustModal(false);
        setImageFileToAdjust(null);
        if (galleryInputRef.current) galleryInputRef.current.value = null;
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
            showMessage("Content updated successfully!");
        } catch (error) {
            showMessage(`Update failed: ${error.message}`);
            throw error;
        }
    }; 

    const handleAddToLibrary = async () => {
        if (!title.trim() || !contentType || !videoLinkInput.trim()) {
            showMessage('Title, Content Type, and a URL are required.');
            return;
        }
        if (!customThumbnailFile && !autoThumbnailPreview) {
            showMessage("Could not get a thumbnail from this URL. Please upload a custom image.");
            return;
        }

        setIsPublishing(true);
        let finalThumbnailUrl = autoThumbnailPreview;

        const getCreatorArtisticRole = () => {
            if (!creatorProfile) return 'Artist';
            const knownRoles = ['Actor', 'Comedian', 'Designer', 'Filmmaker', 'Influencer', 'Musician', 'Poet', 'Voice Artist'];
            const searchFields = [
                creatorProfile.talent,
                creatorProfile.talentRole,
                creatorProfile.artisticRole,
                creatorProfile.creatorRole,
                ...(Array.isArray(creatorProfile.talents) ? creatorProfile.talents : []),
                ...(Array.isArray(creatorProfile.roles) ? creatorProfile.roles : [])
            ];
            
            for (const val of searchFields) {
                if (typeof val === 'string') {
                    const matched = knownRoles.find(r => r.toLowerCase() === val.toLowerCase());
                    if (matched) return matched;
                }
            }
            return 'Artist'; 
        };

        try {
            if (customThumbnailFile) {
                showMessage("Compressing and uploading thumbnail to R2...");
                
                // 1. Native Compression (1080px max, 0.85 quality)
                const compressedFile = await compressImage(customThumbnailFile, 1080, 0.85);
                
                // 2. Clean, strict path format. The backend onContentDeleted hook will purge this exact path later.
                const thumbnailId = `thumb_${Date.now()}`;
                const filePath = `content_thumbnails/${currentUser.uid}/${thumbnailId}.jpg`;
                
                // 3. Centralized R2 Upload (Handles secure handshake and PUT)
                // We strip the ?t= timestamp for clean database storage since this is brand new content, not an overwrite.
                const rawUrl = await uploadToR2(compressedFile, filePath, functions);
                finalThumbnailUrl = rawUrl.split('?')[0]; 
                
                showMessage("Thumbnail uploaded successfully!");
            }

            const addContentFunction = httpsCallable(functions, 'addContentToLibrary');
            await addContentFunction({
                appId: appId,
                contentData: {
                    title: title.trim(),
                    description: description.trim(),
                    mainUrl: videoLinkInput,
                    customThumbnailUrl: finalThumbnailUrl,
                    contentType: contentType,
                    creatorName: creatorProfile.creatorName,
                    creatorProfilePictureUrl: creatorProfile.profilePictureUrl || '',
                    creatorRole: getCreatorArtisticRole(),
                    isActive: applyMonetization ? false : true, // Explicit Boolean logic
                    monetizationStatus: applyMonetization ? 'pending' : 'none',
                    isMonetizationRequest: applyMonetization,
                    isFeatured: false // Hard-lock: Ensures upload never auto-publishes to Showcase
                }
            });

            if (applyMonetization) {
                showMessage("Video submitted for monetization review. You will be notified once it is approved and launched!");
            } else {
                showMessage(`"${title.trim()}" was added to your library.`);
            }
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

    const modernStyles = `
        .glass-panel { background: rgba(30, 30, 30, 0.5); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3); }
        
        /* ===== UNIFIED ATELIER CONTAINER ===== */
        .atelier-container {
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 24px;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        }

        /* ===== UNIFIED ATELIER WRAPPING GRID (No Scrollbar) ===== */
        .atelier-grid { 
            display: grid; 
            grid-template-columns: repeat(3, 1fr); 
            gap: 15px; 
            width: 100%;
        }
        @media (max-width: 1024px) { .atelier-grid { grid-template-columns: repeat(2, 1fr); gap: 10px;} }

        /* ===== PINNED CARD — GOLD FRAME ===== */
        .atelier-card.pinned-card { border: 2px solid #FFD700 !important; box-shadow: 0 0 20px rgba(255, 215, 0, 0.2); }
        .atelier-card.pinned-card::before { content: 'PINNED'; position: absolute; top: 8px; left: 50%; transform: translateX(-50%); background: #FFD700; color: #000; font-size: 8px; font-weight: 900; padding: 2px 10px; border-radius: 100px; z-index: 10; }

        .atelier-card { 
            transition: all 0.3s ease; 
            position: relative; 
            overflow: hidden; 
            border-radius: 12px; 
            cursor: pointer; 
            display: flex; 
            flex-direction: column;
            background: #111111; 
            border: 1px solid #333;
        }
        .atelier-card:hover { transform: translateY(-4px); box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
        .atelier-card img { width: 100%; height: auto; display: block; transition: transform 0.5s ease; }
        .atelier-card:hover img { transform: scale(1.05); }
        
        .atelier-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 40%, transparent 70%); opacity: 0; transition: opacity 0.3s ease; display: flex; flex-direction: column; justify-content: flex-end; padding: 16px; pointer-events: none; }
        .atelier-card:hover .atelier-overlay { opacity: 1; pointer-events: auto; }
        
        .atelier-title { color: #FFF; font-size: 15px; font-weight: 700; margin: 0 0 6px 0; line-height: 1.2; }
        .atelier-meta { color: #FFD700; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px 0; }
        .atelier-actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .atelier-actions .btn-pills { font-size: 9px; padding: 5px 10px; }
        
        .atelier-pin { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 5; transition: all 0.2s; opacity: 0; }
        .atelier-card:hover .atelier-pin { opacity: 1; }
        .atelier-pin.pinned { opacity: 1; background: rgba(255,215,0,0.2); }
        .atelier-pin.pinned svg { fill: #FFD700; }
        
        .atelier-badge { position: absolute; top: 10px; left: 10px; background: rgba(255, 215, 0, 0.15); backdrop-filter: blur(4px); border: 1px solid rgba(255, 215, 0, 0.3); color: #FFD700; font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.08em; z-index: 5; }

        /* ===== BUTTON COLORS (RESTORED) ===== */
        .btn-pills { padding: 6px 14px; border-radius: 100px; font-size: 10px; font-weight: 800; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid; transition: all 0.2s; text-align: center; display: inline-block; width: auto; }
        .btn-featured-active { background: rgba(255, 140, 0, 0.1); border-color: rgba(255, 140, 0, 0.4); color: #FF8C00; }
        .btn-featured-active:hover { background: #FF8C00; color: #000; }
        .btn-featured-set { background: rgba(79, 70, 229, 0.1); border-color: rgba(79, 70, 229, 0.4); color: #818CF8; box-shadow: 0 0 10px rgba(79, 70, 229, 0.2); }
        .btn-featured-set:hover { background: #4F46E5; color: #FFF; box-shadow: 0 0 15px rgba(79, 70, 229, 0.5); }
        .btn-manage { background: rgba(255, 255, 255, 0.03); border-color: rgba(255, 255, 255, 0.15); color: #DDD; }
        .btn-manage:hover { background: #FFF; color: #000; }
        .btn-delete { background: rgba(220, 53, 69, 0.1); border-color: rgba(220, 53, 69, 0.4); color: #DC3545; }
        .btn-delete:hover { background: #DC3545; color: #FFF; }
        
        .library-item-thumbnail { width: 100%; aspect-ratio: 4/5; object-fit: cover; background: #0a0a0a; cursor: pointer; border-bottom: 1px solid #222; }
        
        .pin-icon-button { position: absolute; top: 15px; right: 15px; background: none; border: none; cursor: pointer; color: #555; transition: color 0.2s; }
        .pin-icon-button.pinned { color: #FFD700; filter: drop-shadow(0 0 4px rgba(255, 215, 0, 0.5)); }
        .pin-svg { width: 18px; height: 18px; fill: currentColor; }

        /* ===== STUDIO GALLERY (PINTEREST MASONRY) ===== */
        .studio-gallery-grid { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 100px; gap: 12px; margin-top: 15px; }
        .gallery-slot { background: rgba(255,255,255,0.03); border-radius: 16px; overflow: hidden; position: relative; border: 1px dashed rgba(255,255,255,0.15); display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s ease; }
        .gallery-slot:hover { border-color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.08); }
        .gallery-slot img { width: 100%; height: 100%; object-fit: cover; }
        .slot-0 { grid-column: span 2; grid-row: span 3; } 
        .slot-1 { grid-column: span 2; grid-row: span 1; } 
        .slot-2 { grid-column: span 1; grid-row: span 2; } 
        .slot-3 { grid-column: span 1; grid-row: span 2; } 
        .slot-4 { grid-column: span 4; grid-row: span 1; } 
        .slot-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.6); display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; color: #FFF; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; backdrop-filter: blur(2px); }
        .gallery-slot:hover .slot-overlay { opacity: 1; }
        @media (max-width: 768px) { .studio-gallery-grid { grid-auto-rows: 70px; gap: 8px; } }
    `;

    return (
        <>
            <style>{modernStyles}</style>
            <div className="screenContainer" style={{ paddingBottom: '40px' }}>
                <p className="heading">My Content Library</p>
                <p className="subHeading" style={{ marginBottom: '24px' }}>Add to your portfolio and manage what's featured on your profile.</p>
                
                {/* GLASS-PANEL ADD CONTENT FORM */}
                <div className="glass-panel">
                    <p className="dashboardSectionTitle" style={{ color: '#FFD700', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>🎬 Add New Content to Library</p>
                    <div className="videoLinkSection">
                        <div className="formGroup"><label htmlFor="contentTitle" className="formLabel">Title:</label><input type="text" id="contentTitle" className="formInput" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
                        <div className="formGroup"><label htmlFor="contentDescription" className="formLabel">Description (Optional):</label><textarea id="contentDescription" className="formTextarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A brief summary of your content"></textarea></div>
                        <div className="formGroup"><label htmlFor="contentType" className="formLabel">Content Type:</label><select id="contentType" className="formInput" value={contentType} onChange={(e) => setContentType(e.target.value)} required><option value="" disabled>-- Select a Category --</option>{availableCategories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}</select></div>
                        <div className="formGroup"><label htmlFor="videoLinkInput" className="formLabel">URL:</label><input type="url" id="videoLinkInput" className="formInput" value={videoLinkInput} onChange={(e) => setVideoLinkInput(e.target.value)} placeholder="Paste your video link here" /></div>
                        
                        {currentThumbnail && (
                            <div style={{ width: '100%', maxWidth: '200px', aspectRatio: '16/9', background: '#0a0a0a', borderRadius: '8px', overflow: 'hidden', marginBottom: '15px', border: '1px solid #333' }}>
                                <img src={currentThumbnail} alt="Thumbnail Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            </div>
                        )}
                        
                        <div className="formGroup">
                            <label className="formLabel">Custom Thumbnail (Optional):</label>
                            <input type="file" ref={thumbnailFileInputRef} onChange={handleThumbnailFileSelect} accept="image/*" style={{display: 'none'}} />
                            <button type="button" className="button" onClick={() => thumbnailFileInputRef.current.click()} style={{width: '100%', backgroundColor: '#222', border: '1px solid #444', color: '#FFF'}}><span className="buttonText">Upload Custom Image</span></button>
                        </div>

                        {/* MONETIZATION GATE UI */}
                        <div style={{ background: 'rgba(255, 215, 0, 0.05)', border: '1px solid rgba(255, 215, 0, 0.2)', padding: '16px', borderRadius: '12px', marginBottom: '15px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    checked={applyMonetization} 
                                    onChange={(e) => setApplyMonetization(e.target.checked)}
                                    style={{ width: '20px', height: '20px', accentColor: '#FFD700' }}
                                />
                                <span style={{ color: '#FFF', fontSize: '14px', fontWeight: 'bold' }}>Apply for Showcase Monetization</span>
                            </label>
                            <p style={{ color: '#CCC', fontSize: '13px', margin: '10px 0 0 32px', lineHeight: '1.6' }}>
                                <b style={{ color: '#FFD700' }}>If checked:</b> Video is held for Admin approval to verify original work. Public launch occurs after approval. <br/>
                                <b style={{ color: '#AAA' }}>If unchecked:</b> Video goes live on your profile immediately (non-monetized).
                            </p>
                        </div>

                        <button className="button" onClick={handleAddToLibrary} disabled={isPublishing} style={{ width: '100%', backgroundColor: '#FFD700', color: '#0A0A0A', fontWeight: 'bold', marginTop: '10px' }}>
                            {isPublishing ? 'Saving to Portfolio...' : 'Add to Library'}
                        </button>
                    </div>
                </div>

                <input type="file" ref={galleryInputRef} onChange={handleGalleryFileChange} accept="image/*" style={{ display: 'none' }} />
                
                {/* STUDIO GALLERY (Specific Roles Only) */}
                {['Craft', 'Designer', 'Health & Fitness', 'Crafter / Designer', 'Wellness Coach'].includes(creatorProfile?.creatorField) && (
                    <div className="atelier-container" style={{ background: `linear-gradient(180deg, ${roleColor}33 0%, #111111 100%)`, border: `1px solid ${roleColor}66`, marginBottom: '24px' }}>
                        <p className="sectionTitle" style={{ color: roleColor, marginBottom: '5px' }}>The Visual Showcase</p>
                        <p style={{ color: '#888', fontSize: '11px', marginBottom: '15px' }}>Tap an empty slot to upload or a photo to replace it.</p>
                        <div className="studio-gallery-grid">
                            {[0, 1, 2, 3, 4].map((index) => {
                                const imgUrl = creatorProfile?.studioGallery?.[index];
                                return (
                                    <div key={index} className={`gallery-slot slot-${index}`} onClick={() => triggerGalleryUpload(index)}>
                                        {imgUrl ? (
                                            <>
                                                <img src={imgUrl} alt={`Gallery Slot ${index}`} />
                                                <div className="slot-overlay">
                                                    <span style={{ fontSize: '20px', marginBottom: '4px' }}>↺</span>
                                                    Replace
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div style={{ color: '#555', fontSize: '28px', fontWeight: '300' }}>+</div>
                                                <div style={{ fontSize: '10px', color: '#555', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '700' }}>Upload</div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {isUploadingGallery && <p style={{ color: '#FFD700', fontSize: '12px', textAlign: 'center', marginTop: '10px', fontWeight: 'bold' }}>Uploading image...</p>}
                    </div>
                )}

                {/* MY UPLOADS SECTION */}
                <div className="dashboardSection" style={{ marginTop: '20px', border: 'none', padding: 0 }}>
                    <div 
                        onClick={() => setIsLibraryExpanded(!isLibraryExpanded)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'linear-gradient(90deg, rgba(255,215,0,0.1) 0%, transparent 100%)', border: '1px solid rgba(255,215,0,0.2)', padding: '16px 24px', borderRadius: '12px', transition: 'all 0.3s ease', boxShadow: isLibraryExpanded ? '0 4px 15px rgba(0,0,0,0.5)' : 'none' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,215,0,0.5)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,215,0,0.2)'}
                    >
                        <p style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#FFD700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            📂 My Uploads Library <span style={{ color: '#FFF', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '20px', fontSize: '12px', marginLeft: '10px' }}>{libraryItems.length} Files</span>
                        </p>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,215,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFD700', transform: isLibraryExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}>
                            ▼
                        </div>
                    </div>
                    <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isLibraryExpanded ? 'max-h-[5000px] mt-4' : 'max-h-0'}`}>
                        <div className="formGroup" style={{ marginBottom: '16px' }}>
                            <input type="text" className="formInput" placeholder="Search your library by title..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                        
                        {/* ATELIER TINTED CONTAINER */}
                        <div 
                            className="atelier-container" 
                            style={{ 
                                background: `linear-gradient(180deg, ${roleColor}33 0%, #111111 100%)`, 
                                border: `1px solid ${roleColor}66` 
                            }}
                        >
                            <div className="atelier-grid" style={{ maxHeight: '800px', overflowY: 'auto', paddingRight: '10px' }}>
                                {(() => {
                                    if (loadingLibrary) return <p style={{ color: '#888', textAlign: 'center', gridColumn: '1/-1' }}>Loading content...</p>;
                                    if (sortedAndFilteredItems.length === 0) return <p className="dashboardItem" style={{ gridColumn: '1/-1' }}>{searchTerm ? `No matches for "${searchTerm}".` : 'Your library is empty.'}</p>;

                                    return sortedAndFilteredItems.map(item => {
                                        const isPinned = creatorProfile?.pinnedContent?.includes(item.id);
                                        const isFeatured = creatorProfile.featuredVideoLink?.liveFeedContentId === item.id;
                                        const isPending = item.monetizationStatus === 'pending';
                                        
                                        return (
                                            <div key={item.id} className={`atelier-card ${isPinned ? 'pinned-card' : ''}`}>
                                                
                                                {/* Image Container with Pin + Status Badges */}
                                                <div style={{ position: 'relative', cursor: 'pointer', width: '100%', aspectRatio: '16/9', overflow: 'hidden', background: '#000' }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleVideoPress(item.embedUrl || item.mainUrl, item); }}>
                                                    <button 
                                                        className={`pin-icon-button ${isPinned ? 'pinned' : ''}`} 
                                                        onClick={(e) => { e.stopPropagation(); handleTogglePin(item); }} 
                                                        disabled={isUpdatingPin === item.id || isPending} 
                                                        style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', borderRadius: '50%', padding: '6px', border: 'none', zIndex: 10 }}
                                                    >
                                                        {isUpdatingPin === item.id ? '...' : <svg className="pin-svg" viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: isPinned ? '#FFD700' : '#FFF' }}><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"></path></svg>}
                                                    </button>
                                                    
                                                    {isPending && <span style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(255, 215, 0, 0.2)', border: '1px solid rgba(255, 215, 0, 0.4)', color: '#FFD700', fontSize: '8px', fontWeight: 900, padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase', zIndex: 5 }}>Pending</span>}
                                                    {isFeatured && <span style={{ position: 'absolute', top: '8px', left: isPending ? '65px' : '8px', background: 'rgba(0,255,0,0.2)', border: '1px solid rgba(0,255,0,0.4)', color: '#4ADE80', fontSize: '8px', fontWeight: 900, padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase', zIndex: 5 }}>Showcase</span>}

                                                    <img 
                                                        src={item.customThumbnailUrl || 'https://placehold.co/400x225/111/333?text=NVA'} 
                                                        alt={item.title} 
                                                        style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                                                    />
                                                </div>

                                                {/* Card Body */}
                                                <div style={{ padding: '12px' }}>
                                                    <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 4px 0', color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</p>
                                                    <p style={{ fontSize: '11px', color: '#888', fontWeight: '700', margin: '0 0 10px 0', textTransform: 'uppercase' }}>
                                                        {item.contentType}
                                                        {item.monetizationStatus === 'approved' && <span style={{ color: '#FFD700' }}> • 🎁 Monetized</span>}
                                                    </p>
                                                    
                                                    {/* Views + Likes Row */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', fontSize: '11px', color: '#666' }}>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><svg viewBox="0 0 24 24" style={{ width: '13px', height: '13px', fill: 'currentColor' }}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zM12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>{(item.viewCount || 0).toLocaleString()}</span>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><svg viewBox="0 0 24 24" style={{ width: '13px', height: '13px', fill: '#FFD700' }}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>{(item.likeCount || 0).toLocaleString()}</span>
                                                    </div>

                                                    {/* Actions - New Layout */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        {isPending ? (
                                                            <button className="btn-pills btn-featured-active" style={{ background: 'rgba(255, 215, 0, 0.05)', borderColor: 'rgba(255, 215, 0, 0.2)', color: '#FFD700', cursor: 'not-allowed', width: '100%' }} disabled>⏱️ Reviewing</button>
                                                        ) : isFeatured ? (
                                                            <button className="btn-pills btn-featured-active" onClick={handleRemoveFeatured} disabled={isUpdatingFeature === item.id} style={{ width: '100%', padding: '10px' }}>{isUpdatingFeature === item.id ? '...' : 'Remove Showcase'}</button>
                                                        ) : (
                                                            <button className="btn-pills btn-featured-set" onClick={() => handleSetFeatured(item)} disabled={isUpdatingFeature === item.id} style={{ width: '100%', padding: '10px' }}>{isUpdatingFeature === item.id ? '...' : 'Set Showcase'}</button>
                                                        )}
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <button className="btn-pills btn-manage" style={{ flex: 1, padding: '10px' }} onClick={() => handleOpenManageModal(item)} disabled={isPending}>Manage</button>
                                                            <button className="btn-pills btn-delete" style={{ flex: 1, padding: '10px' }} onClick={() => handleDelete(item)}>Delete</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
                <button className="button" onClick={() => setActiveScreen('CreatorDashboard')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}>
                    <span className="buttonText light">Back to Dashboard</span>
                </button>
            </div>
            
           {showImageAdjustModal && imageFileToAdjust && (
                <ThumbnailAdjustModal 
                    imageUrl={imageFileToAdjust}
                    onSave={activeGallerySlot !== null ? handleGallerySave : handleThumbnailSave}
                    onCancel={activeGallerySlot !== null ? handleGalleryCancel : handleThumbnailCancel}
                    showMessage={showMessage}
                    isUploading={isPublishing || isUploadingGallery}
                    aspectRatio={activeGallerySlot !== null ? SLOT_ASPECT_RATIOS[activeGallerySlot] : 16 / 9}
                    initialScale={activeGallerySlot !== null ? galleryAdjustments[activeGallerySlot]?.scale : null}
                    initialPosition={activeGallerySlot !== null ? galleryAdjustments[activeGallerySlot]?.position : null}
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