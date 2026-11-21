/**
 * Module 04: Al-Osta IndexedDB Vault, Sync Queue State Tracker & Financial Audit Logger
 * Solves: 5MB localStorage ceiling, silent cloud write drops, and financial mutation auditing.
 */
(function (global) {
    'use strict';

    const DB_NAME = 'alosta_vault_db_v1';
    const STORE_NAME = 'kv_store';
    const RECORD_KEY = 'smart_db_snapshot';
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

    const loadSnapshotAsync = async () => {
        try {
            const val = await idbGet(RECORD_KEY);
            if (val && typeof val === 'object') return val;
            if (typeof val === 'string' && val.startsWith('{')) return JSON.parse(val);
            return null;
        } catch (e) {
            return null;
        }
    };

    const saveSnapshotAsync = async (storeObj) => {
        try {
            return await idbSet(RECORD_KEY, storeObj);
        } catch (e) {
            return false;
        }
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
        loadPendingOpsAsync,
        savePendingOpsAsync,
        updateSyncStatus,
        getSyncStatus
    });

    global.AlOstaAuditLogger = Object.freeze({
        logEvent: logAuditEvent
    });
})(typeof window !== 'undefined' ? window : globalThis);
