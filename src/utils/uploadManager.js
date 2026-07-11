import { uploadMovieToR2 } from './r2Uploader';

class UploadManager {
    constructor() {
        this.uploadProgress = 0;
        this.isUploadingMovie = false;
        this.statusMessage = "";
        this.movieFile = null;
        this.targetEventId = localStorage.getItem('nva_last_target_id') || "";
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
            targetEventId: this.targetEventId
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

    async startUpload(file, eventId, mediaServerUrl, showMessage) {
        if (this.isUploadingMovie) return;
        this.isUploadingMovie = true;
        this.uploadProgress = 0;
        this.statusMessage = "Uploading to Vault...";
        this.notify();

        try {
            await uploadMovieToR2(file, (p) => {
                this.uploadProgress = p;
                if (p === 100) this.statusMessage = "Finalizing Upload...";
                this.notify();
            });

            if (this.eventSource) this.eventSource.close();
            this.eventSource = new EventSource(`${mediaServerUrl}/api/start-transcode?eventId=${eventId}`);

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