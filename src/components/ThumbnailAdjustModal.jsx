import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

const ThumbnailAdjustModal = ({ imageUrl, onSave, onCancel, showMessage, isUploading, aspectRatio, initialScale, initialPosition }) => {
    const canvasRef = useRef(null);
    const imageRef = useRef(new Image());
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [touchStartDistance, setTouchStartDistance] = useState(0);
    const [isPinching, setIsPinching] = useState(false);

    // Compute dynamic sizing for canvas and high-res output to match the EXACT slot aspect ratio
    const targetRatio = aspectRatio || (16 / 9);
    const { CANVAS_SIZE, OUTPUT_SIZE } = useMemo(() => {
        let canvasWidth = 360;
        let canvasHeight = 360 / targetRatio;
        
        // Prevent layout spilling in the modal box if the slot is extremely tall
        if (canvasHeight > 340) {
            canvasHeight = 340;
            canvasWidth = 340 * targetRatio;
        }
        
        return {
            CANVAS_SIZE: { width: canvasWidth, height: canvasHeight },
            OUTPUT_SIZE: { width: 1080, height: 1080 / targetRatio }
        };
    }, [targetRatio]);

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
        
        // Native High-DPI Context scaling (Fixes Retina display offset drift)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.scale(devicePixelRatio, devicePixelRatio);
        ctx.drawImage(img, position.x, position.y, img.naturalWidth * scale, img.naturalHeight * scale);
    }, [scale, position]);
    
    const handleWheel = useCallback((e) => {
        e.preventDefault();
        const img = imageRef.current;
        if (!img.complete) return;

        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const newScale = scale * zoomFactor;

        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Infinite, unconstrained zoom-to-mouse coordinates
        const newPosition = { 
            x: mouseX - (mouseX - position.x) * zoomFactor, 
            y: mouseY - (mouseY - position.y) * zoomFactor 
        };

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
    }, [handleWheel, CANVAS_SIZE]);

    useEffect(() => {
        if (!imageUrl) return;

        const img = imageRef.current;
        const handleImageLoad = () => {
            // Restore previous user alignments if adjusting an existing photo [1]
            if (initialScale && initialPosition) {
                setScale(initialScale);
                setPosition(initialPosition);
            } else {
                const calculatedScale = Math.max(CANVAS_SIZE.width / img.naturalWidth, CANVAS_SIZE.height / img.naturalHeight);
                setScale(calculatedScale);
                const initialX = (CANVAS_SIZE.width - img.naturalWidth * calculatedScale) / 2;
                const initialY = (CANVAS_SIZE.height - img.naturalHeight * calculatedScale) / 2;
                setPosition({ x: initialX, y: initialY });
            }
        };
        
        img.crossOrigin = 'anonymous';
        img.onload = handleImageLoad;
        img.src = imageUrl;
        if (img.complete) handleImageLoad();
        img.onerror = () => { if (showMessage) showMessage("Failed to load image for adjustment."); };

    }, [imageUrl, showMessage, CANVAS_SIZE, initialScale, initialPosition]);

    useEffect(() => { drawImage(); }, [scale, position, drawImage]);

    const handleMouseDown = (e) => { 
        setIsDragging(true); 
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y }); 
    };
    
    const handleMouseMove = (e) => { 
        if (!isDragging) return; 
        setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); 
    };
    
    const handleMouseUp = () => setIsDragging(false);
    const handleMouseLeave = () => setIsDragging(false);
    
    const getTouchDistance = (touches) => Math.sqrt(Math.pow(touches[1].clientX - touches[0].clientX, 2) + Math.pow(touches[1].clientY - touches[0].clientY, 2));
    
    const handleTouchStart = (e) => {
        if (e.touches.length === 2) { 
            e.preventDefault(); 
            setIsPinching(true); 
            setIsDragging(false); 
            setTouchStartDistance(getTouchDistance(e.touches)); 
        } else if (e.touches.length === 1) { 
            setIsDragging(true); 
            setIsPinching(false); 
            const t = e.touches[0]; 
            setDragStart({ x: t.clientX - position.x, y: t.clientY - position.y }); 
        }
    };
    
    const handleTouchMove = (e) => {
        if (isPinching && e.touches.length === 2) { 
            e.preventDefault(); 
            const newDist = getTouchDistance(e.touches);
            setScale(scale * (newDist / touchStartDistance)); 
            setTouchStartDistance(newDist); 
        } else if (isDragging && e.touches.length === 1) { 
            e.preventDefault(); 
            const t = e.touches[0]; 
            setPosition({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y }); 
        }
    };
    
    const handleTouchEnd = () => { setIsDragging(false); setIsPinching(false); };

    const saveCroppedImage = () => {
        const img = imageRef.current;
        if (!img.complete || img.naturalWidth === 0) { showMessage("Image not loaded."); return; }
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = OUTPUT_SIZE.width;
        outputCanvas.height = OUTPUT_SIZE.height;
        const ctx = outputCanvas.getContext('2d');
        
        // Flawlessly maps the CSS drag layout coordinates onto the high-resolution output canvas
        const scaleRatio = OUTPUT_SIZE.width / CANVAS_SIZE.width;
        const finalScale = scale * scaleRatio;
        const finalX = position.x * scaleRatio;
        const finalY = position.y * scaleRatio;
        
        ctx.drawImage(img, finalX, finalY, img.naturalWidth * finalScale, img.naturalHeight * finalScale);
        
        outputCanvas.toBlob((blob) => {
            // Send both the blob file and the coordinate coordinates back up to save them in state [1]
            if (blob) onSave(blob, scale, position);
            else showMessage("Failed to create image file.");
        }, 'image/jpeg', 0.85);
    };

    return (
        <div className="confirmationModalOverlay" style={{ zIndex: 3000 }}>
            <div className="confirmationModalContent" style={{ maxWidth: '400px', textAlign: 'center' }}>
                <p className="confirmationModalTitle">Reposition Gallery Photo</p>
                <p className="subHeading" style={{fontSize: '14px', marginBottom: '15px', color: '#CCC'}}>Drag freely to position the sweet spot, scroll or pinch to zoom.</p>
                <div onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} style={{ cursor: isDragging ? 'grabbing' : 'grab', margin: '0 auto', width: `${CANVAS_SIZE.width}px`, height: `${CANVAS_SIZE.height}px`, border: '2px solid #555', touchAction: 'none', overflow: 'hidden' }}>
                    <canvas ref={canvasRef}></canvas>
                </div>
                <div className="confirmationModalButtons" style={{ marginTop: '20px' }}>
                    <button className="confirmationButton cancel" onClick={onCancel} disabled={isUploading}>Cancel</button>
                    <button className="confirmationButton confirm" onClick={saveCroppedImage} disabled={isUploading}>Save Photo</button>
                </div>
            </div>
        </div>
    );
};

export default ThumbnailAdjustModal;