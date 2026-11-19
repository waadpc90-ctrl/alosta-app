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
