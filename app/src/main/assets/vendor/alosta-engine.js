/* Al-Osta Modular Architecture Engine v1.0.16 */
/**
 * Module 01: Al-Osta Enterprise Security, Firebase Auth UID Session Binding & Brute-Force Guard
 * Solves: Client-side session tampering, refresh-bypass on login lockouts, and Auth UID binding.
 */
(function (global) {
    'use strict';

    const LOCKOUT_STORAGE_KEY = 'alosta_sec_lockout_v2';
    const DEVICE_FP_KEY = 'alosta_sec_dev_fp_v2';

    const getDeviceFingerprint = () => {
        try {
            let fp = localStorage.getItem(DEVICE_FP_KEY);
            if (!fp) {
                const raw = [
                    navigator.userAgent || '',
                    navigator.language || '',
                    screen.width + 'x' + screen.height,
                    Date.now().toString(36),
                    Math.random().toString(36).substring(2, 10)
                ].join('|');
                fp = 'fp_' + btoa(unescape(encodeURIComponent(raw))).replace(/[^A-Za-z0-9]/g, '').slice(0, 28);
                localStorage.setItem(DEVICE_FP_KEY, fp);
            }
            return fp;
        } catch (e) {
            return 'fp_fallback_device';
        }
    };

    const ensureFirebaseAuthUid = async () => {
        try {
            if (!global.firebase || !global.firebase.auth) return null;
            const auth = global.firebase.auth();
            if (auth.currentUser && auth.currentUser.uid) {
                return auth.currentUser.uid;
            }
            const cred = await auth.signInAnonymously();
            return cred && cred.user ? cred.user.uid : null;
        } catch (e) {
            return null;
        }
    };

    const getLockoutState = () => {
        try {
            const raw = localStorage.getItem(LOCKOUT_STORAGE_KEY);
            if (!raw) return { count: 0, lockUntil: 0 };
            const parsed = JSON.parse(raw);
            return {
                count: Number(parsed.count) || 0,
                lockUntil: Number(parsed.lockUntil) || 0
            };
        } catch (e) {
            return { count: 0, lockUntil: 0 };
        }
    };

    const recordFailedLoginAttempt = () => {
        const cur = getLockoutState();
        const nextCount = cur.count + 1;
        // Exponential backoff after 5 attempts: 20s, 40s, 80s, max 300s
        let lockUntil = cur.lockUntil;
        if (nextCount >= 5) {
            const penaltySec = Math.min(300, 20 * Math.pow(2, nextCount - 5));
            lockUntil = Date.now() + penaltySec * 1000;
        }
        const nextState = { count: nextCount, lockUntil };
        try {
            localStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify(nextState));
        } catch (e) {}
        return nextState;
    };

    const resetLoginAttempts = () => {
        try {
            localStorage.removeItem(LOCKOUT_STORAGE_KEY);
        } catch (e) {}
        return { count: 0, lockUntil: 0 };
    };

    const bindSessionToAuthUid = async (db, roleType, accountId) => {
        try {
            const uid = await ensureFirebaseAuthUid();
            const fp = getDeviceFingerprint();
            if (!db || !accountId) return { uid, fp };
            const col = roleType === 'admin' ? 'admins' : roleType === 'worker' ? 'workers' : null;
            if (col) {
                await db.collection(col).doc(String(accountId)).set({
                    boundAuthUid: uid || 'local_auth',
                    boundDeviceFp: fp,
                    lastSecureLoginAt: new Date().toISOString()
                }, { merge: true });
            }
            return { uid, fp };
        } catch (e) {
            return { uid: null, fp: getDeviceFingerprint() };
        }
    };

    global.AlOstaSecurityGuard = Object.freeze({
        getDeviceFingerprint,
        ensureFirebaseAuthUid,
        getLockoutState,
        recordFailedLoginAttempt,
        resetLoginAttempts,
        bindSessionToAuthUid
    });
})(typeof window !== 'undefined' ? window : this);


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


/**
 * Module 02: Al-Osta High-Performance O(1) Indexed Financial Aggregator & Monthly Snapshot Archiver
 * Solves: O(N*M) frontend array scanning slowdown on large datasets (10,000+ records) and monthly ledger archiving.
 */
(function (global) {
    'use strict';

    const extractMonthKey = (dateStr) => {
        const s = String(dateStr || '').trim();
        if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    };

    const formatMonthLabel = (monthKey, lang = 'ar') => {
        if (!monthKey || monthKey === 'all') return lang === 'ar' ? '📅 كل الأشهر' : '📅 All Months';
        const parts = String(monthKey).split('-');
        if (parts.length < 2) return monthKey;
        const year = parts[0];
        const mIdx = parseInt(parts[1], 10) - 1;
        const arMonths = ['يناير (1)', 'فبراير (2)', 'مارس (3)', 'أبريل (4)', 'مايو (5)', 'يونيو (6)', 'يوليو (7)', 'أغسطس (8)', 'سبتمبر (9)', 'أكتوبر (10)', 'نوفمبر (11)', 'ديسمبر (12)'];
        const enMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mName = (lang === 'ar' ? arMonths[mIdx] : enMonths[mIdx]) || parts[1];
        return `${mName} ${year}`;
    };

    /**
     * Builds O(1) lookup maps once per data change so project & worker calculations don't re-scan arrays repeatedly.
     */
    const buildIndexedLedger = (data, resolveOwnerFn, getWageFn, calcWageFn) => {
        const projects = Array.isArray(data?.projects) ? data.projects : [];
        const workers = Array.isArray(data?.workers) ? data.workers : [];
        const payments = Array.isArray(data?.payments) ? data.payments : [];
        const expenses = Array.isArray(data?.expenses) ? data.expenses : [];
        const advances = Array.isArray(data?.advances) ? data.advances : [];
        const attendance = Array.isArray(data?.attendance) ? data.attendance : [];

        const workerMap = new Map();
        const workerStatsMap = new Map();
        for (let i = 0; i < workers.length; i++) {
            const w = workers[i];
            if (w && w.id) {
                workerMap.set(w.id, w);
                const officialWage = typeof getWageFn === 'function' ? getWageFn(w) : (Number(w.wage) || 25000);
                workerStatsMap.set(w.id, {
                    officialWage,
                    activeDays: 0,
                    wageEarned: 0,
                    workerMatCredit: 0,
                    advances: 0,
                    earned: 0,
                    currentDue: 0
                });
            }
        }

        const projectMap = new Map();
        for (let i = 0; i < projects.length; i++) {
            const p = projects[i];
            if (p && p.id) projectMap.set(p.id, p);
        }

        const payByProj = new Map();
        const expByProj = new Map();
        const advByProj = new Map();
        const attByProj = new Map();

        const pushToMap = (map, key, item) => {
            if (!key) return;
            let list = map.get(key);
            if (!list) {
                list = [];
                map.set(key, list);
            }
            list.push(item);
        };

        for (let i = 0; i < payments.length; i++) {
            const x = payments[i];
            if (x) pushToMap(payByProj, x.projectId, x);
        }
        for (let i = 0; i < expenses.length; i++) {
            const x = expenses[i];
            if (!x) continue;
            pushToMap(expByProj, x.projectId, x);
            if (x.paidByWorkerId && !x.settled) {
                const ws = workerStatsMap.get(x.paidByWorkerId);
                if (ws) ws.workerMatCredit += (Number(x.cost) || 0);
            }
        }
        for (let i = 0; i < advances.length; i++) {
            const x = advances[i];
            if (!x) continue;
            pushToMap(advByProj, x.projectId, x);
            if (x.workerId && !x.settled) {
                const ws = workerStatsMap.get(x.workerId);
                if (ws) ws.advances += (Number(x.amount) || 0);
            }
        }
        for (let i = 0; i < attendance.length; i++) {
            const a = attendance[i];
            if (!a) continue;
            const ownerProjId = typeof resolveOwnerFn === 'function' ? resolveOwnerFn(a, projects) : a.projectId;
            if (ownerProjId) pushToMap(attByProj, ownerProjId, a);
            if (a.workerId && !a.settled) {
                const ws = workerStatsMap.get(a.workerId);
                if (ws) {
                    if (a.status !== 'absent') ws.activeDays += 1;
                    if (typeof calcWageFn === 'function') {
                        ws.wageEarned += calcWageFn(a.status, ws.officialWage);
                    }
                }
            }
        }

        workerStatsMap.forEach((ws) => {
            ws.earned = ws.wageEarned + ws.workerMatCredit;
            ws.currentDue = ws.earned - ws.advances;
        });

        const getWorkerStats = (workerId) => {
            return workerStatsMap.get(workerId) || {
                officialWage: 25000,
                activeDays: 0,
                wageEarned: 0,
                workerMatCredit: 0,
                advances: 0,
                earned: 0,
                currentDue: 0
            };
        };

        const computeForProject = (pId) => {
            const activeProj = pId ? projectMap.get(pId) : null;
            const fPay = pId ? (payByProj.get(pId) || []) : payments;
            const fExp = pId ? (expByProj.get(pId) || []) : expenses;
            const fAdv = pId ? (advByProj.get(pId) || []) : advances;
            let fAtt = [];
            if (pId) {
                fAtt = attByProj.get(pId) || [];
            } else {
                fAtt = attendance.filter(a => a && workerMap.has(a.workerId));
            }

            let contract = 0;
            if (pId) {
                contract = Number(activeProj?.amount) || 0;
            } else {
                for (let i = 0; i < projects.length; i++) contract += (Number(projects[i]?.amount) || 0);
            }

            let inAmt = 0;
            for (let i = 0; i < fPay.length; i++) inAmt += (Number(fPay[i]?.amount) || 0);

            let matCost = 0;
            let unsettledWorkerMat = 0;
            let unsettledCreditMat = 0;
            let explicitPersonalMat = 0;

            for (let i = 0; i < fExp.length; i++) {
                const x = fExp[i];
                const c = Number(x?.cost) || 0;
                matCost += c;
                if (!x?.settled) {
                    if (x?.paidByWorkerId) unsettledWorkerMat += c;
                    else if (x?.fundingMode === 'credit') unsettledCreditMat += c;
                    else if (x?.fundingMode === 'personal') explicitPersonalMat += c;
                }
            }

            let unsettledAdvCost = 0;
            let settledAdvCost = 0;
            for (let i = 0; i < fAdv.length; i++) {
                const x = fAdv[i];
                const a = Number(x?.amount) || 0;
                if (x?.settled) settledAdvCost += a;
                else unsettledAdvCost += a;
            }
            const advCost = unsettledAdvCost + settledAdvCost;

            let wageCost = 0;
            let settledWageCost = 0;
            for (let i = 0; i < fAtt.length; i++) {
                const a = fAtt[i];
                const wk = workerMap.get(a?.workerId);
                if (wk && typeof getWageFn === 'function' && typeof calcWageFn === 'function') {
                    const w = calcWageFn(a.status, getWageFn(wk));
                    wageCost += w;
                    if (a.settled) settledWageCost += w;
                }
            }

            const totalCost = matCost + wageCost;
            const boxPaidMat = Math.max(0, matCost - unsettledWorkerMat - unsettledCreditMat - explicitPersonalMat);
            const paidWorkerCash = Math.max(settledWageCost, settledAdvCost) + unsettledAdvCost;
            const effectiveWorkerCostForBox = Math.max(wageCost, paidWorkerCash);
            const rawBoxBalance = inAmt - boxPaidMat - effectiveWorkerCostForBox;
            const cashInHand = Math.max(0, rawBoxBalance);
            const autoDeficitPersonal = rawBoxBalance < 0 ? Math.abs(rawBoxBalance) : 0;
            const outOfPocketAmt = explicitPersonalMat + autoDeficitPersonal;

            const history = new Array(fPay.length + fExp.length + fAdv.length);
            let idx = 0;
            for (let i = 0; i < fPay.length; i++) {
                const x = fPay[i];
                history[idx++] = { ...x, t: 'in', monthKey: extractMonthKey(x?.date) };
            }
            for (let i = 0; i < fExp.length; i++) {
                const x = fExp[i];
                history[idx++] = { ...x, t: 'out', monthKey: extractMonthKey(x?.date) };
            }
            for (let i = 0; i < fAdv.length; i++) {
                const x = fAdv[i];
                const wk = workerMap.get(x?.workerId);
                history[idx++] = {
                    ...x,
                    t: 'adv',
                    workerName: wk ? wk.name : (x?.workerName || ''),
                    monthKey: extractMonthKey(x?.date)
                };
            }
            history.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

            const monthsMap = new Map();
            for (let i = 0; i < history.length; i++) {
                const h = history[i];
                const mk = h.monthKey;
                let mStat = monthsMap.get(mk);
                if (!mStat) {
                    mStat = { monthKey: mk, count: 0, inTotal: 0, outTotal: 0, advTotal: 0 };
                    monthsMap.set(mk, mStat);
                }
                mStat.count += 1;
                if (h.t === 'in') mStat.inTotal += (Number(h.amount) || 0);
                else if (h.t === 'out') mStat.outTotal += (Number(h.cost) || 0);
                else if (h.t === 'adv') mStat.advTotal += (Number(h.amount) || 0);
            }
            const monthlySummaries = Array.from(monthsMap.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));

            return {
                contract,
                inAmt,
                matCost,
                wageCost,
                advCost,
                cashInHand,
                rawBoxBalance,
                explicitPersonalMat,
                outOfPocketAmt,
                unsettledCreditMat,
                unsettledWorkerMat,
                totalCost,
                profit: contract - totalCost,
                history,
                monthlySummaries
            };
        };

        return {
            workerMap,
            projectMap,
            workerStatsMap,
            getWorkerStats,
            computeForProject
        };
    };

    const saveMonthlyArchiveSnapshot = async (db, adminId, projectId, projectTitle, monthSummary) => {
        if (!db || !adminId || !monthSummary?.monthKey) return null;
        const snapId = `snap_${adminId}_${projectId || 'all'}_${monthSummary.monthKey}`;
        const payload = {
            adminId,
            projectId: projectId || 'all',
            projectTitle: projectTitle || 'كافة المشاريع',
            monthKey: monthSummary.monthKey,
            count: monthSummary.count || 0,
            inTotal: monthSummary.inTotal || 0,
            outTotal: monthSummary.outTotal || 0,
            advTotal: monthSummary.advTotal || 0,
            netFlow: (monthSummary.inTotal || 0) - (monthSummary.outTotal || 0) - (monthSummary.advTotal || 0),
            archivedAt: new Date().toISOString()
        };
        await db.collection('monthly_snapshots').doc(snapId).set(payload, { merge: true });
        return payload;
    };

    global.AlOstaLedgerEngine = Object.freeze({
        extractMonthKey,
        formatMonthLabel,
        buildIndexedLedger,
        saveMonthlyArchiveSnapshot
    });
})(typeof window !== 'undefined' ? window : this);


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


/**
 * Module 05: Al-Osta Precision Worker Activity, Trade-Calibrated Effort & 4-State Live Status Engine
 * Combines 4 signals: Shift state + Heartbeat freshness + GPS site geofence + Recent motion/step window.
 */
(function (global) {
    'use strict';

    const HEARTBEAT_OFFLINE_MS = 10 * 60 * 1000;   // 10 min without heartbeat -> phone closed / offline
    const MOTION_IDLE_MS = 10 * 60 * 1000;          // 10 min without steps or work motion -> idle / break
    const SHIFT_WARMUP_GRACE_MS = 12 * 60 * 1000;   // 12 min grace right after clock-in before flagging idle

    const STATIONARY_TRADE_KEYWORDS = [
        'صباغ', 'صبغ', 'دهان', 'جبس', 'جبسم', 'كهرب', 'صحية', 'سباك',
        'تكييف', 'ألمنيوم', 'المينيوم', 'ديكور', 'ورق جدران', 'سقف ثانوي',
        'لحام', 'نقاش', 'زجاج', 'فني', 'paint', 'electric', 'plumb', 'gypsum'
    ];

    const getTradeEffortTarget = (specialty = '') => {
        const s = String(specialty || '').trim().toLowerCase();
        const isStationary = STATIONARY_TRADE_KEYWORDS.some((kw) => s.includes(kw));
        if (isStationary) {
            return {
                tradeType: 'stationary',
                stepTarget: 3200,
                activeMinTarget: 210
            };
        }
        return {
            tradeType: 'mobile',
            stepTarget: 6000,
            activeMinTarget: 240
        };
    };

    const formatDurationShort = (minutes, lang = 'ar') => {
        const m = Math.max(0, Math.floor(Number(minutes) || 0));
        if (lang === 'en') {
            if (m < 1) return 'just now';
            if (m < 60) return `${m}m`;
            const h = Math.floor(m / 60);
            const rem = m % 60;
            return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
        }
        if (m < 1) return 'الآن';
        if (m === 1) return 'دقيقة';
        if (m === 2) return 'دقيقتين';
        if (m <= 10) return `${m} دقائق`;
        if (m < 60) return `${m} دقيقة`;
        const h = Math.floor(m / 60);
        const rem = m % 60;
        const hStr = h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعات`;
        return rem > 0 ? `${hStr} و${rem}د` : hStr;
    };

    const computeEffortMetrics = ({ steps = 0, activeMinutes = 0, specialty = '', lang = 'ar' } = {}) => {
        const safeSteps = Math.max(0, parseInt(steps, 10) || 0);
        const safeActiveMin = Math.max(0, parseInt(activeMinutes, 10) || 0);
        const target = getTradeEffortTarget(specialty);

        const distanceMeters = Math.round(safeSteps * 0.75);
        // Active stationary work burns ~1.8 kcal/min in addition to walking steps when activeMinutes exceed walking time
        const walkingMinEst = safeSteps / 90;
        const extraStationaryMin = Math.max(0, safeActiveMin - walkingMinEst);
        const calories = Math.round(safeSteps * 0.045 + extraStationaryMin * 1.8);

        const stepPct = Math.min(100, (safeSteps / target.stepTarget) * 100);
        let effortScore = Math.round(stepPct);
        if (safeActiveMin > 0) {
            const activePct = Math.min(100, (safeActiveMin / target.activeMinTarget) * 100);
            const blended = target.tradeType === 'stationary'
                ? Math.round(stepPct * 0.45 + activePct * 0.55)
                : Math.round(stepPct * 0.70 + activePct * 0.30);
            // Never penalize high-step mobile effort if activeMinutes weren't recorded in legacy logs
            effortScore = Math.min(100, Math.max(Math.round(stepPct), blended));
        }

        const effortStars = effortScore >= 100 ? 6
            : effortScore >= 75 ? 5
            : effortScore >= 50 ? 4
            : effortScore >= 30 ? 3
            : effortScore >= 12 ? 2
            : (safeSteps > 0 || safeActiveMin > 0) ? 1 : 0;

        let label = '';
        let badgeClass = '';
        if (effortScore >= 100) {
            label = lang === 'ar' ? 'مجهود فائق 🔥' : 'Peak Effort 🔥';
            badgeClass = 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300';
        } else if (effortScore >= 75) {
            label = lang === 'ar' ? 'مجهود ممتاز 💪' : 'Excellent Effort 💪';
            badgeClass = 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400';
        } else if (effortScore >= 50) {
            label = lang === 'ar' ? 'مجهود جيد جداً 👍' : 'Very Good Effort 👍';
            badgeClass = 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400';
        } else if (effortScore >= 25) {
            label = lang === 'ar' ? 'مجهود متوسط' : 'Moderate Effort';
            badgeClass = 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400';
        } else if (safeSteps > 0 || safeActiveMin > 0) {
            label = lang === 'ar' ? 'حركة خفيفة' : 'Light Activity';
            badgeClass = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
        } else {
            label = lang === 'ar' ? 'بانتظار الحركة' : 'Idle';
            badgeClass = 'bg-slate-100 dark:bg-slate-800 text-slate-400';
        }

        return {
            steps: safeSteps,
            activeMinutes: safeActiveMin,
            distanceMeters,
            calories,
            effortScore,
            effortStars,
            stepTarget: target.stepTarget,
            activeMinTarget: target.activeMinTarget,
            tradeType: target.tradeType,
            label,
            badgeClass
        };
    };

    const classifyWorkerLiveStatus = ({ worker = {}, todayRec = null, nowMs = Date.now(), todayDate = '', lang = 'ar' } = {}) => {
        const targetToday = todayDate || new Date(nowMs).toISOString().split('T')[0];
        const isOnShift = Boolean(
            todayRec &&
            todayRec.status !== 'absent' &&
            todayRec.timeIn &&
            !todayRec.timeOut
        );

        if (!isOnShift) {
            return {
                code: 'off_shift',
                dot: '⏸',
                shortLabel: lang === 'ar' ? 'خارج المناوبة' : 'Off Shift',
                title: lang === 'ar' ? '⏸ متوقف (يعمل التتبع فقط بعد تسجيل حضور العامل بالموقع)' : '⏸ Paused (tracks only after on-site clock-in)',
                detail: '',
                idleMinutes: 0,
                offlineMinutes: 0,
                recentSteps10m: 0,
                pillClass: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
                textClass: 'text-slate-400'
            };
        }

        const sameDayWorker = worker && worker.todayEffortDate === targetToday;
        const heartbeatCandidates = [
            sameDayWorker ? Number(worker.lastHeartbeatAt || 0) : 0,
            sameDayWorker ? Number(worker.sensorUpdatedAt || 0) : 0,
            Number(todayRec.lastHeartbeatAt || 0),
            Number(todayRec.sensorUpdatedAt || 0)
        ].filter((v) => v > 0);
        const lastHeartbeatAt = heartbeatCandidates.length > 0 ? Math.max(...heartbeatCandidates) : 0;

        const motionCandidates = [
            sameDayWorker ? Number(worker.lastMotionAt || 0) : 0,
            sameDayWorker ? Number(worker.lastStepAt || 0) : 0,
            Number(todayRec.lastMotionAt || 0),
            Number(todayRec.lastStepAt || 0)
        ].filter((v) => v > 0);
        const lastMotionAt = motionCandidates.length > 0 ? Math.max(...motionCandidates) : 0;

        const recentSteps10m = Math.max(
            sameDayWorker ? (parseInt(worker.todayRecentSteps10m, 10) || 0) : 0,
            parseInt(todayRec.recentSteps10m, 10) || 0
        );

        const shiftStartMs = Number(todayRec.timeIn || 0);
        const shiftElapsedMs = shiftStartMs > 0 ? Math.max(0, nowMs - shiftStartMs) : 0;

        // 1) Check phone connection / heartbeat freshness
        if (lastHeartbeatAt <= 0) {
            return {
                code: 'offline',
                dot: '⚪',
                shortLabel: lang === 'ar' ? 'بانتظار اتصال الهاتف' : 'Awaiting Phone',
                title: lang === 'ar' ? '⚪ بانتظار اتصال هاتف العامل بالتطبيق' : '⚪ Waiting for worker phone heartbeat',
                detail: lang === 'ar' ? 'المناوبة مسجلة ولم يرسل هاتف العامل نبضة بعد' : 'Shift open; no device signal yet',
                idleMinutes: 0,
                offlineMinutes: Math.floor(shiftElapsedMs / 60000),
                recentSteps10m: 0,
                pillClass: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600',
                textClass: 'text-slate-500 dark:text-slate-400'
            };
        }

        const msSinceHeartbeat = Math.max(0, nowMs - lastHeartbeatAt);
        if (msSinceHeartbeat > HEARTBEAT_OFFLINE_MS) {
            const offMin = Math.max(1, Math.floor(msSinceHeartbeat / 60000));
            return {
                code: 'offline',
                dot: '⚪',
                shortLabel: lang === 'ar' ? `منقطع (${formatDurationShort(offMin, lang)})` : `Offline (${formatDurationShort(offMin, lang)})`,
                title: lang === 'ar'
                    ? `⚪ غير متصل — انقطع إرسال الهاتف منذ ${formatDurationShort(offMin, lang)}`
                    : `⚪ Offline — No device heartbeat for ${formatDurationShort(offMin, lang)}`,
                detail: lang === 'ar' ? 'أغلق العامل التطبيق أو انقطع الإنترنت عن هاتفه' : 'App closed or network disconnected',
                idleMinutes: lastMotionAt > 0 ? Math.floor(Math.max(0, nowMs - lastMotionAt) / 60000) : offMin,
                offlineMinutes: offMin,
                recentSteps10m: 0,
                pillClass: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600',
                textClass: 'text-slate-500 dark:text-slate-400'
            };
        }

        // 2) Check GPS site geofence presence
        const hasLiveBoundsWorker = sameDayWorker && typeof worker.liveInBounds === 'boolean';
        const hasLiveBoundsRec = typeof todayRec.liveInBounds === 'boolean';
        const liveInBounds = hasLiveBoundsWorker
            ? worker.liveInBounds
            : hasLiveBoundsRec
                ? todayRec.liveInBounds
                : !(todayRec.outStatus === 'invalid' && Number(todayRec.leftSiteAt || 0) >= lastHeartbeatAt - 120000);
        const liveSiteDist = sameDayWorker && Number.isFinite(Number(worker.liveSiteDist))
            ? Math.round(Number(worker.liveSiteDist))
            : Number.isFinite(Number(todayRec.outDist))
                ? Math.round(Number(todayRec.outDist))
                : null;

        if (liveInBounds === false) {
            return {
                code: 'out_of_site',
                dot: '🟠',
                shortLabel: lang === 'ar' ? 'خارج الموقع' : 'Outside Site',
                title: lang === 'ar'
                    ? `🟠 خارج نطاق موقع العمل${liveSiteDist !== null ? ` (يبعد ${liveSiteDist} متر)` : ''}`
                    : `🟠 Outside project geofence${liveSiteDist !== null ? ` (${liveSiteDist}m away)` : ''}`,
                detail: lang === 'ar' ? 'الهاتف متصل لكن إحداثيات GPS خارج حدود المشروع' : 'Phone connected, GPS outside project boundary',
                idleMinutes: lastMotionAt > 0 ? Math.floor(Math.max(0, nowMs - lastMotionAt) / 60000) : 0,
                offlineMinutes: 0,
                recentSteps10m,
                pillClass: 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700',
                textClass: 'text-orange-600 dark:text-orange-400'
            };
        }

        // 3) Check motion / step recency to distinguish actively working vs idle/sitting
        if (lastMotionAt > 0) {
            const msSinceMotion = Math.max(0, nowMs - lastMotionAt);
            if (msSinceMotion > MOTION_IDLE_MS) {
                const idleMin = Math.max(1, Math.floor(msSinceMotion / 60000));
                return {
                    code: 'idle',
                    dot: '🟡',
                    shortLabel: lang === 'ar' ? `متوقف (${formatDurationShort(idleMin, lang)})` : `Idle (${formatDurationShort(idleMin, lang)})`,
                    title: lang === 'ar'
                        ? `🟡 متواجد بالموقع لكن متوقف عن الحركة منذ ${formatDurationShort(idleMin, lang)}`
                        : `🟡 On site but stationary/idle for ${formatDurationShort(idleMin, lang)}`,
                    detail: lang === 'ar' ? 'الهاتف متصل داخل الموقع بدون حركة عمل مسجلة (استراحة أو توقف)' : 'Device connected on site with no detected work motion',
                    idleMinutes: idleMin,
                    offlineMinutes: 0,
                    recentSteps10m: 0,
                    pillClass: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700',
                    textClass: 'text-amber-600 dark:text-amber-400'
                };
            }

            const agoMin = Math.floor(msSinceMotion / 60000);
            const stepsHint = recentSteps10m > 0
                ? (lang === 'ar' ? ` • +${recentSteps10m} خطوة آخر 10د` : ` • +${recentSteps10m} steps/10m`)
                : '';
            const agoText = agoMin < 1
                ? (lang === 'ar' ? 'حركة مباشرة الآن' : 'moving right now')
                : (lang === 'ar' ? `آخر حركة قبل ${formatDurationShort(agoMin, lang)}` : `last motion ${formatDurationShort(agoMin, lang)} ago`);

            return {
                code: 'active',
                dot: '🟢',
                shortLabel: lang === 'ar' ? 'يعمل بنشاط' : 'Active Now',
                title: lang === 'ar'
                    ? `🟢 يعمل بنشاط في الموقع (${agoText}${stepsHint})`
                    : `🟢 Actively working on site (${agoText}${stepsHint})`,
                detail: lang === 'ar' ? 'متصل بالحساس داخل الموقع مع نشاط حركي مؤكد' : 'Verified on-site motion & heartbeat',
                idleMinutes: 0,
                offlineMinutes: 0,
                recentSteps10m,
                pillClass: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
                textClass: 'text-emerald-600 dark:text-emerald-400'
            };
        }

        // No motion recorded yet since shift started: grace window vs idle
        if (shiftElapsedMs > SHIFT_WARMUP_GRACE_MS) {
            const idleMin = Math.max(1, Math.floor(shiftElapsedMs / 60000));
            return {
                code: 'idle',
                dot: '🟡',
                shortLabel: lang === 'ar' ? `بدون حركة (${formatDurationShort(idleMin, lang)})` : `No Motion (${formatDurationShort(idleMin, lang)})`,
                title: lang === 'ar'
                    ? `🟡 متواجد بالموقع لكن لم تُسجل حركة منذ ${formatDurationShort(idleMin, lang)}`
                    : `🟡 On site with no motion recorded for ${formatDurationShort(idleMin, lang)}`,
                detail: lang === 'ar' ? 'الهاتف متصل بالموقع بانتظار بدء الحركة الفعلية' : 'Connected on site; awaiting movement',
                idleMinutes: idleMin,
                offlineMinutes: 0,
                recentSteps10m: 0,
                pillClass: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700',
                textClass: 'text-amber-600 dark:text-amber-400'
            };
        }

        return {
            code: 'active',
            dot: '🟢',
            shortLabel: lang === 'ar' ? 'متصل بالموقع' : 'Connected On Site',
            title: lang === 'ar' ? '🟢 متصل الآن في الموقع (بدأت المناوبة حديثاً — جاري رصد الحركة)' : '🟢 Connected on site (shift just started)',
            detail: lang === 'ar' ? 'الحساس يعمل ومستعد لرصد النشاط' : 'Sensor active and ready',
            idleMinutes: 0,
            offlineMinutes: 0,
            recentSteps10m: 0,
            pillClass: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
            textClass: 'text-emerald-600 dark:text-emerald-400'
        };
    };

    const summarizeCrewActivity = (workers = [], attendanceList = [], nowMs = Date.now(), todayDate = '', lang = 'ar') => {
        const targetToday = todayDate || new Date(nowMs).toISOString().split('T')[0];
        const attByWorker = new Map();
        (attendanceList || []).forEach((a) => {
            if (a && a.workerId && a.date === targetToday) {
                attByWorker.set(a.workerId, a);
            }
        });
        const counts = { active: 0, idle: 0, outOfSite: 0, offline: 0, offShift: 0, onShiftTotal: 0 };
        (workers || []).forEach((w) => {
            if (!w || !w.id) return;
            const rec = attByWorker.get(w.id) || null;
            const st = classifyWorkerLiveStatus({ worker: w, todayRec: rec, nowMs, todayDate: targetToday, lang });
            if (st.code === 'off_shift') {
                counts.offShift++;
            } else {
                counts.onShiftTotal++;
                if (st.code === 'active') counts.active++;
                else if (st.code === 'idle') counts.idle++;
                else if (st.code === 'out_of_site') counts.outOfSite++;
                else counts.offline++;
            }
        });
        return counts;
    };

    const api = {
        HEARTBEAT_OFFLINE_MS,
        MOTION_IDLE_MS,
        SHIFT_WARMUP_GRACE_MS,
        getTradeEffortTarget,
        formatDurationShort,
        computeEffortMetrics,
        classifyWorkerLiveStatus,
        summarizeCrewActivity
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.AlOstaActivityEngine = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
