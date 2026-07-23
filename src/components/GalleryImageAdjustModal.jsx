// src/components/GalleryImageAdjustModal.jsx

import React, { useState, useEffect, useRef } from 'react';

const GalleryImageAdjustModal = ({ isUploading, imageFile, onSave, onCancel, aspectRatio }) => {
    const canvasRef = useRef(null);
    const [imageSrc, setImageSrc] = useState(null);
    const [imgElement, setImgElement] = useState(null);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const CANVAS_WIDTH = 300;
    const CANVAS_HEIGHT = CANVAS_WIDTH / aspectRatio;

    useEffect(() => {
        if (imageFile) {
            const reader = new FileReader();
            reader.onload = (e) => setImageSrc(e.target.result);
            reader.readAsDataURL(imageFile);
        }
    }, [imageFile]);

    useEffect(() => {
        if (imageSrc) {
            const img = new Image();
            img.onload = () => {
                setImgElement(img);
                
                // Calculate initial scale to completely cover the canvas
                const scaleX = CANVAS_WIDTH / img.width;
                const scaleY = CANVAS_HEIGHT / img.height;
                const minScale = Math.max(scaleX, scaleY);
                setScale(minScale);
                
                // Center the image initially
                setPosition({
                    x: (CANVAS_WIDTH - img.width * minScale) / 2,
                    y: (CANVAS_HEIGHT - img.height * minScale) / 2
                });
            };
            img.src = imageSrc;
        }
    }, [imageSrc, CANVAS_WIDTH, CANVAS_HEIGHT]);

    useEffect(() => {
        if (imgElement && canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            
            // Draw image with current scale and position
            ctx.drawImage(
                imgElement,
                position.x,
                position.y,
                imgElement.width * scale,
                imgElement.height * scale
            );
        }
    }, [imgElement, scale, position, CANVAS_WIDTH, CANVAS_HEIGHT]);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragStart({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    };

    const handleMouseMove = (e) => {
        if (!isDragging || !imgElement) return;
        
        // Calculate new position
        let newX = e.clientX - dragStart.x;
        let newY = e.clientY - dragStart.y;
        
        const minX = CANVAS_WIDTH - (imgElement.width * scale);
        const minY = CANVAS_HEIGHT - (imgElement.height * scale);
        
        // Dynamic boundary tracking: adapts if zoomed in or out
        if (minX < 0) {
            newX = Math.min(0, Math.max(minX, newX));
        } else {
            newX = Math.min(minX, Math.max(0, newX));
        }
        
        if (minY < 0) {
            newY = Math.min(0, Math.max(minY, newY));
        } else {
            newY = Math.min(minY, Math.max(0, newY));
        }
        
        setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleSaveClick = () => {
        if (!imgElement) return;

        // THE FIX: Create a high-resolution off-screen canvas for export (1080p instead of 300p)
        const EXPORT_WIDTH = 1080;
        const EXPORT_HEIGHT = EXPORT_WIDTH / aspectRatio;
        const scaleMultiplier = EXPORT_WIDTH / CANVAS_WIDTH;

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = EXPORT_WIDTH;
        offscreenCanvas.height = EXPORT_HEIGHT;
        const ctx = offscreenCanvas.getContext('2d');

        // Draw the exact crop coordinates scaled up to 1080p
        ctx.drawImage(
            imgElement,
            position.x * scaleMultiplier,
            position.y * scaleMultiplier,
            imgElement.width * scale * scaleMultiplier,
            imgElement.height * scale * scaleMultiplier
        );

        offscreenCanvas.toBlob((blob) => {
            if (blob) onSave(blob);
        }, 'image/jpeg', 0.95); // Bumped compression quality to 95%
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
            <div style={{ background: '#1A1A1A', padding: '20px', borderRadius: '12px', border: '1px solid #FFD700', textAlign: 'center', maxWidth: '90%' }}>
                <p style={{ color: '#FFD700', fontSize: '18px', fontWeight: 'bold', margin: '0 0 10px 0' }}>Adjust Gallery Image</p>
                <p style={{ color: '#888', fontSize: '12px', margin: '0 0 20px 0' }}>Drag to position. Use slider to zoom.</p>
                
                <div 
                    style={{ 
                        width: `${CANVAS_WIDTH}px`, 
                        height: `${CANVAS_HEIGHT}px`, 
                        margin: '0 auto',
                        border: '2px dashed #00FFFF',
                        cursor: isDragging ? 'grabbing' : 'grab',
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={(e) => handleMouseDown(e.touches[0])}
                    onTouchMove={(e) => handleMouseMove(e.touches[0])}
                    onTouchEnd={handleMouseUp}
                >
                    <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
                </div>

                <div style={{ margin: '20px 0' }}>
                    <label style={{ color: '#FFF', fontSize: '12px', display: 'block', marginBottom: '10px' }}>Zoom</label>
                    <input 
                        type="range" 
                        min={imgElement ? Math.min(CANVAS_WIDTH / imgElement.width, CANVAS_HEIGHT / imgElement.height) * 0.4 : 0.1} 
                        max={3} 
                        step="0.01" 
                        value={scale} 
                        onChange={(e) => setScale(parseFloat(e.target.value))} 
                        style={{ width: '80%' }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button onClick={onCancel} disabled={isUploading} style={{ background: '#333', color: '#FFF', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button onClick={handleSaveClick} disabled={isUploading || !imageSrc} style={{ background: '#FFD700', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                        {isUploading ? 'Saving...' : 'Save Image'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GalleryImageAdjustModal;