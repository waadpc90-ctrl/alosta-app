/**
 * Module 04: Al-Osta Differential IndexedDB Vault, Sync Queue State Tracker & Financial Audit Logger
 * Solves: 5MB localStorage ceiling, full-DB JSON.stringify jank on every write, silent cloud drops, and audit trail.
 * Stores each Firestore collection under its own IndexedDB record key (`col_<name>`) so mutations persist O(1) per dirty collection.
 */
(function (global) {
    'use strict';

    const DB_NAME = 'alosta_vault_db_v1';
    const STORE_NAME = 'kv_store';
    const LEGACY_RECORD_KEY = 'smart_db_snapshot';
    const COL_INDEX_KEY = 'smart_db_col_index_v2';
    const COL_PREFIX = 'col_v2_';
    const MEDIA_BLOB_PREFIX = 'media_v2_';
    const PENDING_QUEUE_KEY = 'smart_db_pending_ops';

    let idbPromise = null;
    const syncState = {
        status: 'synced', // 'synced' | 'syncing' | 'offline' | 'pending'
        pendingCount: 0,
        lastSyncedAt: Date.now(),
        lastError: ''
    };

    const emitSyncState = () => {
        try {
            if (typeof global.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
                global.dispatchEvent(new CustomEvent('alosta-sync-state', { detail: { ...syncState } }));
            }
        } catch (e) {}
    };

    const openDb = () => {
        if (idbPromise) return idbPromise;
        if (typeof global.indexedDB === 'undefined') {
            return Promise.resolve(null);
        }
        idbPromise = new Promise((resolve) => {
            try {
                const req = global.indexedDB.open(DB_NAME, 1);
                req.onupgradeneeded = (ev) => {
                    try {
                        const db = ev.target.result;
                        if (!db.objectStoreNames.contains(STORE_NAME)) {
                            db.createObjectStore(STORE_NAME);
                        }
                    } catch (e) {}
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
        return idbPromise;
    };

    const idbGet = async (key) => {
        const db = await openDb();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const req = tx.objectStore(STORE_NAME).get(key);
                req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    };

    const idbSet = async (key, value) => {
        const db = await openDb();
        if (!db) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put(value, key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    };

    /**
     * Differential per-collection write: persists ONLY modified collections in a single IndexedDB transaction.
     * Avoids serializing & rewriting megabytes of unchanged collections on every tick.
     */
    const saveCollectionsAsync = async (dirtyCollectionsMap, allKnownColNames = null) => {
        const db = await openDb();
        if (!db || !dirtyCollectionsMap || typeof dirtyCollectionsMap !== 'object') return false;
        const dirtyKeys = Object.keys(dirtyCollectionsMap);
        if (dirtyKeys.length === 0) return true;
        try {
            let colIndex = await idbGet(COL_INDEX_KEY);
            const colSet = new Set(Array.isArray(colIndex) ? colIndex : []);
            if (Array.isArray(allKnownColNames)) {
                allKnownColNames.forEach(c => colSet.add(c));
            }
            dirtyKeys.forEach(c => colSet.add(c));
            const nextIndex = Array.from(colSet);

            return await new Promise((resolve) => {
                try {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    const objStore = tx.objectStore(STORE_NAME);
                    dirtyKeys.forEach((colName) => {
                        objStore.put(dirtyCollectionsMap[colName] || {}, COL_PREFIX + colName);
                    });
                    objStore.put(nextIndex, COL_INDEX_KEY);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                } catch (e) {
                    resolve(false);
                }
            });
        } catch (e) {
            return false;
        }
    };

    /**
     * Hydrates all per-collection records from IndexedDB (with automatic fallback to legacy monolithic snapshot).
     */
    const loadSnapshotAsync = async () => {
        try {
            const colIndex = await idbGet(COL_INDEX_KEY);
            if (Array.isArray(colIndex) && colIndex.length > 0) {
                const db = await openDb();
                if (!db) return null;
                const hydrated = {};
                await Promise.all(colIndex.map(async (colName) => {
                    const data = await idbGet(COL_PREFIX + colName);
                    if (data && typeof data === 'object') {
                        hydrated[colName] = data;
                    }
                }));
                if (Object.keys(hydrated).length > 0) {
                    return hydrated;
                }
            }
            // Fallback to legacy single-blob snapshot if user upgrades from v1.0.16
            const val = await idbGet(LEGACY_RECORD_KEY);
            if (val && typeof val === 'object') {
                // Migrate lazily to per-collection keys in background
                saveCollectionsAsync(val, Object.keys(val)).catch(() => {});
                return val;
            }
            if (typeof val === 'string' && val.startsWith('{')) {
                const parsed = JSON.parse(val);
                saveCollectionsAsync(parsed, Object.keys(parsed)).catch(() => {});
                return parsed;
            }
            return null;
        } catch (e) {
            return null;
        }
    };

    const saveSnapshotAsync = async (storeObj) => {
        if (!storeObj || typeof storeObj !== 'object') return false;
        return await saveCollectionsAsync(storeObj, Object.keys(storeObj));
    };

    // Dedicated IndexedDB cache for decoupled media blobs (`blob://media_...`)
    const getMediaBlobAsync = async (blobId) => {
        if (!blobId) return null;
        const val = await idbGet(MEDIA_BLOB_PREFIX + blobId);
        return typeof val === 'string' && val.length > 0 ? val : null;
    };

    const saveMediaBlobAsync = async (blobId, dataUrl) => {
        if (!blobId || !dataUrl) return false;
        return await idbSet(MEDIA_BLOB_PREFIX + blobId, String(dataUrl));
    };

    const loadPendingOpsAsync = async () => {
        try {
            const ops = await idbGet(PENDING_QUEUE_KEY);
            return Array.isArray(ops) ? ops : [];
        } catch (e) {
            return [];
        }
    };

    const savePendingOpsAsync = async (ops) => {
        try {
            const safeOps = Array.isArray(ops) ? ops.slice(-300) : [];
            syncState.pendingCount = safeOps.length;
            syncState.status = safeOps.length > 0
                ? (global.navigator && global.navigator.onLine === false ? 'offline' : 'pending')
                : 'synced';
            emitSyncState();
            return await idbSet(PENDING_QUEUE_KEY, safeOps);
        } catch (e) {
            return false;
        }
    };

    const updateSyncStatus = (patch) => {
        Object.assign(syncState, patch || {});
        if (syncState.status === 'synced') {
            syncState.lastSyncedAt = Date.now();
            syncState.lastError = '';
        }
        emitSyncState();
    };

    const getSyncStatus = () => ({ ...syncState });

    const logAuditEvent = async (db, adminId, action, targetCollection, targetId, summary = {}) => {
        if (!db || !adminId || !action) return;
        try {
            await db.collection('audit_logs').add({
                adminId: String(adminId),
                action: String(action).slice(0, 64),
                targetCollection: String(targetCollection || '').slice(0, 48),
                targetId: String(targetId || '').slice(0, 128),
                summary: typeof summary === 'object' && summary !== null ? summary : { note: String(summary || '') },
                timestamp: Date.now(),
                date: new Date().toISOString().slice(0, 10)
            });
        } catch (e) {}
    };

    global.AlOstaIndexedVault = Object.freeze({
        loadSnapshotAsync,
        saveSnapshotAsync,
        saveCollectionsAsync,
        getMediaBlobAsync,
        saveMediaBlobAsync,
        loadPendingOpsAsync,
        savePendingOpsAsync,
        updateSyncStatus,
        getSyncStatus
    });

    global.AlOstaAuditLogger = Object.freeze({
        logEvent: logAuditEvent
    });
})(typeof window !== 'undefined' ? window : globalThis);
