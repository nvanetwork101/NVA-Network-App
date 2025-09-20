// src/components/ThumbnailAdjustModal.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';

// Define constants outside the component to prevent re-creation on every render.
const CANVAS_SIZE = { width: 320, height: 180 }; // 16:9 preview canvas
const OUTPUT_SIZE = { width: 1280, height: 720 }; // Final 16:9 output resolution

const ThumbnailAdjustModal = ({ imageUrl, onSave, onCancel, showMessage, isUploading }) => {
    const canvasRef = useRef(null);
    const imageRef = useRef(new Image());
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [touchStartDistance, setTouchStartDistance] = useState(0);
    const [isPinching, setIsPinching] = useState(false);

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
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const finalX = position.x * devicePixelRatio;
        const finalY = position.y * devicePixelRatio;
        const finalWidth = img.naturalWidth * scale * devicePixelRatio;
        const finalHeight = img.naturalHeight * scale * devicePixelRatio;

        ctx.drawImage(img, finalX, finalY, finalWidth, finalHeight);
    }, [scale, position]);
    
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
            canvas.width = CANVAS_SIZE.width * devicePixelRatio;
            canvas.height = CANVAS_SIZE.height * devicePixelRatio;
            canvas.style.width = `${CANVAS_SIZE.width}px`;
            canvas.style.height = `${CANVAS_SIZE.height}px`;

            const handleWheelProxy = (e) => handleWheel(e);
            canvas.addEventListener('wheel', handleWheelProxy, { passive: false });
            return () => { canvas.removeEventListener('wheel', handleWheelProxy); };
        }
    }, [handleWheel]);

    useEffect(() => {
        if (!imageUrl) return;

        const img = imageRef.current;
        const handleImageLoad = () => {
            const initialScale = Math.max(CANVAS_SIZE.width / img.naturalWidth, CANVAS_SIZE.height / img.naturalHeight);
            setScale(initialScale);
            const initialX = (CANVAS_SIZE.width - img.naturalWidth * initialScale) / 2;
            const initialY = (CANVAS_SIZE.height - img.naturalHeight * initialScale) / 2;
            setPosition({ x: initialX, y: initialY });
        };
        
        img.crossOrigin = 'anonymous';
        img.onload = handleImageLoad;
        img.src = imageUrl;
        if (img.complete) handleImageLoad();
        img.onerror = () => { if (showMessage) showMessage("Failed to load image for adjustment."); };

    }, [imageUrl, showMessage]);

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
        if (!img.complete || img.naturalWidth === 0) { showMessage("Image not loaded."); return; }
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = OUTPUT_SIZE.width;
        outputCanvas.height = OUTPUT_SIZE.height;
        const ctx = outputCanvas.getContext('2d');
        const scaleRatio = OUTPUT_SIZE.width / CANVAS_SIZE.width;
        const finalScale = scale * scaleRatio;
        const finalX = position.x * scaleRatio;
        const finalY = position.y * scaleRatio;
        ctx.drawImage(img, finalX, finalY, img.naturalWidth * finalScale, img.naturalHeight * finalScale);
        outputCanvas.toBlob((blob) => {
            if (blob) onSave(blob);
            else showMessage("Failed to create image file.");
        }, 'image/png', 0.9);
    };

    return (
        <div className="confirmationModalOverlay" style={{ zIndex: 3000 }}>
            <div className="confirmationModalContent" style={{ maxWidth: '400px', textAlign: 'center' }}>
                <p className="confirmationModalTitle">Adjust Thumbnail</p>
                <p className="subHeading" style={{fontSize: '14px', marginBottom: '15px', color: '#CCC'}}>Drag to pan, scroll or pinch to zoom.</p>
                <div onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} style={{ cursor: isDragging ? 'grabbing' : 'grab', margin: '0 auto', width: `${CANVAS_SIZE.width}px`, height: `${CANVAS_SIZE.height}px`, border: '2px solid #555' }}>
                    <canvas ref={canvasRef}></canvas>
                </div>
                <div className="confirmationModalButtons">
                    <button className="confirmationButton cancel" onClick={onCancel} disabled={isUploading}>Cancel</button>
                    <button className="confirmationButton confirm" onClick={saveCroppedImage} disabled={isUploading}>Save Thumbnail</button>
                </div>
            </div>
        </div>
    );
};

export default ThumbnailAdjustModal;