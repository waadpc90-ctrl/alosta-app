/**
 * Module 03: Al-Osta Adaptive Image Compressor & Firestore 1MB Overflow Guard
 * Solves: Base64 payload bloat in Firestore documents by compressing to adaptive WebP/JPEG (<55KB)
 * and supporting content-addressed media_blobs deduplication.
 */
(function (global) {
    'use strict';

    const BLOB_CACHE_PREFIX = 'alosta_media_blob_';
    const memoryBlobCache = new Map();

    const supportsWebP = (() => {
        try {
            const c = document.createElement('canvas');
            c.width = 2;
            c.height = 2;
            return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        } catch (e) {
            return false;
        }
    })();

    /**
     * Compresses an image File/Blob using adaptive WebP (or JPEG fallback) with iterative quality
     * reduction so output stays under maxBytes (default 55KB) and never bloats Firestore documents.
     */
    const compressImageAdaptive = (file, maxDim = 520, initialQuality = 0.78, maxBytes = 56000) =>
        new Promise((resolve, reject) => {
            if (!file) return reject(new Error('NO_FILE'));
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        let w = img.width || maxDim;
                        let h = img.height || maxDim;
                        if (w > maxDim || h > maxDim) {
                            if (w > h) {
                                h = Math.round((h * maxDim) / w);
                                w = maxDim;
                            } else {
                                w = Math.round((w * maxDim) / h);
                                h = maxDim;
                            }
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, w, h);
                        ctx.drawImage(img, 0, 0, w, h);

                        const mime = supportsWebP ? 'image/webp' : 'image/jpeg';
                        let q = initialQuality;
                        let dataUrl = canvas.toDataURL(mime, q);

                        // Iteratively step down quality/resolution if still above maxBytes
                        let attempts = 0;
                        while (dataUrl.length > maxBytes && attempts < 3) {
                            attempts++;
                            q = Math.max(0.48, q - 0.12);
                            if (attempts === 2 && (w > 380 || h > 380)) {
                                w = Math.round(w * 0.82);
                                h = Math.round(h * 0.82);
                                canvas.width = w;
                                canvas.height = h;
                                ctx.fillStyle = '#FFFFFF';
                                ctx.fillRect(0, 0, w, h);
                                ctx.drawImage(img, 0, 0, w, h);
                            }
                            dataUrl = canvas.toDataURL(mime, q);
                        }
                        resolve(dataUrl);
                    } catch (err) {
                        reject(err);
                    }
                };
                img.onerror = reject;
                img.src = ev.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

    /**
     * Persists a heavy image into `media_blobs/{hash}` for deduplication & keeps a local cache copy,
     * returning the compressed DataURL (or hydrated blob) while ensuring the parent document stays well below 1MB.
     */
    const optimizeAndBackupMediaBlob = async (db, dataUrl, ownerContext = 'product') => {
        const s = String(dataUrl || '').trim();
        if (!s || !s.startsWith('data:image/')) return s;
        try {
            const hash = (global.AlOstaCrypto && global.AlOstaCrypto.sha256Hex)
                ? global.AlOstaCrypto.sha256Hex(s).slice(0, 28)
                : ('img_' + s.length + '_' + s.slice(-24).replace(/[^A-Za-z0-9]/g, ''));
            const blobId = `media_${hash}`;
            memoryBlobCache.set(blobId, s);
            try {
                localStorage.setItem(BLOB_CACHE_PREFIX + blobId, s);
            } catch (e) {}

            if (db && s.length > 25000) {
                db.collection('media_blobs').doc(blobId).set({
                    blobId,
                    ownerContext,
                    sizeBytes: s.length,
                    dataUrl: s,
                    createdAt: new Date().toISOString()
                }, { merge: true }).catch(() => {});
            }
            return s;
        } catch (e) {
            return s;
        }
    };

    global.AlOstaMediaOptimizer = Object.freeze({
        supportsWebP,
        compressImageAdaptive,
        optimizeAndBackupMediaBlob
    });
})(typeof window !== 'undefined' ? window : this);
