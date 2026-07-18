import axios from 'axios';

// Pointed directly to your Tokyo Oracle Instance
const API_BASE = "http://158.179.184.80:5000"; 

export const uploadMovieToR2 = async (file, slotNum, onProgress) => {
  try {
    // 1. Get the temporary "Authorized Key" from your server mapped to the Slot
    const { data } = await axios.get(`${API_BASE}/api/get-upload-url?slot=${slotNum}`);
    const { uploadUrl } = data;

    // 2. Upload the file DIRECTLY to Cloudflare R2
    await axios.put(uploadUrl, file, {
      headers: { 'Content-Type': 'video/mp4' },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      }
    });

    // Utility now only handles the raw upload; Screen handles the status stream.
    return { success: true };
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
};