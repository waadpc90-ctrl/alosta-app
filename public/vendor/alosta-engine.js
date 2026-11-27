/**
 * Module 01: Al-Osta Enterprise Security, Auth UID Session Binding, Brute-Force Guard & Shared Config Bus
 * Solves: Client-side session tampering, refresh-bypass on login lockouts, duplicate app_config listeners.
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
                    (global.screen ? (global.screen.width + 'x' + global.screen.height) : '0x0'),
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

    /**
     * Singleton AppConfig Bus: shares ONE Firestore listener for `settings/app_config`
     * across AdminApp, UpdateChecker, and StoreOwnerPortal (cuts config reads by ~66%).
     */
    const createAppConfigBus = () => {
        let activeDb = null;
        let activeUnsub = null;
        let latestConfig = null;
        const listeners = new Set();

        const notifyAll = () => {
            if (!latestConfig) return;
            const snapshot = { ...latestConfig };
            listeners.forEach((cb) => {
                try { cb(snapshot); } catch (e) {}
            });
        };

        const subscribe = (db, cb) => {
            if (typeof cb !== 'function') return () => {};
            listeners.add(cb);
            if (latestConfig) {
                try { cb({ ...latestConfig }); } catch (e) {}
            }
            if (db && (!activeUnsub || activeDb !== db)) {
                if (activeUnsub) {
                    try { activeUnsub(); } catch (e) {}
                }
                activeDb = db;
                try {
                    activeUnsub = db.collection('settings').doc('app_config').onSnapshot((docSnap) => {
                        if (docSnap && docSnap.exists) {
                            latestConfig = { ...(docSnap.data() || {}) };
                            notifyAll();
                        }
                    });
                } catch (e) {
                    activeUnsub = null;
                }
            }
            return () => {
                listeners.delete(cb);
                if (listeners.size === 0 && activeUnsub) {
                    try { activeUnsub(); } catch (e) {}
                    activeUnsub = null;
                    activeDb = null;
                }
            };
        };

        const getLatest = () => (latestConfig ? { ...latestConfig } : null);

        return Object.freeze({ subscribe, getLatest });
    };

    global.AlOstaSecurityGuard = Object.freeze({
        getDeviceFingerprint,
        ensureFirebaseAuthUid,
        getLockoutState,
        recordFailedLoginAttempt,
        resetLoginAttempts,
        bindSessionToAuthUid
    });

    global.AlOstaAppConfigBus = createAppConfigBus();
})(typeof window !== 'undefined' ? window : globalThis);
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
/**
 * Module 05: Al-Osta Precision Worker Activity, Trade-Calibrated Effort & 4-State Live Status Engine
 * Combines 4 signals: Shift state + Heartbeat freshness + GPS site geofence + Recent motion/step window.
 */
(function (global) {
    'use strict';

    const HEARTBEAT_OFFLINE_MS = 22 * 60 * 1000;   // 22 min without heartbeat (comfortably above 16-min Ultra-Eco heartbeat) -> phone closed / offline
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

    const formatDistance = (meters = 0, lang = 'ar') => {
        const m = Math.max(0, Math.round(Number(meters) || 0));
        if (m >= 1000) {
            const km = (m / 1000).toFixed(2).replace(/\.?0+$/, '');
            return lang === 'ar' ? `${km} كم` : `${km} km`;
        }
        return lang === 'ar' ? `${m} م` : `${m}m`;
    };

    const computeShiftElapsedMinutes = (attRec = null, nowMs = Date.now()) => {
        if (!attRec || !attRec.timeIn) return 0;
        const startMs = Number(attRec.timeIn) || 0;
        if (startMs <= 0) return 0;
        const endMs = Number(attRec.timeOut) > startMs ? Number(attRec.timeOut) : nowMs;
        if (endMs <= startMs) return 0;
        // Cap at 14 hours (840 min) for physiological sanity
        return Math.min(840, Math.ceil((endMs - startMs) / 60000));
    };

    const computeEffortMetrics = ({ steps = 0, activeMinutes = 0, shiftElapsedMinutes = 0, specialty = '', lang = 'ar' } = {}) => {
        const safeSteps = Math.max(0, parseInt(steps, 10) || 0);
        const rawActiveMin = Math.max(0, Math.min(720, parseInt(activeMinutes, 10) || 0));
        const safeShiftMin = Math.max(0, parseInt(shiftElapsedMinutes, 10) || 0);
        // Never allow recorded active minutes to exceed actual elapsed shift time when shift window is known
        const safeActiveMin = safeShiftMin > 0 ? Math.min(rawActiveMin, safeShiftMin) : rawActiveMin;
        const target = getTradeEffortTarget(specialty);

        // Standard site stride length (~0.74m per step)
        const distanceMeters = Math.round(safeSteps * 0.74);

        // Trade-calibrated MET active energy (kcal above resting, 75 kg reference adult):
        // - Walking at ~95 steps/min burns ~0.042 kcal/step (craft) or ~0.046 kcal/step (heavy/mobile site work)
        // - Non-overlapping sustained stationary craft work burns ~2.5 kcal/min (stationary trade) or ~2.9 kcal/min (heavy trade)
        const walkingMinEst = safeSteps / 95;
        const extraStationaryMin = Math.max(0, safeActiveMin - walkingMinEst);
        const kcalPerStep = target.tradeType === 'stationary' ? 0.042 : 0.046;
        const stationaryKcalPerMin = target.tradeType === 'stationary' ? 2.5 : 2.9;
        const calories = Math.round(safeSteps * kcalPerStep + extraStationaryMin * stationaryKcalPerMin);

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
            distanceText: formatDistance(distanceMeters, lang),
            calories,
            energyText: lang === 'ar' ? `${calories} سعرة` : `${calories} kcal`,
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

    const haversineMeters = (lat1, lng1, lat2, lng2) => {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    };

    const parseProjectCoords = (loc) => {
        if (!loc) return null;
        if (typeof loc === 'object' && typeof loc.lat === 'number' && typeof loc.lng === 'number' && isFinite(loc.lat) && isFinite(loc.lng)) {
            return { lat: loc.lat, lng: loc.lng };
        }
        const raw = String(loc).trim();
        const patterns = [
            /@(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
            /[?&](?:q|ll|query|center|destination|daddr)=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i,
            /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/
        ];
        for (let i = 0; i < patterns.length; i++) {
            const m = raw.match(patterns[i]);
            if (m) {
                const lat = parseFloat(m[1]);
                const lng = parseFloat(m[2]);
                if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                    return { lat, lng };
                }
            }
        }
        return null;
    };

    /**
     * Compares worker GPS coordinates against ALL projects with valid site coordinates.
     * Prioritizes sites the worker is physically inside (and explicitly assigned to),
     * falling back to the nearest site when outside all boundaries.
     */
    const matchWorkerAcrossProjects = (coords, projects = [], options = {}) => {
        const result = { matched: null, nearest: null, evaluated: [], byId: {} };
        if (!coords || !isFinite(Number(coords.lat)) || !isFinite(Number(coords.lng))) return result;
        const lat = Number(coords.lat);
        const lng = Number(coords.lng);
        const acc = Math.max(0, Number(coords.acc) || 0);
        const workerId = String(options.workerId || '').trim();
        const preferredProjectId = String(options.preferredProjectId || '').trim();
        const extractFn = typeof options.extractCoordsFn === 'function' ? options.extractCoordsFn : parseProjectCoords;

        const evaluated = [];
        for (let i = 0; i < (projects || []).length; i++) {
            const p = projects[i];
            if (!p || !p.id) continue;
            const pCoords = extractFn(p.location);
            if (!pCoords || !isFinite(pCoords.lat) || !isFinite(pCoords.lng)) continue;
            const radius = Math.max(20, parseInt(p.radius, 10) || 150);
            const rawDist = haversineMeters(lat, lng, pCoords.lat, pCoords.lng);
            const accBuffer = Math.min(Math.max(0, acc), 120);
            const effectiveDist = Math.max(0, rawDist - accBuffer);
            const inBounds = effectiveDist <= radius;
            const isAssigned = Boolean(workerId && Array.isArray(p.workerIds) && p.workerIds.includes(workerId));
            const entry = { project: p, coords: pCoords, radius, rawDist, effectiveDist, inBounds, isAssigned };
            evaluated.push(entry);
            result.byId[p.id] = entry;
        }

        if (evaluated.length === 0) return result;

        // Sort: inside bounds first -> explicitly assigned first -> closest effective distance
        evaluated.sort((a, b) => {
            if (a.inBounds !== b.inBounds) return a.inBounds ? -1 : 1;
            if (a.isAssigned !== b.isAssigned) return a.isAssigned ? -1 : 1;
            if (a.effectiveDist !== b.effectiveDist) return a.effectiveDist - b.effectiveDist;
            return a.rawDist - b.rawDist;
        });

        result.evaluated = evaluated;
        const inBoundsList = evaluated.filter(e => e.inBounds);
        if (inBoundsList.length > 0) {
            const prefMatch = preferredProjectId ? inBoundsList.find(e => e.project.id === preferredProjectId) : null;
            result.matched = (prefMatch && (!inBoundsList[0].isAssigned || prefMatch.isAssigned)) ? prefMatch : inBoundsList[0];
        }
        const byDistance = evaluated.slice().sort((a, b) => a.rawDist - b.rawDist);
        result.nearest = byDistance[0] || null;
        return result;
    };

    /**
     * Resolves which project should receive a worker's daily attendance wage based on GPS location first,
     * falling back to explicit projectId only when no contradicting physical GPS site match exists.
     */
    const resolveAttendanceProjectByLocation = (att, projects = [], options = {}) => {
        if (!att) return null;
        const projs = Array.isArray(projects) ? projects : [];
        const coords = att.inLoc || options.liveCoords || null;
        if (coords && att.manualProjectOverride !== true) {
            const scan = matchWorkerAcrossProjects(coords, projs, {
                workerId: att.workerId || options.workerId || '',
                preferredProjectId: att.projectId || '',
                extractCoordsFn: options.extractCoordsFn
            });
            if (scan.matched && scan.matched.project && scan.matched.project.id) {
                const currentEntry = att.projectId ? scan.byId[att.projectId] : null;
                if (!att.projectId || (currentEntry && !currentEntry.inBounds)) {
                    return scan.matched.project.id;
                }
                if (currentEntry && currentEntry.inBounds) {
                    return att.projectId;
                }
                // Explicit projectId has no GPS coordinates at all, while worker physically clocked in inside a located project
                if (att.inLoc && !currentEntry) {
                    return scan.matched.project.id;
                }
            }
        }
        return att.projectId || null;
    };

    const api = {
        HEARTBEAT_OFFLINE_MS,
        MOTION_IDLE_MS,
        SHIFT_WARMUP_GRACE_MS,
        getTradeEffortTarget,
        formatDurationShort,
        formatDistance,
        computeShiftElapsedMinutes,
        computeEffortMetrics,
        classifyWorkerLiveStatus,
        summarizeCrewActivity,
        matchWorkerAcrossProjects,
        resolveAttendanceProjectByLocation
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.AlOstaActivityEngine = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
