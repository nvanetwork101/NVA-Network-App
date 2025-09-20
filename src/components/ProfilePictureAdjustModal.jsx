// src/components/ProfilePictureAdjustModal.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';

const ProfilePictureAdjustModal = ({ isUploading, imageFile, onSave, onCancel, showMessage }) => {
    const canvasRef = useRef(null);
    const imageRef = useRef(new Image());
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [touchStartDistance, setTouchStartDistance] = useState(0);
    const [isPinching, setIsPinching] = useState(false);

    const canvasSize = 200; // The size of the circular preview on screen
    const profilePicSize = 300; // The final output resolution (e.g., 300x300 pixels)

    const drawImage = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const img = imageRef.current;
        if (!img.complete || img.naturalWidth === 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        const devicePixelRatio = window.devicePixelRatio || 1;
        const scaledCanvasSize = canvasSize * devicePixelRatio;

        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        
        ctx.beginPath();
        ctx.arc(scaledCanvasSize / 2, scaledCanvasSize / 2, scaledCanvasSize / 2, 0, Math.PI * 2, true);
        ctx.clip();
        
        const finalX = position.x * devicePixelRatio;
        const finalY = position.y * devicePixelRatio;
        const finalWidth = img.naturalWidth * scale * devicePixelRatio;
        const finalHeight = img.naturalHeight * scale * devicePixelRatio;

        ctx.drawImage(img, finalX, finalY, finalWidth, finalHeight);
        ctx.restore();
    }, [scale, position, canvasSize]);

    const handleWheel = useCallback((e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const newScale = scale * zoomFactor;
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const newPosition = { x: mouseX - (mouseX - position.x) * zoomFactor, y: mouseY - (mouseY - position.y) * zoomFactor };
        setScale(newScale);
        setPosition(newPosition);
    }, [scale, position]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const devicePixelRatio = window.devicePixelRatio || 1;
            canvas.width = canvasSize * devicePixelRatio;
            canvas.height = canvasSize * devicePixelRatio;
            canvas.style.width = `${canvasSize}px`;
            canvas.style.height = `${canvasSize}px`;

            const handleWheelProxy = (e) => handleWheel(e);
            canvas.addEventListener('wheel', handleWheelProxy, { passive: false });
            return () => { canvas.removeEventListener('wheel', handleWheelProxy); };
        }
    }, [canvasSize, handleWheel]);

    useEffect(() => {
        if (!imageFile) return;

        const img = imageRef.current;
        const handleImageLoad = () => {
            const initialScale = Math.max(canvasSize / img.naturalWidth, canvasSize / img.naturalHeight);
            setScale(initialScale);
            const initialX = (canvasSize - img.naturalWidth * initialScale) / 2;
            const initialY = (canvasSize - img.naturalHeight * initialScale) / 2;
            setPosition({ x: initialX, y: initialY });
        };
        
        const objectUrl = URL.createObjectURL(imageFile);
        img.crossOrigin = 'anonymous';
        img.onload = handleImageLoad;
        img.src = objectUrl;
        if (img.complete) handleImageLoad();
        img.onerror = () => { if (showMessage) showMessage("Failed to load image for adjustment."); };

        return () => { URL.revokeObjectURL(objectUrl); };
    }, [imageFile, showMessage, canvasSize]);

    useEffect(() => { drawImage(); }, [scale, position, drawImage]);

    const handleMouseDown = (e) => { setIsDragging(true); setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y }); };
    const handleMouseMove = (e) => { if (!isDragging) return; setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
    const handleMouseUp = () => setIsDragging(false);
    const handleMouseLeave = () => setIsDragging(false);
    
    const getTouchDistance = (touches) => Math.sqrt(Math.pow(touches[1].clientX - touches[0].clientX, 2) + Math.pow(touches[1].clientY - touches[0].clientY, 2));
    const handleTouchStart = (e) => {
        if (e.touches.length === 2) { e.preventDefault(); setIsPinching(true); setIsDragging(false); setTouchStartDistance(getTouchDistance(e.touches)); }
        else if (e.touches.length === 1) { setIsDragging(true); setIsPinching(false); const t = e.touches[0]; setDragStart({ x: t.clientX - position.x, y: t.clientY - position.y }); }
    };
    const handleTouchMove = (e) => {
        if (isPinching && e.touches.length === 2) { e.preventDefault(); const newDist = getTouchDistance(e.touches); setScale(scale * (newDist / touchStartDistance)); setTouchStartDistance(newDist); }
        else if (isDragging && e.touches.length === 1) { e.preventDefault(); const t = e.touches[0]; setPosition({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y }); }
    };
    const handleTouchEnd = () => { setIsDragging(false); setIsPinching(false); };

    const saveCroppedImage = () => {
        const img = imageRef.current;
        if (!img.complete || img.naturalWidth === 0) { if (showMessage) showMessage("Image not loaded."); return; }
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = profilePicSize;
        outputCanvas.height = profilePicSize;
        const ctx = outputCanvas.getContext('2d');
        ctx.beginPath();
        ctx.arc(profilePicSize / 2, profilePicSize / 2, profilePicSize / 2, 0, Math.PI * 2, true);
        ctx.clip();
        const scaleRatio = profilePicSize / canvasSize;
        const finalScale = scale * scaleRatio;
        const finalX = position.x * scaleRatio;
        const finalY = position.y * scaleRatio;
        ctx.drawImage(img, finalX, finalY, img.naturalWidth * finalScale, img.naturalHeight * finalScale);
        outputCanvas.toBlob((blob) => {
            if (blob) { onSave(blob); }
            else { if (showMessage) showMessage("Failed to create image file."); }
        }, 'image/png', 0.9);
    };

    return (
        <div className="imageAdjustModalOverlay">
            <div className="imageAdjustModalContent">
                <p className="heading" style={{fontSize: '20px', marginBottom: '10px'}}>Adjust Profile Picture</p>
                <p className="subHeading" style={{fontSize: '14px', marginBottom: '15px', color: '#CCC'}}>Drag to pan, scroll or pinch to zoom.</p>
                <div className="canvasContainer" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
                    <canvas ref={canvasRef}></canvas>
                </div>
                <div className="modalButtons">
                    <button className="modalButton" onClick={saveCroppedImage} disabled={isUploading}>
                        {isUploading ? 'Uploading...' : 'Save'}
                    </button>
                    <button className="modalButton cancel" onClick={onCancel} disabled={isUploading}>Cancel</button>
                </div>
            </div>
        </div>
    );
};

export default ProfilePictureAdjustModal;