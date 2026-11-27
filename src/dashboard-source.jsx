        // =========================================================================
        // AL-OSTA PLATFORM CENTRAL DASHBOARD (v1.0.26 — COMPLETE EDITION)
        // Full 5-Tab Cloud Administration Suite + StoreOwnerPortal:
        // 1. 👷 المقاولون (admins) — CRUD, Pro Plans, Projects/Workers Count, Password Reset, WhatsApp
        // 2. 🛠️ العمال والحرفيون (workers) — CRUD, Pro Verification, Login Codes, Wages, Ratings
        // 3. 🏪 المعارض والمحلات والوكالات (stores, store_products, store_orders) —
        //    Full Showroom Setup (Store Type, Exclusive Paint Agency Brand Catalog,
        //    Custom Sections Editor, GPS/Google Maps Location Picker, Protected Electronic Payment
        //    Account & Live QR Code / Custom QR Image Upload, Portal Code Generator, VIP Plans,
        //    Full Product Management with Color Code Support, and Live Store Orders)
        // 4. 📢 إعلانات النظام (announcements) — CRUD, Re-Broadcast (broadcastId), Pin, Image Upload
        // 5. ⚙️ الإعدادات والتحديثات (settings/app_config) — OTA Push/Force/Stop Update, Monetization & Targets
        // =========================================================================

        (function () {
            const l = document.getElementById('init-loader');
            if (l) l.style.display = 'none';
        })();

        const APP_VERSION = "1.0.26";
        const { useState, useEffect, useMemo, useRef } = React;

        const firebaseConfig = {
            apiKey: "AIzaSyDpeicW_gpXfqeuur7g08nQ9Nr0DTIkoaM",
            authDomain: "craftsmanapp-3e46b.firebaseapp.com",
            projectId: "craftsmanapp-3e46b",
            storageBucket: "craftsmanapp-3e46b.firebasestorage.app",
            messagingSenderId: "567712814306",
            appId: "1:567712814306:web:f27769f9ce59af1a22fabb"
        };

        const createDashboardDatabase = () => {
            let rawDb = null;
            let authReadyPromise = Promise.resolve(null);

            try {
                if (window.firebase) {
                    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
                    if (firebase.auth) {
                        authReadyPromise = new Promise((resolve) => {
                            try {
                                const auth = firebase.auth();
                                if (auth.currentUser && auth.currentUser.uid) {
                                    resolve(auth.currentUser);
                                    return;
                                }
                                auth.signInAnonymously()
                                    .then((cred) => resolve(cred && cred.user ? cred.user : null))
                                    .catch(() => resolve(null));
                            } catch (e) {
                                resolve(null);
                            }
                        });
                    }
                    rawDb = firebase.firestore();
                }
            } catch (e) {}

            const isDeleteSentinel = (v) => {
                if (!v || typeof v !== 'object') return false;
                if (v.__smartOp === 'DELETE_FIELD') return true;
                if (v.constructor && /DeleteField/i.test(String(v.constructor.name || ''))) return true;
                try {
                    if (typeof v.isEqual === 'function' && firebase.firestore && firebase.firestore.FieldValue) {
                        return v.isEqual(firebase.firestore.FieldValue.delete());
                    }
                } catch (e) {}
                return false;
            };

            const sanitizePatch = (obj, stripDeletes = false) => {
                const out = {};
                Object.keys(obj || {}).forEach((k) => {
                    const v = obj[k];
                    if (v === undefined) return;
                    if (stripDeletes && isDeleteSentinel(v)) return;
                    if (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype) {
                        out[k] = sanitizePatch(v, stripDeletes);
                    } else {
                        out[k] = v;
                    }
                });
                return out;
            };

            const ensureAuthBeforeWrite = async () => {
                try {
                    await authReadyPromise;
                    if (window.firebase && firebase.auth && !firebase.auth().currentUser) {
                        await firebase.auth().signInAnonymously();
                    }
                } catch (e) {}
            };

            const wrapDocRef = (colName, docId) => {
                const getRawRef = () => rawDb.collection(colName).doc(String(docId));
                return {
                    id: String(docId),
                    get: async (opts) => {
                        await ensureAuthBeforeWrite();
                        return opts ? getRawRef().get(opts) : getRawRef().get();
                    },
                    set: async (data, opts) => {
                        await ensureAuthBeforeWrite();
                        const merge = Boolean(opts && opts.merge);
                        const clean = sanitizePatch(data, !merge);
                        return merge ? getRawRef().set(clean, { merge: true }) : getRawRef().set(clean);
                    },
                    update: async (data) => {
                        await ensureAuthBeforeWrite();
                        const clean = sanitizePatch(data, false);
                        try {
                            return await getRawRef().update(clean);
                        } catch (err) {
                            if (err && (err.code === 'not-found' || /No document to update/i.test(String(err.message || '')))) {
                                return await getRawRef().set(clean, { merge: true });
                            }
                            throw err;
                        }
                    },
                    delete: async () => {
                        await ensureAuthBeforeWrite();
                        return getRawRef().delete();
                    },
                    onSnapshot: (onNext, onError) => {
                        let unsub = () => {};
                        let cancelled = false;
                        ensureAuthBeforeWrite().then(() => {
                            if (cancelled || !rawDb) return;
                            try {
                                unsub = getRawRef().onSnapshot(onNext, onError || (() => {}));
                            } catch (e) {}
                        });
                        return () => {
                            cancelled = true;
                            try { unsub(); } catch (e) {}
                        };
                    }
                };
            };

            const wrapQuery = (buildQueryFn) => ({
                where: (f, op, val) => wrapQuery(() => buildQueryFn().where(f, op, val)),
                limit: (n) => wrapQuery(() => buildQueryFn().limit(n)),
                get: async (opts) => {
                    await ensureAuthBeforeWrite();
                    const q = buildQueryFn();
                    return opts ? q.get(opts) : q.get();
                },
                onSnapshot: (onNext, onError) => {
                    let unsub = () => {};
                    let cancelled = false;
                    ensureAuthBeforeWrite().then(() => {
                        if (cancelled || !rawDb) return;
                        try {
                            unsub = buildQueryFn().onSnapshot(onNext, onError || (() => {}));
                        } catch (e) {}
                    });
                    return () => {
                        cancelled = true;
                        try { unsub(); } catch (e) {}
                    };
                }
            });

            return {
                ensureAuthBeforeWrite,
                collection: (colName) => {
                    const baseQ = wrapQuery(() => rawDb.collection(colName));
                    return {
                        doc: (docId) => wrapDocRef(colName, docId),
                        where: baseQ.where,
                        limit: baseQ.limit,
                        get: baseQ.get,
                        onSnapshot: baseQ.onSnapshot,
                        count: async () => {
                            await ensureAuthBeforeWrite();
                            try {
                                const colRef = rawDb.collection(colName);
                                if (typeof colRef.count === 'function') {
                                    const aggSnap = await colRef.count().get();
                                    const val = aggSnap && typeof aggSnap.data === 'function' ? aggSnap.data().count : null;
                                    if (Number.isFinite(val)) return val;
                                }
                            } catch (e) {}
                            return null;
                        },
                        add: async (data) => {
                            await ensureAuthBeforeWrite();
                            const clean = sanitizePatch(data, true);
                            return rawDb.collection(colName).add(clean);
                        }
                    };
                }
            };
        };

        const db = createDashboardDatabase();

        // Full Cryptographic & Security Helper (PBKDF2-HMAC-SHA256 v3 + Store Contact Sanitizer)
        const AlOstaCrypto = (() => {
            const MASTER_PEPPER = 'ALOSTA_WAAD_2026_E2EE_PEPPER_V2_9F8A7B6C5D4E3F2A1B';
            const ENCRYPTED_MASK = '🔒 [ENCRYPTED-SHA256]';

            const utf8ToBytes = (str) => new TextEncoder().encode(String(str ?? ''));
            const bytesToHex = (bytes) => {
                let hex = '';
                for (let i = 0; i < bytes.length; i++) {
                    hex += bytes[i].toString(16).padStart(2, '0');
                }
                return hex;
            };

            const rotr = (n, x) => (x >>> n) | (x << (32 - n));
            const K = new Uint32Array([
                0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
                0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
                0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
                0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
                0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
                0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
                0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
                0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
            ]);

            const sha256Bytes = (msgBytes) => {
                const l = msgBytes.length;
                const bitLenHi = Math.floor((l * 8) / 0x100000000);
                const bitLenLo = (l * 8) >>> 0;
                const padLen = ((l + 9 + 63) & ~63);
                const padded = new Uint8Array(padLen);
                padded.set(msgBytes);
                padded[l] = 0x80;
                const view = new DataView(padded.buffer);
                view.setUint32(padLen - 8, bitLenHi, false);
                view.setUint32(padLen - 4, bitLenLo, false);

                let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
                let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
                const W = new Uint32Array(64);

                for (let offset = 0; offset < padLen; offset += 64) {
                    for (let i = 0; i < 16; i++) W[i] = view.getUint32(offset + i * 4, false);
                    for (let i = 16; i < 64; i++) {
                        const s0 = rotr(7, W[i - 15]) ^ rotr(18, W[i - 15]) ^ (W[i - 15] >>> 3);
                        const s1 = rotr(17, W[i - 2]) ^ rotr(19, W[i - 2]) ^ (W[i - 2] >>> 10);
                        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
                    }
                    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
                    for (let i = 0; i < 64; i++) {
                        const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
                        const ch = (e & f) ^ (~e & g);
                        const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
                        const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
                        const maj = (a & b) ^ (a & c) ^ (b & c);
                        const temp2 = (S0 + maj) >>> 0;
                        h = g; g = f; f = e; e = (d + temp1) >>> 0;
                        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
                    }
                    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
                    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
                }
                const out = new Uint8Array(32);
                const outView = new DataView(out.buffer);
                outView.setUint32(0, h0, false); outView.setUint32(4, h1, false);
                outView.setUint32(8, h2, false); outView.setUint32(12, h3, false);
                outView.setUint32(16, h4, false); outView.setUint32(20, h5, false);
                outView.setUint32(24, h6, false); outView.setUint32(28, h7, false);
                return out;
            };

            const hmacSha256Bytes = (keyBytes, msgBytes) => {
                let k = keyBytes;
                if (k.length > 64) k = sha256Bytes(k);
                const ipad = new Uint8Array(64);
                const opad = new Uint8Array(64);
                for (let i = 0; i < 64; i++) {
                    const b = i < k.length ? k[i] : 0;
                    ipad[i] = b ^ 0x36;
                    opad[i] = b ^ 0x5c;
                }
                const inner = new Uint8Array(64 + msgBytes.length);
                inner.set(ipad);
                inner.set(msgBytes, 64);
                const innerHash = sha256Bytes(inner);
                const outer = new Uint8Array(64 + 32);
                outer.set(opad);
                outer.set(innerHash, 64);
                return sha256Bytes(outer);
            };

            const pbkdf2Sha256Hex = (passwordStr, saltHex, iterations = 2500) => {
                const pwdBytes = utf8ToBytes(`${passwordStr}::${MASTER_PEPPER}`);
                const saltBytes = utf8ToBytes(saltHex);
                const saltWithBlock = new Uint8Array(saltBytes.length + 4);
                saltWithBlock.set(saltBytes);
                saltWithBlock[saltBytes.length + 3] = 1;
                let u = hmacSha256Bytes(pwdBytes, saltWithBlock);
                const t = new Uint8Array(u);
                for (let i = 1; i < iterations; i++) {
                    u = hmacSha256Bytes(pwdBytes, u);
                    for (let j = 0; j < 32; j++) t[j] ^= u[j];
                }
                return bytesToHex(t);
            };

            const randomHex = (byteLen = 16) => {
                const buf = new Uint8Array(byteLen);
                if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
                    crypto.getRandomValues(buf);
                } else {
                    for (let i = 0; i < byteLen; i++) buf[i] = Math.floor(Math.random() * 256);
                }
                return bytesToHex(buf);
            };

            const hashPasswordV3 = (rawPassword, existingSaltHex = '', iterations = 2500) => {
                const clean = String(rawPassword || '').trim();
                if (!clean) return '';
                const saltHex = existingSaltHex || randomHex(16);
                const dkHex = pbkdf2Sha256Hex(clean, saltHex, iterations);
                return `v3$pbkdf2-sha256$${iterations}$${saltHex}$${dkHex}`;
            };

            const hashPassword = (rawPassword, saltContext = '') => {
                const clean = String(rawPassword || '').trim();
                if (!clean) return '';
                const normSalt = String(saltContext || 'global').trim().toLowerCase();
                const r1 = bytesToHex(hmacSha256Bytes(utf8ToBytes(MASTER_PEPPER), utf8ToBytes(`${normSalt}::${clean}`)));
                const r2 = bytesToHex(sha256Bytes(utf8ToBytes(`ALOSTA_V2_ROUND2::${r1}::${normSalt}::${MASTER_PEPPER}`)));
                return `v2$sha256$${r2}`;
            };

            const buildProtectedCredentials = (rawPassword, saltContext = '', forUpdate = false) => {
                const clean = String(rawPassword || '').trim();
                const creds = {
                    passwordHash: hashPasswordV3(clean),
                    password: ENCRYPTED_MASK,
                    securityVersion: 3,
                    securityUpdatedAt: new Date().toISOString()
                };
                if (forUpdate) {
                    if (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue && firebase.firestore.FieldValue.delete) {
                        creds.passwordCipher = firebase.firestore.FieldValue.delete();
                    } else {
                        creds.passwordCipher = '';
                    }
                }
                return creds;
            };

            const sanitizeText = (val, maxLen = 500) => {
                if (val === null || val === undefined) return '';
                return String(val)
                    .replace(/<\s*\/?\s*script\b[^>]*>/gi, '')
                    .replace(/javascript\s*:/gi, '')
                    .replace(/on\w+\s*=/gi, '')
                    .trim()
                    .slice(0, maxLen);
            };

            const sanitizeImageUrl = (url) => {
                const s = String(url || '').trim();
                if (!s) return '';
                if (/^blob:\/\/media_[a-zA-Z0-9_-]+$/.test(s)) return s;
                if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(s)) return s;
                if (/^https?:\/\/[^\s"'<>]+$/i.test(s)) return s;
                return '';
            };

            const buildSafeStoreContactPayload = (inputObj = {}, fallbackStore = {}) => {
                const cleanPhone = String(inputObj.phone ?? fallbackStore.phone ?? '')
                    .replace(/[^\d+]/g, '')
                    .slice(0, 20);
                const cleanGov = sanitizeText(inputObj.gov ?? fallbackStore.gov ?? 'بغداد', 40) || 'بغداد';
                const cleanAddress = sanitizeText(inputObj.address ?? fallbackStore.address ?? '', 180);
                const cleanWorkHours = sanitizeText(inputObj.workHours ?? fallbackStore.workHours ?? '', 100);
                const cleanHasDelivery = inputObj.hasDelivery !== undefined
                    ? Boolean(inputObj.hasDelivery)
                    : Boolean(fallbackStore.hasDelivery !== false);

                return {
                    phone: cleanPhone,
                    gov: cleanGov,
                    address: cleanAddress,
                    workHours: cleanWorkHours,
                    hasDelivery: cleanHasDelivery,
                    updatedAt: new Date().toISOString()
                };
            };

            return {
                ENCRYPTED_MASK,
                hashPassword,
                hashPasswordV3,
                buildProtectedCredentials,
                sanitizeText,
                sanitizeImageUrl,
                buildSafeStoreContactPayload
            };
        })();

        // =========================================================================
        // CONSTANTS & CATALOGS (100% Synchronized with src/app-source.jsx)
        // =========================================================================
        const GOVERNORATES = ["بغداد", "البصرة", "نينوى", "أربيل", "النجف", "كربلاء", "كركوك", "الأنبار", "ديالى", "ذي قار", "بابل", "واسط", "ميسان", "القادسية", "المثنى", "صلاح الدين", "دهوك", "السليمانية"];
        const SPECIALTIES = ["خلفة سحب", "صباغ", "جبس بورد", "ورق جدران", "تأسيسات صحية", "كهربائي", "سيراميك", "عامل عادي", "خلفة بناء", "نجار قالب", "حداد مسلح", "لبخ وبياض"];

        const STORE_TYPES = [
            { id: 'paint_agency', icon: '🎯', labelAr: 'وكالة أصباغ معتمدة (كتالوج شركة حصري)', shortAr: 'وكالة أصباغ' },
            { id: 'paint', icon: '🎨', labelAr: 'معرض أصباغ ودهانات عام', shortAr: 'معرض أصباغ' },
            { id: 'both', icon: '🎨⬜', labelAr: 'مركز أصباغ وجبس بورد شامل', shortAr: 'أصباغ وجبس بورد' },
            { id: 'gypsum_board', icon: '⬜', labelAr: 'وكالة جبس بورد وبوردكس ومقاطع', shortAr: 'جبس بورد' },
            { id: 'decor', icon: '✨', labelAr: 'معرض ديكورات وفوم وكرانيش', shortAr: 'ديكورات وفوم' },
            { id: 'general', icon: '🛠️', labelAr: 'العدد اليدوية ومستلزمات العمل', shortAr: 'عدد ومستلزمات' }
        ];

        const PAINT_AGENCY_BRANDS = [
            { id: 'jotun', nameAr: 'جوتن (Jotun)', shortAr: 'جوتن', desc: 'كتالوج ألوان جوتن الحصري (150+ كود أصلي)', hasCatalog: true, suggestedBadge: 'وكيل جوتن معتمد ✓' },
            { id: 'berger', nameAr: 'برجر (Berger)', shortAr: 'برجر', desc: 'مسطرة برجر الأصلية ColorBank', hasCatalog: true, suggestedBadge: 'وكيل برجر معتمد ✓' },
            { id: 'san_marco', nameAr: 'بلو - سان ماركو (Blue / San Marco)', shortAr: 'سان ماركو', desc: 'إيطالي أصلي - مسطرة كادورو وماركوبولو', hasCatalog: true, suggestedBadge: 'وكيل سان ماركو الإيطالي ✓' },
            { id: 'loggia', nameAr: 'لوجيا (Loggia)', shortAr: 'لوجيا', desc: 'إيطالي أصلي - بلازما 3D وفيلاتورا', hasCatalog: true, suggestedBadge: 'وكيل لوجيا الإيطالي ✓' },
            { id: 'betek', nameAr: 'بيتك (Betek)', shortAr: 'بيتك', desc: 'ماركة تركية مسجلة (كود يدوي / أبيض سادة)', hasCatalog: false, suggestedBadge: 'وكيل بيتك معتمد ✓' },
            { id: 'national', nameAr: 'ناشونال (National)', shortAr: 'ناشونال', desc: 'ماركة مسجلة (كود يدوي / أبيض سادة)', hasCatalog: false, suggestedBadge: 'وكيل ناشونال معتمد ✓' }
        ];

        const ECOMMERCE_CATEGORIES = [
            { id: 'paint', icon: '🎨', label: 'الأصباغ والدهانات' },
            { id: 'interior_paint', icon: '🏠', label: 'أصباغ داخلية' },
            { id: 'exterior_paint', icon: '🏢', label: 'أصباغ واجهات خارجية' },
            { id: 'putty_primer', icon: '🪣', label: 'المعجون والأساس' },
            { id: 'decor_paint', icon: '✨', label: 'أصباغ ديكورية' },
            { id: 'gypsum_board', icon: '⬜', label: 'ألواح الجبس بورد' },
            { id: 'gypsum_profiles', icon: '🔩', label: 'مقاطع الحديد والهياكل' },
            { id: 'decor', icon: '🏛️', label: 'ديكورات الجبس والفوم' },
            { id: 'insulation', icon: '🛡️', label: 'عوازل ومواد لاصقة' },
            { id: 'tools', icon: '🛠️', label: 'العدد والأدوات' }
        ];

        const getDefaultSectionsForStoreType = (storeType) => {
            const pick = (ids) => ECOMMERCE_CATEGORIES
                .filter((c) => ids.includes(c.id))
                .map((c) => ({ id: c.id, label: c.label, icon: c.icon }));
            if (storeType === 'paint_agency' || storeType === 'paint') {
                return pick(['paint', 'interior_paint', 'exterior_paint', 'putty_primer', 'decor_paint', 'tools']);
            }
            if (storeType === 'gypsum_board') {
                return pick(['gypsum_board', 'gypsum_profiles', 'putty_primer', 'tools']);
            }
            if (storeType === 'decor') {
                return pick(['decor', 'decor_paint', 'gypsum_board', 'tools']);
            }
            if (storeType === 'general') {
                return pick(['tools', 'putty_primer', 'insulation']);
            }
            return pick(['paint', 'gypsum_board', 'decor', 'tools']);
        };

        const getStoreSectionsList = (store) => {
            if (Array.isArray(store?.customSections) && store.customSections.length > 0) {
                return store.customSections.filter((s) => s && s.id && s.label);
            }
            return getDefaultSectionsForStoreType(store?.storeType || 'both');
        };

        const STORE_PAYMENT_METHODS = [
            { id: 'zaincash', label: 'زين كاش (ZainCash)', icon: '💜' },
            { id: 'superqi', label: 'سوبر كي / كي كارد (SuperQi)', icon: '💛' },
            { id: 'fib', label: 'مصرف العراق الأول (FIB)', icon: '💚' },
            { id: 'taif', label: 'الطيف الإسلامي / ناس باي', icon: '💙' },
            { id: 'asiapay', label: 'آسيا حوالة (AsiaPay)', icon: '❤️' },
            { id: 'rafidain', label: 'ماستر كارد الرافدين / الرشيد', icon: '🏦' },
            { id: 'other', label: 'حساب تحويل إلكتروني آخر', icon: '💳' }
        ];

        const ANNOUNCEMENT_TYPES = [
            { key: 'info', label: '📢 إعلان النظام العام', badgeCls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
            { key: 'promo', label: '🔥 عرض خاص / تخفيضات', badgeCls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
            { key: 'urgent', label: '🚨 تنبيه هام وعاجل', badgeCls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
            { key: 'maintenance', label: '🛠️ تحديث وصيانة النظام', badgeCls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' }
        ];

        const ANNOUNCEMENT_TARGETS = [
            { key: 'all', label: '👥 الجميع (المقاولون والعمال)' },
            { key: 'admin', label: '👷 المقاولون فقط' },
            { key: 'worker', label: '🛠️ العمال والحرفيون فقط' }
        ];

        // Strict payment account helper (never falls back to storeObj.phone)
        const getStoreAccountNumber = (storeObj) => {
            if (!storeObj) return '';
            return String(storeObj.paymentAccountNumber || storeObj.accountNumber || '').trim();
        };

        const getStoreQrPreviewSrc = (paymentMethod, accountNumber, customQrImage = '', size = 180) => {
            if (customQrImage && String(customQrImage).trim()) return String(customQrImage).trim();
            const acc = String(accountNumber || '').trim();
            if (!acc) return '';
            const methodId = String(paymentMethod || 'zaincash').toUpperCase();
            try {
                if (typeof window !== 'undefined' && window.QRious) {
                    const qr = new window.QRious({
                        value: `${methodId}:${acc}`,
                        size,
                        level: 'H',
                        background: '#ffffff',
                        foreground: '#0f172a',
                        padding: 10
                    });
                    return qr.toDataURL('image/png');
                }
            } catch (e) {}
            return '';
        };

        const getStorePortalCode = (storeObj) => {
            if (!storeObj) return '';
            if (storeObj.portalCode) return String(storeObj.portalCode).trim().toUpperCase();
            const raw = String(storeObj.id || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            return 'ST-' + (raw.slice(-6) || '100000');
        };

        const generateNewPortalCode = () => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let code = 'ST-';
            for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
            return code;
        };

        const generateWorkerLoginCode = () => {
            const num = Math.floor(100000 + Math.random() * 900000);
            return `W-${num}`;
        };

        const getStorePortalLink = (storeObj, portalBaseUrl = '') => {
            if (!storeObj) return '';
            const code = getStorePortalCode(storeObj);
            let base = String(portalBaseUrl || 'https://waadpc90-ctrl.github.io/alosta-app/').trim();
            if (!base.endsWith('/')) base += '/';
            return `${base}dashboard.html?storePortal=${encodeURIComponent(storeObj.id)}&code=${encodeURIComponent(code)}`;
        };

        const parseStorePortalInput = (rawInput) => {
            const raw = String(rawInput || '').trim();
            if (!raw) return null;
            try {
                if (raw.includes('storePortal=') || raw.startsWith('http') || raw.startsWith('alosta://')) {
                    const qPart = raw.includes('?') ? raw.split('?')[1].split('#')[0] : raw;
                    const params = new URLSearchParams(qPart);
                    const sp = (params.get('storePortal') || '').trim();
                    const sc = (params.get('code') || '').trim().toUpperCase();
                    return { isUrlMode: true, storeId: sp, code: sc || sp.toUpperCase() };
                }
            } catch (e) {}
            return { isUrlMode: false, storeId: raw, code: raw.toUpperCase() };
        };

        // Parse Google Maps URL or "lat, lng" string into { lat, lng, raw, url }
        const parseLocationString = (rawInput = '') => {
            const s = String(rawInput || '').trim();
            if (!s) return null;
            let lat = null, lng = null;
            const atMatch = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
            const qMatch = s.match(/[?&](?:q|ll|query)=(-?\d+\.\d+),(-?\d+\.\d+)/);
            const dMatch = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
            const pairMatch = s.match(/(-?\d{1,2}\.\d{3,})[,\s]+(-?\d{1,3}\.\d{3,})/);
            const m = atMatch || qMatch || dMatch || pairMatch;
            if (m) {
                lat = parseFloat(m[1]);
                lng = parseFloat(m[2]);
            }
            const url = /^https?:\/\//i.test(s)
                ? s
                : (lat !== null && lng !== null ? `https://maps.google.com/?q=${lat},${lng}` : '');
            return {
                lat: isFinite(lat) ? lat : null,
                lng: isFinite(lng) ? lng : null,
                raw: lat !== null && lng !== null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : s,
                url
            };
        };

        const detectPaintBrandKey = (text = '') => {
            const lower = String(text || '').toLowerCase();
            if (/جوتن|jotun/.test(lower)) return 'jotun';
            if (/برجر|بيرجر|berger/.test(lower)) return 'berger';
            if (/سان ماركو|ماركو|san.?marco|بلو/.test(lower)) return 'san_marco';
            if (/لوجيا|loggia/.test(lower)) return 'loggia';
            if (/بيتك|betek/.test(lower)) return 'betek';
            if (/ناشونال|national/.test(lower)) return 'national';
            return 'jotun';
        };

        const todayStr = () => new Date().toISOString().split('T')[0];

        const formatDaysRemaining = (expiresAt) => {
            if (!expiresAt) return { expired: false, text: 'مفتوح (بدون انتهاء)', days: null };
            const ms = new Date(expiresAt).getTime();
            if (isNaN(ms)) return { expired: false, text: expiresAt, days: null };
            const diffDays = Math.ceil((ms - Date.now()) / 86400000);
            if (diffDays < 0) return { expired: true, text: `منتهي منذ ${Math.abs(diffDays)} يوم`, days: diffDays };
            return { expired: false, text: `متبقي ${diffDays} يوم (${String(expiresAt).split('T')[0]})`, days: diffDays };
        };

        const addDaysIso = (days) => {
            const d = new Date(Date.now() + days * 86400000);
            return d.toISOString().split('T')[0];
        };

        const formatWhatsappNumber = (phone) => {
            let digits = String(phone || '').replace(/\D/g, '');
            if (!digits) return '';
            if (digits.startsWith('07')) digits = '964' + digits.slice(1);
            else if (digits.startsWith('7') && digits.length === 10) digits = '964' + digits;
            return digits;
        };

        const openWhatsappChat = (phone, textMsg = '') => {
            const intl = formatWhatsappNumber(phone);
            if (!intl) return;
            const url = `https://wa.me/${intl}${textMsg ? `?text=${encodeURIComponent(textMsg)}` : ''}`;
            window.open(url, '_blank');
        };

        const copyToClipboard = async (text, onDone) => {
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                if (onDone) onDone(true);
            } catch (e) {
                if (onDone) onDone(false);
            }
        };

        const compressImageFileToDataUrl = (file, maxWidth = 640, quality = 0.76) => {
            return new Promise((resolve, reject) => {
                if (!file) return reject(new Error('لم يتم اختيار صورة'));
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let w = img.width;
                        let h = img.height;
                        if (w > maxWidth) {
                            h = Math.round((h * maxWidth) / w);
                            w = maxWidth;
                        }
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, w, h);
                        ctx.drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    };
                    img.onerror = () => reject(new Error('تعذر قراءة الصورة'));
                    img.src = ev.target.result;
                };
                reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
                reader.readAsDataURL(file);
            });
        };

        // =========================================================================
        // REUSABLE COMPLETE PRODUCT MODAL (Used in Admin Dashboard & StoreOwnerPortal)
        // =========================================================================
        const ProductEditorModal = ({ store, product, onClose, onSaved, addToast }) => {
            const [imgPreview, setImgPreview] = useState(product?.imageUrl || product?.image || '');
            const [saving, setSaving] = useState(false);

            if (!store || !product) return null;

            const storeSections = getStoreSectionsList(store);
            const agencyBrand = PAINT_AGENCY_BRANDS.find((b) => b.id === store.agencyBrandKey);

            const handleUpload = async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                    const dataUrl = await compressImageFileToDataUrl(file, 540, 0.76);
                    setImgPreview(dataUrl);
                    if (addToast) addToast('تم تجهيز وضغط صورة المنتج بنجاح ✓');
                } catch (err) {
                    if (addToast) addToast('تعذر قراءة الصورة: ' + err.message, 'error');
                }
            };

            const handleSubmit = async (e) => {
                e.preventDefault();
                const f = e.target;
                const name = AlOstaCrypto.sanitizeText(f.name.value, 140);
                if (!name) {
                    if (addToast) addToast('يرجى إدخال اسم المنتج', 'error');
                    return;
                }
                const rawPrice = Number(f.price.value) || 0;
                const price = rawPrice > 0 && rawPrice < 500 ? rawPrice * 1000 : rawPrice;
                const rawOldPrice = Number(f.oldPrice.value) || 0;
                const oldPrice = rawOldPrice > 0 && rawOldPrice < 500 ? rawOldPrice * 1000 : rawOldPrice;
                const catId = String(f.category.value || storeSections[0]?.id || 'paint').trim();
                const secObj = storeSections.find((s) => s.id === catId) || ECOMMERCE_CATEGORIES.find((c) => c.id === catId);
                const brandText = AlOstaCrypto.sanitizeText(f.brand.value, 80) || (agencyBrand ? agencyBrand.nameAr : '');
                const selectedBrandKey = String(f.paintBrandKey?.value || agencyBrand?.id || detectPaintBrandKey(`${brandText} ${name}`)).trim();
                const reqColor = Boolean(f.requiresColorCode.checked);

                setSaving(true);
                try {
                    const payload = {
                        storeId: store.id,
                        storeName: store.name || 'معرض معتمد',
                        name,
                        category: catId,
                        categoryLabel: secObj?.label || 'أصباغ ومواد',
                        icon: secObj?.icon || '🎨',
                        brand: brandText,
                        paintBrandKey: reqColor ? selectedBrandKey : '',
                        requiresColorCode: reqColor,
                        price: Math.max(0, price),
                        oldPrice: Math.max(0, oldPrice),
                        unit: AlOstaCrypto.sanitizeText(f.unit.value, 30) || 'قطعة',
                        desc: AlOstaCrypto.sanitizeText(f.desc.value, 400),
                        description: AlOstaCrypto.sanitizeText(f.desc.value, 400),
                        imageUrl: AlOstaCrypto.sanitizeImageUrl(imgPreview || f.imageUrl?.value || ''),
                        inStock: Boolean(f.inStock.checked),
                        updatedAt: new Date().toISOString()
                    };

                    if (product.isNew) {
                        payload.createdAt = new Date().toISOString();
                        await db.collection('store_products').add(payload);
                        if (addToast) addToast(`✓ تمت إضافة المنتج "${name}" إلى معرض "${store.name}"!`);
                    } else {
                        await db.collection('store_products').doc(product.id).set(payload, { merge: true });
                        if (addToast) addToast(`✓ تم تحديث المنتج "${name}" بنجاح!`);
                    }
                    if (onSaved) onSaved();
                    onClose();
                } catch (err) {
                    if (addToast) addToast('⛔ تعذر حفظ المنتج: ' + (err.message || ''), 'error');
                } finally {
                    setSaving(false);
                }
            };

            return (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
                    <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-5 space-y-3 shadow-2xl max-h-[92vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div>
                                <h3 className="font-black text-base text-white">
                                    {product.isNew ? `+ إضافة منتج جديد لـ "${store.name}"` : `✏️ تعديل منتج: ${product.name}`}
                                </h3>
                                {agencyBrand && (
                                    <p className="text-[11px] font-bold text-fuchsia-300 mt-0.5">
                                        🎯 وكالة معتمدة: {agencyBrand.nameAr}
                                    </p>
                                )}
                            </div>
                            <button type="button" onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 font-black">✕</button>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-400 block mb-1">اسم المنتج بالكامل</label>
                            <input
                                name="name"
                                defaultValue={product.name || ''}
                                required
                                placeholder="مثال: صبغ جوتن فينوماستيك مذهل مطفي 18 لتر"
                                className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-bold text-white"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 block mb-1">القسم داخل المعرض (من أقسام هذا المعرض)</label>
                                <select
                                    name="category"
                                    defaultValue={product.category || storeSections[0]?.id || 'paint'}
                                    className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-white"
                                >
                                    {storeSections.map((sec) => (
                                        <option key={sec.id} value={sec.id}>{sec.icon || '📂'} {sec.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 block mb-1">الماركة / الشركة المصنعة</label>
                                <input
                                    name="brand"
                                    defaultValue={product.brand || agencyBrand?.nameAr || store.agencyBrandLabel || ''}
                                    placeholder="جوتن / برجر / كناوف / تركي"
                                    className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-white"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 block mb-1">السعر الحالي (د.ع)</label>
                                <input
                                    type="number"
                                    name="price"
                                    defaultValue={product.price || ''}
                                    required
                                    placeholder="85000"
                                    className="w-full p-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-emerald-400"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 block mb-1">السعر السابق (للخصم)</label>
                                <input
                                    type="number"
                                    name="oldPrice"
                                    defaultValue={product.oldPrice || ''}
                                    placeholder="95000"
                                    className="w-full p-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-bold text-slate-400"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 block mb-1">الوحدة / القياس</label>
                                <input
                                    name="unit"
                                    defaultValue={product.unit || 'دبة 18 لتر'}
                                    placeholder="دبة / لوح / قطعة"
                                    className="w-full p-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-white"
                                />
                            </div>
                        </div>

                        {/* Paint Color Code Catalog Option */}
                        <div className="p-3 rounded-2xl bg-fuchsia-950/30 border border-fuchsia-500/30 space-y-2">
                            <label className="flex items-center justify-between gap-2">
                                <div>
                                    <span className="text-xs font-black text-fuchsia-300 block">🎨 المنتج يطلب كود لون من مسطرة الأصباغ عند الطلب</span>
                                    <span className="text-[10px] font-bold text-slate-400">عند التفعيل سيختار المقاول كود اللون من مسطرة الشركة قبل الإضافة للسلة</span>
                                </div>
                                <input
                                    type="checkbox"
                                    name="requiresColorCode"
                                    defaultChecked={product.isNew ? (store.storeType === 'paint_agency' || store.storeType === 'paint') : Boolean(product.requiresColorCode)}
                                    className="w-5 h-5"
                                />
                            </label>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 block mb-1">مسطرة الألوان المرتبطة بالمنتج</label>
                                <select
                                    name="paintBrandKey"
                                    defaultValue={product.paintBrandKey || agencyBrand?.id || 'jotun'}
                                    className="w-full p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-white"
                                >
                                    {PAINT_AGENCY_BRANDS.map((b) => (
                                        <option key={b.id} value={b.id}>{b.nameAr} {b.hasCatalog ? '— (مسطرة ألوان تفاعلية)' : '— (كود يدوي)'}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-400 block mb-1">وصف ومواصفات المنتج</label>
                            <textarea
                                name="desc"
                                rows="2"
                                defaultValue={product.desc || product.description || ''}
                                placeholder="مثال: دهان داخلي فاخر قابل للغسيل بتغطية فائقة..."
                                className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-white"
                            />
                        </div>

                        {/* Product Image Upload */}
                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-slate-400 block">صورة المنتج (رفع من الجهاز أو لصق رابط)</label>
                            <div className="flex items-center gap-2">
                                <label className="px-3.5 py-2.5 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-black text-xs cursor-pointer shrink-0">
                                    📷 رفع صورة
                                    <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                                </label>
                                <input
                                    name="imageUrl"
                                    value={imgPreview}
                                    onChange={(e) => setImgPreview(e.target.value)}
                                    placeholder="أو الصق رابط الصورة المباشر..."
                                    className="flex-1 p-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300"
                                />
                            </div>
                            {imgPreview && (
                                <div className="flex items-center gap-3 pt-1">
                                    <img src={imgPreview} alt="preview" className="w-16 h-16 rounded-xl object-cover border border-slate-700" />
                                    <button type="button" onClick={() => setImgPreview('')} className="text-xs font-black text-rose-400">حذف الصورة</button>
                                </div>
                            )}
                        </div>

                        <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                            <span className="text-xs font-black text-emerald-300">متوفر حالياً في المخزن (In Stock)</span>
                            <input type="checkbox" name="inStock" defaultChecked={product.inStock !== false} className="w-5 h-5" />
                        </label>

                        <div className="flex gap-2 pt-2">
                            <button type="submit" disabled={saving} className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs">
                                {saving ? 'جاري الحفظ...' : '💾 حفظ المنتج في المعرض ✓'}
                            </button>
                            <button type="button" onClick={onClose} className="px-4 py-3.5 rounded-2xl bg-slate-800 text-slate-300 font-black text-xs">
                                إلغاء
                            </button>
                        </div>
                    </form>
                </div>
            );
        };

        // =========================================================================
        // STORE OWNER PORTAL COMPONENT (?storePortal=ST-XXXXXX)
        // Organized 4-Tab Showroom Workspace:
        // 1. 📦 المنتجات والأقسام (Grouped by Showroom Sections + Search + Stock Filter)
        // 2. 📂 ترتيب قوائم وأقسام المعرض (Up/Down Reordering, Inline Edit, Add/Remove)
        // 3. 🧾 طلبيات هذا المعرض (Live Orders for this Showroom)
        // 4. ℹ️ بيانات الاتصال والدفع (Contact editable; Financial strictly read-only)
        // =========================================================================
        const StoreOwnerPortal = ({ storeKeyInput, initialSectionId = 'all', onExit, addToast }) => {
            const [entryInput, setEntryInput] = useState(storeKeyInput === 'prompt' ? '' : (storeKeyInput || ''));
            const [resolvedKey, setResolvedKey] = useState(storeKeyInput && storeKeyInput !== 'prompt' ? storeKeyInput : '');
            const [store, setStore] = useState(null);
            const [products, setProducts] = useState([]);
            const [orders, setOrders] = useState([]);
            const [loading, setLoading] = useState(Boolean(resolvedKey));
            const [error, setError] = useState('');
            const [editingProduct, setEditingProduct] = useState(null);

            // Organized inner showroom navigation & filters
            const [portalTab, setPortalTab] = useState('products'); // products | sections | orders | info
            const [selectedSection, setSelectedSection] = useState(initialSectionId || 'all');
            const [prodSearch, setProdSearch] = useState('');
            const [stockFilter, setStockFilter] = useState('all'); // all | in_stock | out_of_stock
            const [groupBySection, setGroupBySection] = useState(true);
            const [orderStatusFilter, setOrderStatusFilter] = useState('all');

            // Local section organizer state
            const [draftSections, setDraftSections] = useState([]);
            const [sectionsDirty, setSectionsDirty] = useState(false);
            const [savingSections, setSavingSections] = useState(false);
            const [newSecIcon, setNewSecIcon] = useState('📂');
            const [newSecLabel, setNewSecLabel] = useState('');

            useEffect(() => {
                setSelectedSection(initialSectionId || 'all');
            }, [initialSectionId]);

            useEffect(() => {
                if (store && !sectionsDirty) {
                    setDraftSections(getStoreSectionsList(store));
                }
            }, [store, sectionsDirty]);

            useEffect(() => {
                if (!db || !resolvedKey) return;
                let unsubStore = null;
                let unsubProds = null;
                let unsubOrders = null;
                let cancelled = false;
                setLoading(true);
                setError('');

                const resolveAndSubscribe = async () => {
                    try {
                        const parsed = parseStorePortalInput(resolvedKey);
                        const candidateId = parsed?.storeId || '';
                        const candidateCode = (parsed?.code || candidateId || '').toUpperCase();
                        let targetStore = null;

                        if (candidateId) {
                            const docSnap = await db.collection('stores').doc(candidateId).get();
                            if (docSnap.exists) targetStore = { id: docSnap.id, ...docSnap.data() };
                        }
                        if (!targetStore && candidateCode) {
                            const byCodeSnap = await db.collection('stores').where('portalCode', '==', candidateCode).limit(1).get();
                            if (!byCodeSnap.empty) targetStore = { id: byCodeSnap.docs[0].id, ...byCodeSnap.docs[0].data() };
                        }
                        if (!targetStore || targetStore.isActive === false) {
                            if (!cancelled) {
                                setError('لم يتم العثور على المعرض المطلوب أو أن الرمز غير صحيح.');
                                setLoading(false);
                            }
                            return;
                        }
                        const authorizedPortalCode = getStorePortalCode(targetStore);
                        if (parsed?.code && parsed.code !== authorizedPortalCode && candidateId !== targetStore.id) {
                            setError('⛔ رمز الدخول السري للمعرض غير صحيح.');
                            setLoading(false);
                            return;
                        }
                        setStore(targetStore);
                        setDraftSections(getStoreSectionsList(targetStore));
                        setSectionsDirty(false);
                        setLoading(false);

                        unsubStore = db.collection('stores').doc(targetStore.id).onSnapshot((docSnap) => {
                            if (docSnap.exists) {
                                const stData = { id: docSnap.id, ...docSnap.data() };
                                if (stData.isActive === false) {
                                    setStore(null);
                                    setError('⛔ تم إيقاف هذا المعرض من قِبل الإدارة.');
                                } else if (getStorePortalCode(stData) !== authorizedPortalCode) {
                                    setStore(null);
                                    setError('⛔ تم تغيير رمز حماية المعرض من قِبل الإدارة.');
                                } else {
                                    setStore(stData);
                                }
                            }
                        });

                        unsubProds = db.collection('store_products').where('storeId', '==', targetStore.id).limit(300).onSnapshot((snap) => {
                            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                            list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
                            setProducts(list);
                        });

                        unsubOrders = db.collection('store_orders').where('storeId', '==', targetStore.id).limit(200).onSnapshot((snap) => {
                            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                            list.sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')));
                            setOrders(list);
                        });
                    } catch (e) {
                        if (!cancelled) {
                            setError('تعذر الاتصال بقاعدة بيانات المعرض.');
                            setLoading(false);
                        }
                    }
                };

                resolveAndSubscribe();
                return () => {
                    cancelled = true;
                    if (unsubStore) unsubStore();
                    if (unsubProds) unsubProds();
                    if (unsubOrders) unsubOrders();
                };
            }, [resolvedKey]);

            const handleSaveStoreContactInfo = async (e) => {
                e.preventDefault();
                if (!store?.id) return;
                const form = e.target;
                const contactUpdates = AlOstaCrypto.buildSafeStoreContactPayload({
                    phone: form.phone?.value,
                    gov: form.gov?.value,
                    address: form.address?.value,
                    workHours: form.workHours?.value,
                    hasDelivery: form.hasDelivery ? form.hasDelivery.checked : store.hasDelivery
                }, store);
                if (!contactUpdates.phone) {
                    if (addToast) addToast('يرجى إدخال رقم هاتف المعرض', 'error');
                    return;
                }
                try {
                    await db.collection('stores').doc(store.id).update(contactUpdates);
                    setStore((prev) => ({ ...prev, ...contactUpdates }));
                    if (addToast) addToast('تم حفظ معلومات التواصل للمعرض بنجاح ✓');
                } catch (err) {
                    if (addToast) addToast('تعذر حفظ معلومات التواصل: ' + (err.message || ''), 'error');
                }
            };

            const handleToggleProductStock = async (prod) => {
                if (!prod?.id) return;
                const nextInStock = prod.inStock === false;
                try {
                    await db.collection('store_products').doc(prod.id).update({
                        inStock: nextInStock,
                        updatedAt: new Date().toISOString()
                    });
                    if (addToast) addToast(nextInStock ? `🟢 تم تفعيل توفر "${prod.name}"` : `🔴 تم تعيين "${prod.name}" كنافذ مؤقتاً`);
                } catch (err) {
                    if (addToast) addToast('تعذر تحديث حالة المخزون', 'error');
                }
            };

            const handleDeleteProduct = async (prod) => {
                if (!prod?.id) return;
                if (!window.confirm(`هل أنت متأكد من حذف المنتج "${prod.name}" نهائياً؟`)) return;
                try {
                    await db.collection('store_products').doc(prod.id).delete();
                    if (addToast) addToast(`🗑️ تم حذف المنتج "${prod.name}"`);
                } catch (err) {
                    if (addToast) addToast('تعذر حذف المنتج: ' + (err.message || ''), 'error');
                }
            };

            const handleMoveDraftSection = (idx, delta) => {
                setDraftSections((prev) => {
                    const target = idx + delta;
                    if (target < 0 || target >= prev.length) return prev;
                    const next = [...prev];
                    const tmp = next[idx];
                    next[idx] = next[target];
                    next[target] = tmp;
                    return next;
                });
                setSectionsDirty(true);
            };

            const handleRenameDraftSection = (idx, field, val) => {
                setDraftSections((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s)));
                setSectionsDirty(true);
            };

            const handleAddDraftSection = () => {
                const cleanLabel = newSecLabel.trim();
                if (!cleanLabel) return;
                setDraftSections((prev) => [...prev, { id: 'sec_' + Date.now().toString(36), label: cleanLabel, icon: newSecIcon.trim() || '📂' }]);
                setNewSecLabel('');
                setSectionsDirty(true);
            };

            const handleTogglePresetDraftSection = (cat) => {
                setDraftSections((prev) => {
                    const exists = prev.some((s) => s.id === cat.id);
                    if (exists) return prev.filter((s) => s.id !== cat.id);
                    return [...prev, { id: cat.id, label: cat.label, icon: cat.icon }];
                });
                setSectionsDirty(true);
            };

            const handleSaveSectionsOrder = async () => {
                if (!store?.id) return;
                const cleanSections = draftSections
                    .map((s) => ({
                        id: String(s.id || ('sec_' + Date.now().toString(36))).trim(),
                        label: AlOstaCrypto.sanitizeText(s.label, 60),
                        icon: AlOstaCrypto.sanitizeText(s.icon || '📂', 8) || '📂'
                    }))
                    .filter((s) => s.label);
                if (cleanSections.length === 0) {
                    if (addToast) addToast('يجب أن يحتوي المعرض على قسم واحد على الأقل', 'error');
                    return;
                }
                setSavingSections(true);
                try {
                    await db.collection('stores').doc(store.id).update({
                        customSections: cleanSections,
                        updatedAt: new Date().toISOString()
                    });
                    setSectionsDirty(false);
                    if (addToast) addToast('✓ تم حفظ ترتيب وقوائم أقسام المعرض بنجاح!');
                } catch (err) {
                    if (addToast) addToast('تعذر حفظ ترتيب الأقسام: ' + (err.message || ''), 'error');
                } finally {
                    setSavingSections(false);
                }
            };

            const handleUpdatePortalOrderStatus = async (ord, status) => {
                if (!ord?.id) return;
                try {
                    await db.collection('store_orders').doc(ord.id).update({
                        status,
                        updatedAt: new Date().toISOString()
                    });
                    if (addToast) addToast(`✓ تم تحديث حالة الطلبية إلى: ${status === 'delivered' ? 'تم التوصيل' : 'مؤكدة'}`);
                } catch (err) {
                    if (addToast) addToast('تعذر تحديث حالة الطلبية', 'error');
                }
            };

            if (!resolvedKey || error) {
                return (
                    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4" dir="rtl">
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-sm w-full space-y-4 text-center">
                            <div className="text-4xl">🏪</div>
                            <h2 className="font-black text-lg">بوابة صاحب المعرض وإدارة القوائم والمنتجات</h2>
                            {error && <div className="p-3 rounded-2xl bg-rose-950/60 border border-rose-700/50 text-rose-300 text-xs font-bold">{error}</div>}
                            <input
                                value={entryInput}
                                onChange={(e) => setEntryInput(e.target.value)}
                                placeholder="أدخل كود المعرض (مثال: ST-XXXXXX)"
                                className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-700 text-center font-mono text-sm text-white"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setResolvedKey(entryInput.trim())}
                                    className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-black text-xs"
                                >
                                    دخول للمعرض
                                </button>
                                <button
                                    onClick={onExit}
                                    className="px-4 py-3 rounded-2xl bg-slate-800 text-slate-300 font-black text-xs"
                                >
                                    لوحة الإدارة
                                </button>
                            </div>
                        </div>
                    </div>
                );
            }

            if (loading || !store) {
                return (
                    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4" dir="rtl">
                        <div className="text-center space-y-2">
                            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                            <div className="text-xs font-bold text-slate-400">جاري تحميل بيانات المعرض...</div>
                        </div>
                    </div>
                );
            }

            const storeSections = getStoreSectionsList(store);
            const knownSectionIds = new Set(storeSections.map((s) => s.id));
            const inStockCount = products.filter((p) => p.inStock !== false).length;
            const outOfStockCount = products.length - inStockCount;
            const pendingOrdersCount = orders.filter((o) => !o.status || o.status === 'pending').length;
            const accNum = getStoreAccountNumber(store);
            const payMethodObj = STORE_PAYMENT_METHODS.find((m) => m.id === store.paymentMethod) || STORE_PAYMENT_METHODS[0];
            const storeQrSrc = getStoreQrPreviewSrc(store.paymentMethod, accNum, store.paymentQrImage, 180);

            const qProdNorm = prodSearch.trim().toLowerCase();
            const filteredPortalProducts = products.filter((p) => {
                if (selectedSection !== 'all') {
                    if (selectedSection === '__other__') {
                        if (knownSectionIds.has(p.category)) return false;
                    } else if (p.category !== selectedSection) {
                        return false;
                    }
                }
                if (stockFilter === 'in_stock' && p.inStock === false) return false;
                if (stockFilter === 'out_of_stock' && p.inStock !== false) return false;
                if (!qProdNorm) return true;
                return (
                    String(p.name || '').toLowerCase().includes(qProdNorm) ||
                    String(p.brand || '').toLowerCase().includes(qProdNorm) ||
                    String(p.categoryLabel || '').toLowerCase().includes(qProdNorm) ||
                    String(p.desc || '').toLowerCase().includes(qProdNorm)
                );
            });

            const uncategorizedProducts = filteredPortalProducts.filter((p) => !knownSectionIds.has(p.category));
            const filteredPortalOrders = orders.filter((o) => {
                if (orderStatusFilter === 'all') return true;
                const stVal = o.status || 'pending';
                return stVal === orderStatusFilter;
            });

            const renderProductCard = (prod) => (
                <div key={prod.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-4 flex flex-col justify-between gap-3 transition-all">
                    <div className="flex items-start gap-3">
                        {(prod.imageUrl || prod.image) ? (
                            <img src={prod.imageUrl || prod.image} alt={prod.name} className="w-16 h-16 rounded-2xl object-cover border border-slate-700 shrink-0" />
                        ) : (
                            <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-2xl shrink-0">{prod.icon || '🎨'}</div>
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="font-black text-sm text-white truncate">{prod.name}</div>
                            <div className="text-[11px] font-bold text-slate-400 truncate">
                                {prod.brand ? `${prod.brand} • ` : ''}{prod.unit || 'قطعة'}
                            </div>
                            <div className="flex items-baseline gap-2 mt-1">
                                <span className="text-sm font-black text-emerald-400">
                                    {Number(prod.price || 0).toLocaleString('en-US')} د.ع
                                </span>
                                {Number(prod.oldPrice || 0) > Number(prod.price || 0) && (
                                    <span className="text-[10px] font-bold text-slate-500 line-through">
                                        {Number(prod.oldPrice).toLocaleString('en-US')}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                                {prod.categoryLabel && (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-500/20 text-indigo-300">
                                        {prod.icon || '📂'} {prod.categoryLabel}
                                    </span>
                                )}
                                {prod.requiresColorCode && (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-fuchsia-500/20 text-fuchsia-300">🎨 كود لون</span>
                                )}
                                {prod.inStock === false && (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-500/20 text-rose-300">نفذت الكمية</span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800">
                        <button
                            onClick={() => handleToggleProductStock(prod)}
                            className={`px-2.5 py-2 rounded-xl font-black text-[11px] border ${
                                prod.inStock === false
                                    ? 'bg-rose-950/60 border-rose-700/40 text-rose-300'
                                    : 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                            }`}
                            title="تبديل حالة التوفر في المخزن"
                        >
                            {prod.inStock === false ? '🔴 نافذ' : '🟢 متوفر'}
                        </button>
                        <button
                            onClick={() => setEditingProduct({ ...prod, isNew: false })}
                            className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs"
                        >
                            ✏️ تعديل
                        </button>
                        <button
                            onClick={() => handleDeleteProduct(prod)}
                            className="px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-700/40 font-black text-xs"
                        >
                            🗑️
                        </button>
                    </div>
                </div>
            );

            return (
                <div className="min-h-screen bg-slate-950 text-slate-100 p-4 pb-24" dir="rtl">
                    <div className="max-w-5xl mx-auto space-y-4">
                        {/* Showroom Top Header Card */}
                        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h1 className="font-black text-lg text-white">🏪 {store.name}</h1>
                                        {store.badge && (
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                {store.badge}
                                            </span>
                                        )}
                                        <button
                                            onClick={() => copyToClipboard(getStorePortalCode(store), () => addToast && addToast(`📋 تم نسخ كود المعرض: ${getStorePortalCode(store)}`))}
                                            className="px-2.5 py-0.5 rounded-lg font-mono text-[11px] bg-slate-950 text-amber-300 border border-slate-800"
                                        >
                                            🔑 {getStorePortalCode(store)}
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-400 font-bold">
                                        📍 {store.gov || 'بغداد'} {store.address ? `• ${store.address}` : ''} {store.workHours ? `• 🕒 ${store.workHours}` : ''}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        onClick={() => setEditingProduct({ isNew: true, inStock: true, category: selectedSection !== 'all' && selectedSection !== '__other__' ? selectedSection : storeSections[0]?.id })}
                                        className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg"
                                    >
                                        + إضافة منتج جديد
                                    </button>
                                    <button
                                        onClick={onExit}
                                        className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs border border-slate-700"
                                    >
                                        🔙 العودة لقائمة المعارض
                                    </button>
                                </div>
                            </div>

                            {/* Organized Inner Showroom Navigation Menu (4 Clear Tabs) */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-800">
                                {[
                                    { id: 'products', icon: '📦', label: 'قوائم المنتجات', badge: `${products.length} منتج` },
                                    { id: 'sections', icon: '📂', label: 'ترتيب الأقسام', badge: `${storeSections.length} قسم` },
                                    { id: 'orders', icon: '🧾', label: 'طلبيات المعرض', badge: pendingOrdersCount > 0 ? `${pendingOrdersCount} جديدة` : `${orders.length} طلب` },
                                    { id: 'info', icon: 'ℹ️', label: 'بيانات المعرض والدفع', badge: accNum ? 'QR مفعل' : 'تحديث' }
                                ].map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => setPortalTab(t.id)}
                                        className={`p-3 rounded-2xl border text-right transition-all ${
                                            portalTab === t.id
                                                ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-md'
                                                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="text-base">{t.icon}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                portalTab === t.id ? 'bg-indigo-500 text-white' : 'bg-slate-900 text-slate-400'
                                            }`}>
                                                {t.badge}
                                            </span>
                                        </div>
                                        <div className="text-xs font-black mt-1">{t.label}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* INNER TAB 1: PRODUCTS ORGANIZED BY SHOWROOM SECTIONS */}
                        {portalTab === 'products' && (
                            <div className="space-y-4">
                                {/* Search, Stock Filter & View Toggle */}
                                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input
                                            type="search"
                                            value={prodSearch}
                                            onChange={(e) => setProdSearch(e.target.value)}
                                            placeholder="🔍 ابحث داخل منتجات هذا المعرض بالاسم أو الماركة..."
                                            className="flex-1 min-w-[200px] p-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                                        />
                                        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800">
                                            {[
                                                { id: 'all', label: `الكل (${products.length})` },
                                                { id: 'in_stock', label: `🟢 متوفر (${inStockCount})` },
                                                { id: 'out_of_stock', label: `🔴 نافذ (${outOfStockCount})` }
                                            ].map((sf) => (
                                                <button
                                                    key={sf.id}
                                                    onClick={() => setStockFilter(sf.id)}
                                                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all ${
                                                        stockFilter === sf.id ? 'bg-indigo-600 text-white' : 'text-slate-400'
                                                    }`}
                                                >
                                                    {sf.label}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => setGroupBySection((v) => !v)}
                                            className={`px-3 py-2 rounded-2xl text-xs font-black border ${
                                                groupBySection
                                                    ? 'bg-amber-400/20 border-amber-500/40 text-amber-300'
                                                    : 'bg-slate-950 border-slate-800 text-slate-400'
                                            }`}
                                        >
                                            {groupBySection ? '🗂️ مرتب حسب الأقسام' : '▦ عرض شبكة موحدة'}
                                        </button>
                                    </div>

                                    {/* Ordered Section Filter Tabs */}
                                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
                                        <button
                                            onClick={() => setSelectedSection('all')}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                                                selectedSection === 'all'
                                                    ? 'bg-amber-400 text-slate-950 border-amber-400'
                                                    : 'bg-slate-950 text-slate-300 border-slate-800'
                                            }`}
                                        >
                                            📋 كل الأقسام ({products.length})
                                        </button>
                                        {storeSections.map((sec, idx) => {
                                            const cnt = products.filter((p) => p.category === sec.id).length;
                                            return (
                                                <button
                                                    key={sec.id}
                                                    onClick={() => setSelectedSection(sec.id)}
                                                    className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                                                        selectedSection === sec.id
                                                            ? 'bg-indigo-600 text-white border-indigo-500'
                                                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                                                    }`}
                                                >
                                                    <span className="text-[10px] opacity-70 ml-1">#{idx + 1}</span>
                                                    {sec.icon || '📂'} {sec.label} ({cnt})
                                                </button>
                                            );
                                        })}
                                        {products.some((p) => !knownSectionIds.has(p.category)) && (
                                            <button
                                                onClick={() => setSelectedSection('__other__')}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                                                    selectedSection === '__other__'
                                                        ? 'bg-slate-700 text-white border-slate-500'
                                                        : 'bg-slate-950 text-slate-400 border-slate-800'
                                                }`}
                                            >
                                                📦 أخرى ({products.filter((p) => !knownSectionIds.has(p.category)).length})
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Product List Content */}
                                {filteredPortalProducts.length === 0 ? (
                                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center space-y-3">
                                        <div className="text-4xl">📦</div>
                                        <div className="text-sm font-black text-slate-300">لا توجد منتجات في هذا القسم أو الفلتر حالياً</div>
                                        <button
                                            onClick={() => setEditingProduct({
                                                isNew: true,
                                                inStock: true,
                                                category: selectedSection !== 'all' && selectedSection !== '__other__' ? selectedSection : storeSections[0]?.id
                                            })}
                                            className="px-5 py-3 rounded-2xl bg-emerald-500 text-slate-950 font-black text-xs"
                                        >
                                            + إضافة منتج في هذا القسم
                                        </button>
                                    </div>
                                ) : groupBySection && selectedSection === 'all' ? (
                                    <div className="space-y-4">
                                        {storeSections.map((sec, idx) => {
                                            const secProds = filteredPortalProducts.filter((p) => p.category === sec.id);
                                            return (
                                                <div key={sec.id} className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4 space-y-3">
                                                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-7 h-7 rounded-xl bg-indigo-600/25 border border-indigo-500/40 text-indigo-300 text-xs font-black flex items-center justify-center">
                                                                {idx + 1}
                                                            </span>
                                                            <span className="text-lg">{sec.icon || '📂'}</span>
                                                            <h3 className="font-black text-sm text-white">{sec.label}</h3>
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-800 text-slate-300">
                                                                {secProds.length} منتج
                                                            </span>
                                                        </div>
                                                        <button
                                                            onClick={() => setEditingProduct({ isNew: true, inStock: true, category: sec.id })}
                                                            className="px-3 py-1.5 rounded-xl bg-emerald-600/25 border border-emerald-500/40 text-emerald-300 font-black text-[11px]"
                                                        >
                                                            + إضافة في «{sec.label}»
                                                        </button>
                                                    </div>
                                                    {secProds.length === 0 ? (
                                                        <div className="text-center py-4 text-xs font-bold text-slate-500">
                                                            القسم فارغ حالياً — اضغط «+ إضافة» لإدراج منتجات داخله
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                            {secProds.map(renderProductCard)}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {uncategorizedProducts.length > 0 && (
                                            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4 space-y-3">
                                                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                                    <h3 className="font-black text-sm text-slate-300">📦 منتجات غير مرتبطة بقسم محدد ({uncategorizedProducts.length})</h3>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                    {uncategorizedProducts.map(renderProductCard)}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        {filteredPortalProducts.map(renderProductCard)}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* INNER TAB 2: LIVE SECTION MENU ORGANIZER (REORDER / RENAME / ADD / REMOVE) */}
                        {portalTab === 'sections' && (
                            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                                    <div>
                                        <h2 className="font-black text-base text-white">📂 ترتيب وتنظيم قوائم وأقسام المعرض</h2>
                                        <p className="text-xs font-bold text-slate-400 mt-0.5">
                                            رتّب الأقسام بالأسهم (▲ / ▼) أو عدّل أسماءها لتظهر بنفس الترتيب للعملاء والمقاولين داخل التطبيق
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => { setDraftSections(getDefaultSectionsForStoreType(store.storeType || 'both')); setSectionsDirty(true); }}
                                            className="px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-black"
                                        >
                                            ✨ الافتراضي للتخصص
                                        </button>
                                        <button
                                            type="button"
                                            disabled={savingSections}
                                            onClick={handleSaveSectionsOrder}
                                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg"
                                        >
                                            {savingSections ? 'جاري الحفظ...' : '💾 حفظ ترتيب القوائم ✓'}
                                        </button>
                                    </div>
                                </div>

                                {/* Ordered Vertical Menu Rows */}
                                <div className="space-y-2">
                                    {draftSections.map((sec, idx) => {
                                        const countInSec = products.filter((p) => p.category === sec.id).length;
                                        return (
                                            <div key={sec.id + '_' + idx} className="flex flex-wrap items-center gap-2 p-2.5 rounded-2xl bg-slate-950 border border-slate-800">
                                                <span className="w-7 h-7 rounded-xl bg-indigo-600/25 border border-indigo-500/40 text-indigo-300 font-black text-xs flex items-center justify-center shrink-0">
                                                    {idx + 1}
                                                </span>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        disabled={idx === 0}
                                                        onClick={() => handleMoveDraftSection(idx, -1)}
                                                        className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white font-black text-xs"
                                                        title="تحريك للأعلى"
                                                    >
                                                        ▲
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={idx === draftSections.length - 1}
                                                        onClick={() => handleMoveDraftSection(idx, 1)}
                                                        className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white font-black text-xs"
                                                        title="تحريك للأسفل"
                                                    >
                                                        ▼
                                                    </button>
                                                </div>
                                                <input
                                                    value={sec.icon || '📂'}
                                                    onChange={(e) => handleRenameDraftSection(idx, 'icon', e.target.value)}
                                                    className="w-11 p-2 rounded-xl bg-slate-900 border border-slate-700 text-center text-sm"
                                                />
                                                <input
                                                    value={sec.label || ''}
                                                    onChange={(e) => handleRenameDraftSection(idx, 'label', e.target.value)}
                                                    className="flex-1 min-w-[140px] p-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-black text-white"
                                                />
                                                <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-bold text-slate-400">
                                                    {countInSec} منتج
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => { setDraftSections((prev) => prev.filter((_, i) => i !== idx)); setSectionsDirty(true); }}
                                                    className="px-2.5 py-2 rounded-xl bg-rose-950/60 border border-rose-700/40 text-rose-300 font-black text-xs"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Add Custom Section */}
                                <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                                    <input
                                        value={newSecIcon}
                                        onChange={(e) => setNewSecIcon(e.target.value)}
                                        placeholder="📂"
                                        className="w-12 p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-center text-sm"
                                    />
                                    <input
                                        value={newSecLabel}
                                        onChange={(e) => setNewSecLabel(e.target.value)}
                                        placeholder="اسم قسم مخصص جديد (مثال: بديل الرخام، إنارة مخفية، عوازل...)"
                                        className="flex-1 p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddDraftSection}
                                        className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-black text-xs shrink-0"
                                    >
                                        + إضافة قسم
                                    </button>
                                </div>

                                {/* Quick Preset Category Chips */}
                                <div className="space-y-2 pt-2 border-t border-slate-800">
                                    <div className="text-[11px] font-bold text-slate-400">أقسام جاهزة للإضافة السريعة:</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {ECOMMERCE_CATEGORIES.map((cat) => {
                                            const active = draftSections.some((s) => s.id === cat.id);
                                            return (
                                                <button
                                                    key={cat.id}
                                                    type="button"
                                                    onClick={() => handleTogglePresetDraftSection(cat)}
                                                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black border ${
                                                        active
                                                            ? 'bg-indigo-600 text-white border-indigo-500'
                                                            : 'bg-slate-950 text-slate-400 border-slate-800'
                                                    }`}
                                                >
                                                    {cat.icon} {cat.label} {active ? '✓' : '+'}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* INNER TAB 3: LIVE ORDERS FOR THIS SHOWROOM */}
                        {portalTab === 'orders' && (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-2xl p-3">
                                    {[
                                        { id: 'all', label: `الكل (${orders.length})` },
                                        { id: 'pending', label: `⏳ قيد الانتظار (${pendingOrdersCount})` },
                                        { id: 'confirmed', label: `✓ مؤكدة (${orders.filter((o) => o.status === 'confirmed').length})` },
                                        { id: 'delivered', label: `🚚 تم التوصيل (${orders.filter((o) => o.status === 'delivered').length})` }
                                    ].map((f) => (
                                        <button
                                            key={f.id}
                                            onClick={() => setOrderStatusFilter(f.id)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-black ${
                                                orderStatusFilter === f.id ? 'bg-amber-400 text-slate-950' : 'bg-slate-950 text-slate-400 border border-slate-800'
                                            }`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>

                                {filteredPortalOrders.length === 0 ? (
                                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center text-slate-400 font-bold text-sm">
                                        لا توجد طلبيات مطابقة لهذا المعرض حالياً
                                    </div>
                                ) : (
                                    filteredPortalOrders.map((ord) => (
                                        <div key={ord.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-2">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-black text-sm text-white">👷 {ord.contractorName || ord.adminId || 'مقاول'}</span>
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                                                        ord.status === 'delivered' ? 'bg-emerald-500/20 text-emerald-300' :
                                                        ord.status === 'confirmed' ? 'bg-indigo-500/20 text-indigo-300' :
                                                        'bg-amber-500/20 text-amber-300'
                                                    }`}>
                                                        {ord.status === 'delivered' ? '✓ تم التوصيل' : ord.status === 'confirmed' ? 'تم التأكيد' : 'قيد الانتظار'}
                                                    </span>
                                                </div>
                                                <span className="font-black text-sm text-emerald-400">
                                                    {Number(ord.total || ord.totalAmount || 0).toLocaleString('en-US')} د.ع
                                                </span>
                                            </div>
                                            {ord.projectName && (
                                                <div className="text-xs font-bold text-slate-400">🏗️ المشروع: {ord.projectName} • 📅 {ord.date || String(ord.createdAt || '').split('T')[0]}</div>
                                            )}
                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                                <button onClick={() => handleUpdatePortalOrderStatus(ord, 'confirmed')} className="px-3 py-1.5 rounded-xl bg-indigo-600/25 text-indigo-300 text-xs font-black">✓ تأكيد الطلبية</button>
                                                <button onClick={() => handleUpdatePortalOrderStatus(ord, 'delivered')} className="px-3 py-1.5 rounded-xl bg-emerald-600/25 text-emerald-300 text-xs font-black">🚚 تم التوصيل</button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* INNER TAB 4: ORGANIZED SHOWROOM CONTACT & PROTECTED PAYMENT INFO */}
                        {portalTab === 'info' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <form onSubmit={handleSaveStoreContactInfo} className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-3">
                                    <h3 className="font-black text-sm text-indigo-300 border-b border-slate-800 pb-2">📞 معلومات التواصل والعنوان (قابلة للتحديث)</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 block mb-1">رقم الهاتف / واتساب</label>
                                            <input name="phone" defaultValue={store.phone || ''} placeholder="رقم الهاتف / واتساب" className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-700 text-sm font-mono text-white" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 block mb-1">المحافظة</label>
                                            <select name="gov" defaultValue={store.gov || 'بغداد'} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white">
                                                {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 block mb-1">العنوان التفصيلي</label>
                                        <input name="address" defaultValue={store.address || ''} placeholder="العنوان التفصيلي" className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 block mb-1">أوقات الدوام</label>
                                        <input name="workHours" defaultValue={store.workHours || ''} placeholder="أوقات الدوام (مثال: 8 ص - 8 م)" className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white" />
                                    </div>
                                    <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300">
                                        <span>🚚 يتوفر توصيل للمشاريع والورش</span>
                                        <input type="checkbox" name="hasDelivery" defaultChecked={store.hasDelivery !== false} className="w-4 h-4" />
                                    </label>
                                    <button type="submit" className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs">
                                        💾 حفظ معلومات التواصل ✓
                                    </button>
                                </form>

                                <div className="bg-slate-900 border border-emerald-500/30 p-5 rounded-3xl space-y-3">
                                    <h3 className="font-black text-sm text-emerald-300 border-b border-slate-800 pb-2">💳 حساب الدفع المعتمد وباركود QR (محمي للقراءة فقط)</h3>
                                    {accNum ? (
                                        <div className="space-y-3">
                                            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                                                <div className="text-xs font-black text-white">{payMethodObj.icon} {payMethodObj.label}</div>
                                                <div className="text-sm font-mono font-black text-emerald-400">{accNum}</div>
                                                {store.paymentAccountHolder && (
                                                    <div className="text-xs font-bold text-slate-400">باسم: {store.paymentAccountHolder}</div>
                                                )}
                                            </div>
                                            {storeQrSrc && (
                                                <div className="flex justify-center">
                                                    <div className="p-3 rounded-2xl bg-white border-2 border-emerald-500">
                                                        <img src={storeQrSrc} alt="Store Payment QR" className="w-36 h-36 object-contain" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-6 rounded-2xl bg-amber-950/50 border border-amber-500/30 text-amber-300 text-xs font-bold text-center">
                                            لم يتم تعيين حساب الدفع الإلكتروني لهذا المعرض بعد — يتم تعيينه حصراً من قِبل الإدارة المركزية.
                                        </div>
                                    )}
                                    <p className="text-[11px] font-bold text-slate-400">
                                        🔒 لحماية أموال العملاء، تعديل الحساب البنكي أو صورة الباركود متاح حصراً عبر شاشة «تعديل المعرض» في لوحة الإدارة المركزية.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {editingProduct && (
                        <ProductEditorModal
                            store={store}
                            product={editingProduct}
                            onClose={() => setEditingProduct(null)}
                            addToast={addToast}
                        />
                    )}
                </div>
            );
        };

        // =========================================================================
        // COMPLETE SHOWROOM & SHOP ADD / EDIT MODAL (All Original Details Restored)
        // =========================================================================
        const ShowroomEditorModal = ({ initialStore, onClose, onDelete, addToast }) => {
            const isNew = Boolean(initialStore?.isNew);
            const [storeType, setStoreType] = useState(initialStore?.storeType || 'paint_agency');
            const [agencyBrandKey, setAgencyBrandKey] = useState(initialStore?.agencyBrandKey || (initialStore?.storeType === 'paint_agency' ? 'jotun' : ''));
            const [agencyBrandLabel, setAgencyBrandLabel] = useState(initialStore?.agencyBrandLabel || '');
            const [badge, setBadge] = useState(initialStore?.badge || 'وكيل معتمد ✓');
            const [name, setName] = useState(initialStore?.name || '');
            const [gov, setGov] = useState(initialStore?.gov || 'بغداد');
            const [address, setAddress] = useState(initialStore?.address || '');
            const [phone, setPhone] = useState(initialStore?.phone || '');
            const [workHours, setWorkHours] = useState(initialStore?.workHours || '8:00 ص - 9:00 م');
            const [notes, setNotes] = useState(initialStore?.notes || '');

            // Custom Sections inside Showroom
            const [customSections, setCustomSections] = useState(() => {
                if (Array.isArray(initialStore?.customSections) && initialStore.customSections.length > 0) {
                    return initialStore.customSections;
                }
                return getDefaultSectionsForStoreType(initialStore?.storeType || 'paint_agency');
            });
            const [newSecIcon, setNewSecIcon] = useState('📂');
            const [newSecLabel, setNewSecLabel] = useState('');

            // GPS / Google Maps Location
            const [locInput, setLocInput] = useState(initialStore?.location?.url || initialStore?.location?.raw || '');
            const [locLat, setLocLat] = useState(initialStore?.location?.lat != null ? String(initialStore.location.lat) : '');
            const [locLng, setLocLng] = useState(initialStore?.location?.lng != null ? String(initialStore.location.lng) : '');
            const [gpsBusy, setGpsBusy] = useState(false);

            // Financial Payment Account & QR Code (Admin-Only Protected)
            const [paymentMethod, setPaymentMethod] = useState(initialStore?.paymentMethod || 'zaincash');
            const [paymentAccountNumber, setPaymentAccountNumber] = useState(getStoreAccountNumber(initialStore));
            const [paymentAccountHolder, setPaymentAccountHolder] = useState(initialStore?.paymentAccountHolder || '');
            const [paymentQrImage, setPaymentQrImage] = useState(initialStore?.paymentQrImage || '');

            // Portal Code & VIP Subscription
            const [portalCode, setPortalCode] = useState(initialStore?.portalCode || (isNew ? generateNewPortalCode() : getStorePortalCode(initialStore)));
            const [isVipStore, setIsVipStore] = useState(initialStore?.isVipStore !== false);
            const [subscriptionPlanLabel, setSubscriptionPlanLabel] = useState(initialStore?.subscriptionPlanLabel || 'سنوي');
            const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState(
                initialStore?.subscriptionExpiresAt ? String(initialStore.subscriptionExpiresAt).split('T')[0] : addDaysIso(365)
            );
            const [isActive, setIsActive] = useState(initialStore?.isActive !== false);
            const [hasDelivery, setHasDelivery] = useState(initialStore?.hasDelivery !== false);
            const [saving, setSaving] = useState(false);
            const [modalSectionTab, setModalSectionTab] = useState('identity'); // identity | sections | location | payment | portal | all

            const qrPreviewSrc = useMemo(
                () => getStoreQrPreviewSrc(paymentMethod, paymentAccountNumber, paymentQrImage, 180),
                [paymentMethod, paymentAccountNumber, paymentQrImage]
            );

            const handleStoreTypeChange = (nextType) => {
                setStoreType(nextType);
                if (nextType !== 'paint_agency' && nextType !== 'paint') {
                    setAgencyBrandKey('');
                    setAgencyBrandLabel('');
                } else if (nextType === 'paint_agency' && !agencyBrandKey) {
                    setAgencyBrandKey('jotun');
                    setAgencyBrandLabel('جوتن (Jotun)');
                    if (!badge || badge === 'معرض معتمد ✓') setBadge('وكيل جوتن معتمد ✓');
                }
                if (isNew) {
                    setCustomSections(getDefaultSectionsForStoreType(nextType));
                }
            };

            const handleSelectBrand = (brandId) => {
                setAgencyBrandKey(brandId);
                const found = PAINT_AGENCY_BRANDS.find((b) => b.id === brandId);
                if (found) {
                    setAgencyBrandLabel(found.nameAr);
                    if (isNew || badge.includes('وكيل') || badge.includes('معرض معتمد')) {
                        setBadge(found.suggestedBadge);
                    }
                } else {
                    setAgencyBrandLabel('');
                }
            };

            const handleTogglePresetSection = (cat) => {
                setCustomSections((prev) => {
                    const exists = prev.some((s) => s.id === cat.id);
                    if (exists) return prev.filter((s) => s.id !== cat.id);
                    return [...prev, { id: cat.id, label: cat.label, icon: cat.icon }];
                });
            };

            const handleAddCustomSection = () => {
                const cleanLabel = newSecLabel.trim();
                if (!cleanLabel) return;
                const secId = 'sec_' + Date.now().toString(36);
                setCustomSections((prev) => [...prev, { id: secId, label: cleanLabel, icon: newSecIcon.trim() || '📂' }]);
                setNewSecLabel('');
            };

            const handleMoveCustomSection = (idx, delta) => {
                setCustomSections((prev) => {
                    const target = idx + delta;
                    if (target < 0 || target >= prev.length) return prev;
                    const next = [...prev];
                    const tmp = next[idx];
                    next[idx] = next[target];
                    next[target] = tmp;
                    return next;
                });
            };

            const handleUpdateCustomSectionField = (idx, field, val) => {
                setCustomSections((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s)));
            };

            const handleLocationInputChange = (val) => {
                setLocInput(val);
                const parsed = parseLocationString(val);
                if (parsed && parsed.lat !== null && parsed.lng !== null) {
                    setLocLat(String(parsed.lat));
                    setLocLng(String(parsed.lng));
                }
            };

            const handleCaptureCurrentGps = () => {
                if (!navigator.geolocation) {
                    if (addToast) addToast('المتصفح لا يدعم التقاط GPS التلقائي', 'error');
                    return;
                }
                setGpsBusy(true);
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const lat = Number(pos.coords.latitude.toFixed(6));
                        const lng = Number(pos.coords.longitude.toFixed(6));
                        setLocLat(String(lat));
                        setLocLng(String(lng));
                        setLocInput(`https://maps.google.com/?q=${lat},${lng}`);
                        setGpsBusy(false);
                        if (addToast) addToast(`📍 تم التقاط الإحداثيات بنجاح (${lat}, ${lng})`);
                    },
                    () => {
                        setGpsBusy(false);
                        if (addToast) addToast('تعذر الوصول لـ GPS — يمكنك لصق رابط الموقع من خرائط جوجل', 'error');
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            };

            const handleQrImageUpload = async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                    const dataUrl = await compressImageFileToDataUrl(file, 480, 0.82);
                    setPaymentQrImage(dataUrl);
                    if (addToast) addToast('✓ تم رفع صورة باركود الدفع الرسمية للمعرض');
                } catch (err) {
                    if (addToast) addToast('تعذر قراءة صورة الباركود: ' + err.message, 'error');
                }
            };

            const handleSubmit = async (e) => {
                e.preventDefault();
                const cleanName = AlOstaCrypto.sanitizeText(name, 140);
                if (!cleanName) {
                    setModalSectionTab('identity');
                    if (addToast) addToast('يرجى إدخال اسم المعرض أو المحل أولاً', 'error');
                    return;
                }
                const targetId = isNew ? ('store_' + Date.now()) : initialStore.id;
                const cleanCode = String(portalCode || generateNewPortalCode()).trim().toUpperCase();

                const parsedLat = parseFloat(locLat);
                const parsedLng = parseFloat(locLng);
                let locationObj = null;
                if (isFinite(parsedLat) && isFinite(parsedLng)) {
                    locationObj = {
                        lat: parsedLat,
                        lng: parsedLng,
                        raw: `${parsedLat}, ${parsedLng}`,
                        url: /^https?:\/\//i.test(locInput.trim()) ? locInput.trim() : `https://maps.google.com/?q=${parsedLat},${parsedLng}`
                    };
                } else if (locInput.trim()) {
                    locationObj = parseLocationString(locInput.trim());
                }

                const cleanSections = customSections
                    .map((s) => ({
                        id: s.id,
                        label: AlOstaCrypto.sanitizeText(s.label, 60),
                        icon: AlOstaCrypto.sanitizeText(s.icon || '📂', 8) || '📂'
                    }))
                    .filter((s) => s.label);
                const finalSections = cleanSections.length > 0 ? cleanSections : getDefaultSectionsForStoreType(storeType);

                setSaving(true);
                try {
                    const payload = {
                        name: cleanName,
                        storeType,
                        agencyBrandKey: agencyBrandKey || '',
                        agencyBrandLabel: agencyBrandLabel.trim(),
                        badge: AlOstaCrypto.sanitizeText(badge, 60) || 'معرض معتمد ✓',
                        gov,
                        address: AlOstaCrypto.sanitizeText(address, 180),
                        phone: String(phone || '').replace(/[^\d+]/g, '').slice(0, 20),
                        workHours: AlOstaCrypto.sanitizeText(workHours, 80) || '8:00 ص - 9:00 م',
                        notes: AlOstaCrypto.sanitizeText(notes, 400),
                        customSections: finalSections,
                        location: locationObj,
                        // Protected Financial Payment Info
                        paymentMethod,
                        paymentAccountNumber: String(paymentAccountNumber || '').trim(),
                        paymentAccountHolder: AlOstaCrypto.sanitizeText(paymentAccountHolder, 100),
                        paymentQrImage: AlOstaCrypto.sanitizeImageUrl(paymentQrImage),
                        // Portal Security & VIP Subscription
                        portalCode: cleanCode,
                        isVipStore,
                        subscriptionPlanLabel: isVipStore ? subscriptionPlanLabel : '',
                        subscriptionExpiresAt: subscriptionExpiresAt ? subscriptionExpiresAt : null,
                        isActive,
                        hasDelivery,
                        updatedAt: new Date().toISOString()
                    };
                    if (isNew) payload.createdAt = new Date().toISOString();

                    await db.collection('stores').doc(targetId).set(payload, { merge: true });
                    if (addToast) {
                        addToast(isNew
                            ? `🏪 تم إنشاء المعرض "${cleanName}" بكامل تفاصيله بنجاح (كود البوابة: ${cleanCode})!`
                            : `✓ تم تحديث بيانات معرض "${cleanName}" في السحابة بنجاح!`);
                    }
                    onClose();
                } catch (err) {
                    if (addToast) addToast('⛔ تعذر حفظ بيانات المعرض: ' + (err.message || ''), 'error');
                } finally {
                    setSaving(false);
                }
            };

            const showModalSec = (secKey) => modalSectionTab === 'all' || modalSectionTab === secKey;

            return (
                <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
                    <form
                        onSubmit={handleSubmit}
                        className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[93vh] overflow-y-auto"
                    >
                        {/* Sticky Modal Header + Organized Menu Tabs */}
                        <div className="border-b border-slate-800 pb-3 sticky top-0 bg-slate-900 z-10 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <h3 className="font-black text-base sm:text-lg text-white">
                                        {isNew ? '🏪 إضافة محل / معرض / وكالة جديدة' : `✏️ إدارة وتعديل: ${initialStore.name}`}
                                    </h3>
                                    <p className="text-[11px] font-bold text-slate-400">
                                        تنقّل بين القوائم المنظمة أدناه لإعداد المعرض بدقة وسهولة
                                    </p>
                                </div>
                                <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-800 text-slate-300 font-black">✕</button>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                                {[
                                    { id: 'identity', label: '1️⃣ الهوية والوكالة' },
                                    { id: 'sections', label: `2️⃣ القوائم والأقسام (${customSections.length})` },
                                    { id: 'location', label: '3️⃣ الموقع والاتصال' },
                                    { id: 'payment', label: '4️⃣ الدفع QR' },
                                    { id: 'portal', label: '5️⃣ البوابة و VIP' },
                                    { id: 'all', label: '📋 عرض الكل' }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setModalSectionTab(tab.id)}
                                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black border transition-all ${
                                            modalSectionTab === tab.id
                                                ? 'bg-amber-400 text-slate-950 border-amber-400'
                                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* SECTION 1: Store Type & Basic Identity */}
                        {showModalSec('identity') && (
                        <div className="space-y-3 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                            <div className="text-xs font-black text-indigo-300">1️⃣ هوية المعرض / المحل وتخصصه الرئيسي</div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {STORE_TYPES.map((st) => (
                                    <button
                                        key={st.id}
                                        type="button"
                                        onClick={() => handleStoreTypeChange(st.id)}
                                        className={`p-2.5 rounded-2xl border text-right transition-all ${
                                            storeType === st.id
                                                ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-md'
                                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="text-base">{st.icon}</div>
                                        <div className="text-[11px] font-black mt-0.5">{st.shortAr}</div>
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 block mb-1">اسم المعرض أو المحل *</label>
                                    <input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="مثال: مركز جوتن للأصباغ والديكورات الحديثة"
                                        className="w-full p-3 rounded-2xl bg-slate-900 border border-slate-700 text-sm font-bold text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 block mb-1">الشارة المميزة للمعرض (Badge)</label>
                                    <input
                                        value={badge}
                                        onChange={(e) => setBadge(e.target.value)}
                                        placeholder="مثال: وكيل جوتن معتمد ✓ / خصم خاص للمقاولين 🔥"
                                        className="w-full p-3 rounded-2xl bg-slate-900 border border-slate-700 text-xs font-bold text-emerald-300"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-400 block mb-1">وصف ومميزات المعرض (تظهر للمقاولين أسفل الاسم)</label>
                                <textarea
                                    rows="2"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="مثال: تلوين بالكمبيوتر فوري + توصيل سريع لمواقع العمل والورش بأسعار الجملة"
                                    className="w-full p-3 rounded-2xl bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                                />
                            </div>
                        </div>
                        )}

                        {/* SECTION 2: Exclusive Paint Agency Brand Catalog */}
                        {showModalSec('identity') && (
                        <div className="space-y-3 p-4 rounded-2xl bg-fuchsia-950/25 border border-fuchsia-500/35">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <div className="text-xs font-black text-fuchsia-300">🎯 ربط كتالوج شركة الأصباغ الحصري (للوكالات المعتمدة)</div>
                                    <p className="text-[10px] font-bold text-slate-400">
                                        اختيار شركة هنا يُفعّل «بنر وكتالوج ألوان الشركة الحصري» داخل هذا المعرض في التطبيق
                                    </p>
                                </div>
                                {agencyBrandKey && (
                                    <button
                                        type="button"
                                        onClick={() => handleSelectBrand('')}
                                        className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-black"
                                    >
                                        إلغاء ربط الوكالة
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {PAINT_AGENCY_BRANDS.map((b) => (
                                    <button
                                        key={b.id}
                                        type="button"
                                        onClick={() => handleSelectBrand(b.id)}
                                        className={`p-2.5 rounded-2xl border text-right transition-all ${
                                            agencyBrandKey === b.id
                                                ? 'bg-fuchsia-600/30 border-fuchsia-400 text-white'
                                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="text-xs font-black">{b.nameAr}</div>
                                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                                            {b.hasCatalog ? '🎨 كتالوج ألوان تفاعلي' : '✍️ كود يدوي'}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-400 block mb-1">اسم الوكالة / الماركة المعروض (اختياري)</label>
                                <input
                                    value={agencyBrandLabel}
                                    onChange={(e) => setAgencyBrandLabel(e.target.value)}
                                    placeholder="مثال: جوتن (Jotun) أو وكالة كناوف للجبس بورد"
                                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                                />
                            </div>
                        </div>
                        )}

                        {/* SECTION 3: Custom Showroom Sections Manager (Ordered List with Up/Down + Rename) */}
                        {showModalSec('sections') && (
                        <div className="space-y-3 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <div className="text-xs font-black text-amber-300">2️⃣ ترتيب قوائم وأقسام المعرض ({customSections.length} قسم)</div>
                                    <p className="text-[10px] font-bold text-slate-400">
                                        استخدم الأسهم (▲ / ▼) لترتيب الأقسام كما تريد ظهورها بالضبط داخل المعرض
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setCustomSections(getDefaultSectionsForStoreType(storeType))}
                                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black"
                                >
                                    ✨ تعبئة الافتراضي حسب التخصص
                                </button>
                            </div>

                            {/* Ordered Active Sections List */}
                            {customSections.length > 0 && (
                                <div className="space-y-2">
                                    {customSections.map((sec, idx) => (
                                        <div key={sec.id + '_' + idx} className="flex items-center gap-1.5 p-2 rounded-2xl bg-slate-900 border border-slate-800">
                                            <span className="w-6 h-6 rounded-lg bg-indigo-600/25 text-indigo-300 text-[11px] font-black flex items-center justify-center shrink-0">
                                                {idx + 1}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={idx === 0}
                                                onClick={() => handleMoveCustomSection(idx, -1)}
                                                className="w-7 h-7 rounded-lg bg-slate-800 disabled:opacity-30 text-white text-[11px] font-black shrink-0"
                                                title="تحريك للأعلى"
                                            >
                                                ▲
                                            </button>
                                            <button
                                                type="button"
                                                disabled={idx === customSections.length - 1}
                                                onClick={() => handleMoveCustomSection(idx, 1)}
                                                className="w-7 h-7 rounded-lg bg-slate-800 disabled:opacity-30 text-white text-[11px] font-black shrink-0"
                                                title="تحريك للأسفل"
                                            >
                                                ▼
                                            </button>
                                            <input
                                                value={sec.icon || '📂'}
                                                onChange={(e) => handleUpdateCustomSectionField(idx, 'icon', e.target.value)}
                                                className="w-10 p-1.5 rounded-lg bg-slate-950 border border-slate-700 text-center text-xs shrink-0"
                                            />
                                            <input
                                                value={sec.label || ''}
                                                onChange={(e) => handleUpdateCustomSectionField(idx, 'label', e.target.value)}
                                                className="flex-1 min-w-0 p-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-bold text-white"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setCustomSections((prev) => prev.filter((_, i) => i !== idx))}
                                                className="w-7 h-7 rounded-lg bg-rose-950/60 text-rose-400 font-black text-xs shrink-0"
                                                title="حذف القسم"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Custom Section Creator */}
                            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                                <input
                                    value={newSecIcon}
                                    onChange={(e) => setNewSecIcon(e.target.value)}
                                    placeholder="📂"
                                    className="w-12 p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-center text-sm"
                                />
                                <input
                                    value={newSecLabel}
                                    onChange={(e) => setNewSecLabel(e.target.value)}
                                    placeholder="إضافة قسم مخصص جديد (مثال: بديل الرخام والخشب، إنارة مخفية...)"
                                    className="flex-1 p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddCustomSection}
                                    className="px-3.5 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs shrink-0"
                                >
                                    + إضافة قسم
                                </button>
                            </div>

                            {/* Quick Toggle Preset Categories */}
                            <div className="space-y-1.5 pt-2 border-t border-slate-800">
                                <div className="text-[10px] font-bold text-slate-400">أقسام جاهزة (اضغط للإضافة أو الإزالة):</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {ECOMMERCE_CATEGORIES.map((cat) => {
                                        const active = customSections.some((s) => s.id === cat.id);
                                        return (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                onClick={() => handleTogglePresetSection(cat)}
                                                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black border transition-all ${
                                                    active
                                                        ? 'bg-indigo-600 text-white border-indigo-500'
                                                        : 'bg-slate-900 text-slate-400 border-slate-800'
                                                }`}
                                            >
                                                {cat.icon} {cat.label} {active ? '✓' : '+'}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        )}

                        {/* SECTION 4: Contact, Address & GPS / Google Maps Location */}
                        {showModalSec('location') && (
                        <div className="space-y-3 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                            <div className="text-xs font-black text-sky-300">3️⃣ معلومات الاتصال والعنوان والموقع الجغرافي (GPS / خرائط جوجل)</div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 block mb-1">هاتف / واتساب المعرض</label>
                                    <input
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="0770XXXXXXX"
                                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 block mb-1">المحافظة</label>
                                    <select
                                        value={gov}
                                        onChange={(e) => setGov(e.target.value)}
                                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                                    >
                                        {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 block mb-1">أوقات الدوام</label>
                                    <input
                                        value={workHours}
                                        onChange={(e) => setWorkHours(e.target.value)}
                                        placeholder="8:00 ص - 9:00 م"
                                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-400 block mb-1">العنوان التفصيلي</label>
                                <input
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="مثال: بغداد - الكرادة خارج - قرب تقاطع المسبح"
                                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                                />
                            </div>

                            {/* GPS & Google Maps Location */}
                            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <label className="text-[11px] font-black text-sky-300">📍 رابط خرائط جوجل أو الإحداثيات (لحساب المسافة والتوجيه للمعرض)</label>
                                    <button
                                        type="button"
                                        disabled={gpsBusy}
                                        onClick={handleCaptureCurrentGps}
                                        className="px-3 py-1.5 rounded-xl bg-sky-600/25 border border-sky-500/40 text-sky-300 text-[10px] font-black"
                                    >
                                        {gpsBusy ? 'جاري الالتقاط...' : '📡 التقاط موقعي الحالي GPS'}
                                    </button>
                                </div>
                                <input
                                    value={locInput}
                                    onChange={(e) => handleLocationInputChange(e.target.value)}
                                    placeholder="الصق رابط Google Maps أو اكتب الإحداثيات (مثال: 33.2985, 44.4228)"
                                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-sky-200"
                                />
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-center">
                                    <input
                                        value={locLat}
                                        onChange={(e) => setLocLat(e.target.value)}
                                        placeholder="خط العرض Lat (33.31)"
                                        className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white"
                                    />
                                    <input
                                        value={locLng}
                                        onChange={(e) => setLocLng(e.target.value)}
                                        placeholder="خط الطول Lng (44.36)"
                                        className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white"
                                    />
                                    {locLat && locLng && (
                                        <a
                                            href={`https://maps.google.com/?q=${locLat},${locLng}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="p-2 rounded-xl bg-indigo-600/25 border border-indigo-500/40 text-indigo-300 text-center text-[11px] font-black"
                                        >
                                            🗺️ معاينة على الخريطة
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                        )}

                        {/* SECTION 5: Protected Electronic Payment Account & Live QR Code */}
                        {showModalSec('payment') && (
                        <div className="space-y-3 p-4 rounded-2xl bg-emerald-950/25 border border-emerald-500/35">
                            <div className="text-xs font-black text-emerald-300">
                                4️⃣ حساب الدفع الإلكتروني وباركود QR المعتمد (محمي من الداشبورد فقط)
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 block mb-1">طريقة الدفع / المحفظة</label>
                                    <select
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                                    >
                                        {STORE_PAYMENT_METHODS.map((pm) => <option key={pm.id} value={pm.id}>{pm.icon} {pm.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 block mb-1">رقم المحفظة أو الحساب المالي</label>
                                    <input
                                        value={paymentAccountNumber}
                                        onChange={(e) => setPaymentAccountNumber(e.target.value)}
                                        placeholder="0780XXXXXXX أو رقم البطاقة"
                                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-emerald-300"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 block mb-1">اسم صاحب الحساب المالي</label>
                                    <input
                                        value={paymentAccountHolder}
                                        onChange={(e) => setPaymentAccountHolder(e.target.value)}
                                        placeholder="الاسم الثلاثي أو اسم المعرض"
                                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                                    />
                                </div>
                            </div>

                            {/* Live QR Preview + Custom QR Image Upload */}
                            <div className="flex flex-wrap items-center gap-4 pt-1">
                                {qrPreviewSrc ? (
                                    <div className="p-2 rounded-2xl bg-white border-2 border-emerald-500 shrink-0">
                                        <img src={qrPreviewSrc} alt="Store Payment QR" className="w-24 h-24 object-contain" />
                                    </div>
                                ) : (
                                    <div className="w-24 h-24 rounded-2xl bg-slate-900 border border-dashed border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 text-center p-2 shrink-0">
                                        أدخل رقم الحساب لتوليد QR
                                    </div>
                                )}
                                <div className="flex-1 space-y-2">
                                    <p className="text-[11px] font-bold text-slate-300">
                                        {paymentQrImage
                                            ? '✓ يتم عرض صورة الباركود الرسمية المرفوعة من الإدارة'
                                            : 'يتم توليد باركود QR تلقائياً من رقم الحساب أعلاه، أو يمكنك رفع صورة الباركود الرسمية للمعرض:'}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <label className="px-3 py-2 rounded-xl bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 font-black text-xs cursor-pointer">
                                            📷 رفع صورة باركود QR رسمية
                                            <input type="file" accept="image/*" onChange={handleQrImageUpload} className="hidden" />
                                        </label>
                                        {paymentQrImage && (
                                            <button
                                                type="button"
                                                onClick={() => setPaymentQrImage('')}
                                                className="px-3 py-2 rounded-xl bg-rose-950/60 text-rose-300 text-xs font-black border border-rose-700/40"
                                            >
                                                استخدام الباركود التلقائي
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        )}

                        {/* SECTION 6: Portal Code, VIP Subscription & Status Toggles */}
                        {showModalSec('portal') && (
                        <div className="space-y-3 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                            <div className="text-xs font-black text-amber-300">5️⃣ بوابة صاحب المعرض، اشتراك VIP، وحالة العرض</div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 block mb-1">كود بوابة صاحب المعرض السري</label>
                                    <div className="flex gap-1.5">
                                        <input
                                            value={portalCode}
                                            onChange={(e) => setPortalCode(e.target.value.toUpperCase())}
                                            className="flex-1 p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono font-black text-amber-300"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setPortalCode(generateNewPortalCode())}
                                            className="px-2.5 rounded-xl bg-slate-800 text-amber-300 text-xs font-black border border-slate-700"
                                            title="توليد كود سري جديد"
                                        >
                                            🔄
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 block mb-1">باقة اشتراك المعرض</label>
                                    <select
                                        value={subscriptionPlanLabel}
                                        onChange={(e) => setSubscriptionPlanLabel(e.target.value)}
                                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                                    >
                                        <option value="شهري">شهري (30 يوم)</option>
                                        <option value="3 أشهر">3 أشهر (90 يوم)</option>
                                        <option value="6 أشهر">6 أشهر (180 يوم)</option>
                                        <option value="سنوي">سنوي (365 يوم)</option>
                                        <option value="VIP مفتوح">VIP مفتوح</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 block mb-1">تاريخ انتهاء الاشتراك</label>
                                    <input
                                        type="date"
                                        value={subscriptionExpiresAt}
                                        onChange={(e) => setSubscriptionExpiresAt(e.target.value)}
                                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                                    <span className="text-xs font-black text-amber-300">💎 معرض VIP معتمد</span>
                                    <input type="checkbox" checked={isVipStore} onChange={(e) => setIsVipStore(e.target.checked)} className="w-4 h-4" />
                                </label>
                                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                                    <span className="text-xs font-black text-emerald-300">🟢 نشط وظاهر بالتطبيق</span>
                                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4" />
                                </label>
                                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                                    <span className="text-xs font-black text-indigo-300">🚚 توصيل متاح للمشاريع</span>
                                    <input type="checkbox" checked={hasDelivery} onChange={(e) => setHasDelivery(e.target.checked)} className="w-4 h-4" />
                                </label>
                            </div>
                        </div>
                        )}

                        {/* Modal Footer Actions */}
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg"
                            >
                                {saving ? 'جاري الحفظ...' : (isNew ? '🏪 إنشاء المعرض وحفظ كافة التفاصيل ✓' : '💾 حفظ كافة تعديلات المعرض ✓')}
                            </button>
                            {!isNew && onDelete && (
                                <button
                                    type="button"
                                    onClick={() => onDelete(initialStore)}
                                    className="px-4 py-3.5 rounded-2xl bg-rose-950/80 text-rose-300 border border-rose-700/40 font-black text-xs"
                                >
                                    🗑️ حذف المعرض
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-3.5 rounded-2xl bg-slate-800 text-slate-300 font-black text-xs"
                            >
                                إلغاء
                            </button>
                        </div>
                    </form>
                </div>
            );
        };

        // =========================================================================
        // MAIN PLATFORM CENTRAL DASHBOARD (5-TAB CONTROL CENTER)
        // =========================================================================
        const PlatformDashboardApp = () => {
            const [portalUrlKey, setPortalUrlKey] = useState(() => {
                try {
                    const s = window.location.search || '';
                    const h = window.location.hash || '';
                    if (/storePortal=/i.test(s) || /storePortal=/i.test(h)) return window.location.href;
                } catch (e) {}
                return '';
            });

            const [activeTab, setActiveTab] = useState('stores'); // contractors | workers | stores | announcements | settings
            const [storesSubTab, setStoresSubTab] = useState('list'); // list | products | orders
            const [searchQ, setSearchQ] = useState('');
            const [contractorFilter, setContractorFilter] = useState('all');
            const [workerFilter, setWorkerFilter] = useState('all');
            const [selectedGovFilter, setSelectedGovFilter] = useState('الكل');
            const [storeTypeFilter, setStoreTypeFilter] = useState('all');
            const [portalInitialSection, setPortalInitialSection] = useState('all');
            const [productStoreFilter, setProductStoreFilter] = useState('all');
            const [productCategoryFilter, setProductCategoryFilter] = useState('all');
            const [productStockFilter, setProductStockFilter] = useState('all');
            const [productGroupByStore, setProductGroupByStore] = useState(true);
            const [orderStoreFilter, setOrderStoreFilter] = useState('all');
            const [orderStatusFilter, setOrderStatusFilter] = useState('all');

            const [toasts, setToasts] = useState([]);
            const [admins, setAdmins] = useState([]);
            const [workers, setWorkers] = useState([]);
            const [stores, setStores] = useState([]);
            const [storeProducts, setStoreProducts] = useState([]);
            const [storeOrders, setStoreOrders] = useState([]);
            const [projects, setProjects] = useState([]);
            const [announcements, setAnnouncements] = useState([]);
            const [appConfig, setAppConfig] = useState({
                latestVersion: APP_VERSION,
                apkUrl: '',
                rawApkUrl: '',
                portalBaseUrl: 'https://waadpc90-ctrl.github.io/alosta-app/',
                forceUpdate: false,
                stopUpdate: false,
                maintenanceMode: false,
                monetizationEnabled: false,
                autoEnableOnTarget: false,
                targetContractorsCount: 500,
                targetWorkersCount: 2000,
                targetStoresCount: 15,
                freeMaxProjects: 2,
                freeMaxWorkers: 5,
                freeStoreMaxProducts: 10,
                proContractorPrice: 25000,
                proContractorAnnualPrice: 250000,
                proStorePrice: 75000,
                proStoreAnnualPrice: 750000,
                verifiedWorkerPrice: 5000,
                verifiedWorkerAnnualPrice: 50000,
                subscriptionWhatsapp: ''
            });
            const [cloudAppConfig, setCloudAppConfig] = useState(null);
            const [isConfigDirty, setIsConfigDirty] = useState(false);
            const [configSaveError, setConfigSaveError] = useState('');
            const [linkCheckState, setLinkCheckState] = useState(null); // { state: 'checking'|'ok'|'error'|'warn', url, statusCode, message, resolvedUrl, checkedAt }
            const appConfigDirtyRef = useRef(false);

            const normalizeDashboardApkUrl = (raw) => {
                let u = String(raw || '').trim();
                if (!u) return '';
                if (!/^https?:\/\//i.test(u) && u.includes('.') && !u.includes('://')) {
                    u = 'https://' + u;
                }
                const ghMatch = u.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/(?:blob|raw)\/([^/\s]+)\/(.+)$/i);
                if (ghMatch) {
                    const cleanPath = ghMatch[4].split('?')[0].split('#')[0];
                    return `https://raw.githubusercontent.com/${ghMatch[1]}/${ghMatch[2]}/${ghMatch[3]}/${cleanPath}`;
                }
                if (/dropbox\.com/i.test(u)) {
                    if (/[?&]dl=0\b/i.test(u)) return u.replace(/([?&])dl=0\b/i, '$1dl=1');
                    if (/[?&]dl=1\b/i.test(u)) return u;
                    return u + (u.includes('?') ? '&dl=1' : '?dl=1');
                }
                return u;
            };

            const updateAppConfigFields = (patch) => {
                appConfigDirtyRef.current = true;
                setIsConfigDirty(true);
                setConfigSaveError('');
                if (Object.prototype.hasOwnProperty.call(patch, 'apkUrl')) {
                    setLinkCheckState(null);
                }
                setAppConfig((prev) => ({ ...prev, ...patch }));
            };

            const verifyApkLinkNow = async (rawInputUrl) => {
                const candidate = normalizeDashboardApkUrl(rawInputUrl ?? appConfig.apkUrl ?? '');
                if (!candidate) {
                    const res = { state: 'error', url: '', statusCode: 0, message: '⚠️ يرجى إدخال رابط ملف الـ APK أولاً قبل الفحص.' };
                    setLinkCheckState(res);
                    return res;
                }
                if (!/^https?:\/\/[^/\s]+/i.test(candidate)) {
                    const res = { state: 'error', url: candidate, statusCode: 0, message: '⛔ صيغة الرابط غير صحيحة — يجب أن يبدأ بـ https://' };
                    setLinkCheckState(res);
                    return res;
                }
                setLinkCheckState({ state: 'checking', url: candidate, statusCode: 0, message: 'جاري فحص الرابط والتحقق من وجود ملف الـ APK...' });

                // 1) Native Android Dashboard APK check (exact HTTP status + PK\x03\x04 magic bytes + size, zero CORS limits)
                if (window.AndroidApp && typeof window.AndroidApp.verifyUpdateApkUrl === 'function') {
                    try {
                        const rawJson = await new Promise((resolve) => {
                            setTimeout(() => {
                                try {
                                    resolve(window.AndroidApp.verifyUpdateApkUrl(candidate));
                                } catch (e) {
                                    resolve(JSON.stringify({ ok: false, statusCode: 0, message: 'تعذر الفحص: ' + (e.message || '') }));
                                }
                            }, 30);
                        });
                        const parsed = JSON.parse(rawJson || '{}');
                        const out = {
                            state: parsed.ok ? 'ok' : 'error',
                            url: candidate,
                            statusCode: Number(parsed.statusCode || 0),
                            resolvedUrl: parsed.resolvedUrl || candidate,
                            message: parsed.message || (parsed.ok ? '✓ الرابط شغّال ومؤكد' : '⛔ الرابط لا يعمل'),
                            checkedAt: new Date().toLocaleTimeString('ar-IQ')
                        };
                        setLinkCheckState(out);
                        return out;
                    } catch (e) {
                        const out = { state: 'error', url: candidate, statusCode: 0, message: '⛔ تعذر فحص الرابط: ' + (e.message || '') };
                        setLinkCheckState(out);
                        return out;
                    }
                }

                // 2) Web Browser Dashboard check (HEAD/Range GET on CORS-enabled hosts like GitHub raw / direct servers)
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 9000);
                    const resp = await fetch(candidate, { method: 'HEAD', mode: 'cors', signal: controller.signal });
                    clearTimeout(timer);
                    if (resp.status === 404 || resp.status === 410) {
                        const out = { state: 'error', url: candidate, statusCode: resp.status, message: `⛔ الملف غير موجود على هذا الرابط (خطأ ${resp.status})! تأكد من رفع AlOsta_App.apk وتصحيح الرابط.`, checkedAt: new Date().toLocaleTimeString('ar-IQ') };
                        setLinkCheckState(out);
                        return out;
                    }
                    if (resp.status === 401 || resp.status === 403) {
                        const out = { state: 'error', url: candidate, statusCode: resp.status, message: `⛔ الرابط خاص أو محمي (خطأ ${resp.status})! اجعله عاماً للجميع.`, checkedAt: new Date().toLocaleTimeString('ar-IQ') };
                        setLinkCheckState(out);
                        return out;
                    }
                    if (!resp.ok) {
                        const out = { state: 'error', url: candidate, statusCode: resp.status, message: `⛔ الخادم أعاد خطأ (${resp.status}) عند فحص الرابط.`, checkedAt: new Date().toLocaleTimeString('ar-IQ') };
                        setLinkCheckState(out);
                        return out;
                    }
                    const ct = (resp.headers.get('content-type') || '').toLowerCase();
                    const cl = Number(resp.headers.get('content-length') || 0);
                    if (ct.includes('text/html')) {
                        const out = { state: 'error', url: candidate, statusCode: resp.status, message: '⛔ الرابط يفتح صفحة ويب (HTML) وليس ملف APK مباشر!', checkedAt: new Date().toLocaleTimeString('ar-IQ') };
                        setLinkCheckState(out);
                        return out;
                    }
                    const mbStr = cl > 0 ? ` (${(cl / (1024 * 1024)).toFixed(1)} MB)` : '';
                    const out = { state: 'ok', url: candidate, statusCode: resp.status, resolvedUrl: resp.url || candidate, message: `✓ الرابط شغّال ومؤكد وموجود على الخادم${mbStr}!`, checkedAt: new Date().toLocaleTimeString('ar-IQ') };
                    setLinkCheckState(out);
                    return out;
                } catch (err) {
                    const out = {
                        state: 'warn',
                        url: candidate,
                        statusCode: 0,
                        message: '⚠️ تعذر الفحص التلقائي من المتصفح (قيود CORS للمضيف مثل كوكل درايف). اضغط «🌐 فتح للتجربة» أو استخدم تطبيق الداشبورد للفحص المباشر.',
                        checkedAt: new Date().toLocaleTimeString('ar-IQ')
                    };
                    setLinkCheckState(out);
                    return out;
                }
            };

            const bumpPatchVersion = () => {
                const raw = String(appConfig.latestVersion || APP_VERSION).trim();
                const parts = raw.split('.').map((n) => parseInt(n, 10));
                if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
                    parts[2] = parts[2] + 1;
                    updateAppConfigFields({ latestVersion: parts.slice(0, 3).join('.') });
                } else {
                    updateAppConfigFields({ latestVersion: '1.0.20' });
                }
            };

            const [editingContractor, setEditingContractor] = useState(null);
            const [editingWorker, setEditingWorker] = useState(null);
            const [editingStore, setEditingStore] = useState(null);
            const [productModalState, setProductModalState] = useState(null); // { store, product }
            const [editingAnnouncement, setEditingAnnouncement] = useState(null);
            const [annImgPreview, setAnnImgPreview] = useState('');
            const [savingId, setSavingId] = useState('');
            const [syncHealthy, setSyncHealthy] = useState(true);
            // Scalable Dashboard Pagination Limits & Server-Side Aggregation Counts (prevents OOM & cuts launch reads ~95%)
            const [dashLimits, setDashLimits] = useState({
                admins: 100,
                workers: 100,
                stores: 80,
                storeProducts: 150,
                storeOrders: 120,
                projects: 150,
                announcements: 50
            });
            const [cloudCounts, setCloudCounts] = useState({
                admins: null,
                workers: null,
                stores: null,
                storeProducts: null,
                storeOrders: null,
                projects: null,
                announcements: null
            });
            const [countsRefreshing, setCountsRefreshing] = useState(false);

            const refreshCloudCounts = async () => {
                setCountsRefreshing(true);
                try {
                    const [cAdmins, cWorkers, cStores, cProducts, cOrders, cProjects, cAnn] = await Promise.all([
                        db.collection('admins').count(),
                        db.collection('workers').count(),
                        db.collection('stores').count(),
                        db.collection('store_products').count(),
                        db.collection('store_orders').count(),
                        db.collection('projects').count(),
                        db.collection('announcements').count()
                    ]);
                    setCloudCounts({
                        admins: cAdmins,
                        workers: cWorkers,
                        stores: cStores,
                        storeProducts: cProducts,
                        storeOrders: cOrders,
                        projects: cProjects,
                        announcements: cAnn
                    });
                } catch (e) {
                } finally {
                    setCountsRefreshing(false);
                }
            };

            const loadMoreForCollection = (key, step = 100) => {
                setDashLimits((prev) => ({ ...prev, [key]: (prev[key] || 100) + step }));
            };

            const addToast = (msg, type = 'success') => {
                const id = Date.now() + Math.random();
                setToasts((prev) => [...prev, { id, msg, type }]);
                setTimeout(() => {
                    setToasts((prev) => prev.filter((t) => t.id !== id));
                }, 4000);
            };

            // 1) Lightweight Always-On Config Listener (1 doc) + Server-Side Count Aggregation (1/1000th read cost)
            useEffect(() => {
                refreshCloudCounts();
                const unsubCfg = db.collection('settings').doc('app_config').onSnapshot(
                    (docSnap) => {
                        setSyncHealthy(true);
                        if (docSnap && docSnap.exists) {
                            const data = docSnap.data() || {};
                            const syncedUrl = String(data.apkUrl || data.rawApkUrl || '').trim();
                            const normalized = {
                                ...data,
                                latestVersion: String(data.latestVersion || APP_VERSION).trim(),
                                apkUrl: syncedUrl,
                                rawApkUrl: syncedUrl
                            };
                            setCloudAppConfig(normalized);
                            if (!appConfigDirtyRef.current) {
                                setAppConfig((prev) => ({ ...prev, ...normalized }));
                            }
                        }
                    },
                    () => setSyncHealthy(false)
                );
                return () => { try { unsubCfg && unsubCfg(); } catch (e) {} };
            }, []);

            // 2) Tab-Scoped & Paginated Listeners (ZERO unbounded full-collection downloads!)
            useEffect(() => {
                const unsubs = [];

                if (activeTab === 'stores' || activeTab === 'settings') {
                    unsubs.push(
                        db.collection('stores').limit(dashLimits.stores).onSnapshot(
                            (snap) => {
                                setSyncHealthy(true);
                                setStores(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                            },
                            () => setSyncHealthy(false)
                        )
                    );
                }

                if (activeTab === 'stores') {
                    const prodQ = productStoreFilter && productStoreFilter !== 'all'
                        ? db.collection('store_products').where('storeId', '==', productStoreFilter).limit(dashLimits.storeProducts)
                        : db.collection('store_products').limit(dashLimits.storeProducts);
                    unsubs.push(
                        prodQ.onSnapshot((snap) => {
                            setStoreProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                        })
                    );

                    const orderQ = orderStoreFilter && orderStoreFilter !== 'all'
                        ? db.collection('store_orders').where('storeId', '==', orderStoreFilter).limit(dashLimits.storeOrders)
                        : db.collection('store_orders').limit(dashLimits.storeOrders);
                    unsubs.push(
                        orderQ.onSnapshot((snap) => {
                            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                            list.sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')));
                            setStoreOrders(list);
                        })
                    );
                }

                if (activeTab === 'contractors' || activeTab === 'settings') {
                    unsubs.push(
                        db.collection('admins').limit(dashLimits.admins).onSnapshot(
                            (snap) => {
                                setSyncHealthy(true);
                                setAdmins(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                            },
                            () => setSyncHealthy(false)
                        )
                    );
                }

                if (activeTab === 'contractors') {
                    unsubs.push(
                        db.collection('projects').limit(dashLimits.projects).onSnapshot((snap) => {
                            setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                        })
                    );
                }

                if (activeTab === 'workers' || activeTab === 'contractors' || activeTab === 'settings') {
                    unsubs.push(
                        db.collection('workers').limit(dashLimits.workers).onSnapshot(
                            (snap) => {
                                setSyncHealthy(true);
                                setWorkers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                            },
                            () => setSyncHealthy(false)
                        )
                    );
                }

                if (activeTab === 'announcements') {
                    unsubs.push(
                        db.collection('announcements').limit(dashLimits.announcements).onSnapshot((snap) => {
                            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                            list.sort((a, b) => {
                                if (Boolean(b.isPinned) !== Boolean(a.isPinned)) return b.isPinned ? 1 : -1;
                                return String(b.updatedAt || b.date || '').localeCompare(String(a.updatedAt || a.date || ''));
                            });
                            setAnnouncements(list);
                        })
                    );
                }

                return () => unsubs.forEach((u) => { try { u && u(); } catch (e) {} });
            }, [
                activeTab,
                productStoreFilter,
                orderStoreFilter,
                dashLimits.admins,
                dashLimits.workers,
                dashLimits.stores,
                dashLimits.storeProducts,
                dashLimits.storeOrders,
                dashLimits.projects,
                dashLimits.announcements
            ]);

            // =========================================================================
            // 1. CONTRACTORS HANDLERS
            // =========================================================================
            const handleQuickToggleContractorPro = async (adminObj, durationDays = 30, planLabel = 'شهري') => {
                if (!adminObj || !adminObj.id) return;
                setSavingId('admin_' + adminObj.id);
                try {
                    const currentlyPro = Boolean(adminObj.isPro || adminObj.isVerifiedPro);
                    const nextPro = durationDays > 0 ? (currentlyPro && durationDays === 30 ? false : true) : false;
                    const updates = {
                        isPro: nextPro,
                        isVerifiedPro: nextPro,
                        isVerifiedIdentity: true,
                        subscriptionPlanLabel: nextPro ? planLabel : '',
                        subscriptionPlanType: durationDays >= 360 ? 'yearly' : 'monthly',
                        subscriptionExpiresAt: nextPro ? addDaysIso(durationDays) : null,
                        updatedAt: new Date().toISOString()
                    };
                    await db.collection('admins').doc(adminObj.id).set(updates, { merge: true });
                    addToast(nextPro
                        ? `👑 تم تفعيل باقة المقاول المحترف (Pro - ${planLabel}) للمقاول "${adminObj.name || adminObj.id}" بنجاح ✓`
                        : `تم إيقاف باقة Pro للمقاول "${adminObj.name || adminObj.id}"`);
                } catch (err) {
                    addToast('⛔ تعذر تحديث المقاول: ' + (err.message || 'تحقق من قواعد Firestore'), 'error');
                } finally {
                    setSavingId('');
                }
            };

            const handleSaveContractorModal = async (e) => {
                e.preventDefault();
                if (!editingContractor) return;
                const f = e.target;
                const isNew = Boolean(editingContractor.isNew);
                const rawName = String(f.name.value || '').trim();
                const targetId = isNew ? rawName : editingContractor.id;
                if (!targetId) {
                    addToast('يرجى إدخال اسم المقاول', 'error');
                    return;
                }
                setSavingId('admin_modal_' + targetId);
                try {
                    const isProChecked = Boolean(f.isPro.checked);
                    const isIdentityChecked = Boolean(f.isVerifiedIdentity.checked);
                    const expDate = String(f.subscriptionExpiresAt.value || '').trim();
                    const planLabel = String(f.subscriptionPlanLabel.value || 'شهري').trim();
                    const newPwd = String(f.newPassword.value || '').trim();

                    if (isNew && newPwd.length < 4) {
                        addToast('يرجى إدخال كلمة مرور للمقاول الجديد (4 رموز على الأقل)', 'error');
                        setSavingId('');
                        return;
                    }

                    const credPatch = newPwd.length >= 4
                        ? AlOstaCrypto.buildProtectedCredentials(newPwd, targetId, !isNew)
                        : {};

                    const updates = {
                        name: rawName || targetId,
                        fullName: rawName || targetId,
                        phone: String(f.phone.value || '').trim(),
                        gov: String(f.gov?.value || editingContractor.gov || 'بغداد').trim(),
                        isPro: isProChecked,
                        isVerifiedPro: isProChecked,
                        isVerifiedIdentity: isIdentityChecked,
                        subscriptionPlanLabel: isProChecked ? planLabel : '',
                        subscriptionPlanType: planLabel.includes('سنو') ? 'yearly' : 'monthly',
                        subscriptionExpiresAt: expDate ? expDate : null,
                        updatedAt: new Date().toISOString(),
                        ...credPatch
                    };
                    if (isNew) updates.createdAt = new Date().toISOString();

                    await db.collection('admins').doc(targetId).set(updates, { merge: true });
                    setEditingContractor(null);
                    addToast(isNew
                        ? `✓ تم إنشاء حساب المقاول "${updates.name}" بنجاح!`
                        : `✓ تم حفظ وتحديث بيانات المقاول "${updates.name}" في السحابة بنجاح!`);
                } catch (err) {
                    addToast('⛔ فشل حفظ المقاول: ' + (err.message || 'تحقق من الاتصال'), 'error');
                } finally {
                    setSavingId('');
                }
            };

            const handleDeleteContractor = async (adminObj) => {
                if (!adminObj?.id) return;
                if (!window.confirm(`⚠️ هل أنت متأكد من حذف حساب المقاول "${adminObj.name || adminObj.id}" نهائياً من السحابة؟`)) return;
                setSavingId('admin_' + adminObj.id);
                try {
                    await db.collection('admins').doc(adminObj.id).delete();
                    setEditingContractor(null);
                    addToast(`🗑️ تم حذف حساب المقاول "${adminObj.name || adminObj.id}"`);
                } catch (err) {
                    addToast('⛔ تعذر حذف المقاول: ' + (err.message || ''), 'error');
                } finally {
                    setSavingId('');
                }
            };

            // =========================================================================
            // 2. WORKERS HANDLERS
            // =========================================================================
            const handleQuickToggleWorkerPro = async (workerObj, durationDays = 30) => {
                if (!workerObj || !workerObj.id) return;
                setSavingId('worker_' + workerObj.id);
                try {
                    const currentlyPro = Boolean(workerObj.isVerifiedPro);
                    const nextPro = !currentlyPro;
                    const updates = {
                        isVerifiedPro: nextPro,
                        isVerifiedIdentity: true,
                        subscriptionExpiresAt: nextPro ? addDaysIso(durationDays) : null,
                        updatedAt: new Date().toISOString()
                    };
                    await db.collection('workers').doc(workerObj.id).set(updates, { merge: true });
                    addToast(nextPro
                        ? `🌟 تم توثيق العامل "${workerObj.name}" كحرفي معتمد (Pro) لمدة ${durationDays} يوم ✓`
                        : `تم إلغاء شارة التوثيق Pro للعامل "${workerObj.name}"`);
                } catch (err) {
                    addToast('⛔ تعذر تحديث العامل: ' + (err.message || 'تحقق من قواعد Firestore'), 'error');
                } finally {
                    setSavingId('');
                }
            };

            const handleSaveWorkerModal = async (e) => {
                e.preventDefault();
                if (!editingWorker) return;
                const f = e.target;
                const isNew = Boolean(editingWorker.isNew);
                const rawName = String(f.name.value || '').trim();
                if (!rawName) {
                    addToast('يرجى إدخال اسم العامل / الحرفي', 'error');
                    return;
                }
                const targetId = isNew ? ('w_' + Date.now()) : editingWorker.id;
                setSavingId('worker_modal_' + targetId);
                try {
                    const rawWage = Number(f.wage.value) || 0;
                    const normalizedWage = rawWage > 0 && rawWage < 1000 ? rawWage * 1000 : rawWage;
                    const rawMarketWage = Number(f.marketWage.value) || normalizedWage;
                    const normalizedMarketWage = rawMarketWage > 0 && rawMarketWage < 1000 ? rawMarketWage * 1000 : rawMarketWage;
                    const ratingVal = Math.min(6, Math.max(0, Number(f.ratingScore.value) || 0));
                    const isProChecked = Boolean(f.isVerifiedPro.checked);
                    const isAvailChecked = Boolean(f.isAvailable.checked);
                    const expDate = String(f.subscriptionExpiresAt.value || '').trim();
                    const newPwd = String(f.newPassword.value || '').trim();
                    const cleanPhone = String(f.phone.value || '').trim();
                    const loginCode = String(f.loginCode?.value || editingWorker.loginCode || generateWorkerLoginCode()).trim().toUpperCase();

                    const credPatch = newPwd.length >= 4
                        ? AlOstaCrypto.buildProtectedCredentials(newPwd, cleanPhone || targetId, !isNew)
                        : {};

                    const updates = {
                        name: rawName,
                        phone: cleanPhone,
                        loginCode,
                        specialty: String(f.specialty.value || 'عامل عادي').trim(),
                        gov: String(f.gov.value || 'بغداد').trim(),
                        adminId: String(f.adminId?.value || editingWorker.adminId || '').trim(),
                        wage: Math.max(0, normalizedWage),
                        contractorWage: Math.max(0, normalizedWage),
                        marketWage: Math.max(0, normalizedMarketWage),
                        ratingScore: Number(ratingVal.toFixed(1)),
                        isVerifiedPro: isProChecked,
                        isVerifiedIdentity: true,
                        isAvailable: isAvailChecked,
                        isRegistered: true,
                        subscriptionExpiresAt: expDate ? expDate : null,
                        updatedAt: new Date().toISOString(),
                        ...credPatch
                    };
                    if (isNew) updates.createdAt = new Date().toISOString();

                    await db.collection('workers').doc(targetId).set(updates, { merge: true });
                    setEditingWorker(null);
                    addToast(isNew
                        ? `✓ تمت إضافة الحرفي "${updates.name}" بنجاح (الكود: ${loginCode})!`
                        : `✓ تم حفظ وتحديث بيانات الحرفي "${updates.name}" في السحابة بنجاح!`);
                } catch (err) {
                    addToast('⛔ فشل حفظ العامل: ' + (err.message || 'تحقق من الاتصال'), 'error');
                } finally {
                    setSavingId('');
                }
            };

            const handleDeleteWorker = async (workerObj) => {
                if (!workerObj?.id) return;
                if (!window.confirm(`⚠️ هل أنت متأكد من حذف حساب العامل "${workerObj.name}" نهائياً؟`)) return;
                setSavingId('worker_' + workerObj.id);
                try {
                    await db.collection('workers').doc(workerObj.id).delete();
                    setEditingWorker(null);
                    addToast(`🗑️ تم حذف العامل "${workerObj.name}"`);
                } catch (err) {
                    addToast('⛔ تعذر حذف العامل: ' + (err.message || ''), 'error');
                } finally {
                    setSavingId('');
                }
            };

            // =========================================================================
            // 3. STORES, PRODUCTS & ORDERS HANDLERS
            // =========================================================================
            const handleQuickToggleStoreVip = async (storeObj, durationDays = 30) => {
                if (!storeObj || !storeObj.id) return;
                setSavingId('store_' + storeObj.id);
                try {
                    const nextVip = storeObj.isVipStore === false;
                    await db.collection('stores').doc(storeObj.id).set({
                        isVipStore: nextVip,
                        subscriptionPlanLabel: nextVip ? (durationDays >= 360 ? 'سنوي' : 'شهري') : '',
                        subscriptionExpiresAt: nextVip ? addDaysIso(durationDays) : null,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                    addToast(nextVip
                        ? `💎 تم تفعيل باقة المعرض المعتمد VIP لـ "${storeObj.name}" ✓`
                        : `تم تحويل معرض "${storeObj.name}" إلى الباقة التجريبية`);
                } catch (err) {
                    addToast('⛔ تعذر تحديث المعرض: ' + (err.message || ''), 'error');
                } finally {
                    setSavingId('');
                }
            };

            const handleDeleteStore = async (storeObj) => {
                if (!storeObj?.id) return;
                if (!window.confirm(`⚠️ هل أنت متأكد من حذف معرض "${storeObj.name}" نهائياً؟`)) return;
                setSavingId('store_' + storeObj.id);
                try {
                    await db.collection('stores').doc(storeObj.id).delete();
                    setEditingStore(null);
                    addToast(`🗑️ تم حذف معرض "${storeObj.name}"`);
                } catch (err) {
                    addToast('⛔ تعذر حذف المعرض: ' + (err.message || ''), 'error');
                } finally {
                    setSavingId('');
                }
            };

            const handleDeleteStoreProduct = async (prod) => {
                if (!prod?.id) return;
                if (!window.confirm(`هل أنت متأكد من حذف المنتج "${prod.name}" نهائياً؟`)) return;
                try {
                    await db.collection('store_products').doc(prod.id).delete();
                    addToast(`🗑️ تم حذف المنتج "${prod.name}"`);
                } catch (err) {
                    addToast('⛔ تعذر حذف المنتج: ' + (err.message || ''), 'error');
                }
            };

            const handleUpdateOrderStatus = async (ord, nextStatus) => {
                if (!ord?.id) return;
                try {
                    await db.collection('store_orders').doc(ord.id).set({
                        status: nextStatus,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                    addToast(`✓ تم تحديث حالة الطلبية بنجاح`);
                } catch (err) {
                    addToast('⛔ تعذر تحديث حالة الطلبية', 'error');
                }
            };

            const handleDeleteOrder = async (ord) => {
                if (!ord?.id) return;
                if (!window.confirm('هل تريد حذف هذه الطلبية من السجل؟')) return;
                try {
                    await db.collection('store_orders').doc(ord.id).delete();
                    addToast('🗑️ تم حذف الطلبية');
                } catch (err) {
                    addToast('⛔ تعذر حذف الطلبية', 'error');
                }
            };

            // =========================================================================
            // 4. SYSTEM ANNOUNCEMENTS HANDLERS
            // =========================================================================
            const openNewAnnouncementModal = () => {
                setAnnImgPreview('');
                setEditingAnnouncement({
                    isNew: true,
                    title: '',
                    content: '',
                    adType: 'info',
                    target: 'all',
                    maxViews: 1,
                    expiresAt: '',
                    imageUrl: '',
                    linkUrl: '',
                    buttonLabel: 'فتح الرابط المرفق',
                    isPinned: false,
                    isActive: true,
                    broadcastId: 1
                });
            };

            const openEditAnnouncementModal = (ann) => {
                setAnnImgPreview(ann.imageUrl || '');
                setEditingAnnouncement({ ...ann, isNew: false });
            };

            const handleAnnouncementImageUpload = async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                    const dataUrl = await compressImageFileToDataUrl(file, 720, 0.78);
                    setAnnImgPreview(dataUrl);
                } catch (err) {
                    addToast('تعذر قراءة صورة الإعلان: ' + err.message, 'error');
                }
            };

            const handleSaveAnnouncementModal = async (e) => {
                e.preventDefault();
                if (!editingAnnouncement) return;
                const f = e.target;
                const isNew = Boolean(editingAnnouncement.isNew);
                const title = String(f.title.value || '').trim();
                const content = String(f.content.value || '').trim();
                if (!title && !content && !annImgPreview) {
                    addToast('يرجى كتابة عنوان أو نص الإعلان أو إرفاق صورة', 'error');
                    return;
                }
                const targetId = isNew ? ('ann_' + Date.now()) : editingAnnouncement.id;
                setSavingId('ann_modal_' + targetId);
                try {
                    const payload = {
                        title: title || 'إعلان من إدارة منصة الأسطة',
                        content,
                        adType: String(f.adType.value || 'info').trim(),
                        target: String(f.target.value || 'all').trim(),
                        maxViews: Math.max(1, Math.min(99, Number(f.maxViews.value) || 1)),
                        expiresAt: String(f.expiresAt.value || '').trim(),
                        imageUrl: annImgPreview || String(f.imageUrl?.value || '').trim(),
                        linkUrl: String(f.linkUrl.value || '').trim(),
                        buttonLabel: String(f.buttonLabel.value || 'فتح الرابط المرفق').trim(),
                        isPinned: Boolean(f.isPinned.checked),
                        isActive: Boolean(f.isActive.checked),
                        broadcastId: Number(editingAnnouncement.broadcastId || 1),
                        date: todayStr(),
                        updatedAt: new Date().toISOString()
                    };
                    if (isNew) payload.createdAt = new Date().toISOString();

                    await db.collection('announcements').doc(targetId).set(payload, { merge: true });
                    setEditingAnnouncement(null);
                    setAnnImgPreview('');
                    addToast(isNew
                        ? `📢 تم نشر إعلان النظام "${payload.title}" فوراً لجميع المستخدمين!`
                        : `✓ تم تحديث الإعلان "${payload.title}" بنجاح!`);
                } catch (err) {
                    addToast('⛔ تعذر حفظ الإعلان: ' + (err.message || ''), 'error');
                } finally {
                    setSavingId('');
                }
            };

            const handleRebroadcastAnnouncement = async (ann) => {
                if (!ann?.id) return;
                setSavingId('ann_rebroadcast_' + ann.id);
                try {
                    const nextBId = (Number(ann.broadcastId) || 1) + 1;
                    await db.collection('announcements').doc(ann.id).set({
                        broadcastId: nextBId,
                        isActive: true,
                        date: todayStr(),
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                    addToast(`🔄 تمت إعادة بث الإعلان "${ann.title}" (دفعة #${nextBId}) ليظهر مجدداً للجميع ✓`);
                } catch (err) {
                    addToast('⛔ تعذر إعادة البث: ' + (err.message || ''), 'error');
                } finally {
                    setSavingId('');
                }
            };

            const handleToggleAnnouncementActive = async (ann) => {
                if (!ann?.id) return;
                try {
                    const nextActive = ann.isActive === false;
                    await db.collection('announcements').doc(ann.id).set({
                        isActive: nextActive,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                    addToast(nextActive ? `🟢 تم تفعيل الإعلان "${ann.title}"` : `⏸️ تم إيقاف الإعلان "${ann.title}"`);
                } catch (err) {
                    addToast('⛔ تعذر تحديث حالة الإعلان', 'error');
                }
            };

            const handleToggleAnnouncementPinned = async (ann) => {
                if (!ann?.id) return;
                try {
                    const nextPin = !ann.isPinned;
                    await db.collection('announcements').doc(ann.id).set({
                        isPinned: nextPin,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                    addToast(nextPin ? `📌 تم تثبيت الإعلان في المقدمة` : `تم إلغاء تثبيت الإعلان`);
                } catch (err) {
                    addToast('⛔ تعذر تثبيت الإعلان', 'error');
                }
            };

            const handleDeleteAnnouncement = async (ann) => {
                if (!ann?.id) return;
                if (!window.confirm(`هل أنت متأكد من حذف الإعلان "${ann.title}" نهائياً؟`)) return;
                try {
                    await db.collection('announcements').doc(ann.id).delete();
                    setEditingAnnouncement(null);
                    addToast(`🗑️ تم حذف الإعلان "${ann.title}"`);
                } catch (err) {
                    addToast('⛔ تعذر حذف الإعلان', 'error');
                }
            };

            // =========================================================================
            // 5. SETTINGS & OTA UPDATES HANDLER
            // =========================================================================
            const handleReloadCloudConfig = async () => {
                setSavingId('app_config');
                setConfigSaveError('');
                try {
                    const docSnap = await db.collection('settings').doc('app_config').get();
                    if (docSnap && docSnap.exists) {
                        const data = docSnap.data() || {};
                        const syncedUrl = String(data.apkUrl || data.rawApkUrl || '').trim();
                        const normalized = {
                            ...data,
                            latestVersion: String(data.latestVersion || APP_VERSION).trim(),
                            apkUrl: syncedUrl,
                            rawApkUrl: syncedUrl
                        };
                        appConfigDirtyRef.current = false;
                        setIsConfigDirty(false);
                        setCloudAppConfig(normalized);
                        setAppConfig((prev) => ({ ...prev, ...normalized }));
                        addToast(`🔄 تم جلب آخر إعدادات السحابة (v${normalized.latestVersion}) بنجاح`);
                    } else {
                        addToast('لا توجد إعدادات محفوظة بعد في السحابة', 'error');
                    }
                } catch (err) {
                    const msg = err && err.message ? err.message : 'تعذر الاتصال بالسحابة';
                    setConfigSaveError(msg);
                    addToast('⛔ تعذر قراءة الإعدادات من السحابة: ' + msg, 'error');
                } finally {
                    setSavingId('');
                }
            };

            const handleSaveAppConfig = async (e, pushMode = 'save') => {
                if (e && e.preventDefault) e.preventDefault();
                const cleanVersion = String(appConfig.latestVersion ?? '').trim();
                const rawApkInput = String(appConfig.apkUrl ?? '').trim();
                const cleanApkUrl = normalizeDashboardApkUrl(rawApkInput);
                const cleanPortalUrl = String(appConfig.portalBaseUrl ?? '').trim() || 'https://waadpc90-ctrl.github.io/alosta-app/';

                if (!cleanVersion) {
                    setConfigSaveError('يرجى كتابة رقم الإصدار (مثال: 1.0.26) قبل الحفظ.');
                    addToast('⚠️ يرجى كتابة رقم الإصدار قبل الحفظ', 'error');
                    return;
                }
                if (pushMode === 'push' && !cleanApkUrl) {
                    setConfigSaveError('يرجى إدخال رابط ملف التحديث المباشر (APK URL) قبل إرسال إشعار التحديث.');
                    addToast('⚠️ يرجى إدخال رابط ملف التحديث (APK URL) أولاً', 'error');
                    return;
                }
                if (cleanApkUrl && !/^https?:\/\/[^/\s]+/i.test(cleanApkUrl)) {
                    setConfigSaveError('⛔ رابط التحديث غير صالح — يجب أن يبدأ بـ https://');
                    addToast('⛔ رابط التحديث غير صالح', 'error');
                    return;
                }

                setSavingId('app_config');
                setConfigSaveError('');
                try {
                    // Pre-push live link check so a broken 404/private link is never pushed to user phones
                    if (pushMode === 'push' && cleanApkUrl) {
                        const alreadyOk = linkCheckState && linkCheckState.state === 'ok' && linkCheckState.url === cleanApkUrl;
                        const checkRes = alreadyOk ? linkCheckState : await verifyApkLinkNow(cleanApkUrl);
                        if (checkRes && checkRes.state === 'error') {
                            setConfigSaveError('⛔ تم إيقاف إرسال التحديث لجميع الأجهزة لأن الرابط لا يعمل: ' + checkRes.message);
                            addToast('⛔ تم إيقاف الإرسال — رابط التحديث يعطي خطأ (تحقق من الرابط أولاً)', 'error');
                            setSavingId('');
                            return;
                        }
                    }

                    const payload = {
                        latestVersion: cleanVersion,
                        apkUrl: cleanApkUrl,
                        rawApkUrl: rawApkInput || cleanApkUrl,
                        portalBaseUrl: cleanPortalUrl,
                        forceUpdate: pushMode === 'stop' ? false : Boolean(appConfig.forceUpdate),
                        stopUpdate: pushMode === 'stop' ? true : (pushMode === 'push' ? false : Boolean(appConfig.stopUpdate)),
                        maintenanceMode: Boolean(appConfig.maintenanceMode),
                        monetizationEnabled: Boolean(appConfig.monetizationEnabled),
                        autoEnableOnTarget: Boolean(appConfig.autoEnableOnTarget),
                        targetContractorsCount: Math.max(1, Number(appConfig.targetContractorsCount) || 500),
                        targetWorkersCount: Math.max(1, Number(appConfig.targetWorkersCount) || 2000),
                        targetStoresCount: Math.max(1, Number(appConfig.targetStoresCount) || 15),
                        freeMaxProjects: Math.max(1, Number(appConfig.freeMaxProjects) || 2),
                        freeMaxWorkers: Math.max(1, Number(appConfig.freeMaxWorkers) || 5),
                        freeStoreMaxProducts: Math.max(1, Number(appConfig.freeStoreMaxProducts) || 10),
                        proContractorPrice: Math.max(0, Number(appConfig.proContractorPrice) || 25000),
                        proContractorAnnualPrice: Math.max(0, Number(appConfig.proContractorAnnualPrice) || 250000),
                        proStorePrice: Math.max(0, Number(appConfig.proStorePrice) || 75000),
                        proStoreAnnualPrice: Math.max(0, Number(appConfig.proStoreAnnualPrice) || 750000),
                        verifiedWorkerPrice: Math.max(0, Number(appConfig.verifiedWorkerPrice) || 5000),
                        verifiedWorkerAnnualPrice: Math.max(0, Number(appConfig.verifiedWorkerAnnualPrice) || 50000),
                        subscriptionWhatsapp: String(appConfig.subscriptionWhatsapp || '').trim(),
                        updatedAt: new Date().toISOString()
                    };

                    if (pushMode === 'push') {
                        payload.pushUpdateToken = String(Date.now());
                        payload.pushTargetVersion = cleanVersion;
                        payload.stopUpdate = false;
                    } else if (pushMode === 'stop') {
                        payload.stopUpdate = true;
                        payload.forceUpdate = false;
                    }

                    const cfgRef = db.collection('settings').doc('app_config');
                    await cfgRef.set(payload, { merge: true });

                    // Mandatory server read-back confirmation to prove the exact new URL & version were saved
                    let confirmedData = payload;
                    try {
                        const serverSnap = await cfgRef.get({ source: 'server' }).catch(() => cfgRef.get());
                        if (serverSnap && serverSnap.exists) {
                            const sData = serverSnap.data() || {};
                            const savedUrl = String(sData.apkUrl || sData.rawApkUrl || '').trim();
                            const savedVer = String(sData.latestVersion || '').trim();
                            if (savedVer !== cleanVersion || savedUrl !== cleanApkUrl) {
                                throw new Error('لم يطابق السجل المحفوظ في السحابة القيم الجديدة — تحقق من الاتصال وصلاحيات Firestore.');
                            }
                            confirmedData = {
                                ...payload,
                                ...sData,
                                latestVersion: savedVer,
                                apkUrl: savedUrl,
                                rawApkUrl: savedUrl,
                                verifiedFromCloud: true
                            };
                        }
                    } catch (verifyErr) {
                        if (verifyErr && verifyErr.message && verifyErr.message.includes('لم يطابق')) {
                            throw verifyErr;
                        }
                    }

                    appConfigDirtyRef.current = false;
                    setIsConfigDirty(false);
                    setAppConfig((prev) => ({ ...prev, ...confirmedData }));
                    setCloudAppConfig((prev) => ({ ...(prev || {}), ...confirmedData }));

                    if (pushMode === 'push') {
                        addToast(`🚀 تم التحقق والحفظ في السحابة (v${confirmedData.latestVersion}) وإرسال إشعار التحديث لجميع الأجهزة ✓`);
                    } else if (pushMode === 'stop') {
                        addToast(`⏹️ تم إيقاف إشعار التحديث الفوري وحفظ الإعدادات (v${confirmedData.latestVersion}) بنجاح.`);
                    } else {
                        addToast(`✓ تم حفظ وتأكيد رقم الإصدار (v${confirmedData.latestVersion}) ورابط التحديث في السحابة بنجاح!`);
                    }
                } catch (err) {
                    const msg = (err && err.message) ? err.message : 'تحقق من اتصال الإنترنت وقواعد Firestore';
                    setConfigSaveError('⛔ فشل الحفظ في السحابة: ' + msg);
                    addToast('⛔ تعذر حفظ الإعدادات: ' + msg, 'error');
                } finally {
                    setSavingId('');
                }
            };

            if (portalUrlKey) {
                return (
                    <StoreOwnerPortal
                        storeKeyInput={portalUrlKey}
                        initialSectionId={portalInitialSection}
                        onExit={() => {
                            setPortalUrlKey('');
                            setPortalInitialSection('all');
                        }}
                        addToast={addToast}
                    />
                );
            }

            // Filters
            const qNorm = searchQ.trim().toLowerCase();

            const filteredAdmins = admins.filter((a) => {
                const isPro = Boolean(a.isPro || a.isVerifiedPro);
                if (contractorFilter === 'pro' && !isPro) return false;
                if (contractorFilter === 'free' && isPro) return false;
                if (!qNorm) return true;
                return (
                    String(a.name || a.fullName || a.id || '').toLowerCase().includes(qNorm) ||
                    String(a.phone || '').includes(qNorm) ||
                    String(a.gov || '').toLowerCase().includes(qNorm)
                );
            });

            const filteredWorkers = workers.filter((w) => {
                if (workerFilter === 'pro' && !w.isVerifiedPro) return false;
                if (selectedGovFilter !== 'الكل' && (w.gov || 'بغداد') !== selectedGovFilter) return false;
                if (!qNorm) return true;
                return (
                    String(w.name || '').toLowerCase().includes(qNorm) ||
                    String(w.phone || '').includes(qNorm) ||
                    String(w.specialty || '').toLowerCase().includes(qNorm) ||
                    String(w.gov || '').toLowerCase().includes(qNorm) ||
                    String(w.loginCode || '').toLowerCase().includes(qNorm) ||
                    String(w.adminId || '').toLowerCase().includes(qNorm)
                );
            });

            const filteredStores = stores.filter((s) => {
                if (storeTypeFilter !== 'all' && (s.storeType || 'paint') !== storeTypeFilter) return false;
                if (!qNorm) return true;
                return (
                    String(s.name || '').toLowerCase().includes(qNorm) ||
                    String(s.phone || '').includes(qNorm) ||
                    String(s.gov || '').toLowerCase().includes(qNorm) ||
                    String(s.agencyBrandLabel || '').toLowerCase().includes(qNorm) ||
                    String(s.address || '').toLowerCase().includes(qNorm) ||
                    String(getStorePortalCode(s)).toLowerCase().includes(qNorm)
                );
            });

            const filteredProducts = storeProducts.filter((p) => {
                if (productStoreFilter !== 'all' && p.storeId !== productStoreFilter) return false;
                if (productCategoryFilter !== 'all' && p.category !== productCategoryFilter) return false;
                if (productStockFilter === 'in_stock' && p.inStock === false) return false;
                if (productStockFilter === 'out_of_stock' && p.inStock !== false) return false;
                if (!qNorm) return true;
                return (
                    String(p.name || '').toLowerCase().includes(qNorm) ||
                    String(p.brand || '').toLowerCase().includes(qNorm) ||
                    String(p.categoryLabel || '').toLowerCase().includes(qNorm) ||
                    String(p.storeName || '').toLowerCase().includes(qNorm)
                );
            });

            const filteredOrders = storeOrders.filter((ord) => {
                if (orderStoreFilter !== 'all' && ord.storeId !== orderStoreFilter) return false;
                if (orderStatusFilter !== 'all' && (ord.status || 'pending') !== orderStatusFilter) return false;
                if (!qNorm) return true;
                return (
                    String(ord.storeName || '').toLowerCase().includes(qNorm) ||
                    String(ord.contractorName || ord.adminId || '').toLowerCase().includes(qNorm) ||
                    String(ord.projectName || '').toLowerCase().includes(qNorm)
                );
            });

            const filteredAnnouncements = announcements.filter((a) =>
                !qNorm ||
                String(a.title || '').toLowerCase().includes(qNorm) ||
                String(a.content || '').toLowerCase().includes(qNorm)
            );

            const activeAnnouncementsCount = announcements.filter((a) => a.isActive !== false).length;

            return (
                <div className="min-h-screen bg-slate-950 text-slate-100 pb-24" dir="rtl">
                    {/* Toast Notifications */}
                    <div className="fixed top-4 left-4 right-4 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
                        {toasts.map((t) => (
                            <div
                                key={t.id}
                                className={`px-4 py-3 rounded-2xl shadow-2xl border text-xs font-black max-w-md w-full text-center pointer-events-auto ${
                                    t.type === 'error'
                                        ? 'bg-rose-950/95 border-rose-500/60 text-rose-200'
                                        : 'bg-emerald-950/95 border-emerald-500/60 text-emerald-200'
                                }`}
                            >
                                {t.msg}
                            </div>
                        ))}
                    </div>

                    {/* Top Header */}
                    <header className="bg-slate-900/95 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md">
                        <div className="max-w-5xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 flex items-center justify-center text-xl shadow-lg">
                                    👑
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h1 className="font-black text-base sm:text-lg text-white">لوحة تحكم الأسطة المركزية</h1>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                            v{APP_VERSION}
                                        </span>
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-400">
                                        المعارض والوكالات • المقاولون • العمال • إعلانات النظام • التحديثات والاشتراكات
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`px-3 py-1.5 rounded-xl text-[11px] font-black border ${
                                    syncHealthy
                                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                                        : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                                }`}>
                                    {syncHealthy ? '● متصل بالسحابة' : '⚠️ تحقق من Firestore'}
                                </span>
                                <button
                                    onClick={() => setPortalUrlKey('prompt')}
                                    className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-black text-xs border border-amber-500/30"
                                >
                                    🏪 دخول بوابة معرض
                                </button>
                                <a
                                    href="./index.html"
                                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs border border-slate-700"
                                >
                                    فتح التطبيق
                                </a>
                            </div>
                        </div>
                    </header>

                    {/* Main Container */}
                    <div className="max-w-5xl mx-auto px-4 pt-4">
                        {/* 5 Navigation KPI Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-4">
                            <button
                                onClick={() => setActiveTab('stores')}
                                className={`p-3.5 rounded-2xl border text-right transition-all ${
                                    activeTab === 'stores'
                                        ? 'bg-amber-950/80 border-amber-500 shadow-lg'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                }`}
                            >
                                <div className="text-[11px] font-bold text-slate-400">🏪 المعارض والمحلات</div>
                                <div className="text-2xl font-black text-white mt-0.5">{cloudCounts.stores !== null ? cloudCounts.stores : stores.length}</div>
                                <div className="text-[10px] font-black text-amber-300 mt-1">
                                    📦 منتجات: {cloudCounts.storeProducts !== null ? cloudCounts.storeProducts : storeProducts.length} • 🧾 طلبات: {cloudCounts.storeOrders !== null ? cloudCounts.storeOrders : storeOrders.length}
                                </div>
                            </button>

                            <button
                                onClick={() => setActiveTab('contractors')}
                                className={`p-3.5 rounded-2xl border text-right transition-all ${
                                    activeTab === 'contractors'
                                        ? 'bg-indigo-950/80 border-indigo-500 shadow-lg'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                }`}
                            >
                                <div className="text-[11px] font-bold text-slate-400">👷 المقاولون</div>
                                <div className="text-2xl font-black text-white mt-0.5">{cloudCounts.admins !== null ? cloudCounts.admins : admins.length}</div>
                                <div className="text-[10px] font-black text-amber-400 mt-1">
                                    👑 Pro: {admins.filter((a) => a.isPro || a.isVerifiedPro).length} • مشاريع: {cloudCounts.projects !== null ? cloudCounts.projects : projects.length}
                                </div>
                            </button>

                            <button
                                onClick={() => setActiveTab('workers')}
                                className={`p-3.5 rounded-2xl border text-right transition-all ${
                                    activeTab === 'workers'
                                        ? 'bg-emerald-950/80 border-emerald-500 shadow-lg'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                }`}
                            >
                                <div className="text-[11px] font-bold text-slate-400">🛠️ العمال والحرفيون</div>
                                <div className="text-2xl font-black text-white mt-0.5">{cloudCounts.workers !== null ? cloudCounts.workers : workers.length}</div>
                                <div className="text-[10px] font-black text-emerald-400 mt-1">
                                    🌟 موثقون Pro: {workers.filter((w) => w.isVerifiedPro).length}
                                </div>
                            </button>

                            <button
                                onClick={() => setActiveTab('announcements')}
                                className={`p-3.5 rounded-2xl border text-right transition-all ${
                                    activeTab === 'announcements'
                                        ? 'bg-rose-950/80 border-rose-500 shadow-lg'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                }`}
                            >
                                <div className="text-[11px] font-bold text-slate-400">📢 إعلانات النظام</div>
                                <div className="text-2xl font-black text-white mt-0.5">{cloudCounts.announcements !== null ? cloudCounts.announcements : announcements.length}</div>
                                <div className="text-[10px] font-black text-rose-300 mt-1">
                                    🟢 نشط حالياً: {activeAnnouncementsCount}
                                </div>
                            </button>

                            <button
                                onClick={() => setActiveTab('settings')}
                                className={`p-3.5 rounded-2xl border text-right transition-all col-span-2 md:col-span-1 ${
                                    activeTab === 'settings'
                                        ? 'bg-fuchsia-950/80 border-fuchsia-500 shadow-lg'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                }`}
                            >
                                <div className="text-[11px] font-bold text-slate-400">⚙️ الإعدادات والتحديث</div>
                                <div className="text-sm font-black text-white mt-1">
                                    {appConfig.monetizationEnabled ? '🟢 الاشتراكات مفعلة' : '⚪ الوضع المجاني'}
                                </div>
                                <div className="text-[10px] font-black text-fuchsia-300 mt-1">
                                    الإصدار: v{appConfig.latestVersion || APP_VERSION}
                                </div>
                            </button>
                        </div>

                        {/* Search & Action Toolbar */}
                        {activeTab !== 'settings' && (
                            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-3.5 mb-4 space-y-3">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <input
                                        type="search"
                                        value={searchQ}
                                        onChange={(e) => setSearchQ(e.target.value)}
                                        placeholder={
                                            activeTab === 'stores'
                                                ? '🔍 ابحث عن محل أو معرض أو وكالة بالاسم، الكود، المحافظة، الماركة، أو المنتج...'
                                                : activeTab === 'contractors'
                                                ? '🔍 ابحث عن مقاول بالاسم أو رقم الهاتف أو المحافظة...'
                                                : activeTab === 'workers'
                                                ? '🔍 ابحث عن عامل بالاسم، الهاتف، المهنة، المحافظة، أو كود الدخول...'
                                                : '🔍 ابحث في إعلانات النظام...'
                                        }
                                        className="flex-1 min-w-[200px] p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs sm:text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                                    />

                                    {activeTab === 'stores' && (
                                        <button
                                            onClick={() => setEditingStore({ isNew: true })}
                                            className="px-4 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-lg"
                                        >
                                            + إضافة محل / معرض / وكالة جديدة
                                        </button>
                                    )}

                                    {activeTab === 'contractors' && (
                                        <button
                                            onClick={() => setEditingContractor({ isNew: true, name: '', phone: '', gov: 'بغداد', isPro: false, isVerifiedIdentity: true, subscriptionPlanLabel: 'شهري', subscriptionExpiresAt: '' })}
                                            className="px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg"
                                        >
                                            + إضافة مقاول جديد
                                        </button>
                                    )}

                                    {activeTab === 'workers' && (
                                        <button
                                            onClick={() => setEditingWorker({ isNew: true, name: '', phone: '', specialty: 'صباغ', gov: 'بغداد', wage: 40000, marketWage: 40000, ratingScore: 4.5, loginCode: generateWorkerLoginCode(), isVerifiedPro: false, isAvailable: true })}
                                            className="px-4 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg"
                                        >
                                            + إضافة عامل / حرفي جديد
                                        </button>
                                    )}

                                    {activeTab === 'announcements' && (
                                        <button
                                            onClick={openNewAnnouncementModal}
                                            className="px-4 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg"
                                        >
                                            + إعلان نظام جديد
                                        </button>
                                    )}
                                </div>

                                {/* Sub-tabs for STORES (Showrooms List | All Products | Live Orders) */}
                                {activeTab === 'stores' && (
                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {[
                                                { id: 'list', label: `🏪 المعارض والوكالات (${stores.length})` },
                                                { id: 'products', label: `📦 كل المنتجات (${storeProducts.length})` },
                                                { id: 'orders', label: `🧾 طلبيات المعارض (${storeOrders.length})` }
                                            ].map((st) => (
                                                <button
                                                    key={st.id}
                                                    onClick={() => setStoresSubTab(st.id)}
                                                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                                        storesSubTab === st.id
                                                            ? 'bg-amber-400 text-slate-950'
                                                            : 'bg-slate-950 text-slate-400 border border-slate-800'
                                                    }`}
                                                >
                                                    {st.label}
                                                </button>
                                            ))}
                                        </div>

                                        {storesSubTab === 'list' && (
                                            <select
                                                value={storeTypeFilter}
                                                onChange={(e) => setStoreTypeFilter(e.target.value)}
                                                className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300"
                                            >
                                                <option value="all">كل أنواع المعارض</option>
                                                {STORE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.shortAr}</option>)}
                                            </select>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'contractors' && (
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        {[
                                            { id: 'all', label: `الكل (${admins.length})` },
                                            { id: 'pro', label: `👑 مشتركو Pro (${admins.filter((a) => a.isPro || a.isVerifiedPro).length})` },
                                            { id: 'free', label: `الباقة المجانية (${admins.filter((a) => !a.isPro && !a.isVerifiedPro).length})` }
                                        ].map((f) => (
                                            <button
                                                key={f.id}
                                                onClick={() => setContractorFilter(f.id)}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-black ${
                                                    contractorFilter === f.id
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                                                }`}
                                            >
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {activeTab === 'workers' && (
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <button
                                            onClick={() => setWorkerFilter('all')}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-black ${
                                                workerFilter === 'all' ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                                            }`}
                                        >
                                            الكل ({workers.length})
                                        </button>
                                        <button
                                            onClick={() => setWorkerFilter('pro')}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-black ${
                                                workerFilter === 'pro' ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                                            }`}
                                        >
                                            🌟 الحرفيون الموثقون Pro ({workers.filter((w) => w.isVerifiedPro).length})
                                        </button>
                                        <select
                                            value={selectedGovFilter}
                                            onChange={(e) => setSelectedGovFilter(e.target.value)}
                                            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300"
                                        >
                                            <option value="الكل">📍 كل المحافظات</option>
                                            {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </div>
                                )}

                                {/* High-Capacity Pagination & Aggregation Strip */}
                                {(() => {
                                    const activeMeta =
                                        activeTab === 'contractors'
                                            ? { key: 'admins', loaded: admins.length, limit: dashLimits.admins, total: cloudCounts.admins, label: 'مقاول' }
                                            : activeTab === 'workers'
                                            ? { key: 'workers', loaded: workers.length, limit: dashLimits.workers, total: cloudCounts.workers, label: 'عامل' }
                                            : activeTab === 'announcements'
                                            ? { key: 'announcements', loaded: announcements.length, limit: dashLimits.announcements, total: cloudCounts.announcements, label: 'إعلان' }
                                            : activeTab === 'stores' && storesSubTab === 'products'
                                            ? { key: 'storeProducts', loaded: storeProducts.length, limit: dashLimits.storeProducts, total: cloudCounts.storeProducts, label: 'منتج' }
                                            : activeTab === 'stores' && storesSubTab === 'orders'
                                            ? { key: 'storeOrders', loaded: storeOrders.length, limit: dashLimits.storeOrders, total: cloudCounts.storeOrders, label: 'طلب' }
                                            : { key: 'stores', loaded: stores.length, limit: dashLimits.stores, total: cloudCounts.stores, label: 'معرض' };
                                    const hasMore = activeMeta.loaded >= activeMeta.limit || (activeMeta.total !== null && activeMeta.total > activeMeta.loaded);
                                    return (
                                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[10.5px]">
                                            <span className="font-bold text-slate-400">
                                                ⚡ السعة الذكية: معروض <span className="text-white font-black">{activeMeta.loaded}</span>
                                                {activeMeta.total !== null ? ` من أصل ${activeMeta.total}` : ''} {activeMeta.label} (تحميل عند الطلب لتوفير 95% من القراءات)
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    disabled={countsRefreshing}
                                                    onClick={refreshCloudCounts}
                                                    className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-black hover:border-slate-700"
                                                >
                                                    {countsRefreshing ? 'جاري...' : '🔄 تحديث العدادات'}
                                                </button>
                                                {hasMore && (
                                                    <button
                                                        type="button"
                                                        onClick={() => loadMoreForCollection(activeMeta.key, 100)}
                                                        className="px-3 py-1 rounded-xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 font-black hover:bg-indigo-600/30"
                                                    >
                                                        + تحميل 100 سجل إضافي
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* ========================================================================= */}
                        {/* TAB: SHOWROOMS, SHOPS, AGENCIES, PRODUCTS & ORDERS                        */}
                        {/* ========================================================================= */}
                        {activeTab === 'stores' && storesSubTab === 'list' && (
                            <div className="space-y-3">
                                {filteredStores.length === 0 ? (
                                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center space-y-3">
                                        <div className="text-4xl">🏪</div>
                                        <div className="text-sm font-black text-slate-300">لا توجد محلات أو معارض مطابقة للبحث</div>
                                        <button
                                            onClick={() => setEditingStore({ isNew: true })}
                                            className="px-5 py-3 rounded-2xl bg-amber-400 text-slate-950 font-black text-xs"
                                        >
                                            + إضافة أول محل / معرض / وكالة
                                        </button>
                                    </div>
                                ) : (
                                    filteredStores.map((st) => {
                                        const isVip = st.isVipStore !== false;
                                        const isActive = st.isActive !== false;
                                        const portalCode = getStorePortalCode(st);
                                        const busy = savingId === 'store_' + st.id;
                                        const thisStoreProds = storeProducts.filter((p) => p.storeId === st.id);
                                        const prodCount = thisStoreProds.length;
                                        const accNum = getStoreAccountNumber(st);
                                        const payMethodObj = STORE_PAYMENT_METHODS.find((m) => m.id === st.paymentMethod) || STORE_PAYMENT_METHODS[0];
                                        const storeTypeObj = STORE_TYPES.find((t) => t.id === st.storeType) || STORE_TYPES[1];
                                        const agencyObj = PAINT_AGENCY_BRANDS.find((b) => b.id === st.agencyBrandKey);
                                        const storeSections = getStoreSectionsList(st);
                                        const hasGps = Boolean(st.location && (st.location.lat != null || st.location.url));

                                        return (
                                            <div
                                                key={st.id}
                                                className={`p-4 rounded-3xl border transition-all space-y-3 ${
                                                    !isActive
                                                        ? 'bg-slate-900/50 border-rose-900/40 opacity-75'
                                                        : isVip
                                                        ? 'bg-slate-900 border-amber-500/40'
                                                        : 'bg-slate-900 border-slate-800'
                                                }`}
                                            >
                                                {/* Row 1: Identity & Badges */}
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div className="space-y-1.5">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-black text-base text-white">{st.name}</span>
                                                            <button
                                                                onClick={() => copyToClipboard(portalCode, () => addToast(`📋 تم نسخ كود بوابة المعرض: ${portalCode}`))}
                                                                className="px-2.5 py-0.5 rounded-lg font-mono text-xs bg-slate-950 text-amber-300 border border-slate-800 hover:border-amber-400"
                                                            >
                                                                🔑 {portalCode}
                                                            </button>
                                                            {isVip ? (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400/20 text-amber-300 border border-amber-400/30">
                                                                    💎 VIP {st.subscriptionPlanLabel ? `(${st.subscriptionPlanLabel})` : ''}
                                                                </span>
                                                            ) : (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">
                                                                    تجريبي
                                                                </span>
                                                            )}
                                                            {agencyObj && (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40">
                                                                    🎯 وكالة {agencyObj.shortAr}
                                                                </span>
                                                            )}
                                                            {!isActive && (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300">
                                                                    ⏸️ متوقف
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="text-xs font-bold text-slate-300 flex flex-wrap items-center gap-3">
                                                            <span>{storeTypeObj.icon} {storeTypeObj.shortAr}</span>
                                                            <span>• 📞 {st.phone || 'بدون هاتف'}</span>
                                                            <span>• 📍 {st.gov || 'بغداد'} {st.address ? `(${st.address})` : ''}</span>
                                                            {hasGps && (
                                                                <a
                                                                    href={st.location.url || `https://maps.google.com/?q=${st.location.lat},${st.location.lng}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="text-sky-400 underline"
                                                                >
                                                                    🗺️ موقع GPS
                                                                </a>
                                                            )}
                                                        </div>

                                                        {st.notes && (
                                                            <p className="text-[11px] font-bold text-slate-400">{st.notes}</p>
                                                        )}
                                                    </div>

                                                    {/* Payment Status Badge */}
                                                    <div className="text-[11px] font-bold shrink-0">
                                                        {accNum ? (
                                                            <span className="inline-block px-2.5 py-1 rounded-xl bg-emerald-950/80 border border-emerald-500/30 text-emerald-300">
                                                                {payMethodObj.icon} <span className="font-mono">{accNum}</span> {st.paymentQrImage ? '• 🖼️ QR' : '• QR تلقائي'}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-block px-2.5 py-1 rounded-xl bg-amber-950/60 border border-amber-500/30 text-amber-300">
                                                                ⚠️ بدون حساب دفع
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Row 2: Ordered Showroom Internal Menus Strip (Clickable to jump straight into that section) */}
                                                <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[11px] font-black text-slate-300">
                                                            📂 قوائم وأقسام داخل المعرض ({storeSections.length} أقسام • {prodCount} منتج)
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                setPortalInitialSection('all');
                                                                setPortalUrlKey(`?storePortal=${st.id}&code=${portalCode}`);
                                                            }}
                                                            className="text-[11px] font-black text-indigo-400 hover:text-indigo-300"
                                                        >
                                                            عرض وترتيب كل القوائم ⬅️
                                                        </button>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {storeSections.map((sec, idx) => {
                                                            const secCnt = thisStoreProds.filter((p) => p.category === sec.id).length;
                                                            return (
                                                                <button
                                                                    key={sec.id + '_' + idx}
                                                                    onClick={() => {
                                                                        setPortalInitialSection(sec.id);
                                                                        setPortalUrlKey(`?storePortal=${st.id}&code=${portalCode}`);
                                                                    }}
                                                                    className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-indigo-600/25 border border-slate-800 hover:border-indigo-500/40 text-[11px] font-bold text-slate-200 transition-all flex items-center gap-1"
                                                                >
                                                                    <span className="text-[10px] text-slate-500 font-black">{idx + 1}.</span>
                                                                    <span>{sec.icon || '📂'} {sec.label}</span>
                                                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-[10px] font-black text-amber-300">{secCnt}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Row 3: Neatly Organized 2-Zone Action Footer */}
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                                                    {/* Primary Showroom Actions */}
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button
                                                            onClick={() => {
                                                                setPortalInitialSection('all');
                                                                setPortalUrlKey(`?storePortal=${st.id}&code=${portalCode}`);
                                                            }}
                                                            className="px-3.5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-md"
                                                        >
                                                            📂 إدارة قوائم ومنتجات المعرض ({prodCount})
                                                        </button>
                                                        <button
                                                            onClick={() => setProductModalState({ store: st, product: { isNew: true, inStock: true } })}
                                                            className="px-3 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs"
                                                        >
                                                            + إضافة منتج
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingStore({ ...st, isNew: false })}
                                                            className="px-3 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs border border-slate-700"
                                                        >
                                                            ✏️ تعديل المعرض
                                                        </button>
                                                    </div>

                                                    {/* Secondary Share & VIP Utilities */}
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <button
                                                            onClick={() => {
                                                                const link = getStorePortalLink(st, appConfig.portalBaseUrl);
                                                                copyToClipboard(link, () => addToast(`🔗 تم نسخ رابط بوابة المعرض (${st.name})!`));
                                                            }}
                                                            className="px-2.5 py-2 rounded-xl bg-slate-950 text-amber-300 font-black text-[11px] border border-slate-800"
                                                        >
                                                            🔗 نسخ البوابة
                                                        </button>
                                                        {st.phone && (
                                                            <button
                                                                onClick={() => {
                                                                    const link = getStorePortalLink(st, appConfig.portalBaseUrl);
                                                                    const msg = `مرحباً إدارة "${st.name}"،\nتم تفعيل بوابة المعرض الخاصة بكم في منصة الأسطة:\n🔑 كود الدخول: ${portalCode}\n🔗 رابط إدارة المنتجات:\n${link}`;
                                                                    openWhatsappChat(st.phone, msg);
                                                                }}
                                                                className="px-2.5 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-black text-[11px]"
                                                            >
                                                                💬 واتساب
                                                            </button>
                                                        )}
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => handleQuickToggleStoreVip(st, 30)}
                                                            className={`px-2.5 py-2 rounded-xl font-black text-[11px] ${
                                                                isVip
                                                                    ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                                                    : 'bg-amber-400 text-slate-950'
                                                            }`}
                                                        >
                                                            {busy ? '...' : isVip ? 'تحويل لتجريبي' : '💎 VIP'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* STORES SUB-TAB 2: ALL PRODUCTS ORGANIZED BY SHOWROOM & SECTIONS */}
                        {activeTab === 'stores' && storesSubTab === 'products' && (
                            <div className="space-y-3">
                                {/* Clean Products Filter Bar */}
                                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <select
                                            value={productStoreFilter}
                                            onChange={(e) => { setProductStoreFilter(e.target.value); setProductCategoryFilter('all'); }}
                                            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-white"
                                        >
                                            <option value="all">🏪 كل المعارض ({stores.length})</option>
                                            {stores.map((s) => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={productCategoryFilter}
                                            onChange={(e) => setProductCategoryFilter(e.target.value)}
                                            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-white"
                                        >
                                            <option value="all">📂 كل الأقسام</option>
                                            {(productStoreFilter !== 'all'
                                                ? getStoreSectionsList(stores.find((s) => s.id === productStoreFilter))
                                                : ECOMMERCE_CATEGORIES
                                            ).map((c) => (
                                                <option key={c.id} value={c.id}>{c.icon || '📂'} {c.label}</option>
                                            ))}
                                        </select>
                                        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                                            {[
                                                { id: 'all', label: 'الكل' },
                                                { id: 'in_stock', label: '🟢 متوفر' },
                                                { id: 'out_of_stock', label: '🔴 نافذ' }
                                            ].map((sf) => (
                                                <button
                                                    key={sf.id}
                                                    onClick={() => setProductStockFilter(sf.id)}
                                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${
                                                        productStockFilter === sf.id ? 'bg-indigo-600 text-white' : 'text-slate-400'
                                                    }`}
                                                >
                                                    {sf.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setProductGroupByStore((v) => !v)}
                                        className={`px-3 py-2 rounded-xl text-xs font-black border ${
                                            productGroupByStore
                                                ? 'bg-amber-400/20 border-amber-500/40 text-amber-300'
                                                : 'bg-slate-950 border-slate-800 text-slate-400'
                                        }`}
                                    >
                                        {productGroupByStore ? '🗂️ مرتب حسب المعرض والأقسام' : '▦ عرض شبكة موحدة'}
                                    </button>
                                </div>

                                {filteredProducts.length === 0 ? (
                                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400 font-bold text-sm">
                                        لا توجد منتجات مطابقة للفلاتر المختارة حالياً
                                    </div>
                                ) : productGroupByStore ? (
                                    <div className="space-y-4">
                                        {Object.entries(
                                            filteredProducts.reduce((acc, p) => {
                                                const key = p.storeId || 'unknown';
                                                if (!acc[key]) acc[key] = [];
                                                acc[key].push(p);
                                                return acc;
                                            }, {})
                                        ).map(([stId, prodsInStore]) => {
                                            const parentStore = stores.find((s) => s.id === stId) || { id: stId, name: prodsInStore[0]?.storeName || 'معرض' };
                                            const sectionsForStore = getStoreSectionsList(parentStore);
                                            const knownSecSet = new Set(sectionsForStore.map((s) => s.id));
                                            const otherProds = prodsInStore.filter((p) => !knownSecSet.has(p.category));

                                            return (
                                                <div key={stId} className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4 space-y-4">
                                                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-base text-amber-300">🏪 {parentStore.name}</span>
                                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-800 text-slate-300">
                                                                {prodsInStore.length} منتج
                                                            </span>
                                                        </div>
                                                        <button
                                                            onClick={() => setProductModalState({ store: parentStore, product: { isNew: true, inStock: true } })}
                                                            className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs"
                                                        >
                                                            + إضافة منتج لهذا المعرض
                                                        </button>
                                                    </div>

                                                    {sectionsForStore.map((sec) => {
                                                        const secItems = prodsInStore.filter((p) => p.category === sec.id);
                                                        if (secItems.length === 0) return null;
                                                        return (
                                                            <div key={sec.id} className="space-y-2">
                                                                <div className="flex items-center gap-2 text-xs font-black text-indigo-300 px-1">
                                                                    <span>{sec.icon || '📂'} {sec.label}</span>
                                                                    <span className="text-[10px] text-slate-500">({secItems.length})</span>
                                                                </div>
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                                    {secItems.map((prod) => (
                                                                        <div key={prod.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between gap-3">
                                                                            <div className="flex items-start gap-3">
                                                                                {(prod.imageUrl || prod.image) ? (
                                                                                    <img src={prod.imageUrl || prod.image} alt={prod.name} className="w-14 h-14 rounded-xl object-cover border border-slate-700 shrink-0" />
                                                                                ) : (
                                                                                    <div className="w-14 h-14 rounded-xl bg-slate-800 flex items-center justify-center text-xl shrink-0">{prod.icon || '🎨'}</div>
                                                                                )}
                                                                                <div className="min-w-0 flex-1">
                                                                                    <div className="font-black text-xs sm:text-sm text-white truncate">{prod.name}</div>
                                                                                    <div className="text-[11px] font-bold text-slate-400">{prod.brand ? `${prod.brand} • ` : ''}{prod.unit || 'قطعة'}</div>
                                                                                    <div className="text-sm font-black text-emerald-400 mt-1">
                                                                                        {Number(prod.price || 0).toLocaleString('en-US')} د.ع
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                                                                                <button
                                                                                    onClick={() => setProductModalState({ store: parentStore, product: { ...prod, isNew: false } })}
                                                                                    className="flex-1 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs"
                                                                                >
                                                                                    ✏️ تعديل
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleDeleteStoreProduct(prod)}
                                                                                    className="px-3 py-1.5 rounded-xl bg-rose-950/60 text-rose-300 border border-rose-700/40 font-black text-xs"
                                                                                >
                                                                                    🗑️ حذف
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                    {otherProds.length > 0 && (
                                                        <div className="space-y-2">
                                                            <div className="text-xs font-black text-slate-400 px-1">📦 منتجات أخرى ({otherProds.length})</div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                                {otherProds.map((prod) => (
                                                                    <div key={prod.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between gap-3">
                                                                        <div className="flex items-start gap-3">
                                                                            {(prod.imageUrl || prod.image) ? (
                                                                                <img src={prod.imageUrl || prod.image} alt={prod.name} className="w-14 h-14 rounded-xl object-cover border border-slate-700 shrink-0" />
                                                                            ) : (
                                                                                <div className="w-14 h-14 rounded-xl bg-slate-800 flex items-center justify-center text-xl shrink-0">{prod.icon || '🎨'}</div>
                                                                            )}
                                                                            <div className="min-w-0 flex-1">
                                                                                <div className="font-black text-xs sm:text-sm text-white truncate">{prod.name}</div>
                                                                                <div className="text-[11px] font-bold text-slate-400">{prod.categoryLabel || prod.category} • {prod.unit || 'قطعة'}</div>
                                                                                <div className="text-sm font-black text-emerald-400 mt-1">
                                                                                    {Number(prod.price || 0).toLocaleString('en-US')} د.ع
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                                                                            <button
                                                                                onClick={() => setProductModalState({ store: parentStore, product: { ...prod, isNew: false } })}
                                                                                className="flex-1 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs"
                                                                            >
                                                                                ✏️ تعديل
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleDeleteStoreProduct(prod)}
                                                                                className="px-3 py-1.5 rounded-xl bg-rose-950/60 text-rose-300 border border-rose-700/40 font-black text-xs"
                                                                            >
                                                                                🗑️ حذف
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        {filteredProducts.map((prod) => {
                                            const parentStore = stores.find((s) => s.id === prod.storeId) || { id: prod.storeId, name: prod.storeName || 'معرض' };
                                            return (
                                                <div key={prod.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between gap-3">
                                                    <div className="flex items-start gap-3">
                                                        {(prod.imageUrl || prod.image) ? (
                                                            <img src={prod.imageUrl || prod.image} alt={prod.name} className="w-16 h-16 rounded-2xl object-cover border border-slate-700 shrink-0" />
                                                        ) : (
                                                            <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-2xl shrink-0">{prod.icon || '🎨'}</div>
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[10px] font-black text-amber-300 truncate">🏪 {parentStore.name}</div>
                                                            <div className="font-black text-sm text-white truncate mt-0.5">{prod.name}</div>
                                                            <div className="text-[11px] font-bold text-slate-400">{prod.categoryLabel || prod.category} • {prod.unit || 'قطعة'}</div>
                                                            <div className="text-sm font-black text-emerald-400 mt-1">
                                                                {Number(prod.price || 0).toLocaleString('en-US')} د.ع
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                                                        <button
                                                            onClick={() => setProductModalState({ store: parentStore, product: { ...prod, isNew: false } })}
                                                            className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs"
                                                        >
                                                            ✏️ تعديل
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteStoreProduct(prod)}
                                                            className="px-3 py-2 rounded-xl bg-rose-950/60 text-rose-300 border border-rose-700/40 font-black text-xs"
                                                        >
                                                            🗑️ حذف
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STORES SUB-TAB 3: LIVE STORE ORDERS WITH FILTERS */}
                        {activeTab === 'stores' && storesSubTab === 'orders' && (
                            <div className="space-y-3">
                                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {[
                                            { id: 'all', label: `الكل (${storeOrders.length})` },
                                            { id: 'pending', label: `⏳ قيد الانتظار (${storeOrders.filter((o) => !o.status || o.status === 'pending').length})` },
                                            { id: 'confirmed', label: `✓ مؤكدة (${storeOrders.filter((o) => o.status === 'confirmed').length})` },
                                            { id: 'delivered', label: `🚚 تم التوصيل (${storeOrders.filter((o) => o.status === 'delivered').length})` }
                                        ].map((st) => (
                                            <button
                                                key={st.id}
                                                onClick={() => setOrderStatusFilter(st.id)}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-black ${
                                                    orderStatusFilter === st.id ? 'bg-amber-400 text-slate-950' : 'bg-slate-950 text-slate-400 border border-slate-800'
                                                }`}
                                            >
                                                {st.label}
                                            </button>
                                        ))}
                                    </div>
                                    <select
                                        value={orderStoreFilter}
                                        onChange={(e) => setOrderStoreFilter(e.target.value)}
                                        className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200"
                                    >
                                        <option value="all">🏪 كل المعارض</option>
                                        {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>

                                {filteredOrders.length === 0 ? (
                                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400 font-bold text-sm">
                                        لا توجد طلبيات مواد مطابقة للفلاتر حالياً
                                    </div>
                                ) : (
                                    filteredOrders.map((ord) => (
                                        <div key={ord.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-2">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-black text-sm text-white">🏪 {ord.storeName || 'معرض'}</span>
                                                    <span className="px-2 py-0.5 rounded-lg bg-slate-950 text-indigo-300 text-[11px] font-bold">
                                                        👷 المقاول: {ord.contractorName || ord.adminId || 'غير محدد'}
                                                    </span>
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                                                        ord.status === 'delivered' ? 'bg-emerald-500/20 text-emerald-300' :
                                                        ord.status === 'confirmed' ? 'bg-indigo-500/20 text-indigo-300' :
                                                        'bg-amber-500/20 text-amber-300'
                                                    }`}>
                                                        {ord.status === 'delivered' ? '✓ تم التوصيل' : ord.status === 'confirmed' ? 'تم التأكيد' : 'قيد الانتظار'}
                                                    </span>
                                                </div>
                                                <div className="font-black text-sm text-emerald-400">
                                                    {Number(ord.total || ord.totalAmount || 0).toLocaleString('en-US')} د.ع
                                                </div>
                                            </div>
                                            {ord.projectName && (
                                                <div className="text-xs font-bold text-slate-400">🏗️ المشروع: {ord.projectName} • 📅 {ord.date || String(ord.createdAt || '').split('T')[0]}</div>
                                            )}
                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                                <button onClick={() => handleUpdateOrderStatus(ord, 'confirmed')} className="px-3 py-1.5 rounded-xl bg-indigo-600/25 text-indigo-300 text-xs font-black">✓ تأكيد</button>
                                                <button onClick={() => handleUpdateOrderStatus(ord, 'delivered')} className="px-3 py-1.5 rounded-xl bg-emerald-600/25 text-emerald-300 text-xs font-black">🚚 تم التوصيل</button>
                                                <button onClick={() => handleDeleteOrder(ord)} className="px-3 py-1.5 rounded-xl bg-rose-950/60 text-rose-300 text-xs font-black">🗑️ حذف</button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* ========================================================================= */}
                        {/* TAB: CONTRACTORS (ADMINS)                                                 */}
                        {/* ========================================================================= */}
                        {activeTab === 'contractors' && (
                            <div className="space-y-3">
                                {filteredAdmins.length === 0 ? (
                                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400 font-bold text-sm">
                                        لا توجد حسابات مقاولين مطابقة للبحث
                                    </div>
                                ) : (
                                    filteredAdmins.map((adm) => {
                                        const isPro = Boolean(adm.isPro || adm.isVerifiedPro);
                                        const expInfo = formatDaysRemaining(adm.subscriptionExpiresAt);
                                        const busy = savingId === 'admin_' + adm.id;
                                        const contractorProjectsCount = projects.filter((p) => p.adminId === adm.id).length;
                                        const contractorWorkersCount = workers.filter((w) => w.adminId === adm.id).length;

                                        return (
                                            <div
                                                key={adm.id}
                                                className={`p-4 rounded-3xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                                    isPro && !expInfo.expired
                                                        ? 'bg-slate-900 border-amber-500/40'
                                                        : 'bg-slate-900 border-slate-800'
                                                }`}
                                            >
                                                <div className="space-y-1.5">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-black text-base text-white">
                                                            {adm.name || adm.fullName || adm.id}
                                                        </span>
                                                        <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
                                                            ID: {adm.id}
                                                        </span>
                                                        {isPro && !expInfo.expired ? (
                                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400/20 text-amber-300 border border-amber-400/40">
                                                                👑 مقاول Pro {adm.subscriptionPlanLabel ? `(${adm.subscriptionPlanLabel})` : ''}
                                                            </span>
                                                        ) : (
                                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">
                                                                باقة مجانية
                                                            </span>
                                                        )}
                                                        {adm.isVerifiedIdentity && (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-300">
                                                                ✓ موثق الهاتف
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="text-xs font-bold text-slate-300 flex flex-wrap items-center gap-3">
                                                        <span>📞 الهاتف: <span className="font-mono text-indigo-300">{adm.phone || 'غير مسجل'}</span></span>
                                                        <span>• 📍 {adm.gov || 'بغداد'}</span>
                                                        <span>• 🏗️ المشاريع: <span className="text-white">{contractorProjectsCount}</span></span>
                                                        <span>• 👷 العمال: <span className="text-white">{contractorWorkersCount}</span></span>
                                                        {adm.subscriptionExpiresAt && (
                                                            <span className={expInfo.expired ? 'text-rose-400' : 'text-emerald-400'}>
                                                                • الاشتراك: {expInfo.text}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2">
                                                    <button
                                                        disabled={busy}
                                                        onClick={() => handleQuickToggleContractorPro(adm, 30, 'شهري')}
                                                        className={`px-3.5 py-2.5 rounded-2xl font-black text-xs transition-all active:scale-95 ${
                                                            isPro
                                                                ? 'bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30'
                                                                : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                                                        }`}
                                                    >
                                                        {busy ? 'جاري الحفظ...' : isPro ? 'إيقاف Pro' : '👑 تفعيل شهر'}
                                                    </button>

                                                    <button
                                                        disabled={busy}
                                                        onClick={() => handleQuickToggleContractorPro(adm, 365, 'سنوي')}
                                                        className="px-3 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs active:scale-95"
                                                    >
                                                        👑 تفعيل سنة
                                                    </button>

                                                    {adm.phone && (
                                                        <button
                                                            onClick={() => openWhatsappChat(adm.phone, `مرحباً أستاذ ${adm.name || adm.id}، معك إدارة منصة الأسطة.`)}
                                                            className="px-3 py-2.5 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-black text-xs"
                                                        >
                                                            💬 واتساب
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => setEditingContractor({ ...adm, isNew: false })}
                                                        className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs border border-slate-700 active:scale-95"
                                                    >
                                                        ✏️ تعديل كامل
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* ========================================================================= */}
                        {/* TAB: WORKERS & CRAFTSMEN                                                  */}
                        {/* ========================================================================= */}
                        {activeTab === 'workers' && (
                            <div className="space-y-3">
                                {filteredWorkers.length === 0 ? (
                                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400 font-bold text-sm">
                                        لا توجد حسابات عمال مطابقة للبحث
                                    </div>
                                ) : (
                                    filteredWorkers.map((w) => {
                                        const isPro = Boolean(w.isVerifiedPro);
                                        const expInfo = formatDaysRemaining(w.subscriptionExpiresAt);
                                        const busy = savingId === 'worker_' + w.id;
                                        return (
                                            <div
                                                key={w.id}
                                                className={`p-4 rounded-3xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                                    isPro && !expInfo.expired
                                                        ? 'bg-slate-900 border-emerald-500/40'
                                                        : 'bg-slate-900 border-slate-800'
                                                }`}
                                            >
                                                <div className="space-y-1.5">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-black text-base text-white">{w.name || 'عامل بدون اسم'}</span>
                                                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-black bg-indigo-500/20 text-indigo-300">
                                                            {w.specialty || 'عامل عادي'}
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-300">
                                                            📍 {w.gov || 'بغداد'}
                                                        </span>
                                                        {isPro && !expInfo.expired && (
                                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                                                🌟 حرفي معتمد Pro
                                                            </span>
                                                        )}
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400/15 text-amber-300">
                                                            ⭐ {Number(w.ratingScore || 0).toFixed(1)} / 6
                                                        </span>
                                                    </div>

                                                    <div className="text-xs font-bold text-slate-300 flex flex-wrap items-center gap-3">
                                                        <span>📞 الهاتف: <span className="font-mono text-indigo-300">{w.phone || 'غير مسجل'}</span></span>
                                                        {w.loginCode && (
                                                            <button
                                                                onClick={() => copyToClipboard(w.loginCode, () => addToast(`📋 تم نسخ كود العامل: ${w.loginCode}`))}
                                                                className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-amber-300"
                                                            >
                                                                🔑 {w.loginCode} (نسخ)
                                                            </button>
                                                        )}
                                                        <span>• اليومية: <span className="text-emerald-400">{Number(w.marketWage || w.wage || 0).toLocaleString('en-US')} د.ع</span></span>
                                                        {w.adminId && <span>• المقاول: <span className="text-white">{w.adminId}</span></span>}
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2">
                                                    <button
                                                        disabled={busy}
                                                        onClick={() => handleQuickToggleWorkerPro(w, 30)}
                                                        className={`px-3.5 py-2.5 rounded-2xl font-black text-xs transition-all active:scale-95 ${
                                                            isPro
                                                                ? 'bg-rose-600/20 border border-rose-500/40 text-rose-300'
                                                                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                                                        }`}
                                                    >
                                                        {busy ? 'جاري الحفظ...' : isPro ? 'إلغاء توثيق Pro' : '🌟 توثيق Pro (شهر)'}
                                                    </button>

                                                    {w.phone && (
                                                        <button
                                                            onClick={() => openWhatsappChat(w.phone, `مرحباً ${w.name}، كود الدخول الخاص بك في منصة الأسطة هو: ${w.loginCode || ''}`)}
                                                            className="px-3 py-2.5 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-black text-xs"
                                                        >
                                                            💬 إرسال الكود واتساب
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => setEditingWorker({ ...w, isNew: false })}
                                                        className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs border border-slate-700 active:scale-95"
                                                    >
                                                        ✏️ تعديل كامل
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* ========================================================================= */}
                        {/* TAB: SYSTEM ANNOUNCEMENTS (`announcements`)                               */}
                        {/* ========================================================================= */}
                        {activeTab === 'announcements' && (
                            <div className="space-y-3">
                                <div className="bg-gradient-to-l from-rose-950/60 to-indigo-950/60 border border-rose-500/30 rounded-3xl p-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="font-black text-sm sm:text-base text-white flex items-center gap-2">
                                            <span>📢 مركز إعلانات وتعاميم النظام المباشرة</span>
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                                نشط: {activeAnnouncementsCount}
                                            </span>
                                        </h2>
                                        <p className="text-xs font-bold text-slate-300 mt-0.5">
                                            تظهر الإعلانات كنافذة منبثقة فورية داخل التطبيق للمقاولين أو العمال، مع إمكانية إعادة البث للجميع.
                                        </p>
                                    </div>
                                    <button
                                        onClick={openNewAnnouncementModal}
                                        className="px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg"
                                    >
                                        + إنشاء إعلان نظام جديد
                                    </button>
                                </div>

                                {filteredAnnouncements.length === 0 ? (
                                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center space-y-3">
                                        <div className="text-4xl">📢</div>
                                        <div className="text-sm font-black text-slate-300">لا توجد إعلانات نظام منشورة حالياً</div>
                                        <button
                                            onClick={openNewAnnouncementModal}
                                            className="px-5 py-3 rounded-2xl bg-rose-600 text-white font-black text-xs"
                                        >
                                            + نشر أول إعلان للنظام
                                        </button>
                                    </div>
                                ) : (
                                    filteredAnnouncements.map((ann) => {
                                        const isActive = ann.isActive !== false;
                                        const typeObj = ANNOUNCEMENT_TYPES.find((t) => t.key === ann.adType) || ANNOUNCEMENT_TYPES[0];
                                        const targetObj = ANNOUNCEMENT_TARGETS.find((t) => t.key === ann.target) || ANNOUNCEMENT_TARGETS[0];
                                        const isExpired = ann.expiresAt && new Date(ann.expiresAt + 'T23:59:59').getTime() < Date.now();

                                        return (
                                            <div
                                                key={ann.id}
                                                className={`p-4 rounded-3xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                                                    !isActive || isExpired
                                                        ? 'bg-slate-900/50 border-slate-800 opacity-75'
                                                        : ann.isPinned
                                                        ? 'bg-slate-900 border-amber-500/50 shadow-lg'
                                                        : 'bg-slate-900 border-slate-800'
                                                }`}
                                            >
                                                <div className="flex items-start gap-3.5">
                                                    {ann.imageUrl ? (
                                                        <img src={ann.imageUrl} alt={ann.title} className="w-20 h-20 rounded-2xl object-cover border border-slate-700 shrink-0" />
                                                    ) : (
                                                        <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center text-2xl shrink-0">
                                                            📢
                                                        </div>
                                                    )}
                                                    <div className="space-y-1.5">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {ann.isPinned && (
                                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400/20 text-amber-300 border border-amber-400/40">
                                                                    📌 مثبت
                                                                </span>
                                                            )}
                                                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${typeObj.badgeCls}`}>
                                                                {typeObj.label}
                                                            </span>
                                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-800 text-slate-300">
                                                                {targetObj.label}
                                                            </span>
                                                            {isActive && !isExpired ? (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300">
                                                                    🟢 نشط
                                                                </span>
                                                            ) : (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300">
                                                                    {isExpired ? '⌛ منتهي' : '⏸️ متوقف'}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <h3 className="font-black text-base text-white">{ann.title || 'إعلان بدون عنوان'}</h3>
                                                        {ann.content && (
                                                            <p className="text-xs font-bold text-slate-300 whitespace-pre-line">
                                                                {ann.content}
                                                            </p>
                                                        )}

                                                        <div className="text-[11px] font-bold text-slate-400 flex flex-wrap items-center gap-3 pt-1">
                                                            <span>👁️ مرات الظهور: <span className="text-white">{ann.maxViews || 1}</span></span>
                                                            <span>• 📡 دفعة البث: <span className="font-mono text-amber-300">#{ann.broadcastId || 1}</span></span>
                                                            {ann.expiresAt && <span>• 📅 ينتهي: {ann.expiresAt}</span>}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                                    <button
                                                        disabled={savingId === 'ann_rebroadcast_' + ann.id}
                                                        onClick={() => handleRebroadcastAnnouncement(ann)}
                                                        className="px-3.5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-md"
                                                    >
                                                        🔄 إعادة بث للجميع
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleAnnouncementActive(ann)}
                                                        className={`px-3 py-2.5 rounded-2xl font-black text-xs border ${
                                                            isActive
                                                                ? 'bg-amber-950/50 border-amber-500/40 text-amber-300'
                                                                : 'bg-emerald-600 text-white border-emerald-500'
                                                        }`}
                                                    >
                                                        {isActive ? '⏸️ إيقاف' : '🟢 تفعيل'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleAnnouncementPinned(ann)}
                                                        className={`px-3 py-2.5 rounded-2xl font-black text-xs border ${
                                                            ann.isPinned
                                                                ? 'bg-amber-400 text-slate-950 border-amber-400'
                                                                : 'bg-slate-800 text-slate-300 border-slate-700'
                                                        }`}
                                                    >
                                                        📌
                                                    </button>
                                                    <button
                                                        onClick={() => openEditAnnouncementModal(ann)}
                                                        className="px-3.5 py-2.5 rounded-2xl bg-slate-800 text-slate-200 font-black text-xs border border-slate-700"
                                                    >
                                                        ✏️ تعديل
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteAnnouncement(ann)}
                                                        className="px-3 py-2.5 rounded-2xl bg-rose-950/70 text-rose-300 border border-rose-700/40 font-black text-xs"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* ========================================================================= */}
                        {/* TAB: SETTINGS, MONETIZATION & OTA UPDATES (`settings/app_config`)         */}
                        {/* ========================================================================= */}
                        {activeTab === 'settings' && (
                            <form onSubmit={(e) => handleSaveAppConfig(e, 'save')} className="space-y-4">
                                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                                        <div>
                                            <h2 className="font-black text-base text-white">🚀 مركز التحديث السحابي الفوري (OTA) ووضع الصيانة</h2>
                                            <p className="text-xs font-bold text-slate-400">التحكم بإصدار التطبيق ورابط التحديث المباشر وإرسال تنبيه التحديث الفوري</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isConfigDirty && (
                                                <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                                    ⚠️ تعديلات غير محفوظة
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                disabled={savingId === 'app_config'}
                                                onClick={handleReloadCloudConfig}
                                                className="px-2.5 py-1 rounded-xl text-[11px] font-black bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                                            >
                                                🔄 مزامنة السحابة
                                            </button>
                                            <span className="px-3 py-1 rounded-xl font-mono text-xs font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                                v{cloudAppConfig?.latestVersion || appConfig.latestVersion || APP_VERSION}
                                            </span>
                                        </div>
                                    </div>

                                    {configSaveError && (
                                        <div className="p-3 rounded-2xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs font-black">
                                            {configSaveError}
                                        </div>
                                    )}

                                    {/* Live Cloud State Verification Strip */}
                                    {cloudAppConfig && (
                                        <div className="p-3 rounded-2xl bg-slate-950/70 border border-emerald-500/30 text-[11px] space-y-1">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="font-black text-emerald-300">☁️ المحفوظ فعلياً في السحابة الآن:</span>
                                                {cloudAppConfig.updatedAt && (
                                                    <span className="font-mono text-[10px] text-slate-400">
                                                        آخر حفظ: {String(cloudAppConfig.updatedAt).replace('T', ' ').slice(0, 19)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 font-bold text-slate-300">
                                                <span>الإصدار: <span className="font-mono text-amber-300">v{cloudAppConfig.latestVersion || APP_VERSION}</span></span>
                                                <span className="truncate max-w-full">الرابط: <span className="font-mono text-indigo-300" dir="ltr">{cloudAppConfig.apkUrl || cloudAppConfig.rawApkUrl || 'غير محدد'}</span></span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                                            <span className="text-xs font-black text-amber-300">إلزام التحديث الإجباري</span>
                                            <input type="checkbox" checked={Boolean(appConfig.forceUpdate)} onChange={(e) => updateAppConfigFields({ forceUpdate: e.target.checked })} className="w-5 h-5" />
                                        </label>
                                        <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                                            <span className="text-xs font-black text-slate-200">إيقاف نافذة التحديث مؤقتاً</span>
                                            <input type="checkbox" checked={Boolean(appConfig.stopUpdate)} onChange={(e) => updateAppConfigFields({ stopUpdate: e.target.checked })} className="w-5 h-5" />
                                        </label>
                                        <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                                            <span className="text-xs font-black text-rose-300">وضع الصيانة المؤقت</span>
                                            <input type="checkbox" checked={Boolean(appConfig.maintenanceMode)} onChange={(e) => updateAppConfigFields({ maintenanceMode: e.target.checked })} className="w-5 h-5" />
                                        </label>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">رقم أحدث إصدار للتطبيق (latestVersion)</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    dir="ltr"
                                                    value={appConfig.latestVersion ?? ''}
                                                    onChange={(e) => updateAppConfigFields({ latestVersion: e.target.value })}
                                                    placeholder="1.0.26"
                                                    className="flex-1 p-3 rounded-2xl bg-slate-950 border border-slate-800 focus:border-amber-400 focus:outline-none text-sm font-mono font-black text-amber-300"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={bumpPatchVersion}
                                                    className="px-3 py-3 rounded-2xl bg-amber-500/20 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-mono font-black text-xs shrink-0"
                                                    title="زيادة رقم الإصدار تلقائياً"
                                                >
                                                    +0.0.1
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">الرابط الأساسي لبوابة المعارض (portalBaseUrl)</label>
                                            <input
                                                type="text"
                                                dir="ltr"
                                                value={appConfig.portalBaseUrl ?? ''}
                                                onChange={(e) => updateAppConfigFields({ portalBaseUrl: e.target.value })}
                                                placeholder="https://waadpc90-ctrl.github.io/alosta-app/"
                                                className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none text-xs font-mono text-slate-300"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <label className="text-[11px] font-bold text-slate-400">رابط ملف التحديث المباشر (APK URL)</label>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const officialUrl = 'https://waadpc90-ctrl.github.io/alosta-app/AlOsta_App.apk';
                                                        updateAppConfigFields({
                                                            apkUrl: officialUrl,
                                                            rawApkUrl: officialUrl,
                                                            portalBaseUrl: 'https://waadpc90-ctrl.github.io/alosta-app/'
                                                        });
                                                        verifyApkLinkNow(officialUrl);
                                                    }}
                                                    className="px-2.5 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 text-[10px] font-black"
                                                >
                                                    ⚡ رابط GitHub الرسمي (alosta-app)
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={linkCheckState?.state === 'checking'}
                                                    onClick={() => verifyApkLinkNow(appConfig.apkUrl)}
                                                    className="px-2.5 py-1 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 text-[10px] font-black"
                                                >
                                                    {linkCheckState?.state === 'checking' ? '⏳ جاري الفحص...' : '🔍 فحص وتأكيد الرابط'}
                                                </button>
                                                {appConfig.apkUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const target = normalizeDashboardApkUrl(appConfig.apkUrl);
                                                            if (window.AndroidApp && typeof window.AndroidApp.openExternalUpdateUrl === 'function') {
                                                                window.AndroidApp.openExternalUpdateUrl(target);
                                                            } else {
                                                                window.open(target, '_blank', 'noopener,noreferrer');
                                                            }
                                                        }}
                                                        className="px-2.5 py-1 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-300 text-[10px] font-black"
                                                    >
                                                        🌐 فتح للتجربة
                                                    </button>
                                                )}
                                                {appConfig.apkUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => updateAppConfigFields({ apkUrl: '', rawApkUrl: '' })}
                                                        className="text-[10px] font-black text-rose-400"
                                                    >
                                                        مسح الرابط ✕
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <input
                                            type="text"
                                            dir="ltr"
                                            value={appConfig.apkUrl ?? ''}
                                            onChange={(e) => updateAppConfigFields({ apkUrl: e.target.value, rawApkUrl: e.target.value })}
                                            placeholder="https://drive.google.com/file/d/... أو https://github.com/.../AlOsta_App.apk"
                                            className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none text-xs font-mono text-indigo-300"
                                        />
                                        {linkCheckState && (
                                            <div className={`p-3 rounded-2xl border text-[11px] font-bold flex flex-col gap-1 ${
                                                linkCheckState.state === 'ok'
                                                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                                                    : linkCheckState.state === 'error'
                                                    ? 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                                                    : linkCheckState.state === 'warn'
                                                    ? 'bg-amber-950/50 border-amber-500/40 text-amber-200'
                                                    : 'bg-sky-950/50 border-sky-500/40 text-sky-200'
                                            }`}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span>{linkCheckState.message}</span>
                                                    {linkCheckState.checkedAt && (
                                                        <span className="text-[10px] opacity-75 font-mono shrink-0">{linkCheckState.checkedAt}</span>
                                                    )}
                                                </div>
                                                {linkCheckState.resolvedUrl && linkCheckState.resolvedUrl !== appConfig.apkUrl && (
                                                    <div className="text-[10px] font-mono opacity-80 truncate" dir="ltr">
                                                        Direct: {linkCheckState.resolvedUrl}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <button type="button" disabled={savingId === 'app_config'} onClick={(e) => handleSaveAppConfig(e, 'save')} className="py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg">
                                            {savingId === 'app_config' ? 'جاري الحفظ...' : '💾 حفظ الإصدار والرابط ✓'}
                                        </button>
                                        <button type="button" disabled={savingId === 'app_config'} onClick={(e) => handleSaveAppConfig(e, 'push')} className="flex-1 py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg">
                                            🚀 حفظ وإرسال إشعار تحديث فوري لجميع الأجهزة
                                        </button>
                                        <button type="button" disabled={savingId === 'app_config'} onClick={(e) => handleSaveAppConfig(e, 'stop')} className="py-3.5 px-4 rounded-2xl bg-rose-950/80 border border-rose-600/40 text-rose-200 font-black text-xs">
                                            ⏹️ إيقاف التحديث
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
                                    <h2 className="font-black text-base text-white border-b border-slate-800 pb-3">
                                        💎 نظام الاشتراكات المدفوعة والحدود المجانية والأسعار
                                    </h2>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                                            <span className="text-xs font-black text-emerald-300">تفعيل نظام الاشتراكات المدفوعة (Pro)</span>
                                            <input type="checkbox" checked={Boolean(appConfig.monetizationEnabled)} onChange={(e) => updateAppConfigFields({ monetizationEnabled: e.target.checked })} className="w-5 h-5" />
                                        </label>
                                        <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                                            <span className="text-xs font-black text-indigo-300">التفعيل التلقائي عند الوصول للهدف</span>
                                            <input type="checkbox" checked={Boolean(appConfig.autoEnableOnTarget)} onChange={(e) => updateAppConfigFields({ autoEnableOnTarget: e.target.checked })} className="w-5 h-5" />
                                        </label>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">هدف عدد المقاولين ({admins.length} حالياً)</label>
                                            <input type="number" value={appConfig.targetContractorsCount ?? 500} onChange={(e) => updateAppConfigFields({ targetContractorsCount: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-white" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">هدف عدد العمال ({workers.length} حالياً)</label>
                                            <input type="number" value={appConfig.targetWorkersCount ?? 2000} onChange={(e) => updateAppConfigFields({ targetWorkersCount: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-white" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">هدف عدد المعارض ({stores.length} حالياً)</label>
                                            <input type="number" value={appConfig.targetStoresCount ?? 15} onChange={(e) => updateAppConfigFields({ targetStoresCount: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-white" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">حد المشاريع المجانية للمقاول</label>
                                            <input type="number" value={appConfig.freeMaxProjects ?? 2} onChange={(e) => updateAppConfigFields({ freeMaxProjects: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-white" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">حد العمال المجاني للمقاول</label>
                                            <input type="number" value={appConfig.freeMaxWorkers ?? 5} onChange={(e) => updateAppConfigFields({ freeMaxWorkers: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-white" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">حد المنتجات المجاني للمعرض</label>
                                            <input type="number" value={appConfig.freeStoreMaxProducts ?? 10} onChange={(e) => updateAppConfigFields({ freeStoreMaxProducts: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-white" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">اشتراك المقاول الشهري (د.ع)</label>
                                            <input type="number" value={appConfig.proContractorPrice ?? 25000} onChange={(e) => updateAppConfigFields({ proContractorPrice: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-emerald-400" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">اشتراك المقاول السنوي (د.ع)</label>
                                            <input type="number" value={appConfig.proContractorAnnualPrice ?? 250000} onChange={(e) => updateAppConfigFields({ proContractorAnnualPrice: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-emerald-400" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">رقم واتساب الإدارة للاشتراكات</label>
                                            <input type="text" dir="ltr" value={appConfig.subscriptionWhatsapp ?? ''} onChange={(e) => updateAppConfigFields({ subscriptionWhatsapp: e.target.value })} placeholder="0770XXXXXXX" className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-mono text-white" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">توثيق العامل شهري</label>
                                            <input type="number" value={appConfig.verifiedWorkerPrice ?? 5000} onChange={(e) => updateAppConfigFields({ verifiedWorkerPrice: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-amber-300" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">توثيق العامل سنوي</label>
                                            <input type="number" value={appConfig.verifiedWorkerAnnualPrice ?? 50000} onChange={(e) => updateAppConfigFields({ verifiedWorkerAnnualPrice: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-amber-300" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">اشتراك المعرض VIP شهري</label>
                                            <input type="number" value={appConfig.proStorePrice ?? 75000} onChange={(e) => updateAppConfigFields({ proStorePrice: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-indigo-300" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 block mb-1">اشتراك المعرض VIP سنوي</label>
                                            <input type="number" value={appConfig.proStoreAnnualPrice ?? 750000} onChange={(e) => updateAppConfigFields({ proStoreAnnualPrice: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-indigo-300" />
                                        </div>
                                    </div>

                                    <button type="submit" disabled={savingId === 'app_config'} className="w-full py-3.5 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg">
                                        {savingId === 'app_config' ? 'جاري الحفظ...' : '💾 حفظ جميع إعدادات النظام والاشتراكات في السحابة'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>

                    {/* ========================================================================= */}
                    {/* ALL MODALS                                                                */}
                    {/* ========================================================================= */}

                    {/* Complete Showroom & Agency Modal */}
                    {editingStore && (
                        <ShowroomEditorModal
                            initialStore={editingStore}
                            onClose={() => setEditingStore(null)}
                            onDelete={handleDeleteStore}
                            addToast={addToast}
                        />
                    )}

                    {/* Complete Product Modal */}
                    {productModalState && (
                        <ProductEditorModal
                            store={productModalState.store}
                            product={productModalState.product}
                            onClose={() => setProductModalState(null)}
                            addToast={addToast}
                        />
                    )}

                    {/* Contractor Modal */}
                    {editingContractor && (
                        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
                            <form onSubmit={handleSaveContractorModal} className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-5 space-y-3.5 shadow-2xl max-h-[90vh] overflow-y-auto">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                    <h3 className="font-black text-base text-white">
                                        {editingContractor.isNew ? '+ إنشاء حساب مقاول جديد' : `✏️ تعديل المقاول: ${editingContractor.name || editingContractor.id}`}
                                    </h3>
                                    <button type="button" onClick={() => setEditingContractor(null)} className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 font-black">✕</button>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 block mb-1">اسم المقاول</label>
                                    <input name="name" defaultValue={editingContractor.name || editingContractor.fullName || editingContractor.id || ''} required className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-bold text-white" />
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">رقم الهاتف</label>
                                        <input name="phone" defaultValue={editingContractor.phone || ''} placeholder="0770XXXXXXX" className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-mono text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">المحافظة</label>
                                        <select name="gov" defaultValue={editingContractor.gov || 'بغداد'} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-bold text-white">
                                            {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                                        <span className="text-xs font-black text-amber-300">👑 باقة Pro</span>
                                        <input type="checkbox" name="isPro" defaultChecked={Boolean(editingContractor.isPro || editingContractor.isVerifiedPro)} className="w-5 h-5" />
                                    </label>
                                    <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                                        <span className="text-xs font-black text-emerald-300">✓ موثق الهاتف</span>
                                        <input type="checkbox" name="isVerifiedIdentity" defaultChecked={editingContractor.isVerifiedIdentity !== false} className="w-5 h-5" />
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">نوع الباقة</label>
                                        <select name="subscriptionPlanLabel" defaultValue={editingContractor.subscriptionPlanLabel || 'شهري'} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-bold text-white">
                                            <option value="شهري">شهري</option>
                                            <option value="3 أشهر">3 أشهر</option>
                                            <option value="6 أشهر">6 أشهر</option>
                                            <option value="سنوي">سنوي</option>
                                            <option value="VIP مفتوح">VIP مفتوح</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">تاريخ الانتهاء</label>
                                        <input type="date" name="subscriptionExpiresAt" defaultValue={editingContractor.subscriptionExpiresAt ? String(editingContractor.subscriptionExpiresAt).split('T')[0] : addDaysIso(30)} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-white" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 block mb-1">{editingContractor.isNew ? 'كلمة المرور (مطلوبة)' : 'تعيين كلمة مرور جديدة (اختياري)'}</label>
                                    <input type="text" name="newPassword" placeholder="كلمة المرور..." className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-mono text-amber-300" />
                                </div>
                                <div className="flex flex-wrap gap-2 pt-2">
                                    <button type="submit" disabled={savingId.startsWith('admin_modal_')} className="flex-1 py-3.5 rounded-2xl bg-emerald-600 text-white font-black text-xs">
                                        {savingId.startsWith('admin_modal_') ? 'جاري الحفظ...' : '💾 حفظ المقاول ✓'}
                                    </button>
                                    {!editingContractor.isNew && (
                                        <button type="button" onClick={() => handleDeleteContractor(editingContractor)} className="px-3.5 py-3.5 rounded-2xl bg-rose-950/80 text-rose-300 border border-rose-700/40 font-black text-xs">🗑️ حذف</button>
                                    )}
                                    <button type="button" onClick={() => setEditingContractor(null)} className="px-4 py-3.5 rounded-2xl bg-slate-800 text-slate-300 font-black text-xs">إلغاء</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Worker Modal */}
                    {editingWorker && (
                        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
                            <form onSubmit={handleSaveWorkerModal} className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-5 space-y-3.5 shadow-2xl max-h-[90vh] overflow-y-auto">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                    <h3 className="font-black text-base text-white">
                                        {editingWorker.isNew ? '+ إضافة عامل / حرفي جديد' : `✏️ تعديل العامل: ${editingWorker.name}`}
                                    </h3>
                                    <button type="button" onClick={() => setEditingWorker(null)} className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 font-black">✕</button>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">اسم الحرفي</label>
                                        <input name="name" defaultValue={editingWorker.name || ''} required className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-bold text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">رقم الهاتف</label>
                                        <input name="phone" defaultValue={editingWorker.phone || ''} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-mono text-white" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">كود الدخول السريع</label>
                                        <input name="loginCode" defaultValue={editingWorker.loginCode || generateWorkerLoginCode()} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-amber-300" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">المقاول المسؤول</label>
                                        <input name="adminId" defaultValue={editingWorker.adminId || ''} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-white" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">التخصص</label>
                                        <select name="specialty" defaultValue={editingWorker.specialty || 'عامل عادي'} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-white">
                                            {SPECIALTIES.map((sp) => <option key={sp} value={sp}>{sp}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">المحافظة</label>
                                        <select name="gov" defaultValue={editingWorker.gov || 'بغداد'} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-white">
                                            {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 block mb-1">أجر المقاول</label>
                                        <input type="number" name="wage" defaultValue={editingWorker.contractorWage ?? editingWorker.wage ?? 35000} className="w-full p-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-black text-emerald-400" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 block mb-1">أجر السوق</label>
                                        <input type="number" name="marketWage" defaultValue={editingWorker.marketWage ?? editingWorker.wage ?? 40000} className="w-full p-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-black text-indigo-300" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 block mb-1">التقييم (0-6)</label>
                                        <input type="number" step="0.1" min="0" max="6" name="ratingScore" defaultValue={editingWorker.ratingScore ?? 4.5} className="w-full p-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-black text-amber-300" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                                        <span className="text-xs font-black text-emerald-300">🌟 معتمد Pro</span>
                                        <input type="checkbox" name="isVerifiedPro" defaultChecked={Boolean(editingWorker.isVerifiedPro)} className="w-5 h-5" />
                                    </label>
                                    <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                                        <span className="text-xs font-black text-indigo-300">متاح بالسوق</span>
                                        <input type="checkbox" name="isAvailable" defaultChecked={editingWorker.isAvailable !== false} className="w-5 h-5" />
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">انتهاء التوثيق</label>
                                        <input type="date" name="subscriptionExpiresAt" defaultValue={editingWorker.subscriptionExpiresAt ? String(editingWorker.subscriptionExpiresAt).split('T')[0] : addDaysIso(30)} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">كلمة مرور جديدة</label>
                                        <input type="text" name="newPassword" placeholder="اختياري..." className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-amber-300" />
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-2">
                                    <button type="submit" disabled={savingId.startsWith('worker_modal_')} className="flex-1 py-3.5 rounded-2xl bg-emerald-600 text-white font-black text-xs">
                                        {savingId.startsWith('worker_modal_') ? 'جاري الحفظ...' : '💾 حفظ العامل ✓'}
                                    </button>
                                    {!editingWorker.isNew && (
                                        <button type="button" onClick={() => handleDeleteWorker(editingWorker)} className="px-3.5 py-3.5 rounded-2xl bg-rose-950/80 text-rose-300 border border-rose-700/40 font-black text-xs">🗑️ حذف</button>
                                    )}
                                    <button type="button" onClick={() => setEditingWorker(null)} className="px-4 py-3.5 rounded-2xl bg-slate-800 text-slate-300 font-black text-xs">إلغاء</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Announcement Modal */}
                    {editingAnnouncement && (
                        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
                            <form onSubmit={handleSaveAnnouncementModal} className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-5 space-y-3.5 shadow-2xl max-h-[92vh] overflow-y-auto">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                    <h3 className="font-black text-base text-white">
                                        {editingAnnouncement.isNew ? '📢 إنشاء إعلان نظام جديد' : `✏️ تعديل الإعلان: ${editingAnnouncement.title}`}
                                    </h3>
                                    <button type="button" onClick={() => setEditingAnnouncement(null)} className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 font-black">✕</button>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 block mb-1">عنوان الإعلان</label>
                                    <input name="title" defaultValue={editingAnnouncement.title || ''} required className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-white" />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 block mb-1">نص وتفاصيل الإعلان</label>
                                    <textarea name="content" rows="3" defaultValue={editingAnnouncement.content || ''} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-white" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">نوع الإعلان</label>
                                        <select name="adType" defaultValue={editingAnnouncement.adType || 'info'} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-white">
                                            {ANNOUNCEMENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">الفئة المستهدفة</label>
                                        <select name="target" defaultValue={editingAnnouncement.target || 'all'} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-white">
                                            {ANNOUNCEMENT_TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">مرات الظهور لكل مستخدم</label>
                                        <input type="number" min="1" max="99" name="maxViews" defaultValue={editingAnnouncement.maxViews || 1} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-black text-amber-300" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">تاريخ الانتهاء (اختياري)</label>
                                        <input type="date" name="expiresAt" defaultValue={editingAnnouncement.expiresAt || ''} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-white" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 block">صورة أو بنر الإعلان (اختياري)</label>
                                    <div className="flex items-center gap-2">
                                        <label className="px-3.5 py-2.5 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-black text-xs cursor-pointer">
                                            🖼️ رفع صورة
                                            <input type="file" accept="image/*" onChange={handleAnnouncementImageUpload} className="hidden" />
                                        </label>
                                        <input name="imageUrl" value={annImgPreview} onChange={(e) => setAnnImgPreview(e.target.value)} placeholder="أو الصق رابط صورة..." className="flex-1 p-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300" />
                                    </div>
                                    {annImgPreview && (
                                        <div className="flex items-center gap-3 pt-1">
                                            <img src={annImgPreview} alt="preview" className="w-20 h-16 rounded-xl object-cover border border-slate-700" />
                                            <button type="button" onClick={() => setAnnImgPreview('')} className="text-xs font-black text-rose-400">حذف الصورة</button>
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">رابط خارجي (اختياري)</label>
                                        <input name="linkUrl" defaultValue={editingAnnouncement.linkUrl || ''} placeholder="https://wa.me/..." className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-indigo-300" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 block mb-1">نص زر الرابط</label>
                                        <input name="buttonLabel" defaultValue={editingAnnouncement.buttonLabel || 'فتح الرابط المرفق'} className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-white" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                                        <span className="text-xs font-black text-emerald-300">🟢 نشط ومرئي</span>
                                        <input type="checkbox" name="isActive" defaultChecked={editingAnnouncement.isActive !== false} className="w-5 h-5" />
                                    </label>
                                    <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                                        <span className="text-xs font-black text-amber-300">📌 تثبيت بالمقدمة</span>
                                        <input type="checkbox" name="isPinned" defaultChecked={Boolean(editingAnnouncement.isPinned)} className="w-5 h-5" />
                                    </label>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-2">
                                    <button type="submit" disabled={savingId.startsWith('ann_modal_')} className="flex-1 py-3.5 rounded-2xl bg-rose-600 text-white font-black text-xs shadow-lg">
                                        {savingId.startsWith('ann_modal_') ? 'جاري النشر...' : '📢 حفظ ونشر الإعلان فوراً'}
                                    </button>
                                    {!editingAnnouncement.isNew && (
                                        <button type="button" onClick={() => handleDeleteAnnouncement(editingAnnouncement)} className="px-3.5 py-3.5 rounded-2xl bg-rose-950/80 text-rose-300 border border-rose-700/40 font-black text-xs">🗑️ حذف</button>
                                    )}
                                    <button type="button" onClick={() => setEditingAnnouncement(null)} className="px-4 py-3.5 rounded-2xl bg-slate-800 text-slate-300 font-black text-xs">إلغاء</button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            );
        };

        const rootElement = document.getElementById('root');
        if (ReactDOM.createRoot) {
            ReactDOM.createRoot(rootElement).render(<PlatformDashboardApp />);
        } else {
            ReactDOM.render(<PlatformDashboardApp />, rootElement);
        }
