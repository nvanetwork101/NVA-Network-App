import { httpsCallable } from 'firebase/functions';

/**
 * Native client-side compression (JPEG 0.85, max 1080px) [1].
 * @param {File} imageFile - The raw file from input.
 * @param {number} maxSize - Max width/height.
 * @param {number} quality - Compression factor.
 */
export const compressImage = (imageFile, maxSize = 1080, quality = 0.85) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > height && width > maxSize) {
                    height *= maxSize / width;
                    width = maxSize;
                } else if (height > maxSize) {
                    width *= maxSize / height;
                    height = maxSize;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(new File([blob], imageFile.name, { type: 'image/jpeg' }));
                    } else {
                        reject(new Error("Image compression failed."));
                    }
                }, 'image/jpeg', quality);
            };
            img.onerror = () => reject(new Error("Failed to load image for compression."));
        };
        reader.onerror = () => reject(new Error("Failed to read file."));
    });
};

/**
 * Handles the secure presigned URL handshake and PUTs directly to Cloudflare R2 [1].
 * @param {File|Blob} file - The file/blob to upload.
 * @param {string} filePath - Target R2 path (e.g. 'avatars/user_123.jpg').
 * @param {object} functionsInstance - Your initialized Firebase functions module.
 * @returns {Promise<string>} - Returns the public, cache-busted URL of the asset [2].
 */
export const uploadToR2 = async (file, filePath, functionsInstance) => {
    const getR2UploadUrl = httpsCallable(functionsInstance, 'getR2UploadUrl');
    const { data } = await getR2UploadUrl({ filePath, contentType: file.type });
    
    const response = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file
    });

    if (!response.ok) {
        throw new Error(`Cloudflare R2 upload rejected with status: ${response.status}`);
    }

    // Returns the clean URL with a cache-buster timestamp to instantly refresh UI elements [2]
    return `${data.publicUrl}?t=${Date.now()}`;
};