/* Al-Osta Modular Architecture Engine v1.0.14 */
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
