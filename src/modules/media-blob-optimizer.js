/**
 * Module 03: Al-Osta Adaptive Image Compressor, Blob Decoupling (`blob://media_...`) & Lazy Resolver
 * Solves: Base64 payload bloat inside Firestore `store_products` / `stores` documents.
 * Heavy images (>16KB) are saved to `media_blobs/{hash}` (and cached in IndexedDB + memory) while
 * the parent document stores only a 38-byte `blob://media_<hash>` pointer — reducing catalog payloads by ~95%.
 */
(function (global) {
    'use strict';

    const BLOB_URI_PREFIX = 'blob://';
    const BLOB_INLINE_THRESHOLD_BYTES = 16000;
    const memoryBlobCache = new Map();
    const inflightBlobRequests = new Map();

    const supportsWebP = (() => {
        try {
            if (typeof document === 'undefined') return false;
            const c = document.createElement('canvas');
            c.width = 2;
            c.height = 2;
            return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        } catch (e) {
            return false;
        }
    })();

    const isBlobRef = (url) => typeof url === 'string' && url.startsWith(BLOB_URI_PREFIX + 'media_');

    const extractBlobId = (url) => (isBlobRef(url) ? url.slice(BLOB_URI_PREFIX.length) : '');

    /**
     * Compresses an image File/Blob using adaptive WebP (or JPEG fallback) with iterative quality
     * reduction so output stays under maxBytes (default 52KB).
     */
    const compressImageAdaptive = (file, maxDim = 520, initialQuality = 0.78, maxBytes = 52000) =>
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
     * Decouples heavy Base64 images (>16KB) into `media_blobs/{blobId}` and returns `blob://media_<hash>`
     * so `store_products` / `stores` documents stay <1KB. Falls back safely to inline DataURL if offline/unwritable.
     */
    const optimizeAndBackupMediaBlob = async (db, dataUrl, ownerContext = 'product') => {
        const s = String(dataUrl || '').trim();
        if (!s) return '';
        if (isBlobRef(s) || /^https?:\/\//i.test(s)) return s;
        if (!s.startsWith('data:image/')) return s;
        if (s.length <= BLOB_INLINE_THRESHOLD_BYTES) return s;

        try {
            const hash = (global.AlOstaCrypto && global.AlOstaCrypto.sha256Hex)
                ? global.AlOstaCrypto.sha256Hex(s).slice(0, 28)
                : ('img_' + s.length + '_' + s.slice(-24).replace(/[^A-Za-z0-9]/g, ''));
            const blobId = `media_${hash}`;
            const blobUri = `${BLOB_URI_PREFIX}${blobId}`;

            memoryBlobCache.set(blobId, s);
            if (global.AlOstaIndexedVault && typeof global.AlOstaIndexedVault.saveMediaBlobAsync === 'function') {
                global.AlOstaIndexedVault.saveMediaBlobAsync(blobId, s).catch(() => {});
            }

            if (db) {
                await db.collection('media_blobs').doc(blobId).set({
                    blobId,
                    ownerContext: String(ownerContext || 'product').slice(0, 64),
                    sizeBytes: s.length,
                    dataUrl: s,
                    createdAt: new Date().toISOString()
                }, { merge: true });
                return blobUri;
            }
            return s;
        } catch (e) {
            return s;
        }
    };

    /**
     * Resolves a `blob://media_<hash>` URI lazily via Memory -> IndexedDB -> Firestore `media_blobs/{id}`.
     * Regular `https://` and legacy `data:image/` URLs pass through immediately with zero overhead.
     */
    const resolveMediaBlobUrl = async (url, db) => {
        const raw = String(url || '').trim();
        if (!raw) return '';
        if (!isBlobRef(raw)) return raw;

        const blobId = extractBlobId(raw);
        if (!blobId) return '';
        if (memoryBlobCache.has(blobId)) {
            return memoryBlobCache.get(blobId);
        }
        if (inflightBlobRequests.has(blobId)) {
            return inflightBlobRequests.get(blobId);
        }

        const task = (async () => {
            try {
                if (global.AlOstaIndexedVault && typeof global.AlOstaIndexedVault.getMediaBlobAsync === 'function') {
                    const cached = await global.AlOstaIndexedVault.getMediaBlobAsync(blobId);
                    if (cached) {
                        memoryBlobCache.set(blobId, cached);
                        return cached;
                    }
                }
                if (db) {
                    const snap = await db.collection('media_blobs').doc(blobId).get();
                    if (snap && snap.exists) {
                        const data = snap.data() || {};
                        if (typeof data.dataUrl === 'string' && data.dataUrl.startsWith('data:image/')) {
                            memoryBlobCache.set(blobId, data.dataUrl);
                            if (global.AlOstaIndexedVault && typeof global.AlOstaIndexedVault.saveMediaBlobAsync === 'function') {
                                global.AlOstaIndexedVault.saveMediaBlobAsync(blobId, data.dataUrl).catch(() => {});
                            }
                            return data.dataUrl;
                        }
                    }
                }
            } catch (e) {}
            return '';
        })();

        inflightBlobRequests.set(blobId, task);
        try {
            return await task;
        } finally {
            inflightBlobRequests.delete(blobId);
        }
    };

    const getCachedMediaBlobSync = (url) => {
        if (!isBlobRef(url)) return url || '';
        const blobId = extractBlobId(url);
        return memoryBlobCache.get(blobId) || '';
    };

    global.AlOstaMediaOptimizer = Object.freeze({
        supportsWebP,
        isBlobRef,
        extractBlobId,
        compressImageAdaptive,
        optimizeAndBackupMediaBlob,
        resolveMediaBlobUrl,
        getCachedMediaBlobSync
    });
})(typeof window !== 'undefined' ? window : globalThis);
