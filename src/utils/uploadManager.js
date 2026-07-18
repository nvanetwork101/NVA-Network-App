import { uploadMovieToR2 } from './r2Uploader';

class UploadManager {
    constructor() {
        this.uploadProgress = 0;
        this.isUploadingMovie = false;
        this.statusMessage = "";
        this.movieFile = null;
        this.targetEventId = localStorage.getItem('nva_last_target_id') || "";
        this.targetSlotNum = localStorage.getItem('nva_last_target_slot') || "1"; // THE FIX: Holds selected Slot (1-5)
        this.listeners = new Set();
        this.eventSource = null;
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.listeners.forEach(l => l({
            uploadProgress: this.uploadProgress,
            isUploadingMovie: this.isUploadingMovie,
            statusMessage: this.statusMessage,
            movieFile: this.movieFile,
            targetEventId: this.targetEventId,
            targetSlotNum: this.targetSlotNum // THE FIX: Dispatches Slot selection to UI
        }));
    }

    setMovieFile(file) {
        this.movieFile = file;
        this.notify();
    }

    setTargetEventId(id) {
        this.targetEventId = id;
        localStorage.setItem('nva_last_target_id', id);
        this.notify();
    }

    setTargetSlotNum(slot) {
        this.targetSlotNum = slot;
        localStorage.setItem('nva_last_target_slot', slot);
        this.notify();
    }

    async startUpload(file, eventId, slotNum, mediaServerUrl, showMessage) {
        if (this.isUploadingMovie) return;
        this.isUploadingMovie = true;
        this.uploadProgress = 0;
        this.statusMessage = "Uploading to Vault...";
        this.notify();

        try {
            await uploadMovieToR2(file, slotNum, (p) => {
                this.uploadProgress = p;
                if (p === 100) this.statusMessage = "Finalizing Upload...";
                this.notify();
            });

            if (this.eventSource) this.eventSource.close();
            this.eventSource = new EventSource(`${mediaServerUrl}/api/start-transcode?eventId=${eventId}&slot=${slotNum}`);

            this.eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.heartbeat) return;

                if (data.status) this.statusMessage = data.status;
                if (data.progress !== undefined) this.uploadProgress = data.progress;
                this.notify();

                if (data.complete) {
                    this.eventSource.close();
                    this.isUploadingMovie = false;
                    this.statusMessage = "";
                    this.movieFile = null;
                    this.notify();
                    
                    // THE FIX: Automatically save the slot index assignment to the Firestore event document upon completion.
                    import('../firebase').then(({ db, doc, updateDoc }) => {
                        updateDoc(doc(db, "events", eventId), { cinemaSlot: slotNum }).catch(() => {});
                    });

                    showMessage("🎉 Cinema Slot Ready & Live!");
                }
            };

            this.eventSource.onerror = () => {
                this.eventSource.close();
                this.isUploadingMovie = false;
                this.statusMessage = "";
                this.notify();
                showMessage("❌ Server-side processing failed.");
            };
        } catch (err) {
            this.isUploadingMovie = false;
            this.statusMessage = "";
            this.notify();
            showMessage("❌ Upload failed.");
        }
    }
}

export const uploadManager = new UploadManager();