const firebaseConfig = {
  apiKey: "AIzaSyDpeicW_gpXfqeuur7g08nQ9Nr0DTIkoaM",
  authDomain: "craftsmanapp-3e46b.firebaseapp.com",
  projectId: "craftsmanapp-3e46b",
  storageBucket: "craftsmanapp-3e46b.firebasestorage.app",
  messagingSenderId: "567712814306",
  appId: "1:567712814306:web:f27769f9ce59af1a22fabb"
};
let db;
try {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  if (firebase.auth) {
    setTimeout(() => {
      try {
        firebase.auth().signInAnonymously().catch(() => {});
      } catch (e) {}
    }, 50);
  }
  db = firebase.firestore();
  try {
    db.enablePersistence().catch(() => {});
  } catch (e) {}
} catch (e) {
  console.error(e);
}
const {
  useState,
  useEffect,
  memo,
  useRef
} = React;
const MASTER_PASSWORD = "waad2026";
const DASHBOARD_VERSION = "1.0.10";
const isDashServerVersionNewer = (serverVer, localVer) => {
  const sParts = String(serverVer || '').trim().replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const lParts = String(localVer || '').trim().replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(sParts.length, lParts.length);
  for (let i = 0; i < len; i++) {
    const sv = sParts[i] || 0;
    const lv = lParts[i] || 0;
    if (sv > lv) return true;
    if (sv < lv) return false;
  }
  return false;
};
const normalizeDashApkUrl = rawUrl => {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  if (/drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com/i.test(withScheme)) {
    const gdMatch = withScheme.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/) || withScheme.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || withScheme.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (gdMatch && gdMatch[1]) {
      return `https://drive.usercontent.google.com/download?id=${gdMatch[1]}&export=download&confirm=t&authuser=0`;
    }
  }
  if (/dropbox\.com/i.test(withScheme)) {
    return withScheme.replace(/\?dl=0\b/, '?dl=1').replace(/&dl=0\b/, '&dl=1');
  }
  return withScheme;
};

// ============================================================================
// AL-OSTA ENTERPRISE CRYPTOGRAPHIC & ACCOUNT SECURITY ENGINE (SHA-256 + HMAC + CTR)
// ============================================================================
const AlOstaCrypto = (() => {
  const MASTER_PEPPER = 'ALOSTA_WAAD_2026_E2EE_PEPPER_V2_9F8A7B6C5D4E3F2A1B';
  const ENCRYPTED_MASK = '🔒 [ENCRYPTED-SHA256]';
  const utf8ToBytes = str => {
    const s = unescape(encodeURIComponent(String(str || '')));
    const arr = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
    return arr;
  };
  const bytesToUtf8 = bytes => {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try {
      return decodeURIComponent(escape(s));
    } catch (e) {
      return s;
    }
  };
  const bytesToHex = bytes => {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += (bytes[i] >>> 4).toString(16) + (bytes[i] & 0x0f).toString(16);
    }
    return hex;
  };
  const hexToBytes = hex => {
    const clean = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
    const out = new Uint8Array(Math.floor(clean.length / 2));
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  };
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const rotr = (n, x) => x >>> n | x << 32 - n;
  const sha256Bytes = msgBytes => {
    const l = msgBytes.length;
    const bitLenHi = Math.floor(l * 8 / 0x100000000);
    const bitLenLo = l * 8 >>> 0;
    const padLen = l + 9 + 63 & ~63;
    const padded = new Uint8Array(padLen);
    padded.set(msgBytes);
    padded[l] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padLen - 8, bitLenHi, false);
    dv.setUint32(padLen - 4, bitLenLo, false);
    let h0 = 0x6a09e667,
      h1 = 0xbb67ae85,
      h2 = 0x3c6ef372,
      h3 = 0xa54ff53a;
    let h4 = 0x510e527f,
      h5 = 0x9b05688c,
      h6 = 0x1f83d9ab,
      h7 = 0x5be0cd19;
    const W = new Uint32Array(64);
    for (let offset = 0; offset < padLen; offset += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(offset + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(7, W[i - 15]) ^ rotr(18, W[i - 15]) ^ W[i - 15] >>> 3;
        const s1 = rotr(17, W[i - 2]) ^ rotr(19, W[i - 2]) ^ W[i - 2] >>> 10;
        W[i] = W[i - 16] + s0 + W[i - 7] + s1 >>> 0;
      }
      let a = h0,
        b = h1,
        c = h2,
        d = h3,
        e = h4,
        f = h5,
        g = h6,
        h = h7;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        const ch = e & f ^ ~e & g;
        const temp1 = h + S1 + ch + K[i] + W[i] >>> 0;
        const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        const maj = a & b ^ a & c ^ b & c;
        const temp2 = S0 + maj >>> 0;
        h = g;
        g = f;
        f = e;
        e = d + temp1 >>> 0;
        d = c;
        c = b;
        b = a;
        a = temp1 + temp2 >>> 0;
      }
      h0 = h0 + a >>> 0;
      h1 = h1 + b >>> 0;
      h2 = h2 + c >>> 0;
      h3 = h3 + d >>> 0;
      h4 = h4 + e >>> 0;
      h5 = h5 + f >>> 0;
      h6 = h6 + g >>> 0;
      h7 = h7 + h >>> 0;
    }
    const out = new Uint8Array(32);
    const outDv = new DataView(out.buffer);
    outDv.setUint32(0, h0, false);
    outDv.setUint32(4, h1, false);
    outDv.setUint32(8, h2, false);
    outDv.setUint32(12, h3, false);
    outDv.setUint32(16, h4, false);
    outDv.setUint32(20, h5, false);
    outDv.setUint32(24, h6, false);
    outDv.setUint32(28, h7, false);
    return out;
  };
  const sha256Hex = str => bytesToHex(sha256Bytes(utf8ToBytes(str)));
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
  const hmacSha256Hex = (keyStr, msgStr) => bytesToHex(hmacSha256Bytes(utf8ToBytes(keyStr), utf8ToBytes(msgStr)));
  const constantTimeEqual = (a, b) => {
    const sa = String(a || '');
    const sb = String(b || '');
    if (sa.length !== sb.length) return false;
    let diff = 0;
    for (let i = 0; i < sa.length; i++) {
      diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
    }
    return diff === 0;
  };
  const hashPassword = (rawPassword, saltContext = '') => {
    const pwd = String(rawPassword || '').trim();
    const normSalt = String(saltContext || 'default').trim().toLowerCase();
    const saltHex = sha256Hex(`salt::${MASTER_PEPPER}::${normSalt}`).substring(0, 24);
    const keyBytes = utf8ToBytes(`${MASTER_PEPPER}::${saltHex}::${normSalt}`);
    let state = utf8ToBytes(`${pwd}::${saltHex}`);
    for (let r = 0; r < 128; r++) {
      state = hmacSha256Bytes(keyBytes, state);
    }
    return `v2$sha256$${saltHex}$${bytesToHex(state)}`;
  };
  const encryptSecret = (plainText, contextKey = '') => {
    const text = String(plainText || '');
    if (!text || text.startsWith('enc2$')) return text;
    const normCtx = String(contextKey || 'global').trim().toLowerCase();
    const ivSeed = `${Date.now()}_${Math.random()}_${text.length}`;
    const ivHex = sha256Hex(ivSeed).substring(0, 24);
    const plainBytes = utf8ToBytes(text);
    const cipherBytes = new Uint8Array(plainBytes.length);
    const encKeyStr = `enc::${MASTER_PEPPER}::${normCtx}`;
    for (let offset = 0; offset < plainBytes.length; offset += 32) {
      const blockIdx = Math.floor(offset / 32);
      const keystream = hmacSha256Bytes(utf8ToBytes(encKeyStr), utf8ToBytes(`${ivHex}::${blockIdx}`));
      const chunkLen = Math.min(32, plainBytes.length - offset);
      for (let j = 0; j < chunkLen; j++) {
        cipherBytes[offset + j] = plainBytes[offset + j] ^ keystream[j];
      }
    }
    const cipherHex = bytesToHex(cipherBytes);
    const macHex = hmacSha256Hex(`mac::${MASTER_PEPPER}::${normCtx}`, `${ivHex}$${cipherHex}`).substring(0, 32);
    return `enc2$${ivHex}$${cipherHex}$${macHex}`;
  };
  const decryptSecret = (cipherEnvelope, contextKey = '') => {
    const env = String(cipherEnvelope || '');
    if (!env.startsWith('enc2$')) return env;
    const parts = env.split('$');
    if (parts.length !== 4) return '';
    const [, ivHex, cipherHex, macHex] = parts;
    const normCtx = String(contextKey || 'global').trim().toLowerCase();
    const expectedMac = hmacSha256Hex(`mac::${MASTER_PEPPER}::${normCtx}`, `${ivHex}$${cipherHex}`).substring(0, 32);
    if (!constantTimeEqual(macHex, expectedMac)) return '';
    const cipherBytes = hexToBytes(cipherHex);
    const plainBytes = new Uint8Array(cipherBytes.length);
    const encKeyStr = `enc::${MASTER_PEPPER}::${normCtx}`;
    for (let offset = 0; offset < cipherBytes.length; offset += 32) {
      const blockIdx = Math.floor(offset / 32);
      const keystream = hmacSha256Bytes(utf8ToBytes(encKeyStr), utf8ToBytes(`${ivHex}::${blockIdx}`));
      const chunkLen = Math.min(32, cipherBytes.length - offset);
      for (let j = 0; j < chunkLen; j++) {
        plainBytes[offset + j] = cipherBytes[offset + j] ^ keystream[j];
      }
    }
    return bytesToUtf8(plainBytes);
  };
  const buildProtectedCredentials = (rawPassword, saltContext = '') => {
    const clean = String(rawPassword || '').trim();
    return {
      passwordHash: hashPassword(clean, saltContext),
      passwordCipher: encryptSecret(clean, saltContext),
      password: ENCRYPTED_MASK,
      securityVersion: 2,
      securityUpdatedAt: new Date().toISOString()
    };
  };
  const revealPassword = (docData, saltContext = '') => {
    if (!docData) return '';
    if (docData.passwordCipher) {
      const dec = decryptSecret(docData.passwordCipher, saltContext);
      if (dec) return dec;
    }
    if (docData.password && docData.password !== ENCRYPTED_MASK) {
      return String(docData.password);
    }
    return '';
  };
  const verifyPassword = (inputPassword, docData, saltContext = '') => {
    if (!docData) return {
      valid: false,
      needsUpgrade: false
    };
    const cleanInput = String(inputPassword || '').trim();
    if (!cleanInput) return {
      valid: false,
      needsUpgrade: false
    };
    if (docData.passwordHash) {
      const computed = hashPassword(cleanInput, saltContext);
      if (constantTimeEqual(computed, docData.passwordHash)) {
        const hasPlain = docData.password && docData.password !== ENCRYPTED_MASK;
        return {
          valid: true,
          needsUpgrade: !!hasPlain
        };
      }
    }
    if (docData.passwordCipher) {
      const dec = decryptSecret(docData.passwordCipher, saltContext);
      if (dec && constantTimeEqual(dec, cleanInput)) {
        return {
          valid: true,
          needsUpgrade: !docData.passwordHash || docData.password && docData.password !== ENCRYPTED_MASK
        };
      }
    }
    if (docData.password && docData.password !== ENCRYPTED_MASK) {
      if (constantTimeEqual(String(docData.password).trim(), cleanInput)) {
        return {
          valid: true,
          needsUpgrade: true
        };
      }
    }
    return {
      valid: false,
      needsUpgrade: false
    };
  };
  const saveSecureSession = (storageKey, sessionObj) => {
    try {
      const raw = JSON.stringify(sessionObj);
      const enc = encryptSecret(raw, `session::${storageKey}`);
      localStorage.setItem(storageKey, enc);
    } catch (e) {}
  };
  const loadSecureSession = storageKey => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;
      if (stored.startsWith('enc2$')) {
        const dec = decryptSecret(stored, `session::${storageKey}`);
        return dec ? JSON.parse(dec) : null;
      }
      const parsed = JSON.parse(stored);
      if (parsed) saveSecureSession(storageKey, parsed);
      return parsed;
    } catch (e) {
      return null;
    }
  };
  const sanitizeText = (val, maxLen = 300) => {
    return String(val || '').replace(/<\s*\/?\s*script[^>]*>/gi, '').replace(/javascript\s*:/gi, '').replace(/vbscript\s*:/gi, '').replace(/on\w+\s*=/gi, '').trim().slice(0, maxLen);
  };
  const sanitizeImageUrl = rawUrl => {
    const s = String(rawUrl || '').trim();
    if (!s) return '';
    if (s.startsWith('data:image/')) return s;
    if (/^https?:\/\//i.test(s) && !/javascript\s*:/i.test(s)) return s;
    return '';
  };
  const buildSafeStoreContactPayload = (inputObj = {}, fallbackStore = {}) => {
    // Strictly whitelist contact & delivery fields only.
    // Financial fields (paymentMethod, paymentAccountNumber, paymentAccountHolder, paymentQrImage)
    // and administrative fields (portalCode, isVipStore) can NEVER be included here.
    const safePhone = sanitizeText(inputObj.phone, 30).replace(/[^\d+\-\s()]/g, '').trim();
    const safeGov = sanitizeText(inputObj.gov || fallbackStore.gov || 'بغداد', 40) || 'بغداد';
    const safeAddress = sanitizeText(inputObj.address, 200);
    const safeWorkHours = sanitizeText(inputObj.workHours, 80) || '8:00 ص - 8:00 م';
    const safeDelivery = inputObj.hasDelivery !== undefined ? Boolean(inputObj.hasDelivery) : Boolean(fallbackStore.hasDelivery);
    return Object.freeze({
      phone: safePhone,
      gov: safeGov,
      address: safeAddress,
      workHours: safeWorkHours,
      hasDelivery: safeDelivery,
      updatedAt: new Date().toISOString()
    });
  };
  return {
    ENCRYPTED_MASK,
    constantTimeEqual,
    hashPassword,
    encryptSecret,
    decryptSecret,
    buildProtectedCredentials,
    revealPassword,
    verifyPassword,
    saveSecureSession,
    loadSecureSession,
    sanitizeText,
    sanitizeImageUrl,
    buildSafeStoreContactPayload
  };
})();
const GOVERNORATES = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'النجف', 'كربلاء', 'بابل', 'الأنبار', 'ديالى', 'كركوك', 'صلاح الدين', 'واسط', 'ميسان', 'ذي قار', 'المثنى', 'القادسية', 'السليمانية', 'دهوك'];
const STORE_TYPES = [{
  id: 'paint_agency',
  label: '🎯 وكالة أصباغ معتمدة (كتالوج ألوان خاص بالوكالة فقط)',
  shortLabel: '🎯 وكالة أصباغ',
  badgeClass: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 border border-fuchsia-300 dark:border-fuchsia-700'
}, {
  id: 'paint',
  label: '🎨 معرض أصباغ ودهانات عام',
  shortLabel: '🎨 معرض أصباغ',
  badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
}, {
  id: 'gypsum_board',
  label: '⬜ وكالة / معرض جبس بورد وبوردكس',
  shortLabel: '⬜ جبس بورد',
  badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300'
}, {
  id: 'decor',
  label: '✨ معرض ديكورات جبس وفوم وكرانيش',
  shortLabel: '✨ ديكورات وفوم',
  badgeClass: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300'
}, {
  id: 'both',
  label: '🏢 مركز شامل (أصباغ وجبس بورد وديكور)',
  shortLabel: '🏢 مركز شامل',
  badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
}, {
  id: 'general',
  label: '🛠️ مركز العدد اليدوية ومستلزمات التنفيذ',
  shortLabel: '🛠️ عدد ومستلزمات',
  badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
}];
const PAINT_AGENCY_BRANDS = [{
  id: 'jotun',
  label: 'جوتن (Jotun)',
  desc: 'كتالوج جوتن الحصري (294 كود لون أصلي)',
  icon: '🎨',
  badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700'
}, {
  id: 'berger',
  label: 'برجر (Berger)',
  desc: 'كتالوج ألوان برجر المعتمد فقط',
  icon: '🎨',
  badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
}, {
  id: 'san_marco',
  label: 'بلو - سان ماركو (Blue / San Marco)',
  desc: 'كتالوج ألوان بلو (سان ماركو) الإيطالي فقط',
  icon: '🇮🇹',
  badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-300 dark:border-sky-700'
}, {
  id: 'loggia',
  label: 'لوجيا الإيطالية (Loggia)',
  desc: 'كتالوج ألوان وديكورات لوجيا الإيطالية فقط',
  icon: '✨',
  badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-300 dark:border-purple-700'
}, {
  id: 'betek',
  label: 'بيتك التركية (Betek)',
  desc: 'وكالة بيتك المعتمدة (اسم الشركة فقط)',
  icon: '🏷️',
  badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
}, {
  id: 'national',
  label: 'ناشونال (National)',
  desc: 'وكالة ناشونال المعتمدة (اسم الشركة فقط)',
  icon: '🏷️',
  badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
}];
const PRODUCT_CATEGORIES = [{
  id: 'paint',
  label: '🎨 الأصباغ والدهانات والمعجون',
  shortLabel: 'الأصباغ والدهانات',
  icon: '🎨',
  badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
}, {
  id: 'interior_paint',
  label: '🏠 أصباغ داخلية',
  shortLabel: 'أصباغ داخلية',
  icon: '🏠',
  badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
}, {
  id: 'exterior_paint',
  label: '🏢 أصباغ واجهات خارجية',
  shortLabel: 'أصباغ واجهات خارجية',
  icon: '🏢',
  badgeClass: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
}, {
  id: 'putty_primer',
  label: '🪣 المعجون والأساس والعوازل',
  shortLabel: 'المعجون والأساس',
  icon: '🪣',
  badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
}, {
  id: 'decor_paint',
  label: '✨ أصباغ ديكورية وإيطالية',
  shortLabel: 'أصباغ ديكورية',
  icon: '✨',
  badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
}, {
  id: 'gypsum_board',
  label: '⬜ ألواح الجبس بورد والبوردكس والهياكل',
  shortLabel: 'ألواح الجبس بورد',
  icon: '⬜',
  badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300'
}, {
  id: 'gypsum_profiles',
  label: '🔩 مقاطع الحديد والهياكل والاكسسوارات',
  shortLabel: 'مقاطع الحديد والهياكل',
  icon: '🔩',
  badgeClass: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
}, {
  id: 'decor',
  label: '🏛️ ديكورات الجبس والفوم والكرانيش والإنارة',
  shortLabel: 'ديكورات الفوم والجبس',
  icon: '🏛️',
  badgeClass: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300'
}, {
  id: 'tools',
  label: '🛠️ العدد والأدوات ومستلزمات التنفيذ',
  shortLabel: 'العدد والأدوات',
  icon: '🛠️',
  badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
}];
const getDefaultSectionsForStoreType = storeType => {
  const pick = ids => PRODUCT_CATEGORIES.filter(c => ids.includes(c.id)).map(c => ({
    id: c.id,
    label: c.shortLabel || c.label.replace(/^[^\s]+\s/, ''),
    icon: c.icon
  }));
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
    return pick(['tools', 'putty_primer']);
  }
  return pick(['paint', 'gypsum_board', 'decor', 'tools']);
};
const getStoreSectionsList = store => {
  if (Array.isArray(store?.customSections) && store.customSections.length > 0) {
    return store.customSections.filter(s => s && s.id && s.label);
  }
  return getDefaultSectionsForStoreType(store?.storeType || 'both');
};
const resolveCategoryBadge = (catId, storeContext = null, customLabel = '') => {
  const storeSecs = storeContext ? getStoreSectionsList(storeContext) : [];
  const fromStore = storeSecs.find(s => s.id === catId);
  const fromStatic = PRODUCT_CATEGORIES.find(c => c.id === catId);
  if (fromStore) {
    return {
      id: fromStore.id,
      label: `${fromStore.icon || '📂'} ${fromStore.label}`,
      icon: fromStore.icon || '📂',
      badgeClass: fromStatic?.badgeClass || 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
    };
  }
  if (fromStatic) return fromStatic;
  if (customLabel) {
    return {
      id: catId || 'custom',
      label: `📂 ${customLabel}`,
      icon: '📂',
      badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
    };
  }
  return PRODUCT_CATEGORIES[0];
};
const GOV_COORDS = {
  'بغداد': {
    lat: 33.3152,
    lng: 44.3661
  },
  'البصرة': {
    lat: 30.5081,
    lng: 47.7835
  },
  'نينوى': {
    lat: 36.3489,
    lng: 43.1577
  },
  'أربيل': {
    lat: 36.1901,
    lng: 44.0091
  },
  'النجف': {
    lat: 32.0000,
    lng: 44.3333
  },
  'كربلاء': {
    lat: 32.6160,
    lng: 44.0249
  },
  'بابل': {
    lat: 32.4637,
    lng: 44.4196
  },
  'الأنبار': {
    lat: 33.4259,
    lng: 43.2995
  },
  'ديالى': {
    lat: 33.7485,
    lng: 44.6433
  },
  'كركوك': {
    lat: 35.4681,
    lng: 44.3922
  },
  'صلاح الدين': {
    lat: 34.6111,
    lng: 43.6782
  },
  'واسط': {
    lat: 32.5128,
    lng: 45.8182
  },
  'ميسان': {
    lat: 31.8389,
    lng: 47.1450
  },
  'ذي قار': {
    lat: 31.0439,
    lng: 46.2573
  },
  'المثنى': {
    lat: 31.3320,
    lng: 45.2940
  },
  'القادسية': {
    lat: 31.9929,
    lng: 44.9255
  },
  'السليمانية': {
    lat: 35.5558,
    lng: 45.4351
  },
  'دهوك': {
    lat: 36.8671,
    lng: 42.9884
  }
};
const normalizeDigits = str => String(str || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const extractUrlFromText = str => {
  if (!str) return '';
  const m = String(str).match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0].trim() : '';
};
const parseDmsCoords = str => {
  const dmsRegex = /(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['’′]\s*(\d{1,2}(?:\.\d+)?)\s*["”″]?\s*([NSnsشج])[\s,،/]+(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['’′]\s*(\d{1,2}(?:\.\d+)?)\s*["”″]?\s*([EWewشق])/;
  const m = str.match(dmsRegex);
  if (!m) return null;
  let lat = parseFloat(m[1]) + parseFloat(m[2]) / 60 + parseFloat(m[3]) / 3600;
  if (/[Ssج]/.test(m[4])) lat = -lat;
  let lng = parseFloat(m[5]) + parseFloat(m[6]) / 60 + parseFloat(m[7]) / 3600;
  if (/[Wwغ]/.test(m[8])) lng = -lng;
  if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return {
      lat,
      lng
    };
  }
  return null;
};
const extractCoords = input => {
  if (!input) return null;
  if (typeof input === 'object') {
    if (input.lat !== undefined && input.lng !== undefined) {
      const lat = parseFloat(normalizeDigits(input.lat));
      const lng = parseFloat(normalizeDigits(input.lng));
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return {
          lat,
          lng,
          raw: input.raw || input.url || `${lat}, ${lng}`,
          url: input.url || extractUrlFromText(input.raw || '')
        };
      }
    }
    if (input.raw || input.url) {
      return extractCoords(input.raw || input.url);
    }
    return null;
  }
  const rawStr = String(input).trim();
  if (!rawStr) return null;
  let decoded = rawStr;
  try {
    decoded = decodeURIComponent(rawStr);
  } catch (e) {}
  const str = normalizeDigits(decoded).trim();
  const foundUrl = extractUrlFromText(rawStr);
  const dms = parseDmsCoords(str);
  if (dms) {
    return {
      lat: dms.lat,
      lng: dms.lng,
      raw: rawStr,
      url: foundUrl
    };
  }
  const patterns = [/@(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/, /[?&](?:q|ll|query|center|destination|daddr|saddr|loc)=(-?\d{1,2}\.\d+)\s*(?:,|%2C|\s+)\s*\+?(-?\d{1,3}\.\d+)/i, /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, /\/(?:place|search|dir)\/[^/]*?(-?\d{1,2}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/i, /geo:(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i, /\[null,null,(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]/, /(-?\d{1,2}\.\d+)\s*[,،\s/]+\s*\+?(-?\d{1,3}\.\d+)/];
  for (const regex of patterns) {
    const m = str.match(regex);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return {
          lat,
          lng,
          raw: rawStr,
          url: foundUrl
        };
      }
    }
  }
  const revMatch = str.match(/!2d(-?\d{1,3}\.\d+)!3d(-?\d{1,2}\.\d+)/);
  if (revMatch) {
    const lng = parseFloat(revMatch[1]);
    const lat = parseFloat(revMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return {
        lat,
        lng,
        raw: rawStr,
        url: foundUrl
      };
    }
  }
  return null;
};
const resolveLocationData = async (rawInput, govFallback = 'بغداد', addressFallback = '') => {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) return null;
  const direct = extractCoords(trimmed);
  if (direct) return direct;
  const urlInText = extractUrlFromText(trimmed);

  // 1. Try native Android bridge to unshorten maps.app.goo.gl / goo.gl/maps links without CORS issues
  if (urlInText && window.AndroidApp && typeof window.AndroidApp.resolveShortMapUrl === 'function') {
    try {
      const resJson = window.AndroidApp.resolveShortMapUrl(trimmed);
      if (resJson) {
        const parsed = JSON.parse(resJson);
        if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
          return {
            lat: parsed.lat,
            lng: parsed.lng,
            raw: trimmed,
            url: urlInText,
            resolvedUrl: parsed.resolvedUrl || urlInText
          };
        }
        if (parsed && parsed.resolvedUrl) {
          const fromResolved = extractCoords(parsed.resolvedUrl);
          if (fromResolved) {
            return {
              ...fromResolved,
              raw: trimmed,
              url: urlInText,
              resolvedUrl: parsed.resolvedUrl
            };
          }
        }
      }
    } catch (e) {}
  }

  // 2. Try geocoding place name / query if present
  let searchQuery = '';
  if (urlInText) {
    try {
      const u = new URL(urlInText);
      const qParam = u.searchParams.get('q') || u.searchParams.get('query') || '';
      const placeMatch = u.pathname.match(/\/place\/([^/]+)/i);
      searchQuery = qParam || (placeMatch ? decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')) : '');
    } catch (e) {}
  } else {
    searchQuery = trimmed;
  }
  if (searchQuery && searchQuery.length >= 2 && !/^https?:\/\//i.test(searchQuery)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const queryWithGov = `${searchQuery} ${govFallback || ''} العراق`.trim();
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(queryWithGov)}`, {
        signal: controller.signal,
        headers: {
          'Accept-Language': 'ar,en'
        }
      });
      clearTimeout(timer);
      if (resp.ok) {
        const arr = await resp.json();
        if (Array.isArray(arr) && arr.length > 0 && arr[0].lat && arr[0].lon) {
          const lat = parseFloat(arr[0].lat);
          const lng = parseFloat(arr[0].lon);
          if (!isNaN(lat) && !isNaN(lng)) {
            return {
              lat,
              lng,
              raw: trimmed,
              url: urlInText
            };
          }
        }
      }
    } catch (e) {}
  }

  // 3. Always preserve the pasted location link/text with governorate fallback coordinates so it is NEVER lost
  const govCenter = GOV_COORDS[govFallback] || GOV_COORDS['بغداد'];
  return {
    lat: govCenter.lat,
    lng: govCenter.lng,
    raw: trimmed,
    url: urlInText || (trimmed.startsWith('http') ? trimmed : ''),
    isSavedLink: true
  };
};
const SAMPLE_STORES = [{
  name: 'مركز جوتن للأصباغ والديكورات الحديثة',
  storeType: 'paint',
  gov: 'بغداد',
  address: 'بغداد - الكرادة خارج - قرب تقاطع المسبح',
  phone: '07701234567',
  badge: 'وكيل جوتن معتمد ✓',
  workHours: '8:00 ص - 9:00 م',
  hasDelivery: true,
  isActive: true,
  paymentMethod: 'zaincash',
  paymentAccountNumber: '07701234567',
  paymentAccountHolder: 'مركز جوتن للأصباغ - الكرادة',
  notes: 'تلوين بالكمبيوتر فوري + توصيل سريع لمواقع العمل والورش بأسعار الجملة',
  location: {
    lat: 33.2985,
    lng: 44.4228,
    raw: '33.2985, 44.4228'
  }
}, {
  name: 'وكالة كناوف وبوردكس للجبس بورد والديكور',
  storeType: 'gypsum_board',
  gov: 'بغداد',
  address: 'بغداد - شارع الصناعة / ساحة التحريات',
  phone: '07801234567',
  badge: 'توصيل لموقع العمل 🚚',
  workHours: '7:30 ص - 8:00 م',
  hasDelivery: true,
  isActive: true,
  paymentMethod: 'superqi',
  paymentAccountNumber: '7108452910',
  paymentAccountHolder: 'وكالة كناوف للجبس بورد',
  notes: 'ألواح جبس بورد ألماني وتركي + بوردكس خارجي + جسور وزوايا وفوم ديكوري',
  location: {
    lat: 33.3128,
    lng: 44.4462,
    raw: '33.3128, 44.4462'
  }
}, {
  name: 'المعرض الملكي للأصباغ وديكورات الجبس بورد الشامل',
  storeType: 'both',
  gov: 'بغداد',
  address: 'بغداد - المنصور - شارع 14 رمضان',
  phone: '07719876543',
  badge: 'خصم خاص للمقاولين 🔥',
  workHours: '8:00 ص - 10:00 م',
  hasDelivery: true,
  isActive: true,
  paymentMethod: 'fib',
  paymentAccountNumber: '07719876543',
  paymentAccountHolder: 'المعرض الملكي للأصباغ والجبس بورد',
  notes: 'تجهيز كافة مواد الأصباغ والجبس بورد والكرانيش والعدد اليدوية للمشاريع',
  location: {
    lat: 33.3182,
    lng: 44.3485,
    raw: '33.3182, 44.3485'
  }
}];
const makeSvgProductImg = (bg1, bg2, accent, iconText, titleText, subText) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
                <defs>
                    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="${bg1}"/>
                        <stop offset="100%" stop-color="${bg2}"/>
                    </linearGradient>
                </defs>
                <rect width="320" height="240" rx="28" fill="url(#g)"/>
                <circle cx="265" cy="45" r="55" fill="${accent}" fill-opacity="0.16"/>
                <circle cx="45" cy="200" r="65" fill="#ffffff" fill-opacity="0.08"/>
                <rect x="24" y="22" width="110" height="28" rx="14" fill="#ffffff" fill-opacity="0.18"/>
                <text x="79" y="41" font-family="Cairo, sans-serif" font-size="13" font-weight="800" fill="#ffffff" text-anchor="middle">${subText}</text>
                <text x="160" y="122" font-family="Cairo, sans-serif" font-size="56" text-anchor="middle">${iconText}</text>
                <rect x="20" y="162" width="280" height="54" rx="16" fill="#0f172a" fill-opacity="0.55"/>
                <text x="160" y="195" font-family="Cairo, sans-serif" font-size="17" font-weight="900" fill="#ffffff" text-anchor="middle">${titleText}</text>
            </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
};
const PRESET_PRODUCT_IMAGES = [{
  label: '🎨 دبة صبغ جوتن',
  icon: '🎨',
  url: makeSvgProductImg('#312e81', '#4f46e5', '#fbbf24', '🎨', 'صبغ جوتن فينوماستيك', 'JOTUN 18L')
}, {
  label: '🏢 صبغ واجهات',
  icon: '🏢',
  url: makeSvgProductImg('#0f766e', '#0d9488', '#38bdf8', '🏢', 'صبغ واجهات جوتاشيلد', 'EXTERIOR 18L')
}, {
  label: '🪣 معجون جدران',
  icon: '🪣',
  url: makeSvgProductImg('#b45309', '#d97706', '#fde68a', '🪣', 'معجون جدران سوبر فيت', 'PUTTY 25KG')
}, {
  label: '🛡️ برايمر أساس',
  icon: '🛡️',
  url: makeSvgProductImg('#1e3a8a', '#2563eb', '#93c5fd', '🛡️', 'سيلر وبرايمر أساس مائي', 'PRIMER 18L')
}, {
  label: '⬜ جبس بورد أبيض',
  icon: '⬜',
  url: makeSvgProductImg('#334155', '#475569', '#38bdf8', '⬜', 'لوح جبس بورد قياسي', 'KNAUF 12.5mm')
}, {
  label: '🟩 جبس بورد أخضر',
  icon: '🟩',
  url: makeSvgProductImg('#065f46', '#059669', '#6ee7b7', '🟩', 'جبس بورد مقاوم للرطوبة', 'MOISTURE')
}, {
  label: '🟧 لوح بوردكس',
  icon: '🟧',
  url: makeSvgProductImg('#9a3412', '#ea580c', '#fdba74', '🟧', 'لوح بوردكس خارجي', 'BOARDEX')
}, {
  label: '🔩 حديد هيكل جبس',
  icon: '🔩',
  url: makeSvgProductImg('#1e293b', '#334155', '#94a3b8', '🔩', 'جسور وزوايا حديد مغلون', 'PROFILES 3M')
}, {
  label: '✨ كرانيش فوم',
  icon: '✨',
  url: makeSvgProductImg('#701a75', '#a21caf', '#f0abfc', '✨', 'كرانيش وإطارات فوم ملكي', 'DECOR FOAM')
}, {
  label: '🏛️ بديل الرخام',
  icon: '🏛️',
  url: makeSvgProductImg('#111827', '#374151', '#fbbf24', '🏛️', 'ألواح بديل الرخام والخشب', 'PVC / WPC')
}, {
  label: '💡 إنارة مخفية LED',
  icon: '💡',
  url: makeSvgProductImg('#4c1d95', '#7c3aed', '#fde047', '💡', 'شريط إنارة مخفية للجبس', 'LED STRIP 5M')
}, {
  label: '🖌️ عدة صبغ ورولات',
  icon: '🖌️',
  url: makeSvgProductImg('#047857', '#10b981', '#a7f3d0', '🖌️', 'طقم رولات وفرش وشفر', 'PRO TOOLS')
}];

// Ultra-compact WebP compression (~15-25KB per product photo) with JPEG fallback
const compressImageFileToDataUrl = (file, maxDim = 460, quality = 0.72) => new Promise((resolve, reject) => {
  if (!file) return reject(new Error('No file'));
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round(h * maxDim / w);
          w = maxDim;
        } else {
          w = Math.round(w * maxDim / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const webpUrl = canvas.toDataURL('image/webp', quality);
      if (webpUrl && webpUrl.startsWith('data:image/webp')) {
        resolve(webpUrl);
      } else {
        resolve(canvas.toDataURL('image/jpeg', quality));
      }
    };
    img.onerror = reject;
    img.src = ev.target.result;
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});
const compressImageToBase64 = compressImageFileToDataUrl;
const SAMPLE_PRODUCTS = [
// Store 0: مركز جوتن للأصباغ والديكورات الحديثة
{
  storeIndex: 0,
  name: 'صبغ جوتن فينوماستيك مذهل (مطفي / حريري) 18 لتر',
  category: 'paint',
  brand: 'Jotun جوتن',
  price: 85000,
  oldPrice: 95000,
  unit: 'دبة 18 لتر',
  icon: '🎨',
  imageUrl: PRESET_PRODUCT_IMAGES[0].url,
  desc: 'دهان داخلي فاخر قابل للغسيل بتغطية فائقة وألوان كمبيوتر',
  inStock: true
}, {
  storeIndex: 0,
  name: 'صبغ واجهات خارجي جوتاشيلد مقاوم للعوامل الجوية 18 لتر',
  category: 'paint',
  brand: 'Jotun جوتن',
  price: 110000,
  oldPrice: 120000,
  unit: 'دبة 18 لتر',
  icon: '🏢',
  imageUrl: PRESET_PRODUCT_IMAGES[1].url,
  desc: 'حماية فائقة للواجهات ضد الشمس والأمطار والغبار',
  inStock: true
}, {
  storeIndex: 0,
  name: 'معجون جدران جاهز سوبر فيت (داخلي/خارجي) 25 كغم',
  category: 'paint',
  brand: 'National ناشونال',
  price: 22000,
  oldPrice: 25000,
  unit: 'دبة 25 كغم',
  icon: '🪣',
  imageUrl: PRESET_PRODUCT_IMAGES[2].url,
  desc: 'معجون ناعم عالي الالتصاق لتنعيم الجدران والأسقف قبل الصبغ',
  inStock: true
}, {
  storeIndex: 0,
  name: 'برايمر أساس مائي مقاوم للرطوبة والأملاح 18 لتر',
  category: 'paint',
  brand: 'Jotun جوتن',
  price: 48000,
  oldPrice: 55000,
  unit: 'دبة 18 لتر',
  icon: '🛡️',
  imageUrl: PRESET_PRODUCT_IMAGES[3].url,
  desc: 'أساس عازل يضمن ثبات الصبغ ومنع التقشر والرطوبة',
  inStock: true
},
// Store 1: وكالة كناوف وبوردكس للجبس بورد والديكور
{
  storeIndex: 1,
  name: 'لوح جبس بورد أبيض قياسي Knauf (12.5 ملم • 120×240 سم)',
  category: 'gypsum_board',
  brand: 'Knauf كناوف',
  price: 9500,
  oldPrice: 11000,
  unit: 'لوح',
  icon: '⬜',
  imageUrl: PRESET_PRODUCT_IMAGES[4].url,
  desc: 'لوح جبس بورد قياسي للأسقف الثانوية والقواطع الجدارية',
  inStock: true
}, {
  storeIndex: 1,
  name: 'لوح جبس بورد أخضر مقاوم للرطوبة (مطابخ وحمامات)',
  category: 'gypsum_board',
  brand: 'Knauf كناوف',
  price: 12500,
  oldPrice: 14000,
  unit: 'لوح',
  icon: '🟩',
  imageUrl: PRESET_PRODUCT_IMAGES[5].url,
  desc: 'معالج ضد الرطوبة والأبخرة للمطابخ والحمامات والمناطق الرطبة',
  inStock: true
}, {
  storeIndex: 1,
  name: 'لوح بوردكس خارجي مقاوم للماء والحريق (Boardex 12.5mm)',
  category: 'gypsum_board',
  brand: 'Boardex بوردكس',
  price: 24000,
  oldPrice: 27000,
  unit: 'لوح',
  icon: '🟧',
  imageUrl: PRESET_PRODUCT_IMAGES[6].url,
  desc: 'لوح مغلف بالفايبر كلاس للواجهات الخارجية والديكورات المعرضة للماء',
  inStock: true
}, {
  storeIndex: 1,
  name: 'طقم حديد هيكل جبس بورد (جسور C + أوميجا + زوايا L - سماكة ثقيلة)',
  category: 'gypsum_board',
  brand: 'تركي مغلون',
  price: 3500,
  oldPrice: 4000,
  unit: 'قطعة (3 متر)',
  icon: '🔩',
  imageUrl: PRESET_PRODUCT_IMAGES[7].url,
  desc: 'مقاطع حديد مغلون مقاوم للصدأ لتثبيت الأسقف والقواطع الجبسية',
  inStock: true
}, {
  storeIndex: 1,
  name: 'معجون مفاصل جبس بورد + شريط فايبر شبكي (طقم معالجة فواصل)',
  category: 'gypsum_board',
  brand: 'Knauf Uniflott',
  price: 18000,
  oldPrice: 20000,
  unit: 'كيس + رولة',
  icon: '🩹',
  imageUrl: PRESET_PRODUCT_IMAGES[4].url,
  desc: 'معجون خاص لمنع التشققات في مفاصل ألواح الجبس بورد والبوردكس',
  inStock: true
}, {
  storeIndex: 1,
  name: 'كارتون براغي جبس بورد سوداء ناعمة/خشنة (1000 برغي) + فيشرات',
  category: 'tools',
  brand: 'أصلي صلب',
  price: 8000,
  oldPrice: 9500,
  unit: 'كارتون',
  icon: '🛠️',
  imageUrl: PRESET_PRODUCT_IMAGES[7].url,
  desc: 'براغي فوسفات سوداء سريعة الاختراق لتثبيت ألواح الجبس والحديد',
  inStock: true
},
// Store 2: المعرض الملكي للأصباغ وديكورات الجبس بورد الشامل
{
  storeIndex: 2,
  name: 'كرانيش وإطارات فوم ديكوري ملكي للجدران والأسقف (عرض 8 سم)',
  category: 'decor',
  brand: 'كوري فاخر',
  price: 6000,
  oldPrice: 7500,
  unit: 'قطعة (2.4 متر)',
  icon: '✨',
  imageUrl: PRESET_PRODUCT_IMAGES[8].url,
  desc: 'إطارات فوم مقاومة للماء قابلة للصبغ لعمل براويز الجدران والأسقف',
  inStock: true
}, {
  storeIndex: 2,
  name: 'ألواح بديل الرخام والخشب الديكوري (PVC / WPC) للجدران والتلفزيون',
  category: 'decor',
  brand: 'تركي ممتاز',
  price: 28000,
  oldPrice: 33000,
  unit: 'لوح',
  icon: '🏛️',
  imageUrl: PRESET_PRODUCT_IMAGES[9].url,
  desc: 'تشطيب عصري فخم لديكورات الشاشات والمداخل مع عزل صوتي وحراري',
  inStock: true
}, {
  storeIndex: 2,
  name: 'شريط إنارة مخفية LED للجبس بورد مع محولة (إضاءة دافئة/بيضاء)',
  category: 'decor',
  brand: 'Philips / OSRAM',
  price: 15000,
  oldPrice: 18000,
  unit: 'لفة 5 متر',
  icon: '💡',
  imageUrl: PRESET_PRODUCT_IMAGES[10].url,
  desc: 'إنارة مخفية عالية السطوع لبيوت النور وديكورات الأسقف الجبسية',
  inStock: true
}, {
  storeIndex: 2,
  name: 'حقيبة عدة صبغ متكاملة (رولات أصلية + فرش + شفر معجون ستانلس + تيب)',
  category: 'tools',
  brand: 'Pro Tools',
  price: 25000,
  oldPrice: 30000,
  unit: 'طقم كامل',
  icon: '🖌️',
  imageUrl: PRESET_PRODUCT_IMAGES[11].url,
  desc: 'طقم احترافي متكامل لتنفيذ أعمال المعجون والأصباغ بدون تقطير',
  inStock: true
}];
const Icon = memo(({
  name,
  size = 18,
  className,
  onClick
}) => {
  const elRef = useRef(null);
  useEffect(() => {
    if (elRef.current) {
      elRef.current.innerHTML = `<i data-lucide="${name}"></i>`;
      if (window.lucide) {
        window.lucide.createIcons({
          root: elRef.current
        });
        const svg = elRef.current.querySelector('svg');
        if (svg) {
          svg.setAttribute('width', size);
          svg.setAttribute('height', size);
        }
      }
    }
  }, [name, size]);
  return /*#__PURE__*/React.createElement("span", {
    ref: elRef,
    onClick: onClick,
    className: className,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: onClick ? 'pointer' : 'inherit'
    }
  });
});
const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  text
}) => {
  if (!isOpen) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[600] flex items-center justify-center bg-black/60 p-4",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white dark:bg-slate-800 w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl animate-enter",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-full mx-auto flex items-center justify-center mb-4"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert-triangle",
    size: 32
  })), /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-lg mb-2"
  }, "\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0625\u062C\u0631\u0627\u0621"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-500 mb-6"
  }, text), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onConfirm();
      onClose();
    },
    className: "flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-700 transition-colors"
  }, "\u0646\u0639\u0645\u060C \u0645\u062A\u0623\u0643\u062F"), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    className: "flex-1 bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors"
  }, "\u0625\u0644\u063A\u0627\u0621"))));
};
const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidthClass = 'max-w-lg'
}) => {
  if (!isOpen) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: `bg-white dark:bg-slate-800 w-full ${maxWidthClass} rounded-3xl animate-enter shadow-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700`,
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center px-5 py-3.5 border-b dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-black text-base sm:text-lg text-slate-800 dark:text-white truncate pl-2"
  }, title), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    className: "p-2 bg-slate-100 dark:bg-slate-700 rounded-full hover:bg-slate-200 shrink-0"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    className: "p-4 sm:p-5 overflow-y-auto flex-1"
  }, children)));
};
const PUBLIC_PORTAL_BASE_URL = "https://alosta-portal.surge.sh/";
try {
  const cachedPortalUrl = localStorage.getItem("alosta_portal_base_url");
  if (cachedPortalUrl && cachedPortalUrl.startsWith("https://") && !cachedPortalUrl.includes("ais-pre-") && !cachedPortalUrl.includes("trycloudflare.com")) {
    window.__DYNAMIC_PORTAL_BASE_URL = cachedPortalUrl;
  } else {
    window.__DYNAMIC_PORTAL_BASE_URL = PUBLIC_PORTAL_BASE_URL;
    localStorage.setItem("alosta_portal_base_url", PUBLIC_PORTAL_BASE_URL);
  }
  if (db) {
    db.collection("settings").doc("app_config").onSnapshot(docSnap => {
      if (docSnap && docSnap.exists) {
        const d = docSnap.data() || {};
        if (d.portalBaseUrl && String(d.portalBaseUrl).startsWith("https://") && !String(d.portalBaseUrl).includes("ais-pre-") && !String(d.portalBaseUrl).includes("trycloudflare.com")) {
          window.__DYNAMIC_PORTAL_BASE_URL = String(d.portalBaseUrl).trim();
          try {
            localStorage.setItem("alosta_portal_base_url", window.__DYNAMIC_PORTAL_BASE_URL);
          } catch (e) {}
        }
      }
    }, () => {});
  }
} catch (e) {}
const generateRandomPortalCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "ST-";
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};
const getStorePortalCode = store => {
  if (!store) return "";
  if (store.portalCode && String(store.portalCode).trim()) {
    return String(store.portalCode).trim().toUpperCase();
  }
  const raw = String(store.id || "STORE").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return "ST-" + raw.slice(0, 6).padEnd(6, "8");
};
const getStorePortalLink = store => {
  if (!store || !store.id) return "";
  const code = getStorePortalCode(store);
  const dynamicBase = typeof window !== "undefined" && window.__DYNAMIC_PORTAL_BASE_URL && !String(window.__DYNAMIC_PORTAL_BASE_URL).includes("trycloudflare.com") ? window.__DYNAMIC_PORTAL_BASE_URL : PUBLIC_PORTAL_BASE_URL;
  const sep = dynamicBase.includes("?") ? "&" : "?";
  return `${dynamicBase}${sep}storePortal=${encodeURIComponent(store.id)}&code=${encodeURIComponent(code)}`;
};
const getStoreAppDeepLink = store => {
  if (!store || !store.id) return "";
  const code = getStorePortalCode(store);
  return `alosta://store?storePortal=${encodeURIComponent(store.id)}&code=${encodeURIComponent(code)}`;
};
const parseStorePortalInput = (input = "") => {
  const s = String(input || "").trim();
  if (!s) return null;
  try {
    const storePortalMatch = s.match(/[?&#]storePortal=([^&#\s]+)/i);
    const codeMatch = s.match(/[?&#]code=([^&#\s]+)/i);
    if (storePortalMatch && storePortalMatch[1]) {
      return {
        storeId: decodeURIComponent(storePortalMatch[1]).trim(),
        code: codeMatch && codeMatch[1] ? decodeURIComponent(codeMatch[1]).trim().toUpperCase() : "",
        isUrlMode: true
      };
    }
  } catch (e) {}
  return {
    storeId: s,
    code: s.toUpperCase(),
    isUrlMode: false
  };
};
const formatStoreWhatsAppPhone = (phone = "") => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("964")) return digits;
  if (digits.startsWith("07")) return "964" + digits.slice(1);
  if (digits.startsWith("7")) return "964" + digits;
  return digits;
};
const copyTextToClipboard = (text, onSuccess) => {
  if (!text) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (onSuccess) onSuccess();
      }).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        if (onSuccess) onSuccess();
      });
      return;
    }
  } catch (e) {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    if (onSuccess) onSuccess();
  } catch (e) {}
};
const OFFICIAL_PAINT_BRANDS = [{
  id: 'jotun',
  nameAr: 'جوتن (Jotun)',
  shortAr: 'جوتن Jotun',
  hasCatalog: true,
  badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700',
  keywords: ['جوتن', 'يوتن', 'jotun', 'فينوماستيك', 'جوتاشيلد']
}, {
  id: 'berger',
  nameAr: 'برجر (Berger)',
  shortAr: 'برجر Berger',
  hasCatalog: true,
  badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700',
  keywords: ['برجر', 'بيرجر', 'berger', 'رويال']
}, {
  id: 'san_marco',
  nameAr: 'بلو - سان ماركو (Blue / San Marco)',
  shortAr: 'بلو (سان ماركو)',
  hasCatalog: true,
  badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-300 dark:border-sky-700',
  keywords: ['بلو', 'سان ماركو', 'ماركو', 'san marco', 'blue', 'كادورو', 'ماركوبولو']
}, {
  id: 'loggia',
  nameAr: 'لوجيا (Loggia)',
  shortAr: 'لوجيا Loggia',
  hasCatalog: true,
  badgeClass: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/70 dark:text-fuchsia-300 border border-fuchsia-300 dark:border-fuchsia-700',
  keywords: ['لوجيا', 'لوجية', 'loggia', 'بلازما']
}, {
  id: 'betek',
  nameAr: 'بيتك (Betek)',
  shortAr: 'بيتك Betek',
  hasCatalog: false,
  badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700',
  keywords: ['بيتك', 'بتك', 'betek', 'فاوري']
}, {
  id: 'national',
  nameAr: 'ناشونال (National)',
  shortAr: 'ناشونال National',
  hasCatalog: false,
  badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-700',
  keywords: ['ناشونال', 'نشونال', 'national']
}];
const detectDashboardPaintBrandKey = (txt = '') => {
  const lower = String(txt || '').toLowerCase();
  for (const b of OFFICIAL_PAINT_BRANDS) {
    if (lower.includes(b.id) || b.keywords.some(k => lower.includes(k.toLowerCase()))) return b.id;
  }
  return 'jotun';
};
const PAYMENT_METHODS = [{
  id: 'zaincash',
  label: 'زين كاش (ZainCash)',
  shortLabel: 'زين كاش',
  icon: '💜',
  color: '#4f46e5',
  badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700'
}, {
  id: 'superqi',
  label: 'سوبر كي / كي كارد (SuperQi)',
  shortLabel: 'سوبر كي / Qi',
  icon: '💛',
  color: '#d97706',
  badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
}, {
  id: 'fib',
  label: 'مصرف العراق الأول (FIB)',
  shortLabel: 'مصرف FIB',
  icon: '💚',
  color: '#059669',
  badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
}, {
  id: 'taif',
  label: 'الطيف الإسلامي / ناس باي',
  shortLabel: 'الطيف / ناس باي',
  icon: '💙',
  color: '#0284c7',
  badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-300 dark:border-sky-700'
}, {
  id: 'asiapay',
  label: 'آسيا حوالة (AsiaPay)',
  shortLabel: 'آسيا حوالة',
  icon: '❤️',
  color: '#e11d48',
  badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
}, {
  id: 'rafidain',
  label: 'ماستر كارد الرافدين / الرشيد',
  shortLabel: 'ماستر الرافدين',
  icon: '🏦',
  color: '#0f766e',
  badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300 border border-teal-300 dark:border-teal-700'
}, {
  id: 'other',
  label: 'حساب تحويل إلكتروني آخر',
  shortLabel: 'تحويل مالي',
  icon: '💳',
  color: '#475569',
  badgeClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
}];
const getStorePaymentMethodInfo = methodId => {
  return PAYMENT_METHODS.find(m => m.id === methodId) || PAYMENT_METHODS[0];
};
const getStoreAccountNumber = storeObj => {
  if (!storeObj) return '';
  return String(storeObj.paymentAccountNumber || storeObj.accountNumber || '').trim();
};
const getStoreQrImageSrc = (storeObj, size = 320) => {
  if (!storeObj) return '';
  if (storeObj.paymentQrImage && String(storeObj.paymentQrImage).trim()) {
    return String(storeObj.paymentQrImage).trim();
  }
  const accNum = getStoreAccountNumber(storeObj);
  if (!accNum) return '';
  const methodId = String(storeObj.paymentMethod || 'zaincash').toUpperCase();
  const rawPayload = `${methodId}:${accNum}`;
  try {
    if (typeof window !== 'undefined' && window.QRious) {
      const qr = new window.QRious({
        value: rawPayload,
        size: size,
        level: 'H',
        background: '#ffffff',
        foreground: '#0f172a',
        padding: 16
      });
      return qr.toDataURL('image/png');
    }
  } catch (e) {}
  return '';
};
const generateStorePaymentCardDataUrl = async storeObj => {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1060;
  const ctx = canvas.getContext('2d');
  const methodInfo = getStorePaymentMethodInfo(storeObj?.paymentMethod);
  const accNum = getStoreAccountNumber(storeObj) || 'غير محدد';
  const holderName = String(storeObj?.paymentAccountHolder || storeObj?.name || 'حساب المعرض المعتمد').trim();
  const storeName = String(storeObj?.name || 'معرض معتمد').trim();
  const storeGov = String(storeObj?.gov || 'بغداد').trim();
  const storePhone = String(storeObj?.phone || '').trim();

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 800, 1060);
  bgGrad.addColorStop(0, '#1e1b4b');
  bgGrad.addColorStop(0.5, '#0f172a');
  bgGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 800, 1060);

  // Outer border frame
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.45)';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, 752, 1012);

  // Header Banner
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(48, 48, 704, 150);
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 22px Cairo, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('💳 بطاقة باركود ورقم حساب التحويل المالي للمعرض', 400, 92);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 32px Cairo, sans-serif';
  ctx.fillText(storeName.slice(0, 42), 400, 142);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 19px Cairo, sans-serif';
  ctx.fillText(`📍 ${storeGov}${storePhone ? `  |  📞 ${storePhone}` : ''}`, 400, 180);

  // White QR Card Box
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(150, 225, 500, 500);
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 6;
  ctx.strokeRect(150, 225, 500, 500);
  const qrSrc = getStoreQrImageSrc(storeObj, 440);
  if (qrSrc) {
    await new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 180, 255, 440, 440);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = qrSrc;
    });
  }

  // Payment Method & Account Number Box
  ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
  ctx.fillRect(60, 755, 680, 235);
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(60, 755, 680, 235);
  ctx.fillStyle = '#fde047';
  ctx.font = 'bold 24px Cairo, sans-serif';
  ctx.fillText(`طريقة الدفع والتحويل: ${methodInfo.label}`, 400, 802);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 21px Cairo, sans-serif';
  ctx.fillText(`اسم صاحب الحساب: ${holderName.slice(0, 45)}`, 400, 845);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 38px monospace';
  ctx.fillText(accNum, 400, 912);
  ctx.fillStyle = '#6ee7b7';
  ctx.font = 'bold 18px Cairo, sans-serif';
  ctx.fillText('امسح الباركود أو انسخ رقم الحساب أعلاه لإتمام التحويل المالي بسهولة', 400, 962);
  return canvas.toDataURL('image/png');
};
const saveStorePaymentBarcodeToDevice = async (storeObj, onNotify) => {
  if (!storeObj) return;
  try {
    if (onNotify) onNotify('جاري تجهيز وحفظ صورة الباركود مع رقم الحساب في جهازك...');
    const dataUrl = await generateStorePaymentCardDataUrl(storeObj);
    const safeName = String(storeObj.name || 'store').replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 30);
    const fileName = `AlOsta_Barcode_${safeName}_${Date.now()}.png`;
    if (window.AndroidApp && typeof window.AndroidApp.saveBase64ImageToDevice === 'function') {
      const ok = window.AndroidApp.saveBase64ImageToDevice(dataUrl, fileName);
      if (ok) {
        if (onNotify) onNotify('تم حفظ باركود ورقم حساب المعرض في الاستوديو بالجهاز بنجاح ✓');
        return true;
      }
    }
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (onNotify) onNotify('تم تنزيل وحفظ صورة باركود ورقم حساب المعرض في الجهاز ✓');
    return true;
  } catch (e) {
    console.error(e);
    if (onNotify) onNotify('تعذر حفظ الصورة، حاول مرة أخرى');
    return false;
  }
};
const StoreOwnerPortal = ({
  storeKeyInput,
  initialStoreObj = null,
  onExit,
  isAdminPreview = false
}) => {
  const [entryInput, setEntryInput] = useState('');
  const [resolvedKey, setResolvedKey] = useState(storeKeyInput && storeKeyInput !== 'prompt' ? storeKeyInput : '');
  const [store, setStore] = useState(initialStoreObj);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(Boolean(!initialStoreObj && storeKeyInput && storeKeyInput !== 'prompt'));
  const [error, setError] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [prodModal, setProdModal] = useState({
    open: false,
    item: null
  });
  const [imgPreview, setImgPreview] = useState('');
  const [imgBusy, setImgBusy] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const portalFileRef = useRef(null);
  const notify = t => {
    setToastMsg(t);
    setTimeout(() => setToastMsg(''), 3200);
  };
  const handleStoreOwnerLogout = () => {
    if (isAdminPreview && onExit) {
      onExit();
      return;
    }
    setStore(null);
    setProducts([]);
    setError('');
    setEntryInput('');
    setResolvedKey('');
    try {
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname || '/');
      }
    } catch (e) {}
  };
  useEffect(() => {
    if (!db) return;
    if (!initialStoreObj && !resolvedKey) {
      setLoading(false);
      return;
    }
    let unsubStore = null;
    let unsubProds = null;
    let cancelled = false;
    setLoading(true);
    setError('');
    const resolveAndSubscribe = async () => {
      try {
        let targetStore = initialStoreObj;
        if (!targetStore && resolvedKey) {
          const parsed = parseStorePortalInput(resolvedKey);
          const candidateId = parsed?.storeId || '';
          const candidateCode = (parsed?.code || candidateId || '').toUpperCase();
          if (candidateId) {
            const docSnap = await db.collection('stores').doc(candidateId).get();
            if (docSnap.exists) {
              targetStore = {
                id: docSnap.id,
                ...docSnap.data()
              };
            }
          }
          if (!targetStore) {
            const allSnap = await db.collection('stores').get();
            const allStores = allSnap.docs.map(d => ({
              id: d.id,
              ...d.data()
            }));
            targetStore = allStores.find(s => getStorePortalCode(s) === candidateCode || s.id === candidateId || s.id.toUpperCase() === candidateCode) || null;
          }
          if (targetStore && !isAdminPreview) {
            const expectedCode = getStorePortalCode(targetStore);
            if (parsed?.isUrlMode && parsed?.code && parsed.code !== expectedCode) {
              setError('⛔ رمز الدخول السري للمعرض غير صالح أو تم تغييره من قِبل الإدارة.');
              setLoading(false);
              return;
            }
            if (!parsed?.isUrlMode && targetStore.portalCode && candidateCode !== expectedCode && candidateId !== targetStore.id) {
              setError('⛔ رمز الدخول السري للمعرض غير صحيح.');
              setLoading(false);
              return;
            }
          }
        }
        if (cancelled) return;
        if (!targetStore || !targetStore.id || !isAdminPreview && targetStore.isActive === false) {
          setError('لم يتم العثور على المعرض المطلوب أو تم إيقافه من الإدارة.');
          setLoading(false);
          return;
        }
        const authorizedPortalCode = getStorePortalCode(targetStore);
        setStore(targetStore);
        setLoading(false);
        unsubStore = db.collection('stores').doc(targetStore.id).onSnapshot(docSnap => {
          if (docSnap.exists) {
            const stData = {
              id: docSnap.id,
              ...docSnap.data()
            };
            if (!isAdminPreview && stData.isActive === false) {
              setStore(null);
              setError('⛔ تم إيقاف أو حذف هذا المعرض من قِبل الإدارة.');
            } else if (!isAdminPreview && getStorePortalCode(stData) !== authorizedPortalCode) {
              setStore(null);
              setError('⛔ تم تغيير رمز حماية المعرض من قِبل الإدارة. يرجى استخدام الرابط الجديد.');
            } else {
              setStore(stData);
            }
          } else if (!isAdminPreview) {
            setStore(null);
            setError('⛔ تم حذف هذا المعرض من قِبل الإدارة.');
          }
        });
        unsubProds = db.collection('store_products').where('storeId', '==', targetStore.id).onSnapshot(snap => {
          const list = snap.docs.map(d => ({
            id: d.id,
            ...d.data()
          })).sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
          setProducts(list);
        });
      } catch (e) {
        if (!cancelled) {
          setError('حدث خطأ أثناء الاتصال بقاعدة بيانات المعرض.');
          setLoading(false);
        }
      }
    };
    resolveAndSubscribe();
    return () => {
      cancelled = true;
      if (unsubStore) unsubStore();
      if (unsubProds) unsubProds();
    };
  }, [resolvedKey, initialStoreObj?.id]);
  const openAddOrEditProduct = (item = null) => {
    setImgPreview(item?.imageUrl || '');
    setProdModal({
      open: true,
      item
    });
  };
  const handleUploadImg = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgBusy(true);
    try {
      const compressed = await compressImageToBase64(file, 520, 0.76);
      setImgPreview(compressed);
      notify('تم تجهيز صورة المنتج بنجاح ✓');
    } catch (err) {
      notify('تعذر قراءة الصورة');
    } finally {
      setImgBusy(false);
    }
  };
  const handleSaveProduct = async e => {
    e.preventDefault();
    if (!store?.id) return;
    const f = e.target;
    const rawPrice = parseFloat(f.price.value) || 0;
    const normalizedPrice = rawPrice > 0 && rawPrice < 1000 ? rawPrice * 1000 : rawPrice;
    const rawOldPrice = parseFloat(f.oldPrice.value) || 0;
    const normalizedOldPrice = rawOldPrice > 0 && rawOldPrice < 1000 ? rawOldPrice * 1000 : rawOldPrice;
    const catVal = f.category.value || 'paint';
    const catObj = PRODUCT_CATEGORIES.find(c => c.id === catVal) || PRODUCT_CATEGORIES[0];
    const brandText = f.brand.value.trim();
    const payload = {
      name: AlOstaCrypto.sanitizeText(f.name.value, 140),
      category: catVal,
      brand: AlOstaCrypto.sanitizeText(brandText, 80),
      paintBrandKey: catVal === 'paint' ? detectDashboardPaintBrandKey(`${brandText} ${f.name.value}`) : '',
      requiresColorCode: f.requiresColorCode ? f.requiresColorCode.checked : catVal === 'paint',
      price: Math.max(0, normalizedPrice),
      oldPrice: Math.max(0, normalizedOldPrice),
      unit: AlOstaCrypto.sanitizeText(f.unit.value, 30) || 'قطعة',
      icon: catObj.icon || '🎨',
      imageUrl: AlOstaCrypto.sanitizeImageUrl(imgPreview || f.imageUrl?.value || ''),
      storeId: store.id,
      storeName: store.name || 'معرض معتمد',
      desc: AlOstaCrypto.sanitizeText(f.desc.value, 400),
      inStock: f.inStock.checked,
      updatedAt: new Date().toISOString()
    };
    try {
      if (prodModal.item?.id) {
        await db.collection('store_products').doc(prodModal.item.id).update(payload);
        notify('تم تحديث المنتج في المعرض ✓');
      } else {
        await db.collection('store_products').add({
          ...payload,
          createdAt: new Date().toISOString()
        });
        notify('تمت إضافة المنتج إلى المعرض بنجاح ✓');
      }
      setProdModal({
        open: false,
        item: null
      });
    } catch (err) {
      notify('فشل حفظ المنتج، تحقق من الاتصال');
    }
  };
  const toggleProductStock = async prod => {
    try {
      await db.collection('store_products').doc(prod.id).update({
        inStock: prod.inStock === false ? true : false,
        updatedAt: new Date().toISOString()
      });
      notify('تم تحديث حالة التوفر ✓');
    } catch (e) {}
  };
  const deleteProduct = async prod => {
    if (!window.confirm(`هل أنت متأكد من حذف المنتج "${prod.name}" من معرضك؟`)) return;
    try {
      await db.collection('store_products').doc(prod.id).delete();
      notify('تم حذف المنتج ✓');
    } catch (e) {}
  };
  const handleSaveStoreContactInfo = async e => {
    e.preventDefault();
    if (!store || !store.id) return;
    const form = e.target;
    const contactUpdates = AlOstaCrypto.buildSafeStoreContactPayload({
      phone: form.phone?.value,
      gov: form.gov?.value,
      address: form.address?.value,
      workHours: form.workHours?.value,
      hasDelivery: form.hasDelivery ? form.hasDelivery.checked : store.hasDelivery
    }, store);
    if (!contactUpdates.phone) {
      notify('يرجى إدخال رقم الهاتف / واتساب المعرض بشكل صحيح');
      return;
    }
    try {
      await db.collection('stores').doc(store.id).update(contactUpdates);
      setStore(prev => ({
        ...prev,
        ...contactUpdates
      }));
      setContactModalOpen(false);
      notify('تم حفظ معلومات الاتصال والعنوان للمعرض بنجاح ✓');
    } catch (err) {
      notify('تعذر حفظ معلومات الاتصال، تحقق من الاتصال');
    }
  };
  if (loading) {
    return /*#__PURE__*/React.createElement("div", {
      className: "min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center"
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"
    }), /*#__PURE__*/React.createElement("p", {
      className: "font-black text-base"
    }, "\u062C\u0627\u0631\u064A \u0641\u062A\u062D \u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u0645\u0639\u0631\u0636 \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u0643..."));
  }
  if (!resolvedKey || error || !store) {
    return /*#__PURE__*/React.createElement("div", {
      className: "min-h-screen flex items-center justify-center bg-slate-900 p-4 text-center",
      style: {
        direction: 'rtl'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-slate-800 border border-slate-700 p-7 rounded-[2rem] max-w-sm w-full text-white space-y-4 shadow-2xl animate-enter"
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mx-auto flex items-center justify-center text-3xl"
    }, "\uD83C\uDFEA"), /*#__PURE__*/React.createElement("h2", {
      className: "font-black text-xl text-white"
    }, "\u0628\u0648\u0627\u0628\u0629 \u062F\u062E\u0648\u0644 \u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u0639\u0631\u0636"), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-slate-300 font-bold leading-relaxed"
    }, "\u0623\u062F\u062E\u0644 \u0631\u0645\u0632 \u0627\u0644\u0645\u0639\u0631\u0636 \u0627\u0644\u062E\u0627\u0635 \u0628\u0643 (\u0645\u062B\u0627\u0644: ", /*#__PURE__*/React.createElement("span", {
      className: "font-mono text-emerald-400"
    }, "ST-XXXXXX"), ") \u0623\u0648 \u0627\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0639\u0631\u0636 \u0644\u0625\u062F\u0627\u0631\u0629 \u0645\u0646\u062A\u062C\u0627\u062A\u0643 \u0648\u0623\u0633\u0639\u0627\u0631\u0643:"), error && /*#__PURE__*/React.createElement("div", {
      className: "p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-black"
    }, error), /*#__PURE__*/React.createElement("form", {
      onSubmit: e => {
        e.preventDefault();
        if (entryInput.trim()) {
          setError('');
          setResolvedKey(entryInput.trim());
        }
      },
      className: "space-y-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex gap-2"
    }, /*#__PURE__*/React.createElement("input", {
      type: "text",
      value: entryInput,
      onChange: e => {
        setEntryInput(e.target.value);
        setError('');
      },
      placeholder: "\u0631\u0645\u0632 \u0627\u0644\u0645\u0639\u0631\u0636 ST-XXXXXX \u0623\u0648 \u0627\u0644\u0631\u0627\u0628\u0637",
      className: "flex-1 p-3.5 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl font-mono font-bold text-xs text-center text-white dir-ltr outline-none",
      autoFocus: true
    }), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: async () => {
        try {
          const txt = await navigator.clipboard.readText();
          if (txt) {
            setEntryInput(txt.trim());
            setError('');
          }
        } catch (e) {}
      },
      className: "px-3.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-black text-emerald-300 shrink-0"
    }, "\u0644\u0635\u0642")), /*#__PURE__*/React.createElement("button", {
      type: "submit",
      className: "w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm shadow-lg shadow-emerald-600/20 transition-all"
    }, "\u062F\u062E\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0645\u0639\u0631\u0636 \u0648\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A")), isAdminPreview && onExit && /*#__PURE__*/React.createElement("button", {
      onClick: onExit,
      className: "w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-black text-xs text-slate-200"
    }, "\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629 \u0648\u0627\u0644\u0639\u0648\u062F\u0629 \u0644\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F")));
  }
  const stType = STORE_TYPES.find(t => t.id === store.storeType) || STORE_TYPES[0];
  const filteredProducts = products.filter(p => !searchQ || (p.name || '').includes(searchQ) || (p.brand || '').includes(searchQ));
  const portalMethodInfo = getStorePaymentMethodInfo(store.paymentMethod);
  const portalAccNum = getStoreAccountNumber(store);
  const portalQrSrc = getStoreQrImageSrc(store, 260);
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 pb-20"
  }, toastMsg && /*#__PURE__*/React.createElement("div", {
    className: "fixed top-5 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl font-black text-xs border border-indigo-500/40 animate-enter"
  }, toastMsg), /*#__PURE__*/React.createElement("div", {
    className: "bg-gradient-to-l from-indigo-900 via-indigo-950 to-slate-900 text-white p-5 md:p-7 shadow-xl border-b border-indigo-500/20"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-5xl mx-auto space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-1.5 text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-3 py-1 rounded-full"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83C\uDFEA"), /*#__PURE__*/React.createElement("span", null, "\u0628\u0648\u0627\u0628\u0629 \u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u0639\u0631\u0636 \u0627\u0644\u062E\u0627\u0635\u0629 \u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0648\u0627\u0644\u0623\u0633\u0639\u0627\u0631")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => copyTextToClipboard(getStorePortalLink(store), () => notify('تم نسخ الرابط الخاص بمعرضك ✓')),
    className: "bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "copy",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "\u0646\u0633\u062E \u0631\u0627\u0628\u0637 \u0645\u0639\u0631\u0636\u064A")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: handleStoreOwnerLogout,
    className: "bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "log-out",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, isAdminPreview ? 'إغلاق المعاينة والعودة للداشبورد' : 'خروج')))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-2 border-t border-white/10"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-2"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "font-black text-2xl"
  }, store.name), /*#__PURE__*/React.createElement("span", {
    className: "text-[11px] font-black bg-white/15 px-2.5 py-0.5 rounded-lg"
  }, stType.label), /*#__PURE__*/React.createElement("span", {
    className: "text-[11px] font-mono font-black bg-indigo-500/30 text-indigo-200 px-2.5 py-0.5 rounded-lg dir-ltr"
  }, "Code: ", getStorePortalCode(store))), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-indigo-200 font-bold mt-1.5 flex flex-wrap items-center gap-3"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCCD ", store.gov || 'بغداد', " - ", store.address || ''), store.phone && /*#__PURE__*/React.createElement("span", {
    className: "dir-ltr"
  }, "\uD83D\uDCDE ", store.phone), /*#__PURE__*/React.createElement("span", null, "\uD83D\uDECD\uFE0F \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0627\u0644\u0645\u0639\u0631\u0648\u0636\u0629: (", products.length, ") \u0645\u0646\u062A\u062C"))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2 w-full md:w-auto"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setContactModalOpen(true),
    className: "flex-1 md:flex-initial bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-xl transition-all shrink-0"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "phone",
    size: 16
  }), /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCDE \u062A\u0639\u062F\u064A\u0644 \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0648\u0627\u0644\u0639\u0646\u0648\u0627\u0646")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => openAddOrEditProduct(null),
    className: "flex-1 md:flex-initial bg-amber-400 hover:bg-amber-300 text-slate-950 px-5 py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-xl transition-all shrink-0"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 18
  }), /*#__PURE__*/React.createElement("span", null, "+ \u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C \u062C\u062F\u064A\u062F \u0625\u0644\u0649 \u0645\u0639\u0631\u0636\u064A")))))), /*#__PURE__*/React.createElement("div", {
    className: "max-w-5xl mx-auto p-4 md:p-6 space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 lg:grid-cols-2 gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white dark:bg-slate-800 p-4 rounded-3xl border border-indigo-200 dark:border-slate-700 shadow-sm flex flex-col justify-between gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-black text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCDE"), /*#__PURE__*/React.createElement("span", null, "\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0648\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0644\u0644\u0645\u0639\u0631\u0636")), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-black bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded-lg"
  }, "\u0645\u062A\u0627\u062D \u0644\u0644\u062A\u0639\u062F\u064A\u0644 \u2713")), /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-black text-slate-800 dark:text-white"
  }, "\u0647\u0627\u062A\u0641 / \u0648\u0627\u062A\u0633\u0627\u0628 \u0627\u0644\u0637\u0644\u0628\u0627\u062A: ", /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-sm text-indigo-600 dark:text-indigo-400 dir-ltr select-all"
  }, store.phone || 'غير محدد')), /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] font-bold text-slate-600 dark:text-slate-300"
  }, "\uD83D\uDCCD ", store.gov || 'بغداد', " \u2014 ", store.address || 'لم يحدد العنوان التفصيلي'), /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] font-bold text-slate-500 dark:text-slate-400"
  }, "\uD83D\uDD52 \u0627\u0644\u062F\u0648\u0627\u0645: ", store.workHours || '8:00 ص - 8:00 م', " \u2022 ", store.hasDelivery !== false ? '🚚 يوفر توصيل للموقع' : '🏪 استلام من المعرض')), /*#__PURE__*/React.createElement("div", {
    className: "pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-end"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setContactModalOpen(true),
    className: "px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs flex items-center gap-1.5 shadow-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "edit-2",
    size: 13
  }), /*#__PURE__*/React.createElement("span", null, "\u062A\u0639\u062F\u064A\u0644 \u0647\u0627\u062A\u0641 \u0648\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0639\u0631\u0636")))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white dark:bg-slate-800 p-4 rounded-3xl border-2 border-emerald-500/40 shadow-sm flex flex-col justify-between gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3.5"
  }, portalQrSrc ? /*#__PURE__*/React.createElement("img", {
    src: portalQrSrc,
    alt: "QR",
    onClick: () => saveStorePaymentBarcodeToDevice(store, notify),
    className: "w-16 h-16 rounded-2xl bg-white p-1 border-2 border-emerald-500 object-contain shrink-0 cursor-pointer shadow-sm",
    title: "\u0627\u0636\u063A\u0637 \u0644\u062D\u0641\u0638 \u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062F \u0641\u064A \u0627\u0644\u062C\u0647\u0627\u0632"
  }) : /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-slate-900 border-2 border-dashed border-emerald-400 flex items-center justify-center text-2xl shrink-0"
  }, "\uD83D\uDD12"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1 min-w-0 flex-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", {
    className: `text-[10px] px-2 py-0.5 rounded-lg font-black ${portalMethodInfo.badgeClass}`
  }, portalMethodInfo.icon, " ", portalMethodInfo.label), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-black bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-lg"
  }, "\uD83D\uDD12 \u0645\u062D\u0645\u064A \u0645\u0646 \u0627\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F \u0641\u0642\u0637")), /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-black text-slate-800 dark:text-white"
  }, "\u062D\u0633\u0627\u0628 \u0627\u0644\u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0645\u0627\u0644\u064A: ", /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-sm text-emerald-600 dark:text-emerald-400 dir-ltr select-all"
  }, portalAccNum || 'يُضاف من إدارة النظام (الداشبورد)')), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed"
  }, "\uD83D\uDEE1\uFE0F \u0644\u0636\u0645\u0627\u0646 \u0633\u0644\u0627\u0645\u0629 \u0627\u0644\u0645\u0639\u0631\u0636 \u0645\u0646 \u0627\u0644\u0627\u062E\u062A\u0631\u0627\u0642\u060C \u064A\u062A\u0645 \u0625\u0636\u0627\u0641\u0629 \u0623\u0648 \u062A\u0639\u062F\u064A\u0644 \u0631\u0642\u0645 \u062D\u0633\u0627\u0628 \u0627\u0644\u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0645\u0627\u0644\u064A \u0648\u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062F \u062D\u0635\u0631\u064A\u0627\u064B \u0639\u0628\u0631 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0646\u0638\u0627\u0645 (\u0627\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F)."))), portalAccNum && /*#__PURE__*/React.createElement("div", {
    className: "pt-2 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-2 justify-end"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => copyTextToClipboard(portalAccNum, () => notify(`تم نسخ رقم حساب المعرض (${portalAccNum}) ✓`)),
    className: "px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-800 dark:text-slate-100 rounded-xl font-black text-[11px] flex items-center gap-1"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "copy",
    size: 13
  }), /*#__PURE__*/React.createElement("span", null, "\u0646\u0633\u062E \u0631\u0642\u0645 \u0627\u0644\u062D\u0633\u0627\u0628")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => saveStorePaymentBarcodeToDevice(store, notify),
    className: "px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[11px] flex items-center gap-1 shadow-xs"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "download",
    size: 13
  }), /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCBE \u062D\u0641\u0638 \u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062F"))))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative w-full sm:max-w-xs"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 16,
    className: "absolute right-3.5 top-3 text-slate-400"
  }), /*#__PURE__*/React.createElement("input", {
    value: searchQ,
    onChange: e => setSearchQ(e.target.value),
    placeholder: "\u0627\u0628\u062D\u062B \u062F\u0627\u062E\u0644 \u0645\u0646\u062A\u062C\u0627\u062A \u0645\u0639\u0631\u0636\u0643...",
    className: "w-full bg-slate-100 dark:bg-slate-900 rounded-xl py-2 pr-10 pl-3 text-xs font-bold outline-none"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 w-full sm:w-auto justify-end"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-black text-slate-500"
  }, "\u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0627\u0644\u0645\u062A\u0648\u0641\u0631\u0629: ", products.filter(p => p.inStock !== false).length, " \u0645\u0646 ", products.length), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => openAddOrEditProduct(null),
    className: "px-4 py-2 bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "\u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C")))), filteredProducts.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "text-center py-14 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-slate-700 text-indigo-600 mx-auto flex items-center justify-center mb-3"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shopping-bag",
    size: 32
  })), /*#__PURE__*/React.createElement("h3", {
    className: "font-black text-base"
  }, "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0646\u062A\u062C\u0627\u062A \u0645\u0636\u0627\u0641\u0629 \u0641\u064A \u0645\u0639\u0631\u0636\u0643 \u062D\u0627\u0644\u064A\u0627\u064B"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 font-bold mt-1 mb-5"
  }, "\u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u0632\u0631 \xAB\u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C \u062C\u062F\u064A\u062F\xBB \u0644\u0631\u0641\u0639 \u0645\u0646\u062A\u062C\u0627\u062A\u0643 \u0648\u0623\u0633\u0639\u0627\u0631\u0643 \u0648\u0635\u0648\u0631\u0647\u0627 \u0644\u062A\u0638\u0647\u0631 \u0645\u0628\u0627\u0634\u0631\u0629 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646 \u0641\u064A \u0627\u0644\u062A\u0637\u0628\u064A\u0642."), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => openAddOrEditProduct(null),
    className: "bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-xs inline-flex items-center gap-2 shadow-lg"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 16
  }), /*#__PURE__*/React.createElement("span", null, "+ \u0625\u0636\u0627\u0641\u0629 \u0623\u0648\u0644 \u0645\u0646\u062A\u062C \u0644\u0645\u0639\u0631\u0636 ", store.name))) : /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
  }, filteredProducts.map(prod => {
    const cat = PRODUCT_CATEGORIES.find(c => c.id === prod.category) || PRODUCT_CATEGORIES[0];
    return /*#__PURE__*/React.createElement("div", {
      key: prod.id,
      className: "bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col justify-between"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "relative h-40 w-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center overflow-hidden border-b border-slate-100 dark:border-slate-700"
    }, prod.imageUrl ? /*#__PURE__*/React.createElement("img", {
      src: prod.imageUrl,
      alt: prod.name,
      className: "w-full h-full object-cover"
    }) : /*#__PURE__*/React.createElement("span", {
      className: "text-4xl"
    }, prod.icon || cat.icon || '🎨'), /*#__PURE__*/React.createElement("span", {
      className: `absolute top-2.5 right-2.5 text-[10px] px-2.5 py-1 rounded-lg font-black shadow-sm ${cat.badgeClass}`
    }, cat.label), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => toggleProductStock(prod),
      className: `absolute top-2.5 left-2.5 text-[10px] px-2.5 py-1 rounded-lg font-black shadow-sm ${prod.inStock !== false ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`
    }, prod.inStock !== false ? 'متوفر ✓ (اضغط للتغيير)' : 'نفذت الكمية')), /*#__PURE__*/React.createElement("div", {
      className: "p-4"
    }, prod.brand && /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] text-indigo-600 dark:text-indigo-400 font-black mb-0.5"
    }, "\uD83C\uDFF7\uFE0F \u0627\u0644\u0645\u0627\u0631\u0643\u0629: ", prod.brand), /*#__PURE__*/React.createElement("h3", {
      className: "font-black text-sm leading-snug"
    }, prod.name), prod.desc && /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-slate-500 dark:text-slate-400 mt-1.5 bg-slate-50 dark:bg-slate-900 p-2 rounded-xl line-clamp-2"
    }, prod.desc))), /*#__PURE__*/React.createElement("div", {
      className: "px-4 pb-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/60"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "font-black text-base text-emerald-600 dark:text-emerald-400 dir-ltr"
    }, (prod.price || 0).toLocaleString('en-US'), " \u062F.\u0639"), /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] text-slate-400 font-bold mr-1"
    }, "/ ", prod.unit || 'قطعة')), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-1.5"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => openAddOrEditProduct(prod),
      className: "px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 rounded-xl font-black text-xs flex items-center gap-1"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "edit-2",
      size: 13
    }), " \u062A\u0639\u062F\u064A\u0644"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => deleteProduct(prod),
      className: "p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-600 rounded-xl"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "trash-2",
      size: 14
    })))));
  }))), /*#__PURE__*/React.createElement(Modal, {
    isOpen: contactModalOpen,
    onClose: () => setContactModalOpen(false),
    title: `تعديل معلومات الاتصال والعنوان (${store.name})`
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSaveStoreContactInfo,
    className: "space-y-3.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] font-bold text-amber-800 dark:text-amber-300 leading-relaxed"
  }, "\uD83D\uDD12 \u0645\u0644\u0627\u062D\u0638\u0629 \u0623\u0645\u0646\u064A\u0629: \u0647\u0630\u0627 \u0627\u0644\u0631\u0627\u0628\u0637 \u0645\u062E\u0635\u0635 \u0644\u062A\u062D\u062F\u064A\u062B ", /*#__PURE__*/React.createElement("b", null, "\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0648\u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0641\u0642\u0637"), ". \u0623\u0645\u0627 \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u062D\u0633\u0627\u0628 \u0627\u0644\u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0645\u0627\u0644\u064A \u0648\u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062F \u0641\u062A\u064F\u062F\u0627\u0631 \u062D\u0635\u0631\u064A\u0627\u064B \u0645\u0646 \u0642\u0650\u0628\u0644 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0646\u0638\u0627\u0645 (\u0627\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F) \u0644\u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u0645\u0639\u0631\u0636 \u0645\u0646 \u0627\u0644\u0627\u062E\u062A\u0631\u0627\u0642."), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 / \u0648\u0627\u062A\u0633\u0627\u0628 \u0627\u0644\u0637\u0644\u0628\u0627\u062A *"), /*#__PURE__*/React.createElement("input", {
    name: "phone",
    defaultValue: store.phone || '',
    placeholder: "07xxxxxxxxx",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-mono font-black text-sm dir-ltr text-center",
    required: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0645\u062D\u0627\u0641\u0638\u0629 *"), /*#__PURE__*/React.createElement("select", {
    name: "gov",
    defaultValue: store.gov || 'بغداد',
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
  }, GOVERNORATES.map(g => /*#__PURE__*/React.createElement("option", {
    key: g,
    value: g
  }, g))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062A\u0641\u0635\u064A\u0644\u064A \u0648\u0623\u0642\u0631\u0628 \u0646\u0642\u0637\u0629 \u062F\u0627\u0644\u0629"), /*#__PURE__*/React.createElement("input", {
    name: "address",
    defaultValue: store.address || '',
    placeholder: "\u0627\u0644\u0645\u0646\u0637\u0642\u0629 - \u0627\u0644\u0634\u0627\u0631\u0639 - \u0642\u0631\u0628...",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 gap-3 items-center"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0623\u0648\u0642\u0627\u062A \u0627\u0644\u062F\u0648\u0627\u0645"), /*#__PURE__*/React.createElement("input", {
    name: "workHours",
    defaultValue: store.workHours || '8:00 ص - 8:00 م',
    placeholder: "8:00 \u0635 - 8:00 \u0645",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pt-4"
  }, /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-2 text-xs font-black cursor-pointer"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    name: "hasDelivery",
    defaultChecked: store.hasDelivery !== false,
    className: "w-4 h-4 accent-indigo-600"
  }), /*#__PURE__*/React.createElement("span", null, "\uD83D\uDE9A \u064A\u0648\u0641\u0631 \u062E\u062F\u0645\u0629 \u0627\u0644\u062A\u0648\u0635\u064A\u0644 \u0644\u0645\u0648\u0642\u0639 \u0627\u0644\u0639\u0645\u0644")))), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-xl font-black shadow-lg"
  }, "\u062D\u0641\u0638 \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0648\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u2713"))), /*#__PURE__*/React.createElement(Modal, {
    isOpen: prodModal.open,
    onClose: () => setProdModal({
      open: false,
      item: null
    }),
    title: prodModal.item ? `تعديل منتج في (${store.name})` : `إضافة منتج جديد إلى (${store.name})`
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSaveProduct,
    className: "space-y-3.5"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062A\u062C \u0648\u0627\u0644\u0645\u0648\u0627\u0635\u0641\u0629 *"), /*#__PURE__*/React.createElement("input", {
    name: "name",
    defaultValue: prodModal.item?.name,
    placeholder: "\u0645\u062B\u0627\u0644: \u0635\u0628\u063A \u062C\u0648\u062A\u0646 \u0641\u064A\u0646\u0648\u0645\u0627\u0633\u062A\u064A\u0643 \u0645\u0637\u0641\u064A 18 \u0644\u062A\u0631",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-sm",
    required: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0642\u0633\u0645 \u0641\u064A \u0627\u0644\u0645\u0639\u0631\u0636 *"), /*#__PURE__*/React.createElement("select", {
    name: "category",
    defaultValue: prodModal.item?.category || getStoreSectionsList(store)[0]?.id || 'paint',
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
  }, getStoreSectionsList(store).map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.icon || '📂', " ", c.label)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0645\u0627\u0631\u0643\u0629 / \u0627\u0644\u0648\u0643\u0627\u0644\u0629"), /*#__PURE__*/React.createElement("input", {
    id: "dashPortalBrandInput",
    name: "brand",
    defaultValue: prodModal.item?.brand || store.agencyBrandLabel || '',
    readOnly: Boolean(store.agencyBrandKey || store.storeType === 'paint_agency'),
    placeholder: "\u0645\u062B\u0627\u0644: \u062C\u0648\u062A\u0646 / \u0628\u0631\u062C\u0631 / \u0643\u0646\u0627\u0648\u0641",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-3 gap-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0633\u0639\u0631 (\u062F.\u0639) *"), /*#__PURE__*/React.createElement("input", {
    name: "price",
    type: "number",
    step: "any",
    defaultValue: prodModal.item?.price,
    placeholder: "25000",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-black text-sm dir-ltr text-center",
    required: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0633\u0639\u0631 \u0642\u0628\u0644 \u0627\u0644\u062E\u0635\u0645"), /*#__PURE__*/React.createElement("input", {
    name: "oldPrice",
    type: "number",
    step: "any",
    defaultValue: prodModal.item?.oldPrice || '',
    placeholder: "\u0627\u062E\u062A\u064A\u0627\u0631\u064A",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs dir-ltr text-center"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0648\u062D\u062F\u0629 *"), /*#__PURE__*/React.createElement("input", {
    name: "unit",
    defaultValue: prodModal.item?.unit || 'قطعة',
    placeholder: "\u0633\u0637\u0644 / \u0644\u0648\u062D / \u0643\u064A\u0633",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs text-center",
    required: true
  }))), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-black text-indigo-600 dark:text-indigo-400"
  }, "\uD83D\uDDBC\uFE0F \u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u0646\u062A\u062C"), imgPreview && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setImgPreview(''),
    className: "text-[11px] font-black text-rose-500"
  }, "\u062D\u0630\u0641 \u0627\u0644\u0635\u0648\u0631\u0629 \u2715")), /*#__PURE__*/React.createElement("input", {
    ref: portalFileRef,
    type: "file",
    accept: "image/*",
    onChange: handleUploadImg,
    className: "hidden"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, imgPreview ? /*#__PURE__*/React.createElement("img", {
    src: imgPreview,
    alt: "preview",
    className: "w-16 h-16 rounded-xl object-cover border border-indigo-400 shrink-0"
  }) : /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "image",
    size: 22
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 space-y-1.5"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => portalFileRef.current?.click(),
    disabled: imgBusy,
    className: "w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "upload",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, imgBusy ? 'جاري ضغط الصورة...' : 'اختيار صورة المنتج من الهاتف / الكاميرا')), /*#__PURE__*/React.createElement("input", {
    name: "imageUrl",
    value: imgPreview.startsWith('data:') ? '' : imgPreview,
    onChange: e => setImgPreview(e.target.value),
    placeholder: "\u0623\u0648 \u0627\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0635\u0648\u0631\u0629 \u0645\u0628\u0627\u0634\u0631 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)",
    className: "w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] dir-ltr text-left outline-none"
  })))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0648\u0635\u0641 \u0648\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0645\u0646\u062A\u062C"), /*#__PURE__*/React.createElement("textarea", {
    name: "desc",
    defaultValue: prodModal.item?.desc,
    rows: "2",
    placeholder: "\u062A\u0641\u0627\u0635\u064A\u0644 \u0625\u0636\u0627\u0641\u064A\u0629 \u0639\u0646 \u0627\u0644\u062C\u0648\u062F\u0629 \u0623\u0648 \u0627\u0644\u062A\u063A\u0637\u064A\u0629 \u0623\u0648 \u0627\u0644\u0642\u064A\u0627\u0633\u0627\u062A...",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs resize-none"
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-2 text-xs font-bold cursor-pointer"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    name: "requiresColorCode",
    defaultChecked: prodModal.item ? prodModal.item.requiresColorCode !== false : store.storeType !== 'gypsum_board',
    className: "w-4 h-4 accent-fuchsia-600"
  }), /*#__PURE__*/React.createElement("span", null, "\uD83C\uDFA8 \u064A\u062A\u0637\u0644\u0628 \u062A\u062D\u062F\u064A\u062F \u0643\u0648\u062F \u0627\u0644\u0644\u0648\u0646 \u0639\u0646\u062F \u0627\u0644\u0637\u0644\u0628 (\u064A\u0641\u062A\u062D \u0645\u0633\u0637\u0631\u0629 \u0643\u0648\u062F\u0627\u062A \u0627\u0644\u0623\u0635\u0628\u0627\u063A \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629)")), /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-2 text-xs font-bold cursor-pointer"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    name: "inStock",
    defaultChecked: prodModal.item ? prodModal.item.inStock !== false : true,
    className: "w-4 h-4 accent-emerald-600"
  }), "\u0627\u0644\u0645\u0646\u062A\u062C \u0645\u062A\u0648\u0641\u0631 \u062D\u0627\u0644\u064A\u0627\u064B \u0641\u064A \u0627\u0644\u0645\u0639\u0631\u0636 \u2713")), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-xl font-black shadow-lg"
  }, "\u062D\u0641\u0638 \u0627\u0644\u0645\u0646\u062A\u062C \u0641\u064A \u0627\u0644\u0645\u0639\u0631\u0636 \u2713"))));
};
const Dashboard = ({
  onLogout
}) => {
  const DASHBOARD_CACHE_KEY = 'al_osta_dashboard_cache_v1';
  const [view, setView] = useState('stores');
  const [activeStore, setActiveStore] = useState(null);
  const [data, setData] = useState(() => {
    const fallback = {
      admins: [],
      workers: [],
      announcements: [],
      stores: [],
      products: [],
      storeOrders: [],
      settings: {
        latestVersion: '1.0.9',
        latestDashboardVersion: '1.0.9',
        apkUrl: '',
        dashboardApkUrl: '',
        forceUpdate: false,
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
      }
    };
    try {
      const cached = localStorage.getItem(DASHBOARD_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          return {
            ...fallback,
            ...parsed,
            settings: {
              ...fallback.settings,
              ...(parsed.settings || {})
            },
            stores: Array.isArray(parsed.stores) ? parsed.stores : [],
            products: Array.isArray(parsed.products) ? parsed.products : []
          };
        }
      }
    } catch (e) {}
    return fallback;
  });
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState({
    isOpen: false,
    type: null,
    item: null,
    storeObj: null
  });
  const [savingModal, setSavingModal] = useState(false);
  const [modalError, setModalError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    text: '',
    onConfirm: null
  });
  const [msg, setMsg] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Scalable Stores Directory, Workspace & Tabbed Modal State
  const [storeFilterType, setStoreFilterType] = useState('all');
  const [storeFilterGov, setStoreFilterGov] = useState('all');
  const [storeViewMode, setStoreViewMode] = useState('cards'); // 'cards' | 'table'
  const [activeStoreSubTab, setActiveStoreSubTab] = useState('products'); // 'products' | 'portal' | 'payment'
  const [activeStoreSecFilter, setActiveStoreSecFilter] = useState('all');
  const [storeModalTab, setStoreModalTab] = useState('basic'); // 'basic' | 'sections' | 'location_payment' | 'portal'
  const [storeFormDraft, setStoreFormDraft] = useState({
    name: '',
    gov: 'بغداد',
    address: '',
    phone: '',
    badge: 'وكيل معتمد ✓',
    workHours: '8:00 ص - 8:00 م',
    notes: '',
    hasDelivery: true,
    isActive: true,
    isVipStore: true,
    subscriptionPlanType: 'yearly',
    subscriptionExpiresAt: ''
  });
  const [locInput, setLocInput] = useState('');
  const [locParsed, setLocParsed] = useState(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [storeDraftId, setStoreDraftId] = useState('');
  const [storePortalCodeDraft, setStorePortalCodeDraft] = useState('');
  const [storeTypeDraft, setStoreTypeDraft] = useState('paint_agency');
  const [storeAgencyBrandDraft, setStoreAgencyBrandDraft] = useState('jotun');
  const [storeSectionsDraft, setStoreSectionsDraft] = useState([]);
  const [newSectionLabelDraft, setNewSectionLabelDraft] = useState('');
  const [newSectionIconDraft, setNewSectionIconDraft] = useState('📂');
  const [inlineProdNewSec, setInlineProdNewSec] = useState('');
  const [storeLinkModal, setStoreLinkModal] = useState(null);
  const [portalPreviewStore, setPortalPreviewStore] = useState(null);
  const [paymentQrModal, setPaymentQrModal] = useState(null);
  const [subModal, setSubModal] = useState({
    isOpen: false,
    collectionName: '',
    item: null,
    flagField: '',
    planType: 'monthly',
    customDate: '',
    saving: false
  });
  const [subFilterTab, setSubFilterTab] = useState('all'); // 'all' | 'admins' | 'stores' | 'workers' | 'expiring'

  const SUBSCRIPTION_DURATION_OPTIONS = [{
    id: 'monthly',
    label: 'شهري (شهر واحد)',
    shortLabel: 'شهري',
    days: 30,
    months: 1,
    icon: '🗓️'
  }, {
    id: 'quarterly',
    label: 'ربع سنوي (3 أشهر)',
    shortLabel: '3 أشهر',
    days: 90,
    months: 3,
    icon: '📅'
  }, {
    id: 'semiannual',
    label: 'نصف سنوي (6 أشهر)',
    shortLabel: '6 أشهر',
    days: 180,
    months: 6,
    icon: '📆'
  }, {
    id: 'yearly',
    label: 'سنوي (سنة كاملة - 12 شهر)',
    shortLabel: 'سنوي',
    days: 365,
    months: 12,
    icon: '🏆',
    badge: 'وفر شهرين 🎁'
  }, {
    id: 'lifetime',
    label: 'مفتوح / دائم (بدون انتهاء)',
    shortLabel: 'مفتوح دائم',
    days: null,
    months: null,
    icon: '♾️'
  }, {
    id: 'custom',
    label: 'تاريخ انتهاء مخصص',
    shortLabel: 'مدة مخصصة',
    days: null,
    months: null,
    icon: '⚙️'
  }];
  const computeSubscriptionExpiryIso = (planType, customDateStr = '', baseIso = null) => {
    if (planType === 'lifetime') return '';
    if (planType === 'custom' && customDateStr) {
      const parsed = new Date(customDateStr + 'T23:59:59');
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    const opt = SUBSCRIPTION_DURATION_OPTIONS.find(o => o.id === planType) || SUBSCRIPTION_DURATION_OPTIONS[0];
    if (!opt.days) return '';
    const startMs = baseIso && !isNaN(new Date(baseIso).getTime()) && new Date(baseIso).getTime() > Date.now() ? new Date(baseIso).getTime() : Date.now();
    return new Date(startMs + opt.days * 86400000).toISOString();
  };
  const getEntitySubscriptionInfo = (item, flagField) => {
    const rawFlag = flagField === 'isVipStore' ? item?.isVipStore !== false : Boolean(item?.[flagField]);
    const planType = item?.subscriptionPlanType || (flagField === 'isVipStore' ? 'yearly' : 'monthly');
    const opt = SUBSCRIPTION_DURATION_OPTIONS.find(o => o.id === planType) || SUBSCRIPTION_DURATION_OPTIONS[0];
    const expiresAt = item?.subscriptionExpiresAt || '';
    let daysLeft = null;
    let isExpired = false;
    if (expiresAt) {
      const expMs = new Date(expiresAt).getTime();
      if (!isNaN(expMs)) {
        daysLeft = Math.ceil((expMs - Date.now()) / 86400000);
        isExpired = daysLeft < 0;
      }
    }
    const isActive = rawFlag && !isExpired;
    return {
      rawFlag,
      isActive,
      isExpired,
      daysLeft,
      planType,
      planLabel: item?.subscriptionPlanLabel || opt.shortLabel,
      expiresAt,
      startedAt: item?.subscriptionStartedAt || item?.proUpdatedAt || ''
    };
  };
  const [storeQrImgPreview, setStoreQrImgPreview] = useState('');
  const [storePaymentDraft, setStorePaymentDraft] = useState({
    paymentMethod: 'zaincash',
    paymentAccountNumber: '',
    paymentAccountHolder: ''
  });
  const storeQrFileInputRef = useRef(null);

  // Product Image & Store helper state in modal
  const [prodImgPreview, setProdImgPreview] = useState('');
  const [imgBusy, setImgBusy] = useState(false);
  const [selectedModalStoreId, setSelectedModalStoreId] = useState('');
  const fileInputRef = useRef(null);

  // System Announcements helper state
  const [annImgPreview, setAnnImgPreview] = useState('');
  const [annFilter, setAnnFilter] = useState('all'); // all | active | paused | admin | worker
  const [previewAnn, setPreviewAnn] = useState(null);
  const [annDraft, setAnnDraft] = useState({
    title: '',
    content: '',
    adType: 'info',
    target: 'all',
    maxViews: 3,
    linkUrl: '',
    buttonLabel: '',
    expiresAt: '',
    isPinned: false,
    isActive: true
  });
  const annFileInputRef = useRef(null);

  // Migration & Security state
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationLog, setMigrationLog] = useState([]);
  const [revealedPasswords, setRevealedPasswords] = useState({});
  const showToast = (t, ms = 3000) => {
    setMsg(t);
    setTimeout(() => setMsg(''), ms);
  };
  const autoUpgradePlaintextAccounts = async (adminsList, workersList) => {
    if (!db) return;
    try {
      for (const a of adminsList) {
        const hasPlain = a.password && a.password !== AlOstaCrypto.ENCRYPTED_MASK;
        if (hasPlain && (!a.passwordHash || !a.passwordCipher)) {
          const creds = AlOstaCrypto.buildProtectedCredentials(a.password, a.id);
          db.collection('admins').doc(a.id).update(creds).catch(() => {});
        }
      }
      for (const w of workersList) {
        const hasPlain = w.password && w.password !== AlOstaCrypto.ENCRYPTED_MASK;
        const saltKey = (w.phone || w.id || '').trim();
        if (hasPlain && saltKey && (!w.passwordHash || !w.passwordCipher)) {
          const creds = AlOstaCrypto.buildProtectedCredentials(w.password, saltKey);
          db.collection('workers').doc(w.id).update(creds).catch(() => {});
        }
      }
    } catch (e) {}
  };
  const loadData = async (silent = false) => {
    if (!db) return;
    if (!silent && data.stores.length === 0) setLoading(true);
    const safeGet = (promise, fallbackVal) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(fallbackVal), 3500))]).catch(() => fallbackVal);
    try {
      const emptySnap = {
        docs: [],
        exists: false,
        _timedOut: true
      };
      const [adminsSnap, workersSnap, annSnap, storesSnap, prodSnap, ordSnap, settingsSnap] = await Promise.all([safeGet(db.collection('admins').get(), emptySnap), safeGet(db.collection('workers').get(), emptySnap), safeGet(db.collection('announcements').get(), emptySnap), safeGet(db.collection('stores').get(), emptySnap), safeGet(db.collection('store_products').get(), emptySnap), safeGet(db.collection('store_orders').get(), emptySnap), safeGet(db.collection('settings').doc('app_config').get(), emptySnap)]);
      const loadedStores = storesSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      const loadedProducts = prodSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      const loadedAdmins = adminsSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      const loadedWorkers = workersSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      const loadedAnns = !annSnap._timedOut ? annSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })).sort((a, b) => (b.updatedAt || b.date || '').localeCompare(a.updatedAt || a.date || '')) : null;
      if (loadedAdmins.length > 0 || loadedWorkers.length > 0) {
        autoUpgradePlaintextAccounts(loadedAdmins, loadedWorkers);
      }
      setData(prev => {
        const nextData = {
          admins: !adminsSnap._timedOut ? loadedAdmins : prev.admins,
          workers: !workersSnap._timedOut ? loadedWorkers : prev.workers,
          announcements: loadedAnns !== null ? loadedAnns : prev.announcements,
          stores: !storesSnap._timedOut ? loadedStores : prev.stores,
          products: !prodSnap._timedOut ? loadedProducts : prev.products,
          storeOrders: !ordSnap._timedOut ? ordSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
          })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)) : prev.storeOrders,
          settings: settingsSnap.exists ? settingsSnap.data() : prev.settings
        };
        try {
          localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(nextData));
        } catch (e) {}
        return nextData;
      });
      if (activeStore && !storesSnap._timedOut) {
        const updatedActive = loadedStores.find(s => s.id === activeStore.id);
        if (updatedActive) setActiveStore(updatedActive);else setActiveStore(null);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };
  useEffect(() => {
    loadData(true);
    if (!db) return;
    const unsubOrders = db.collection('store_orders').onSnapshot(snap => {
      const liveOrders = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setData(prev => ({
        ...prev,
        storeOrders: liveOrders
      }));
    }, () => {});
    const unsubAnns = db.collection('announcements').onSnapshot(snap => {
      const liveAnns = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })).sort((a, b) => {
        if (Boolean(b.isPinned) !== Boolean(a.isPinned)) return b.isPinned ? 1 : -1;
        return String(b.updatedAt || b.date || '').localeCompare(String(a.updatedAt || a.date || ''));
      });
      setData(prev => {
        const next = {
          ...prev,
          announcements: liveAnns
        };
        try {
          localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(next));
        } catch (e) {}
        return next;
      });
    }, () => {});
    const unsubSettings = db.collection('settings').doc('app_config').onSnapshot(doc => {
      if (doc.exists) {
        setData(prev => ({
          ...prev,
          settings: {
            ...prev.settings,
            ...doc.data()
          }
        }));
      }
    }, () => {});
    const unsubStores = db.collection('stores').onSnapshot(snap => {
      const liveStores = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setData(prev => {
        const next = {
          ...prev,
          stores: liveStores
        };
        try {
          localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(next));
        } catch (e) {}
        return next;
      });
      setActiveStore(prev => prev ? liveStores.find(s => s.id === prev.id) || null : null);
    }, () => {});
    const unsubProducts = db.collection('store_products').onSnapshot(snap => {
      const liveProds = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setData(prev => {
        const next = {
          ...prev,
          products: liveProds
        };
        try {
          localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(next));
        } catch (e) {}
        return next;
      });
    }, () => {});
    return () => {
      if (unsubOrders) unsubOrders();
      if (unsubAnns) unsubAnns();
      if (unsubSettings) unsubSettings();
      if (unsubStores) unsubStores();
      if (unsubProducts) unsubProducts();
    };
  }, []);
  const openModal = (type, item = null, targetStore = null) => {
    setModalError('');
    setSavingModal(false);
    if (type === 'announcements') {
      setAnnImgPreview(item?.imageUrl || '');
      setAnnDraft({
        title: item?.title || '',
        content: item?.content || '',
        adType: item?.adType || 'info',
        target: item?.target || 'all',
        maxViews: item?.maxViews !== undefined ? Number(item.maxViews) : 3,
        linkUrl: item?.linkUrl || '',
        buttonLabel: item?.buttonLabel || '',
        expiresAt: item?.expiresAt || '',
        isPinned: Boolean(item?.isPinned),
        isActive: item ? Boolean(item.isActive) : true
      });
      setEditModal({
        isOpen: true,
        type,
        item,
        storeObj: null
      });
      return;
    }
    if (type === 'stores') {
      const nextStoreId = item?.id || (db ? db.collection('stores').doc().id : 'store_' + Date.now());
      setStoreModalTab('basic');
      setStoreDraftId(nextStoreId);
      setStorePortalCodeDraft(item ? getStorePortalCode(item) : generateRandomPortalCode());
      const initialType = item?.storeType || 'paint_agency';
      setStoreTypeDraft(initialType);
      const initialBrand = item?.agencyBrandKey || (initialType === 'paint_agency' ? detectDashboardPaintBrandKey(`${item?.name || ''} ${item?.notes || ''}`) || 'jotun' : '');
      setStoreAgencyBrandDraft(initialBrand);
      setStoreSectionsDraft(getStoreSectionsList(item || {
        storeType: initialType
      }));
      setNewSectionLabelDraft('');
      setNewSectionIconDraft('📂');
      setStoreFormDraft({
        name: item?.name || '',
        gov: item?.gov || 'بغداد',
        address: item?.address || '',
        phone: item?.phone || '',
        badge: item?.badge || (initialType === 'paint_agency' ? 'وكالة معتمدة ✓' : 'مركز معتمد ✓'),
        workHours: item?.workHours || '8:00 ص - 8:00 م',
        notes: item?.notes || '',
        hasDelivery: item ? item.hasDelivery !== false : true,
        isActive: item ? item.isActive !== false : true,
        isVipStore: item ? item.isVipStore !== false : true,
        subscriptionPlanType: item?.subscriptionPlanType || 'yearly',
        subscriptionExpiresAt: item?.subscriptionExpiresAt ? String(item.subscriptionExpiresAt).slice(0, 10) : ''
      });
      setStoreQrImgPreview(item?.paymentQrImage || '');
      setStorePaymentDraft({
        paymentMethod: item?.paymentMethod || 'zaincash',
        paymentAccountNumber: item?.paymentAccountNumber || item?.accountNumber || '',
        paymentAccountHolder: item?.paymentAccountHolder || item?.name || ''
      });
      const rawLoc = typeof item?.location === 'string' ? item.location : item?.location?.raw || item?.location?.url || (item?.location?.lat !== undefined ? `${item.location.lat}, ${item.location.lng}` : '');
      setLocInput(rawLoc);
      const extracted = extractCoords(item?.location);
      if (extracted) {
        setLocParsed(extracted);
      } else if (rawLoc) {
        const govCenter = GOV_COORDS[item?.gov || 'بغداد'] || GOV_COORDS['بغداد'];
        setLocParsed({
          lat: govCenter.lat,
          lng: govCenter.lng,
          raw: rawLoc,
          url: extractUrlFromText(rawLoc),
          isSavedLink: true
        });
      } else {
        setLocParsed(null);
      }
    }
    if (type === 'products') {
      const resolvedStore = targetStore || activeStore || data.stores.find(s => s.id === item?.storeId) || data.stores[0] || null;
      setSelectedModalStoreId(item?.storeId && item.storeId !== 'all' ? item.storeId : resolvedStore?.id || '');
      setProdImgPreview(item?.imageUrl || '');
      setEditModal({
        isOpen: true,
        type,
        item,
        storeObj: resolvedStore
      });
      return;
    }
    setEditModal({
      isOpen: true,
      type,
      item,
      storeObj: targetStore
    });
  };
  const handleStoreLocChange = async (val, govVal = 'بغداد') => {
    setLocInput(val);
    const trimmed = String(val || '').trim();
    if (!trimmed) {
      setLocParsed(null);
      return;
    }
    const direct = extractCoords(trimmed);
    if (direct) {
      setLocParsed(direct);
      return;
    }
    // Temporarily mark as saved link/location immediately so saving right away never loses it
    const govCenter = GOV_COORDS[govVal] || GOV_COORDS['بغداد'];
    setLocParsed({
      lat: govCenter.lat,
      lng: govCenter.lng,
      raw: trimmed,
      url: extractUrlFromText(trimmed),
      isSavedLink: true
    });
    // Resolve short Google Maps URL or place name asynchronously
    const resolved = await resolveLocationData(trimmed, govVal);
    if (resolved) {
      setLocParsed(prev => prev && prev.raw === trimmed ? resolved : prev);
    }
  };
  const pasteStoreLocation = async (govVal = 'بغداد') => {
    try {
      let clipText = '';
      if (window.AndroidApp && typeof window.AndroidApp.getClipboardText === 'function') {
        clipText = window.AndroidApp.getClipboardText() || '';
      }
      if (!clipText && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        clipText = await navigator.clipboard.readText();
      }
      clipText = String(clipText || '').trim();
      if (!clipText) {
        showToast("الحافظة فارغة — انسخ رابط الموقع أو الإحداثيات أولاً");
        return;
      }
      await handleStoreLocChange(clipText, govVal);
      showToast("تم لصق موقع المحل وتحديده بنجاح ✓");
    } catch (err) {
      showToast("اضغط مطولاً داخل حقل الموقع واختر لصق");
    }
  };
  const handleProductImageUpload = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgBusy(true);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 480, 0.78);
      setProdImgPreview(dataUrl);
      showToast("تم تجهيز وإرفاق صورة المنتج بنجاح ✓");
    } catch (err) {
      showToast("تعذر قراءة الصورة، جرب صورة أخرى");
    }
    setImgBusy(false);
  };
  const handleStoreQrImageUpload = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgBusy(true);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 520, 0.85);
      setStoreQrImgPreview(dataUrl);
      showToast("تم إرفاق صورة باركود حساب المعرض بنجاح ✓");
    } catch (err) {
      showToast("تعذر قراءة صورة الباركود، جرب صورة أخرى");
    }
    setImgBusy(false);
  };
  const captureAdminGps = () => {
    setGpsBusy(true);
    try {
      if (window.AndroidApp && typeof window.AndroidApp.getNativeLocation === 'function') {
        const nativeStr = window.AndroidApp.getNativeLocation();
        if (nativeStr) {
          const parsed = JSON.parse(nativeStr);
          if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
            const raw = `${parsed.lat.toFixed(6)}, ${parsed.lng.toFixed(6)}`;
            setLocInput(raw);
            setLocParsed({
              lat: parsed.lat,
              lng: parsed.lng,
              raw,
              url: ''
            });
            setGpsBusy(false);
            showToast("تم التقاط إحداثيات موقع المحل بنجاح ✓");
            return;
          }
        }
      }
    } catch (e) {}
    if (!navigator.geolocation) {
      setGpsBusy(false);
      showToast("الـ GPS غير مدعوم في هذا المتصفح");
      return;
    }
    navigator.geolocation.getCurrentPosition(pos => {
      const raw = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
      setLocInput(raw);
      setLocParsed({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        raw,
        url: ''
      });
      setGpsBusy(false);
      showToast("تم التقاط إحداثيات موقع المحل بنجاح ✓");
    }, err => {
      setGpsBusy(false);
      showToast("تعذر جلب الموقع: " + err.message);
    }, {
      enableHighAccuracy: true,
      timeout: 10000
    });
  };
  const triggerDelete = (collection, id, stateKey = collection) => {
    setConfirmDialog({
      isOpen: true,
      text: collection === 'stores' ? 'هل أنت متأكد من حذف هذا المعرض وجميع منتجاته المرتبطة به نهائياً من التطبيق؟' : 'متأكد من الحذف النهائي؟ لا يمكن التراجع.',
      onConfirm: async () => {
        try {
          const delPromise = db.collection(collection).doc(id).delete();
          await raceTimeout(delPromise, 3500, {
            timedOut: true
          });
          if (collection === 'stores') {
            try {
              const orphanProdsSnap = await raceTimeout(db.collection('store_products').where('storeId', '==', id).get(), 3000, null);
              if (orphanProdsSnap && !orphanProdsSnap.empty) {
                const batch = db.batch();
                orphanProdsSnap.docs.forEach(d => batch.delete(d.ref));
                await raceTimeout(batch.commit(), 3000, null);
              }
            } catch (err) {}
          }
          setData(prev => {
            const next = {
              ...prev,
              [stateKey]: (prev[stateKey] || []).filter(i => i.id !== id),
              ...(collection === 'stores' ? {
                products: (prev.products || []).filter(p => p.storeId !== id)
              } : {})
            };
            try {
              localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(next));
            } catch (e) {}
            return next;
          });
          if (collection === 'stores' && activeStore?.id === id) {
            setActiveStore(null);
          }
          showToast("تم الحذف نهائياً من قاعدة البيانات والتطبيق ✓");
        } catch (e) {
          showToast("فشل الحذف");
        }
      }
    });
  };
  const seedDefaultEcommerceData = async () => {
    try {
      showToast("جاري إضافة المحلات ومنتجات وصور كل محل...", 5000);
      let createdStores = [...data.stores];
      if (createdStores.length === 0) {
        for (const st of SAMPLE_STORES) {
          const docRef = await db.collection('stores').add({
            ...st,
            createdAt: new Date().toISOString()
          });
          createdStores.push({
            id: docRef.id,
            ...st
          });
        }
      }
      for (const prod of SAMPLE_PRODUCTS) {
        const targetStore = createdStores[prod.storeIndex] || createdStores[0];
        const {
          storeIndex,
          ...prodData
        } = prod;
        await db.collection('store_products').add({
          ...prodData,
          storeId: targetStore ? targetStore.id : '',
          storeName: targetStore ? targetStore.name : 'معرض معتمد',
          createdAt: new Date().toISOString()
        });
      }
      await loadData();
      showToast("تمت إضافة المحلات ومنتجات وأسعار وصور كل محل بشكل مستقل ✓");
    } catch (e) {
      console.error(e);
      showToast("حدث خطأ أثناء الإضافة النموذجية");
    }
  };
  const handleSaveEdit = async e => {
    e.preventDefault();
    if (savingModal) return;
    const form = e.target;
    const {
      type,
      item
    } = editModal;
    setModalError('');
    const raceTimeout = (promise, ms, fallbackVal) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(fallbackVal), ms))]);
    try {
      if (type === 'stores') {
        const storeNameVal = (storeFormDraft.name || form.name?.value || '').trim();
        const storePhoneVal = (storeFormDraft.phone || form.phone?.value || '').trim();
        const selectedGov = storeFormDraft.gov || form.gov?.value || 'بغداد';
        const selectedAddressRaw = (storeFormDraft.address || form.address?.value || '').trim();
        if (!storeNameVal || !storePhoneVal) {
          const errMsg = "يرجى إدخال اسم المعرض ورقم الهاتف أولاً ✓";
          setModalError(errMsg);
          setStoreModalTab('basic');
          showToast(errMsg, 4000);
          return;
        }
        const selectedAddress = selectedAddressRaw || selectedGov;
        setSavingModal(true);
        const rawLocText = String(locInput || form.locationRaw?.value || '').trim();
        let finalLocation = null;
        if (rawLocText) {
          if (locParsed && !locParsed.isSavedLink && typeof locParsed.lat === 'number' && typeof locParsed.lng === 'number') {
            finalLocation = {
              lat: locParsed.lat,
              lng: locParsed.lng,
              raw: rawLocText,
              url: extractUrlFromText(rawLocText) || locParsed.url || ''
            };
          } else {
            const govCenter = GOV_COORDS[selectedGov] || GOV_COORDS['بغداد'];
            const locFallback = {
              lat: govCenter.lat,
              lng: govCenter.lng,
              raw: rawLocText,
              url: extractUrlFromText(rawLocText) || '',
              isSavedLink: true
            };
            finalLocation = extractCoords(rawLocText) || (await raceTimeout(resolveLocationData(rawLocText, selectedGov, selectedAddress), 2500, locFallback));
          }
        }
        const finalPortalCode = (storePortalCodeDraft || form.portalCode?.value || (item ? getStorePortalCode(item) : generateRandomPortalCode())).trim().toUpperCase();
        const chosenStoreType = storeTypeDraft || form.storeType?.value || 'paint_agency';
        const chosenAgencyBrandKey = chosenStoreType === 'paint_agency' ? storeAgencyBrandDraft || 'jotun' : '';
        const agencyBrandObj = PAINT_AGENCY_BRANDS.find(b => b.id === chosenAgencyBrandKey) || null;
        const paymentMethodVal = storePaymentDraft.paymentMethod || form.paymentMethod?.value || 'zaincash';
        const paymentAccVal = (storePaymentDraft.paymentAccountNumber || form.paymentAccountNumber?.value || '').trim();
        const paymentHolderVal = (storePaymentDraft.paymentAccountHolder || form.paymentAccountHolder?.value || storeNameVal || '').trim();
        const finalSections = (Array.isArray(storeSectionsDraft) && storeSectionsDraft.length > 0 ? storeSectionsDraft : getDefaultSectionsForStoreType(chosenStoreType)).map(sec => ({
          id: String(sec.id || 'sec_' + Date.now().toString(36)),
          label: String(sec.label || 'قسم'),
          icon: String(sec.icon || '📂')
        }));
        const targetStoreId = item?.id || storeDraftId || (db ? db.collection('stores').doc().id : 'store_' + Date.now());
        const nowIso = new Date().toISOString();
        const payload = {
          name: storeNameVal,
          storeType: chosenStoreType,
          agencyBrandKey: chosenAgencyBrandKey,
          agencyBrandLabel: agencyBrandObj ? agencyBrandObj.label : '',
          customSections: finalSections,
          gov: selectedGov,
          address: selectedAddress,
          phone: storePhoneVal,
          badge: (storeFormDraft.badge || form.badge?.value || '').trim() || (chosenStoreType === 'paint_agency' && agencyBrandObj ? `وكالة ${agencyBrandObj.label} المعتمدة ✓` : 'مركز معتمد ✓'),
          workHours: (storeFormDraft.workHours || form.workHours?.value || '').trim() || '8:00 ص - 8:00 م',
          notes: (storeFormDraft.notes ?? form.notes?.value ?? '').trim(),
          hasDelivery: Boolean(storeFormDraft.hasDelivery),
          isActive: Boolean(storeFormDraft.isActive),
          isVipStore: storeFormDraft.isVipStore !== undefined ? Boolean(storeFormDraft.isVipStore) : true,
          subscriptionPlanType: storeFormDraft.subscriptionPlanType || 'yearly',
          subscriptionPlanLabel: (SUBSCRIPTION_DURATION_OPTIONS.find(o => o.id === (storeFormDraft.subscriptionPlanType || 'yearly')) || SUBSCRIPTION_DURATION_OPTIONS[3]).shortLabel,
          subscriptionExpiresAt: storeFormDraft.isVipStore === false ? '' : storeFormDraft.subscriptionPlanType === 'custom' && storeFormDraft.subscriptionExpiresAt ? new Date(storeFormDraft.subscriptionExpiresAt + 'T23:59:59').toISOString() : item?.subscriptionPlanType === storeFormDraft.subscriptionPlanType && item?.subscriptionExpiresAt ? item.subscriptionExpiresAt : computeSubscriptionExpiryIso(storeFormDraft.subscriptionPlanType || 'yearly', storeFormDraft.subscriptionExpiresAt),
          location: finalLocation,
          portalCode: finalPortalCode,
          paymentMethod: paymentMethodVal,
          paymentAccountNumber: paymentAccVal,
          paymentAccountHolder: paymentHolderVal,
          paymentQrImage: (storeQrImgPreview || '').trim(),
          updatedAt: nowIso
        };
        if (!item) {
          payload.createdAt = nowIso;
        }
        let syncedImmediately = true;
        if (db) {
          const writePromise = db.collection('stores').doc(targetStoreId).set(payload, {
            merge: true
          });
          const writeRes = await raceTimeout(writePromise.then(() => ({
            ok: true
          })), 4000, {
            ok: true,
            timedOut: true
          });
          if (writeRes && writeRes.timedOut) syncedImmediately = false;
        }
        const savedStoreObj = {
          ...(item || {}),
          id: targetStoreId,
          ...payload
        };
        setData(prev => {
          const nextStores = prev.stores.some(s => s.id === targetStoreId) ? prev.stores.map(s => s.id === targetStoreId ? savedStoreObj : s) : [...prev.stores, savedStoreObj];
          const nextData = {
            ...prev,
            stores: nextStores
          };
          try {
            localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(nextData));
          } catch (err) {}
          return nextData;
        });
        if (item && activeStore?.id === item.id) {
          setActiveStore(savedStoreObj);
        } else if (!item) {
          setStoreLinkModal(savedStoreObj);
        }
        setEditModal({
          isOpen: false,
          type: null,
          item: null,
          storeObj: null
        });
        showToast(syncedImmediately ? "تم حفظ بيانات المعرض بنجاح ✓" : "تم حفظ التعديلات محلياً وتتم المزامنة ✓");
        return;
      }
      setSavingModal(true);
      if (type === 'admins') {
        const newPass = form.password.value.trim();
        const cleanPhone = (form.phone?.value || '').replace(/\s+/g, '').replace(/[^0-9]/g, '');
        if (cleanPhone && !/^(077|078|079|075)\d{8}$/.test(cleanPhone)) {
          setSavingModal(false);
          setModalError('يرجى إدخال رقم هاتف عراقي صحيح مكون من 11 رقماً (077 / 078 / 079 / 075)');
          return;
        }
        const prefix = cleanPhone.slice(0, 3);
        const carrierLabel = prefix === '077' ? 'آسيا سيل' : prefix === '078' ? 'زين العراق' : prefix === '079' || prefix === '075' ? 'كورك تيليكوم' : '';
        const fullNameVal = (form.fullName?.value || '').trim() || item.fullName || item.name || item.id;
        const protectedCreds = AlOstaCrypto.buildProtectedCredentials(newPass, item.id);
        const isProVal = form.isPro ? Boolean(form.isPro.checked) : Boolean(item.isPro);
        const chosenPlan = form.subscriptionPlanType?.value || item.subscriptionPlanType || 'monthly';
        const opt = SUBSCRIPTION_DURATION_OPTIONS.find(o => o.id === chosenPlan) || SUBSCRIPTION_DURATION_OPTIONS[0];
        const expIso = isProVal ? item.isPro && item.subscriptionPlanType === chosenPlan && item.subscriptionExpiresAt ? item.subscriptionExpiresAt : computeSubscriptionExpiryIso(chosenPlan) : '';
        const updates = {
          ...protectedCreds,
          name: fullNameVal,
          fullName: fullNameVal,
          phone: cleanPhone,
          phoneCarrier: carrierLabel,
          humanVerified: Boolean(cleanPhone) || Boolean(item.humanVerified),
          isPro: isProVal,
          subscriptionPlanType: chosenPlan,
          subscriptionPlanLabel: opt.shortLabel,
          subscriptionStartedAt: isProVal ? item.subscriptionStartedAt || new Date().toISOString() : '',
          subscriptionExpiresAt: expIso,
          proUpdatedAt: new Date().toISOString()
        };
        await db.collection('admins').doc(item.id).update(updates);
        setData(prev => ({
          ...prev,
          admins: prev.admins.map(a => a.id === item.id ? {
            ...a,
            ...updates
          } : a)
        }));
      } else if (type === 'workers') {
        const cleanPhone = form.phone.value.trim();
        const newPass = form.password.value.trim();
        const protectedCreds = newPass ? AlOstaCrypto.buildProtectedCredentials(newPass, cleanPhone || item.id) : {};
        const isVerifiedVal = form.isVerifiedPro ? Boolean(form.isVerifiedPro.checked) : Boolean(item.isVerifiedPro);
        const chosenPlan = form.subscriptionPlanType?.value || item.subscriptionPlanType || 'monthly';
        const opt = SUBSCRIPTION_DURATION_OPTIONS.find(o => o.id === chosenPlan) || SUBSCRIPTION_DURATION_OPTIONS[0];
        const expIso = isVerifiedVal ? item.isVerifiedPro && item.subscriptionPlanType === chosenPlan && item.subscriptionExpiresAt ? item.subscriptionExpiresAt : computeSubscriptionExpiryIso(chosenPlan) : '';
        const updates = {
          name: form.name.value.trim(),
          phone: cleanPhone,
          specialty: form.specialty.value.trim(),
          isVerifiedPro: isVerifiedVal,
          subscriptionPlanType: chosenPlan,
          subscriptionPlanLabel: opt.shortLabel,
          subscriptionStartedAt: isVerifiedVal ? item.subscriptionStartedAt || new Date().toISOString() : '',
          subscriptionExpiresAt: expIso,
          ...protectedCreds
        };
        await db.collection('workers').doc(item.id).update(updates);
        setData(prev => ({
          ...prev,
          workers: prev.workers.map(w => w.id === item.id ? {
            ...w,
            ...updates
          } : w)
        }));
      } else if (type === 'announcements') {
        const nowIso = new Date().toISOString();
        const payload = {
          title: (annDraft.title || form.title?.value || '').trim(),
          content: (annDraft.content || form.content?.value || '').trim(),
          adType: annDraft.adType || form.adType?.value || 'info',
          maxViews: Math.max(1, parseInt(annDraft.maxViews || form.maxViews?.value) || 1),
          isActive: Boolean(annDraft.isActive),
          isPinned: Boolean(annDraft.isPinned),
          target: annDraft.target || form.target?.value || 'all',
          linkUrl: (annDraft.linkUrl || form.linkUrl?.value || '').trim(),
          buttonLabel: (annDraft.buttonLabel || form.buttonLabel?.value || '').trim(),
          imageUrl: (annImgPreview || '').trim(),
          expiresAt: (annDraft.expiresAt || form.expiresAt?.value || '').trim(),
          broadcastId: item?.broadcastId || Date.now(),
          updatedAt: nowIso
        };
        if (item) {
          await db.collection('announcements').doc(item.id).update(payload);
          setData(prev => ({
            ...prev,
            announcements: prev.announcements.map(a => a.id === item.id ? {
              ...a,
              ...payload
            } : a)
          }));
        } else {
          const createdPayload = {
            ...payload,
            date: nowIso,
            broadcastId: Date.now()
          };
          const docRef = await db.collection('announcements').add(createdPayload);
          setData(prev => ({
            ...prev,
            announcements: [{
              id: docRef.id,
              ...createdPayload
            }, ...prev.announcements]
          }));
        }
      } else if (type === 'products') {
        const chosenStoreId = selectedModalStoreId || form.storeId?.value || editModal.storeObj?.id || activeStore?.id || data.stores[0]?.id || '';
        if (!chosenStoreId) {
          setModalError("يرجى إضافة أو اختيار المحل/المعرض أولاً");
          showToast("يرجى إضافة أو اختيار المحل/المعرض أولاً");
          return;
        }
        const storeObj = data.stores.find(s => s.id === chosenStoreId) || editModal.storeObj || activeStore;
        const rawPrice = parseFloat(form.price.value) || 0;
        const normalizedPrice = rawPrice > 0 && rawPrice < 1000 ? rawPrice * 1000 : rawPrice;
        const rawOldPrice = parseFloat(form.oldPrice.value) || 0;
        const normalizedOldPrice = rawOldPrice > 0 && rawOldPrice < 1000 ? rawOldPrice * 1000 : rawOldPrice;
        const finalImg = (prodImgPreview || form.imageUrl?.value || '').trim();
        const catVal = form.category.value || 'paint';
        const storeSections = getStoreSectionsList(storeObj);
        const matchedSec = storeSections.find(s => s.id === catVal) || PRODUCT_CATEGORIES.find(c => c.id === catVal);
        const categoryLabelVal = matchedSec ? matchedSec.shortLabel || matchedSec.label : '';
        const brandText = form.brand.value.trim() || storeObj?.agencyBrandLabel || '';
        const isPaintSec = catVal === 'paint' || catVal.includes('paint') || catVal.startsWith('sec_');
        const payload = {
          name: form.name.value.trim(),
          category: catVal,
          categoryLabel: categoryLabelVal,
          brand: brandText,
          paintBrandKey: isPaintSec ? storeObj?.agencyBrandKey || detectDashboardPaintBrandKey(`${brandText} ${form.name.value}`) : '',
          requiresColorCode: form.requiresColorCode ? form.requiresColorCode.checked : catVal === 'paint' || catVal === 'interior_paint' || catVal === 'exterior_paint' || catVal === 'decor_paint',
          price: normalizedPrice,
          oldPrice: normalizedOldPrice,
          unit: form.unit.value.trim() || 'قطعة',
          icon: form.icon.value.trim() || matchedSec?.icon || '🎨',
          imageUrl: finalImg,
          storeId: chosenStoreId,
          storeName: storeObj ? storeObj.name : 'معرض معتمد',
          desc: form.desc.value.trim(),
          inStock: form.inStock.checked,
          updatedAt: new Date().toISOString()
        };
        if (item) {
          await db.collection('store_products').doc(item.id).update(payload);
          setData(prev => ({
            ...prev,
            products: prev.products.map(p => p.id === item.id ? {
              ...p,
              ...payload
            } : p)
          }));
        } else {
          const docRef = await db.collection('store_products').add({
            ...payload,
            createdAt: new Date().toISOString()
          });
          setData(prev => ({
            ...prev,
            products: [...prev.products, {
              id: docRef.id,
              ...payload
            }]
          }));
        }
      }
      setEditModal({
        isOpen: false,
        type: null,
        item: null,
        storeObj: null
      });
      showToast("تم الحفظ بنجاح ✓");
    } catch (error) {
      console.error(error);
      const errText = "فشل الحفظ: تأكد من الاتصال (" + (error?.message || 'خطأ غير متوقع') + ")";
      setModalError(errText);
      showToast("فشل الحفظ: تأكد من الاتصال", 4000);
    } finally {
      setSavingModal(false);
    }
  };
  const saveSettingsPayload = async (form, forcePushNow = false) => {
    if (!db) return;
    try {
      const customPass = (form.adminPassword?.value || '').trim() || MASTER_PASSWORD;
      const encryptedLocal = AlOstaCrypto.encryptSecret(customPass, 'waad_dashboard_admin');
      localStorage.setItem('waad_custom_admin_pass_enc', encryptedLocal);
      localStorage.removeItem('waad_custom_admin_pass');
      const rawApkUrl = (form.apkUrl?.value || '').trim();
      const normalizedApkUrl = normalizeDashApkUrl(rawApkUrl);
      const rawDashUrl = (form.dashboardApkUrl?.value || '').trim();
      const normalizedDashUrl = rawDashUrl ? normalizeDashApkUrl(rawDashUrl) : data.settings?.dashboardApkUrl || '';
      if (forcePushNow && !normalizedApkUrl) {
        showToast("⚠️ يرجى إدخال رابط ملف التطبيق (AlOsta_App.apk) أولاً قبل نشر التحديث", 4500);
        return;
      }
      const nextLatestVer = (form.latestVersion?.value || '1.0.10').trim();
      const payload = {
        ...(data.settings || {}),
        latestVersion: nextLatestVer,
        latestDashboardVersion: (form.latestDashboardVersion?.value || DASHBOARD_VERSION).trim(),
        apkUrl: normalizedApkUrl,
        rawApkUrl: rawApkUrl,
        dashboardApkUrl: normalizedDashUrl,
        adminPasswordHash: AlOstaCrypto.hashPassword(customPass, 'waad_dashboard_admin'),
        adminPasswordCipher: encryptedLocal,
        adminPassword: AlOstaCrypto.ENCRYPTED_MASK,
        forceUpdate: forcePushNow ? true : Boolean(form.forceUpdate?.checked),
        maintenanceMode: Boolean(form.maintenanceMode?.checked),
        stopUpdate: forcePushNow ? false : Boolean(form.stopUpdate?.checked),
        pushUpdateToken: forcePushNow ? String(Date.now()) : '',
        pushTargetVersion: forcePushNow ? nextLatestVer : '',
        monetizationEnabled: form.monetizationEnabled ? Boolean(form.monetizationEnabled.checked) : Boolean(data.settings?.monetizationEnabled),
        autoEnableOnTarget: form.autoEnableOnTarget ? Boolean(form.autoEnableOnTarget.checked) : Boolean(data.settings?.autoEnableOnTarget),
        targetContractorsCount: Math.max(1, parseInt(form.targetContractorsCount?.value) || 500),
        targetWorkersCount: Math.max(1, parseInt(form.targetWorkersCount?.value) || 2000),
        targetStoresCount: Math.max(1, parseInt(form.targetStoresCount?.value) || 15),
        freeMaxProjects: Math.max(1, parseInt(form.freeMaxProjects?.value) || 2),
        freeMaxWorkers: Math.max(1, parseInt(form.freeMaxWorkers?.value) || 5),
        freeStoreMaxProducts: Math.max(1, parseInt(form.freeStoreMaxProducts?.value) || 10),
        proContractorPrice: Math.max(0, parseInt(form.proContractorPrice?.value) || 25000),
        proContractorAnnualPrice: Math.max(0, parseInt(form.proContractorAnnualPrice?.value) || 250000),
        proStorePrice: Math.max(0, parseInt(form.proStorePrice?.value) || 75000),
        proStoreAnnualPrice: Math.max(0, parseInt(form.proStoreAnnualPrice?.value) || 750000),
        verifiedWorkerPrice: Math.max(0, parseInt(form.verifiedWorkerPrice?.value) || 5000),
        verifiedWorkerAnnualPrice: Math.max(0, parseInt(form.verifiedWorkerAnnualPrice?.value) || 50000),
        subscriptionWhatsapp: (form.subscriptionWhatsapp?.value || '').trim(),
        updatedAt: new Date().toISOString()
      };
      await db.collection('settings').doc('app_config').set(payload, {
        merge: true
      });
      setData(prev => {
        const next = {
          ...prev,
          settings: payload
        };
        try {
          localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(next));
        } catch (err) {}
        return next;
      });
      if (forcePushNow) {
        showToast(`🚀 تم حفظ ونشر التحديث (v${payload.latestVersion}) فوراً لجميع هواتف المستخدمين ✓`, 4500);
      } else {
        showToast(payload.monetizationEnabled ? "تم حفظ الإعدادات وتفعيل الخطة المدفوعة في التطبيق 💎✓" : "تم حفظ إعدادات النظام والتحديثات في السحابة ✓");
      }
    } catch (error) {
      showToast("فشل الحفظ: " + (error?.message || "تحقق من الإنترنت"), 4000);
    }
  };
  const handleSaveSettings = async e => {
    e.preventDefault();
    await saveSettingsPayload(e.target, false);
  };
  const quickSetSubscriptionDuration = async (collectionName, itemObj, flagField, planType) => {
    if (!itemObj?.id || !db) return;
    const nowIso = new Date().toISOString();
    const isActivating = planType !== 'free';
    const opt = SUBSCRIPTION_DURATION_OPTIONS.find(o => o.id === planType) || SUBSCRIPTION_DURATION_OPTIONS[0];
    const nextExpiresIso = isActivating ? computeSubscriptionExpiryIso(planType) : '';
    const updates = {
      [flagField]: isActivating,
      subscriptionPlanType: isActivating ? planType : 'free',
      subscriptionPlanLabel: isActivating ? opt.shortLabel : 'مجاني',
      subscriptionStartedAt: isActivating ? nowIso : '',
      subscriptionExpiresAt: nextExpiresIso,
      updatedAt: nowIso
    };
    try {
      setData(prev => ({
        ...prev,
        [collectionName]: (prev[collectionName] || []).map(x => x.id === itemObj.id ? {
          ...x,
          ...updates
        } : x)
      }));
      if (collectionName === 'stores' && activeStore?.id === itemObj.id) {
        setActiveStore(prev => prev ? {
          ...prev,
          ...updates
        } : prev);
      }
      const writePromise = db.collection(collectionName).doc(itemObj.id).set(updates, {
        merge: true
      });
      await raceTimeout(writePromise, 3500, {
        timedOut: true
      });
      showToast(isActivating ? `تم تفعيل وتجديد اشتراك (${opt.label}) بنجاح 👑✓` : "تم تحويل الحساب إلى الباقة المجانية ✓");
    } catch (e) {
      showToast("تعذر تحديث مدة الاشتراك");
    }
  };
  const openSubscriptionModal = (collectionName, itemObj, flagField) => {
    if (!itemObj?.id) return;
    const info = getEntitySubscriptionInfo(itemObj, flagField);
    const defaultCustom = info.expiresAt ? String(info.expiresAt).slice(0, 10) : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    setSubModal({
      isOpen: true,
      collectionName,
      item: itemObj,
      flagField,
      planType: info.planType || 'monthly',
      customDate: defaultCustom,
      saving: false
    });
  };
  const handleApplySubscription = async (actionMode = 'activate') => {
    const {
      collectionName,
      item: itemObj,
      flagField,
      planType,
      customDate
    } = subModal;
    if (!itemObj?.id || !db) return;
    setSubModal(prev => ({
      ...prev,
      saving: true
    }));
    const nowIso = new Date().toISOString();
    const isActivating = actionMode !== 'revoke';
    const opt = SUBSCRIPTION_DURATION_OPTIONS.find(o => o.id === planType) || SUBSCRIPTION_DURATION_OPTIONS[0];
    const baseForCalc = actionMode === 'extend' && itemObj.subscriptionExpiresAt ? itemObj.subscriptionExpiresAt : null;
    const nextExpiresIso = isActivating ? computeSubscriptionExpiryIso(planType, customDate, baseForCalc) : '';
    const updates = {
      [flagField]: isActivating,
      subscriptionPlanType: isActivating ? planType : 'free',
      subscriptionPlanLabel: isActivating ? opt.shortLabel : 'مجاني',
      subscriptionStartedAt: isActivating ? actionMode === 'extend' && itemObj.subscriptionStartedAt ? itemObj.subscriptionStartedAt : nowIso : '',
      subscriptionExpiresAt: nextExpiresIso,
      updatedAt: nowIso
    };
    try {
      const writePromise = db.collection(collectionName).doc(itemObj.id).set(updates, {
        merge: true
      });
      await raceTimeout(writePromise, 3500, {
        timedOut: true
      });
      setData(prev => ({
        ...prev,
        [collectionName]: (prev[collectionName] || []).map(x => x.id === itemObj.id ? {
          ...x,
          ...updates
        } : x)
      }));
      if (collectionName === 'stores' && activeStore?.id === itemObj.id) {
        setActiveStore(prev => prev ? {
          ...prev,
          ...updates
        } : prev);
      }
      setSubModal({
        isOpen: false,
        collectionName: '',
        item: null,
        flagField: '',
        planType: 'monthly',
        customDate: '',
        saving: false
      });
      showToast(isActivating ? `تم تفعيل باقة (${opt.label}) بنجاح 👑✓` : "تم إلغاء الاشتراك وتحويل الحساب إلى الباقة المجانية ✓");
    } catch (e) {
      setSubModal(prev => ({
        ...prev,
        saving: false
      }));
      showToast("تعذر تحديث حالة الاشتراك");
    }
  };
  const handleAnnImageUpload = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgBusy(true);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 600, 0.80);
      setAnnImgPreview(dataUrl);
      showToast("تم إرفاق وضغط صورة الإعلان بنجاح ✓");
    } catch (err) {
      showToast("تعذر قراءة الصورة، جرب صورة أخرى");
    }
    setImgBusy(false);
  };
  const toggleAnnouncementActive = async ann => {
    if (!db || !ann?.id) return;
    const nextActive = !ann.isActive;
    try {
      const updatedAt = new Date().toISOString();
      await db.collection('announcements').doc(ann.id).update({
        isActive: nextActive,
        updatedAt
      });
      setData(prev => ({
        ...prev,
        announcements: prev.announcements.map(a => a.id === ann.id ? {
          ...a,
          isActive: nextActive,
          updatedAt
        } : a)
      }));
      showToast(nextActive ? `تم تفعيل الإعلان "${ann.title}" فوراً ✓` : `تم إيقاف الإعلان "${ann.title}" مؤقتاً`);
    } catch (e) {
      showToast("تعذر تحديث حالة الإعلان");
    }
  };
  const rebroadcastAnnouncement = async ann => {
    if (!db || !ann?.id) return;
    try {
      const broadcastId = Date.now();
      const updatedAt = new Date().toISOString();
      await db.collection('announcements').doc(ann.id).update({
        broadcastId,
        isActive: true,
        updatedAt
      });
      setData(prev => ({
        ...prev,
        announcements: prev.announcements.map(a => a.id === ann.id ? {
          ...a,
          broadcastId,
          isActive: true,
          updatedAt
        } : a)
      }));
      showToast(`تمت إعادة بث الإعلان "${ann.title}" ليظهر لجميع المستخدمين من جديد 🔄✓`);
    } catch (e) {
      showToast("تعذر إعادة بث الإعلان");
    }
  };
  const toggleSystemMaintenance = async () => {
    if (!db) return;
    const nextMaint = !data.settings?.maintenanceMode;
    try {
      await db.collection('settings').doc('app_config').set({
        maintenanceMode: nextMaint
      }, {
        merge: true
      });
      setData(prev => ({
        ...prev,
        settings: {
          ...prev.settings,
          maintenanceMode: nextMaint
        }
      }));
      showToast(nextMaint ? "🛠️ تم تفعيل وضع الصيانة للنظام بنجاح" : "✅ تم إنهاء وضع الصيانة وإعادة تشغيل النظام للجميع");
    } catch (e) {
      showToast("تعذر تغيير وضع الصيانة");
    }
  };
  const ANNOUNCEMENT_TEMPLATES = [{
    label: '🛠️ إشعار صيانة وتحديث للنظام',
    adType: 'maintenance',
    target: 'all',
    maxViews: 3,
    title: '🛠️ تحديث وصيانة دورية لنظام الأسطة',
    content: 'أعزاءنا المقاولين والحرفيين، تم تحديث خوادم نظام الأسطة لتحسين سرعة المزامنة ودقة تحديد المواقع (GPS) ومتجر المواد. نتمنى لكم تجربة عمل موفقة!',
    buttonLabel: '',
    linkUrl: ''
  }, {
    label: '🎨 عرض خصومات متجر الأصباغ والجبس بورد',
    adType: 'promo',
    target: 'admin',
    maxViews: 5,
    title: '🔥 عروض خاصة للمقاولين في متجر الأصباغ والجبس بورد',
    content: 'تصفح الآن أحدث أسعار أصباغ جوتن وألواح الجبس بورد الكناوف والبوردكس من الوكلاء المعتمدين مع توصيل مباشر لموقع مشروعك عبر واتساب.',
    buttonLabel: '',
    linkUrl: ''
  }, {
    label: '📍 تنبيه تفعيل موقع المشروع (GPS) للعمال',
    adType: 'urgent',
    target: 'worker',
    maxViews: 5,
    title: '📍 تنبيه هام بخصوص تسجيل الدخول والحضور الميداني',
    content: 'يرجى التأكد من تفعيل خدمة الموقع الجغرافي (GPS) والتواجد الفعلي داخل نطاق موقع المشروع المحدد من قبل المقاول عند تسجيل الدخول وإثبات الحضور اليومي.',
    buttonLabel: '',
    linkUrl: ''
  }, {
    label: '📢 إعلان ترحيبي وإرشادات عامة',
    adType: 'info',
    target: 'all',
    maxViews: 2,
    title: '📢 مرحباً بكم في الإصدار المطور من تطبيق الأسطة',
    content: 'نظام الأسطة يوفر إدارة متكاملة للمشاريع، حسابات السيولة والسلف، متابعة الجهد البدني، وتسجيل الحضور الذكي بالموقع الجغرافي.',
    buttonLabel: '',
    linkUrl: ''
  }];
  const createFromTemplate = tpl => {
    setAnnImgPreview('');
    setAnnDraft({
      title: tpl.title,
      content: tpl.content,
      adType: tpl.adType || 'info',
      target: tpl.target || 'all',
      maxViews: tpl.maxViews || 3,
      linkUrl: tpl.linkUrl || '',
      buttonLabel: tpl.buttonLabel || '',
      expiresAt: '',
      isPinned: false,
      isActive: true
    });
    setEditModal({
      isOpen: true,
      type: 'announcements',
      item: null,
      storeObj: null
    });
  };
  const whatsappOrders = data.storeOrders.filter(o => o.sentViaWhatsApp === true);
  const getStoreWhatsAppStats = storeObj => {
    if (!storeObj) return {
      ordersCount: 0,
      totalSoldQty: 0,
      soldItemsList: [],
      lastDate: ''
    };
    const matchedOrders = whatsappOrders.filter(o => o.storeId === storeObj.id || o.storeName === storeObj.name || Array.isArray(o.orderDetails) && o.orderDetails.some(d => d.storeId === storeObj.id));
    let totalSoldQty = 0;
    const itemsMap = {};
    matchedOrders.forEach(ord => {
      const details = Array.isArray(ord.orderDetails) ? ord.orderDetails.filter(d => !d.storeId || d.storeId === storeObj.id || ord.storeId === storeObj.id) : [];
      if (details.length > 0) {
        details.forEach(d => {
          const q = Number(d.qty) || 1;
          totalSoldQty += q;
          const key = `${d.name || 'مادة'}__${d.unit || 'قطعة'}`;
          if (!itemsMap[key]) {
            itemsMap[key] = {
              name: d.name || 'مادة',
              unit: d.unit || 'قطعة',
              qty: 0
            };
          }
          itemsMap[key].qty += q;
        });
      } else {
        const q = Number(ord.totalQty) || 1;
        totalSoldQty += q;
        const label = (ord.items || 'طلبية مواد').split(' + ')[0].trim();
        const key = `${label}__طلب`;
        if (!itemsMap[key]) {
          itemsMap[key] = {
            name: label,
            unit: 'قطعة',
            qty: 0
          };
        }
        itemsMap[key].qty += q;
      }
    });
    return {
      ordersCount: matchedOrders.length,
      totalSoldQty,
      soldItemsList: Object.values(itemsMap).sort((a, b) => b.qty - a.qty),
      lastDate: matchedOrders[0]?.date || '',
      matchedIds: matchedOrders.map(o => o.id)
    };
  };
  const clearStoreWhatsAppCounter = (storeObj, matchedIds) => {
    if (!matchedIds || matchedIds.length === 0) return;
    setConfirmDialog({
      isOpen: true,
      text: `هل تريد تصفير عداد الطلبات والكميات المباعة لـ "${storeObj.name}"؟`,
      onConfirm: async () => {
        try {
          const batch = db.batch();
          matchedIds.forEach(id => batch.delete(db.collection('store_orders').doc(id)));
          await batch.commit();
          showToast(`تم تصفير عداد الطلبات لـ "${storeObj.name}" ✓`);
        } catch (e) {
          showToast("فشل تصفير العداد");
        }
      }
    });
  };
  const cleanupFakeAccounts = () => {
    setConfirmDialog({
      isOpen: true,
      text: 'هذا الإجراء سيحذف كل العمال الذين ليس لديهم اسم أو رقم هاتف صحيح. هل أنت متأكد؟',
      onConfirm: async () => {
        try {
          const batch = db.batch();
          let deletedCount = 0;
          data.workers.forEach(w => {
            const isFake = !w.name || w.name.trim().length < 2 || !w.phone || w.phone.trim().length < 5;
            if (isFake) {
              batch.delete(db.collection('workers').doc(w.id));
              deletedCount++;
            }
          });
          if (deletedCount > 0) {
            await batch.commit();
            showToast(`تم تنظيف ${deletedCount} حساب وهمي بنجاح.`, 4000);
            loadData();
          } else {
            showToast("لا توجد حسابات وهمية للتنظيف.");
          }
        } catch (e) {
          showToast("فشل التنظيف");
        }
      }
    });
  };
  const migrateAccounts = async () => {
    if (!confirm("⚠️ تنبيه هام: سيتم إنشاء حسابات Auth رسمية لجميع العمال والمقاولين. هل أنت جاهز للترحيل؟")) return;
    setIsMigrating(true);
    setMigrationLog(['بدء ترحيل الحسابات... برجاء عدم إغلاق النافذة.']);
    let secondaryApp;
    try {
      secondaryApp = firebase.app("Secondary");
    } catch (e) {
      secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
    }
    let count = 0,
      fail = 0;
    for (const a of data.admins) {
      try {
        const safeEmail = encodeURIComponent(a.id).replace(/%/g, 'x').toLowerCase() + '@admin.waad.com';
        const rawPass = AlOstaCrypto.revealPassword(a, a.id) || '123456';
        const safePass = rawPass.padEnd(6, '0');
        const cred = await secondaryApp.auth().createUserWithEmailAndPassword(safeEmail, safePass);
        const creds = AlOstaCrypto.buildProtectedCredentials(rawPass, a.id);
        await db.collection('admins').doc(a.id).update({
          authUid: cred.user.uid,
          ...creds
        });
        setMigrationLog(p => [...p, `✅ تم تشفير وترحيل مقاول: ${a.id}`]);
        count++;
      } catch (e) {
        setMigrationLog(p => [...p, e.code === 'auth/email-already-in-use' ? `⚠️ مقاول مسجل مسبقاً: ${a.id}` : `❌ خطأ ${a.id}: ${e.message}`]);
        if (e.code !== 'auth/email-already-in-use') fail++;
      }
    }
    for (const w of data.workers) {
      if (!w.phone || w.phone.trim().length === 0) continue;
      try {
        let phoneEmail = w.phone.trim() + '@waad.com';
        const rawPass = AlOstaCrypto.revealPassword(w, w.phone.trim()) || 'waad2026';
        const safePass = rawPass.padEnd(6, '0');
        const cred = await secondaryApp.auth().createUserWithEmailAndPassword(phoneEmail, safePass);
        const creds = AlOstaCrypto.buildProtectedCredentials(rawPass, w.phone.trim());
        await db.collection('workers').doc(w.id).update({
          authUid: cred.user.uid,
          ...creds
        });
        if (w.loginCode && w.loginCode.trim().length >= 3) {
          try {
            let codeEmail = w.loginCode.trim().toUpperCase() + '@code.waad.com';
            const codeCred = await secondaryApp.auth().createUserWithEmailAndPassword(codeEmail, w.loginCode.trim());
            await db.collection('workers').doc(w.id).update({
              codeAuthUid: codeCred.user.uid,
              loginCodeHash: AlOstaCrypto.hashPassword(w.loginCode.trim().toUpperCase(), 'worker_code')
            });
          } catch (err) {}
        }
        setMigrationLog(p => [...p, `✅ تم تشفير وترحيل عامل: ${w.name}`]);
        count++;
      } catch (e) {
        setMigrationLog(p => [...p, e.code === 'auth/email-already-in-use' ? `⚠️ عامل مسجل مسبقاً: ${w.name}` : `❌ خطأ ${w.name}: ${e.message}`]);
        if (e.code !== 'auth/email-already-in-use') fail++;
      }
    }
    setMigrationLog(p => [...p, `🎉 اكتمل التشفير والترحيل! (نجاح: ${count}, أخطاء: ${fail})`]);
    setIsMigrating(false);
    await secondaryApp.auth().signOut();
    loadData(true);
  };
  const renderStoreProductCard = (prod, storeContext = null) => {
    const cat = resolveCategoryBadge(prod.category, storeContext, prod.categoryLabel);
    return /*#__PURE__*/React.createElement("div", {
      key: prod.id,
      className: "bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col justify-between transition-all hover:border-indigo-400"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "relative h-40 w-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center overflow-hidden border-b border-slate-100 dark:border-slate-700"
    }, prod.imageUrl ? /*#__PURE__*/React.createElement("img", {
      src: prod.imageUrl,
      alt: prod.name,
      className: "w-full h-full object-cover",
      onError: e => {
        e.target.style.display = 'none';
      }
    }) : /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col items-center justify-center text-slate-400 gap-1"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-4xl"
    }, prod.icon || cat.icon || '🎨'), /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-bold"
    }, "\u0628\u062F\u0648\u0646 \u0635\u0648\u0631\u0629 \u0645\u0631\u0641\u0642\u0629")), /*#__PURE__*/React.createElement("span", {
      className: `absolute top-2.5 right-2.5 text-[10px] px-2.5 py-1 rounded-lg font-black shadow-sm backdrop-blur-md ${cat.badgeClass}`
    }, cat.label), /*#__PURE__*/React.createElement("span", {
      className: `absolute top-2.5 left-2.5 text-[10px] px-2.5 py-1 rounded-lg font-black shadow-sm ${prod.inStock !== false ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`
    }, prod.inStock !== false ? 'متوفر ✓' : 'نفذ')), /*#__PURE__*/React.createElement("div", {
      className: "p-4"
    }, prod.brand && /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] text-indigo-600 dark:text-indigo-400 font-black mb-0.5"
    }, "\uD83C\uDFF7\uFE0F \u0627\u0644\u0645\u0627\u0631\u0643\u0629: ", prod.brand), /*#__PURE__*/React.createElement("h3", {
      className: "font-black text-sm text-slate-800 dark:text-white leading-snug"
    }, prod.name), prod.desc && /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-slate-500 dark:text-slate-400 mt-1.5 bg-slate-50 dark:bg-slate-900 p-2 rounded-xl line-clamp-2"
    }, prod.desc), /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] font-black text-emerald-700 dark:text-emerald-400 mt-2 flex items-center gap-1"
    }, /*#__PURE__*/React.createElement("span", null, "\uD83C\uDFEA \u0627\u0644\u0645\u062D\u0644:"), /*#__PURE__*/React.createElement("span", null, storeContext?.name || prod.storeName || 'معرض معتمد')))), /*#__PURE__*/React.createElement("div", {
      className: "px-4 pb-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/60"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "flex items-baseline gap-1"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-black text-base text-emerald-600 dark:text-emerald-400 dir-ltr"
    }, (prod.price || 0).toLocaleString('en-US'), " \u062F.\u0639"), /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] text-slate-400 font-bold"
    }, "/ ", prod.unit || 'قطعة')), prod.oldPrice > prod.price && /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] text-slate-400 line-through font-bold block dir-ltr"
    }, (prod.oldPrice || 0).toLocaleString('en-US'), " \u062F.\u0639")), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-1.5"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => openModal('products', prod, storeContext),
      className: "px-3 py-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 rounded-xl font-black text-xs flex items-center gap-1 hover:bg-amber-100"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "edit-2",
      size: 14
    }), " \u062A\u0639\u062F\u064A\u0644"), /*#__PURE__*/React.createElement("button", {
      onClick: () => triggerDelete('store_products', prod.id, 'products'),
      className: "p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-600 rounded-xl hover:bg-rose-100",
      title: "\u062D\u0630\u0641"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "trash-2",
      size: 15
    })))));
  };
  if (portalPreviewStore) {
    return /*#__PURE__*/React.createElement(StoreOwnerPortal, {
      initialStoreObj: portalPreviewStore,
      isAdminPreview: true,
      onExit: () => setPortalPreviewStore(null)
    });
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "flex h-screen overflow-hidden relative"
  }, msg && /*#__PURE__*/React.createElement("div", {
    className: "fixed top-5 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl z-[1000] font-bold text-sm animate-enter border border-indigo-500/40"
  }, msg), isSidebarOpen && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 bg-black/50 z-40 md:hidden",
    onClick: () => setIsSidebarOpen(false)
  }), /*#__PURE__*/React.createElement("div", {
    className: `fixed inset-y-0 right-0 z-50 w-72 bg-slate-900 text-white p-5 flex flex-col hide-scroll overflow-y-auto shrink-0 transition-transform duration-300 md:relative md:translate-x-0 md:flex ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-6 text-center relative"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsSidebarOpen(false),
    className: "md:hidden absolute top-0 -right-2 p-2 text-slate-400 hover:text-white"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 24
  })), /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-lg"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield",
    size: 30
  })), /*#__PURE__*/React.createElement("h1", {
    className: "font-black text-lg"
  }, "\u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 \u0627\u0644\u0646\u0638\u0627\u0645 \u0648\u0627\u0644\u0645\u062A\u062C\u0631"), /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] text-slate-400 font-bold mt-0.5"
  }, "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0639\u0627\u0631\u0636 \u0648\u0645\u0646\u062A\u062C\u0627\u062A \u0648\u0623\u0633\u0639\u0627\u0631 \u0643\u0644 \u0645\u062D\u0644")), /*#__PURE__*/React.createElement("nav", {
    className: "flex-1 space-y-1.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-black text-indigo-400 px-3 pt-1 pb-1 uppercase tracking-wider"
  }, "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062A\u062C\u0631 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setView('stores');
      setActiveStore(null);
      setIsSidebarOpen(false);
    },
    className: `w-full flex items-center justify-between p-3 rounded-xl font-bold text-sm transition-all ${view === 'stores' ? 'bg-indigo-600 shadow-lg' : 'hover:bg-slate-800'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "store"
  }), " \u0627\u0644\u0645\u062D\u0644\u0627\u062A \u0648\u0627\u0644\u0645\u0639\u0627\u0631\u0636 \u0648\u0645\u0646\u062A\u062C\u0627\u062A\u0647\u0627"), /*#__PURE__*/React.createElement("span", {
    className: "text-xs bg-white/15 px-2 py-0.5 rounded-lg"
  }, data.stores.length)), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setView('products');
      if (!activeStore && data.stores[0]) setActiveStore(data.stores[0]);
      setIsSidebarOpen(false);
    },
    className: `w-full flex items-center justify-between p-3 rounded-xl font-bold text-sm transition-all ${view === 'products' ? 'bg-indigo-600 shadow-lg' : 'hover:bg-slate-800'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shopping-bag"
  }), " \u0645\u0646\u062A\u062C\u0627\u062A \u0648\u0623\u0633\u0639\u0627\u0631 \u0643\u0644 \u0645\u0639\u0631\u0636"), /*#__PURE__*/React.createElement("span", {
    className: "text-xs bg-white/15 px-2 py-0.5 rounded-lg"
  }, data.products.length)), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setView('storeOrders');
      setIsSidebarOpen(false);
    },
    className: `w-full flex items-center justify-between p-3 rounded-xl font-bold text-sm transition-all ${view === 'storeOrders' ? 'bg-indigo-600 shadow-lg' : 'hover:bg-slate-800'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "package"
  }), " \u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0645\u062A\u062C\u0631 \u0627\u0644\u0648\u0627\u0631\u062F\u0629"), /*#__PURE__*/React.createElement("span", {
    className: "text-xs bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-lg"
  }, whatsappOrders.length)), /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-black text-indigo-400 px-3 pt-4 pb-1 uppercase tracking-wider"
  }, "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646 \u0648\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setView('subscriptions');
      setIsSidebarOpen(false);
    },
    className: `w-full flex items-center justify-between p-3 rounded-xl font-black text-sm transition-all border ${view === 'subscriptions' ? 'bg-gradient-to-l from-amber-500 to-amber-400 text-slate-950 border-amber-300 shadow-lg' : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDC8E"), /*#__PURE__*/React.createElement("span", null, "\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0648\u062A\u062C\u062F\u064A\u062F \u0627\u0644\u0628\u0627\u0642\u0627\u062A")), /*#__PURE__*/React.createElement("span", {
    className: `text-xs px-2 py-0.5 rounded-lg font-black ${view === 'subscriptions' ? 'bg-slate-950 text-amber-300' : 'bg-amber-400/20 text-amber-300'}`
  }, "\u0634\u0647\u0631\u064A/\u0633\u0646\u0648\u064A")), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setView('workers');
      setIsSidebarOpen(false);
    },
    className: `w-full flex items-center justify-between p-3 rounded-xl font-bold text-sm transition-all ${view === 'workers' ? 'bg-indigo-600' : 'hover:bg-slate-800'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users"
  }), " \u0627\u0644\u0639\u0645\u0627\u0644"), /*#__PURE__*/React.createElement("span", {
    className: "text-xs bg-white/15 px-2 py-0.5 rounded-lg"
  }, data.workers.length)), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setView('admins');
      setIsSidebarOpen(false);
    },
    className: `w-full flex items-center justify-between p-3 rounded-xl font-bold text-sm transition-all ${view === 'admins' ? 'bg-indigo-600' : 'hover:bg-slate-800'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "hard-hat"
  }), " \u0627\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646"), /*#__PURE__*/React.createElement("span", {
    className: "text-xs bg-white/15 px-2 py-0.5 rounded-lg"
  }, data.admins.length)), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setView('announcements');
      setIsSidebarOpen(false);
    },
    className: `w-full flex items-center justify-between p-3 rounded-xl font-bold text-sm transition-all ${view === 'announcements' ? 'bg-indigo-600 shadow-lg' : 'hover:bg-slate-800'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "megaphone"
  }), " \u0625\u0639\u0644\u0627\u0646\u0627\u062A \u0648\u0635\u064A\u0627\u0646\u0629 \u0627\u0644\u0646\u0638\u0627\u0645"), /*#__PURE__*/React.createElement("span", {
    className: "text-xs bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-lg"
  }, data.announcements.filter(a => a.isActive).length, "/", data.announcements.length)), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setView('settings');
      setIsSidebarOpen(false);
    },
    className: `w-full flex items-center gap-3 p-3 rounded-xl font-bold text-sm transition-all ${view === 'settings' ? 'bg-indigo-600' : 'hover:bg-slate-800'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "settings"
  }), " \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0648\u0627\u0644\u0628\u0627\u0642\u0627\u062A")), /*#__PURE__*/React.createElement("div", {
    className: "mt-4 pt-4 border-t border-slate-800 space-y-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setIsSidebarOpen(false);
      if (typeof window.__triggerDashboardUpdate === 'function') {
        window.__triggerDashboardUpdate();
      }
    },
    className: "w-full flex items-center justify-between p-3 rounded-xl bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white font-bold text-xs transition-all border border-indigo-500/30"
  }, /*#__PURE__*/React.createElement("span", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "download-cloud",
    size: 16
  }), " \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F"), /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[10px] bg-indigo-500/30 px-2 py-0.5 rounded"
  }, "v", DASHBOARD_VERSION)), /*#__PURE__*/React.createElement("button", {
    onClick: cleanupFakeAccounts,
    className: "w-full flex items-center gap-3 p-3 rounded-xl bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white font-bold text-sm transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trash-2"
  }), " \u062A\u0646\u0638\u064A\u0641 \u0627\u0644\u0648\u0647\u0645\u064A"), /*#__PURE__*/React.createElement("button", {
    onClick: onLogout,
    className: "w-full flex items-center gap-3 p-3 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold text-sm transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "log-out"
  }), " \u062E\u0631\u0648\u062C"))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden w-full"
  }, /*#__PURE__*/React.createElement("header", {
    className: "bg-white dark:bg-slate-800 shadow-sm p-3.5 sm:p-4 flex justify-between items-center gap-2 z-10 shrink-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "md:hidden flex items-center gap-2 shrink-0"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsSidebarOpen(true),
    className: "p-2 bg-slate-100 dark:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "menu",
    size: 20
  }))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 max-w-md mx-auto relative px-1"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    className: "absolute right-4 top-3 text-slate-400",
    size: 18
  }), /*#__PURE__*/React.createElement("input", {
    value: searchQuery,
    onChange: e => setSearchQuery(e.target.value),
    placeholder: "\u0627\u0628\u062D\u062B \u0639\u0646 \u0645\u0642\u0627\u0648\u0644\u060C \u0639\u0627\u0645\u0644\u060C \u0623\u0648 \u0645\u0639\u0631\u0636...",
    className: "w-full bg-slate-100 dark:bg-slate-700 rounded-xl py-2.5 pr-9 pl-3 outline-none font-bold text-xs sm:text-sm focus:ring-2 ring-indigo-500"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1.5 shrink-0"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setView('subscriptions'),
    className: `px-3 py-2.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all ${view === 'subscriptions' ? 'bg-amber-400 text-slate-950 shadow-md' : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'}`,
    title: "\u0625\u062F\u0627\u0631\u0629 \u0648\u062A\u062C\u062F\u064A\u062F \u0645\u062F\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A (\u0634\u0647\u0631\u064A / \u0633\u0646\u0648\u064A)"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDC8E"), /*#__PURE__*/React.createElement("span", null, "\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A")), /*#__PURE__*/React.createElement("button", {
    onClick: loadData,
    className: "p-2.5 bg-indigo-50 dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 rounded-xl font-bold text-xs flex items-center gap-1.5",
    title: "\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh-cw",
    size: 16
  }), /*#__PURE__*/React.createElement("span", {
    className: "hidden sm:inline"
  }, "\u062A\u062D\u062F\u064A\u062B")))), /*#__PURE__*/React.createElement("main", {
    className: "flex-1 overflow-auto p-4 md:p-6 w-full"
  }, loading ? /*#__PURE__*/React.createElement("div", {
    className: "flex justify-center items-center h-full"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"
  })) : view === 'stores' ? activeStore ? ( /* MASTER-DETAIL STORE WORKSPACE */
  (() => {
    const storeTypeInfo = STORE_TYPES.find(t => t.id === activeStore.storeType) || STORE_TYPES[0];
    const agencyBrandObj = activeStore.agencyBrandKey ? PAINT_AGENCY_BRANDS.find(b => b.id === activeStore.agencyBrandKey) : null;
    const storeSections = getStoreSectionsList(activeStore);
    const allStoreProducts = data.products.filter(p => p.storeId === activeStore.id);
    const filteredStoreProducts = allStoreProducts.filter(p => activeStoreSecFilter === 'all' || p.category === activeStoreSecFilter).filter(p => !searchQuery || (p.name || '').includes(searchQuery) || (p.brand || '').includes(searchQuery));
    const payMethod = getStorePaymentMethodInfo(activeStore.paymentMethod);
    const accNum = getStoreAccountNumber(activeStore);
    const qrSrc = getStoreQrImageSrc(activeStore, 260);
    const coords = extractCoords(activeStore.location);
    const waStats = getStoreWhatsAppStats(activeStore);
    return /*#__PURE__*/React.createElement("div", {
      className: "animate-enter space-y-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-gradient-to-l from-indigo-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl space-y-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center justify-between gap-2"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setActiveStore(null),
      className: "bg-white/15 hover:bg-white/25 text-white px-3 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "arrow-right",
      size: 14
    }), " \u0631\u062C\u0648\u0639 \u0644\u0644\u062F\u0644\u064A\u0644"), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2 shrink-0"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => openModal('stores', activeStore),
      className: "bg-white/10 hover:bg-white/20 text-amber-300 px-3 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 whitespace-nowrap"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "edit-2",
      size: 13
    }), " \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0645\u0639\u0631\u0636"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => openModal('products', null, activeStore),
      className: "bg-amber-400 hover:bg-amber-300 text-slate-950 px-3.5 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 shadow-lg whitespace-nowrap"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 14
    }), " \u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C"))), data.stores.length > 1 && /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2 bg-white/5 px-2.5 py-1.5 rounded-2xl border border-white/10"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black text-indigo-200 whitespace-nowrap shrink-0"
    }, "\uD83C\uDFEA \u0627\u0644\u0645\u0639\u0631\u0636:"), /*#__PURE__*/React.createElement("select", {
      value: activeStore.id,
      onChange: e => {
        const target = data.stores.find(s => s.id === e.target.value);
        if (target) {
          setActiveStore(target);
          setActiveStoreSubTab('products');
          setActiveStoreSecFilter('all');
        }
      },
      className: "w-full min-w-0 bg-transparent text-white py-1 text-xs font-black outline-none truncate",
      title: "\u0627\u0646\u062A\u0642\u0627\u0644 \u0633\u0631\u064A\u0639 \u0644\u0645\u0639\u0631\u0636 \u0622\u062E\u0631"
    }, data.stores.map(st => /*#__PURE__*/React.createElement("option", {
      key: st.id,
      value: st.id,
      className: "text-slate-900 bg-white"
    }, st.name, " (", data.products.filter(p => p.storeId === st.id).length, " \u0645\u0646\u062A\u062C)")))), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2.5 border-t border-white/10"
    }, /*#__PURE__*/React.createElement("div", {
      className: "space-y-1 min-w-0"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-1.5"
    }, /*#__PURE__*/React.createElement("span", {
      className: `text-[10px] px-2.5 py-0.5 rounded-lg font-black ${storeTypeInfo.badgeClass}`
    }, storeTypeInfo.shortLabel || storeTypeInfo.label), agencyBrandObj && /*#__PURE__*/React.createElement("span", {
      className: `text-[10px] px-2.5 py-0.5 rounded-lg font-black ${agencyBrandObj.badgeClass}`
    }, "\uD83C\uDFAF \u0648\u0643\u0627\u0644\u0629 ", agencyBrandObj.label), /*#__PURE__*/React.createElement("span", {
      className: `text-[10px] px-2.5 py-0.5 rounded-lg font-black ${activeStore.isActive !== false ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'}`
    }, activeStore.isActive !== false ? '✓ مفعّل' : '✕ موقوف'), (() => {
      const activeSub = getEntitySubscriptionInfo(activeStore, 'isVipStore');
      return /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => openSubscriptionModal('stores', activeStore, 'isVipStore'),
        className: `text-[10px] px-2.5 py-0.5 rounded-lg font-black border transition-all ${activeSub.isActive ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-xs' : 'bg-white/15 text-amber-200 border-white/20'}`
      }, activeSub.isActive ? `💎 VIP • ${activeSub.planLabel}${activeSub.daysLeft !== null ? ` (متبقي ${activeSub.daysLeft} يوم)` : ''} — تجديد 📅` : '📅 تفعيل / تجديد اشتراك VIP');
    })()), /*#__PURE__*/React.createElement("h2", {
      className: "font-black text-xl sm:text-2xl truncate"
    }, activeStore.name), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-indigo-200 flex flex-wrap items-center gap-3 font-bold"
    }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCCD ", activeStore.gov || 'بغداد', " \u2014 ", activeStore.address || 'بدون عنوان'), activeStore.phone && /*#__PURE__*/React.createElement("span", {
      className: "dir-ltr"
    }, "\uD83D\uDCDE ", activeStore.phone), /*#__PURE__*/React.createElement("span", null, coords ? '🛰️ GPS مضبوط' : '⚠️ بدون GPS'), /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCAC ", waStats.ordersCount, " \u0637\u0644\u0628\u0627\u062A"))))), /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 grid grid-cols-3 gap-1.5 shadow-xs"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setActiveStoreSubTab('products'),
      className: `py-2.5 px-2 rounded-xl font-black text-[11px] sm:text-xs flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${activeStoreSubTab === 'products' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`
    }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDECD\uFE0F \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A"), /*#__PURE__*/React.createElement("span", {
      className: `text-[10px] px-2 py-0.5 rounded-full ${activeStoreSubTab === 'products' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`
    }, allStoreProducts.length)), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setActiveStoreSubTab('portal'),
      className: `py-2.5 px-2 rounded-xl font-black text-[11px] sm:text-xs flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${activeStoreSubTab === 'portal' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`
    }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDD17 \u0627\u0644\u0628\u0648\u0627\u0628\u0629"), /*#__PURE__*/React.createElement("span", {
      className: `text-[10px] font-mono px-1.5 py-0.5 rounded-full dir-ltr truncate max-w-full ${activeStoreSubTab === 'portal' ? 'bg-white/20 text-white' : 'bg-indigo-50 dark:bg-slate-900 text-indigo-600 dark:text-indigo-400'}`
    }, getStorePortalCode(activeStore))), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setActiveStoreSubTab('payment'),
      className: `py-2.5 px-2 rounded-xl font-black text-[11px] sm:text-xs flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${activeStoreSubTab === 'payment' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`
    }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCB3 \u0627\u0644\u062F\u0641\u0639"), /*#__PURE__*/React.createElement("span", {
      className: `text-[10px] px-2 py-0.5 rounded-full truncate max-w-full ${activeStoreSubTab === 'payment' ? 'bg-white/20 text-white' : 'bg-emerald-50 dark:bg-slate-900 text-emerald-700 dark:text-emerald-400'}`
    }, payMethod.shortLabel))), activeStoreSubTab === 'products' ? /*#__PURE__*/React.createElement("div", {
      className: "space-y-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-1.5"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setActiveStoreSecFilter('all'),
      className: `px-3 py-1.5 rounded-xl font-black text-xs transition-all ${activeStoreSecFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`
    }, "\u0627\u0644\u0643\u0644 (", allStoreProducts.length, ")"), storeSections.map(sec => {
      const secCount = allStoreProducts.filter(p => p.category === sec.id).length;
      const isSel = activeStoreSecFilter === sec.id;
      return /*#__PURE__*/React.createElement("button", {
        key: sec.id,
        type: "button",
        onClick: () => setActiveStoreSecFilter(sec.id),
        className: `px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1 transition-all ${isSel ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`
      }, /*#__PURE__*/React.createElement("span", null, sec.icon || '📂'), /*#__PURE__*/React.createElement("span", null, sec.label), /*#__PURE__*/React.createElement("span", {
        className: `text-[10px] px-1.5 rounded-md ${isSel ? 'bg-white/20' : 'bg-white dark:bg-slate-800 text-slate-500'}`
      }, secCount));
    })), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => {
        openModal('stores', activeStore);
        setStoreModalTab('sections');
      },
      className: "px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-black text-xs shrink-0"
    }, "\u2699\uFE0F \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0623\u0642\u0633\u0627\u0645")), filteredStoreProducts.length === 0 ? /*#__PURE__*/React.createElement("div", {
      className: "text-center py-12 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-6"
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-slate-700 text-indigo-600 mx-auto flex items-center justify-center mb-3"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "shopping-bag",
      size: 28
    })), /*#__PURE__*/React.createElement("h3", {
      className: "font-black text-base text-slate-800 dark:text-white"
    }, allStoreProducts.length === 0 ? `لا توجد منتجات داخل "${activeStore.name}" بعد` : 'لا توجد منتجات مطابقة في هذا القسم'), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-slate-500 mt-1 mb-4 font-bold"
    }, "\u0623\u0636\u0641 \u0645\u0646\u062A\u062C\u0627\u062A \u0648\u0623\u0633\u0639\u0627\u0631 \u0648\u0635\u0648\u0631 \u062E\u0627\u0635\u0629 \u0628\u0647\u0630\u0627 \u0627\u0644\u0645\u0639\u0631\u0636 \u0641\u0642\u0637 \u0644\u062A\u0638\u0647\u0631 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646 \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642."), /*#__PURE__*/React.createElement("button", {
      onClick: () => openModal('products', null, activeStore),
      className: "bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl font-black text-xs inline-flex items-center gap-2 shadow-md"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 16
    }), " \u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C \u0644\u0640 ", activeStore.name)) : /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    }, filteredStoreProducts.map(prod => renderStoreProductCard(prod, activeStore)))) : activeStoreSubTab === 'portal' ? /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-5 rounded-3xl border border-indigo-200 dark:border-slate-700 shadow-sm space-y-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-3"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
      className: "font-black text-base text-slate-800 dark:text-white"
    }, "\uD83D\uDD17 \u0628\u0648\u0627\u0628\u0629 \u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u0639\u0631\u0636 \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629"), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-slate-500 font-bold mt-0.5"
    }, "\u064A\u0633\u062A\u0637\u064A\u0639 \u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u0639\u0631\u0636 \u0639\u0628\u0631 \u0647\u0630\u0627 \u0627\u0644\u0631\u0627\u0628\u0637 \u0648\u0627\u0644\u0643\u0648\u062F \u0625\u0636\u0627\u0641\u0629 \u0648\u062A\u0639\u062F\u064A\u0644 \u0645\u0646\u062A\u062C\u0627\u062A\u0647 \u0641\u0642\u0637 \u0628\u062F\u0648\u0646 \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F \u0627\u0644\u0639\u0627\u0645.")), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-indigo-50 dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-slate-700 text-center"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] text-slate-500 font-bold block"
    }, "\u0643\u0648\u062F \u0627\u0644\u062F\u062E\u0648\u0644"), /*#__PURE__*/React.createElement("span", {
      className: "font-mono font-black text-sm text-indigo-600 dark:text-indigo-400 dir-ltr"
    }, getStorePortalCode(activeStore))), /*#__PURE__*/React.createElement("div", {
      className: "bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-center"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] text-slate-500 font-bold block"
    }, "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0645\u0639\u0631\u0636"), /*#__PURE__*/React.createElement("span", {
      className: "font-mono font-bold text-xs text-slate-700 dark:text-slate-300 dir-ltr"
    }, activeStore.id)))), /*#__PURE__*/React.createElement("div", {
      className: "bg-slate-50 dark:bg-slate-900 px-3.5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 font-mono text-xs text-indigo-600 dark:text-indigo-300 dir-ltr text-left select-all break-all"
    }, getStorePortalLink(activeStore)), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-2"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => copyTextToClipboard(getStorePortalLink(activeStore), () => showToast(`تم نسخ الرابط الخاص بمعرض "${activeStore.name}" ✓`)),
      className: "px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs flex items-center gap-1.5"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "copy",
      size: 14
    }), " \u0646\u0633\u062E \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0628\u0627\u0634\u0631"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setStoreLinkModal(activeStore),
      className: "px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs flex items-center gap-1.5"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "share-2",
      size: 14
    }), " \u0625\u0631\u0633\u0627\u0644 \u0644\u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u0639\u0631\u0636 (\u0648\u0627\u062A\u0633\u0627\u0628)"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setPortalPreviewStore(activeStore),
      className: "px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black text-xs flex items-center gap-1.5"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "external-link",
      size: 14
    }), " \u0641\u062A\u062D \u0628\u0648\u0627\u0628\u0629 \u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u0639\u0631\u0636"))) : /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-5 rounded-3xl border border-emerald-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-4 w-full md:w-auto"
    }, qrSrc ? /*#__PURE__*/React.createElement("img", {
      src: qrSrc,
      alt: "Store Payment QR",
      onClick: () => setPaymentQrModal(activeStore),
      className: "w-24 h-24 rounded-2xl bg-white p-1.5 border-2 border-emerald-500 object-contain shadow-md cursor-pointer shrink-0"
    }) : /*#__PURE__*/React.createElement("div", {
      className: "w-24 h-24 rounded-2xl bg-emerald-50 dark:bg-slate-900 border-2 border-dashed border-emerald-400 flex flex-col items-center justify-center text-emerald-600 shrink-0"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-2xl"
    }, "\uD83D\uDCB3"), /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-black mt-1"
    }, "\u0628\u0627\u0631\u0643\u0648\u062F \u0627\u0644\u062D\u0633\u0627\u0628")), /*#__PURE__*/React.createElement("div", {
      className: "space-y-1.5 min-w-0 flex-1"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-2"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-sm font-black text-slate-800 dark:text-white"
    }, "\u062D\u0633\u0627\u0628 \u0627\u0644\u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0645\u0627\u0644\u064A \u0644\u0644\u0645\u0639\u0631\u0636"), /*#__PURE__*/React.createElement("span", {
      className: `text-[10px] px-2.5 py-0.5 rounded-lg font-black ${payMethod.badgeClass}`
    }, payMethod.icon, " ", payMethod.label)), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-2"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-mono font-black text-base text-emerald-600 dark:text-emerald-400 dir-ltr select-all bg-emerald-50 dark:bg-slate-900 px-3 py-0.5 rounded-xl border border-emerald-200 dark:border-slate-700"
    }, accNum || 'لم يُحدد بعد'), accNum && /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => copyTextToClipboard(accNum, () => showToast(`تم نسخ رقم حساب "${activeStore.name}" ✓`)),
      className: "px-2.5 py-1 bg-slate-100 dark:bg-slate-700 rounded-lg font-black text-[11px] flex items-center gap-1"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "copy",
      size: 12
    }), " \u0646\u0633\u062E")), /*#__PURE__*/React.createElement("p", {
      className: "text-xs font-bold text-slate-500"
    }, "\uD83D\uDC64 \u0628\u0627\u0633\u0645: ", /*#__PURE__*/React.createElement("span", {
      className: "text-slate-800 dark:text-slate-200 font-black"
    }, activeStore.paymentAccountHolder || activeStore.name)))), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-2 w-full md:w-auto justify-end shrink-0"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setPaymentQrModal(activeStore),
      className: "px-4 py-2.5 bg-indigo-50 dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-slate-700 rounded-xl font-black text-xs flex items-center gap-1.5"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "eye",
      size: 14
    }), " \u0639\u0631\u0636 \u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062F"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => saveStorePaymentBarcodeToDevice(activeStore, showToast),
      className: "px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs flex items-center gap-1.5 shadow-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 14
    }), " \u062D\u0641\u0638 \u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062F"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => {
        openModal('stores', activeStore);
        setStoreModalTab('location_payment');
      },
      className: "px-3.5 py-2.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-xl font-black text-xs flex items-center gap-1.5"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "edit-2",
      size: 14
    }), " \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628"))));
  })()) : ( /* SCALABLE STORES DIRECTORY (ZERO DUPLICATION, CARDS + TABLE VIEW) */
  (() => {
    const q = searchQuery.trim().toLowerCase();
    const filteredStores = data.stores.filter(s => {
      if (storeFilterType !== 'all' && (s.storeType || 'paint_agency') !== storeFilterType) return false;
      if (storeFilterGov !== 'all' && (s.gov || 'بغداد') !== storeFilterGov) return false;
      if (!q) return true;
      return [s.name, s.address, s.gov, s.phone, s.agencyBrandLabel, s.portalCode].some(v => String(v || '').toLowerCase().includes(q));
    });
    const activeStoresCount = data.stores.filter(s => s.isActive !== false).length;
    const agenciesCount = data.stores.filter(s => s.storeType === 'paint_agency' || Boolean(s.agencyBrandKey)).length;
    return /*#__PURE__*/React.createElement("div", {
      className: "animate-enter space-y-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-gradient-to-l from-indigo-900 via-indigo-950 to-violet-950 text-white p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2.5 py-0.5 rounded-full"
    }, "\uD83C\uDFEA \u062F\u0644\u064A\u0644 \u0648\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062D\u0644\u0627\u062A \u0648\u0627\u0644\u0645\u0639\u0627\u0631\u0636"), /*#__PURE__*/React.createElement("h2", {
      className: "font-black text-lg sm:text-xl mt-1.5"
    }, "\u0627\u0644\u0645\u0639\u0627\u0631\u0636 \u0648\u0627\u0644\u0648\u0643\u0627\u0644\u0627\u062A \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629 (", data.stores.length, ")"), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-indigo-200 mt-0.5"
    }, "\u0623\u062F\u0631 \u0639\u0634\u0631\u0627\u062A \u0627\u0644\u0645\u0639\u0627\u0631\u0636 \u0628\u0633\u0647\u0648\u0644\u0629 \u2014 \u0643\u0644 \u0645\u0639\u0631\u0636 \u064A\u0645\u062A\u0644\u0643 \u0623\u0642\u0633\u0627\u0645\u0647 \u0648\u0645\u0646\u062A\u062C\u0627\u062A\u0647 \u0648\u0643\u062A\u0627\u0644\u0648\u062C \u0623\u0644\u0648\u0627\u0646\u0647 \u0648\u0631\u0648\u0627\u0628\u0637\u0647 \u0627\u0644\u062E\u0627\u0635\u0629.")), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-2 shrink-0"
    }, (data.stores.length === 0 || data.products.length === 0) && /*#__PURE__*/React.createElement("button", {
      onClick: seedDefaultEcommerceData,
      className: "bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-1.5 shadow-lg"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "sparkles",
      size: 15
    }), " \u062A\u0639\u0628\u0626\u0629 \u0646\u0645\u0648\u0630\u062C\u064A\u0629"), /*#__PURE__*/React.createElement("button", {
      onClick: () => openModal('stores', null),
      className: "bg-amber-400 hover:bg-amber-300 text-slate-950 px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 shadow-lg"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 17
    }), " \u0625\u0636\u0627\u0641\u0629 \u0645\u0639\u0631\u0636 \u062C\u062F\u064A\u062F"))), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-2 lg:grid-cols-4 gap-2.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-bold text-slate-500 block"
    }, "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0639\u0627\u0631\u0636"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-xl text-slate-800 dark:text-white"
    }, data.stores.length), /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-bold text-emerald-600 mr-1.5"
    }, "(", activeStoresCount, " \u0645\u0641\u0639\u0651\u0644)")), /*#__PURE__*/React.createElement("span", {
      className: "w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center text-lg"
    }, "\uD83C\uDFEA")), /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-bold text-slate-500 block"
    }, "\u0648\u0643\u0627\u0644\u0627\u062A \u0627\u0644\u0623\u0635\u0628\u0627\u063A"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-xl text-fuchsia-600 dark:text-fuchsia-400"
    }, agenciesCount)), /*#__PURE__*/React.createElement("span", {
      className: "w-10 h-10 rounded-xl bg-fuchsia-50 dark:bg-fuchsia-950/60 text-fuchsia-600 flex items-center justify-center text-lg"
    }, "\uD83C\uDFAF")), /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-bold text-slate-500 block"
    }, "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-xl text-indigo-600 dark:text-indigo-400"
    }, data.products.length)), /*#__PURE__*/React.createElement("span", {
      className: "w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center text-lg"
    }, "\uD83D\uDECD\uFE0F")), /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-bold text-slate-500 block"
    }, "\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0648\u0627\u062A\u0633\u0627\u0628"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-xl text-emerald-600 dark:text-emerald-400"
    }, whatsappOrders.length)), /*#__PURE__*/React.createElement("span", {
      className: "w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center text-lg"
    }, "\uD83D\uDCAC"))), /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-1.5"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setStoreFilterType('all'),
      className: `px-3 py-1.5 rounded-xl font-black text-xs transition-all ${storeFilterType === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`
    }, "\u0627\u0644\u0643\u0644 (", data.stores.length, ")"), STORE_TYPES.map(t => {
      const cnt = data.stores.filter(s => (s.storeType || 'paint_agency') === t.id).length;
      if (cnt === 0 && storeFilterType !== t.id) return null;
      const active = storeFilterType === t.id;
      return /*#__PURE__*/React.createElement("button", {
        key: t.id,
        type: "button",
        onClick: () => setStoreFilterType(t.id),
        className: `px-3 py-1.5 rounded-xl font-black text-xs transition-all ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`
      }, t.shortLabel || t.label, " (", cnt, ")");
    })), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-2 shrink-0"
    }, /*#__PURE__*/React.createElement("select", {
      value: storeFilterGov,
      onChange: e => setStoreFilterGov(e.target.value),
      className: "px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-black outline-none"
    }, /*#__PURE__*/React.createElement("option", {
      value: "all"
    }, "\uD83D\uDCCD \u0643\u0644 \u0627\u0644\u0645\u062D\u0627\u0641\u0638\u0627\u062A"), GOVERNORATES.map(g => /*#__PURE__*/React.createElement("option", {
      key: g,
      value: g
    }, g))), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setStoreViewMode('cards'),
      className: `px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition-all ${storeViewMode === 'cards' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-xs' : 'text-slate-500'}`
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "layout-grid",
      size: 13
    }), " \u0628\u0637\u0627\u0642\u0627\u062A"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setStoreViewMode('table'),
      className: `px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition-all ${storeViewMode === 'table' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-xs' : 'text-slate-500'}`
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "list",
      size: 13
    }), " \u062C\u062F\u0648\u0644 \u0645\u0643\u062B\u0641")))), filteredStores.length === 0 ? /*#__PURE__*/React.createElement("div", {
      className: "text-center py-12 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-6"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "store",
      size: 38,
      className: "mx-auto text-slate-400 mb-3"
    }), /*#__PURE__*/React.createElement("p", {
      className: "font-black text-base text-slate-700 dark:text-slate-200"
    }, data.stores.length === 0 ? 'لا توجد معارض مسجلة حالياً' : 'لا توجد معارض مطابقة للبحث أو الفلتر'), data.stores.length === 0 ? /*#__PURE__*/React.createElement("button", {
      onClick: seedDefaultEcommerceData,
      className: "mt-4 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black text-xs inline-flex items-center gap-2"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "sparkles",
      size: 15
    }), " \u0625\u0636\u0627\u0641\u0629 \u0645\u062D\u0644\u0627\u062A \u0648\u0645\u0646\u062A\u062C\u0627\u062A \u0646\u0645\u0648\u0630\u062C\u064A\u0629") : /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setStoreFilterType('all');
        setStoreFilterGov('all');
        setSearchQuery('');
      },
      className: "mt-3 text-xs font-black text-indigo-600 hover:underline"
    }, "\u0639\u0631\u0636 \u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0639\u0627\u0631\u0636 \u21BA")) : storeViewMode === 'table' ? /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-x-auto"
    }, /*#__PURE__*/React.createElement("table", {
      className: "w-full text-right border-collapse min-w-[780px]"
    }, /*#__PURE__*/React.createElement("thead", {
      className: "bg-slate-50 dark:bg-slate-900/70 text-[11px] font-black text-slate-500 border-b border-slate-200 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
      className: "p-3.5"
    }, "\u0627\u0644\u0645\u0639\u0631\u0636 / \u0627\u0644\u062A\u062E\u0635\u0635"), /*#__PURE__*/React.createElement("th", {
      className: "p-3.5"
    }, "\u0627\u0644\u0645\u062D\u0627\u0641\u0638\u0629 \u0648\u0627\u0644\u0647\u0627\u062A\u0641"), /*#__PURE__*/React.createElement("th", {
      className: "p-3.5 text-center"
    }, "\u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A / \u0627\u0644\u0623\u0642\u0633\u0627\u0645"), /*#__PURE__*/React.createElement("th", {
      className: "p-3.5 text-center"
    }, "\u0627\u0644\u062D\u0627\u0644\u0629 / GPS"), /*#__PURE__*/React.createElement("th", {
      className: "p-3.5 text-center"
    }, "\u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u0648\u0627\u0644\u062F\u0641\u0639"), /*#__PURE__*/React.createElement("th", {
      className: "p-3.5 text-left"
    }, "\u0625\u062F\u0627\u0631\u0629 \u0633\u0631\u064A\u0639\u0629"))), /*#__PURE__*/React.createElement("tbody", {
      className: "divide-y divide-slate-100 dark:divide-slate-700/70 text-xs font-bold"
    }, filteredStores.map(st => {
      const stType = STORE_TYPES.find(t => t.id === st.storeType) || STORE_TYPES[0];
      const agencyBrandObj = st.agencyBrandKey ? PAINT_AGENCY_BRANDS.find(b => b.id === st.agencyBrandKey) : null;
      const coords = extractCoords(st.location);
      const storeProductsCount = data.products.filter(p => p.storeId === st.id).length;
      const secsCount = getStoreSectionsList(st).length;
      const waSt = getStoreWhatsAppStats(st);
      return /*#__PURE__*/React.createElement("tr", {
        key: st.id,
        className: "hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
      }, /*#__PURE__*/React.createElement("td", {
        className: "p-3.5"
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex flex-col gap-1"
      }, /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => {
          setActiveStore(st);
          setActiveStoreSubTab('products');
          setActiveStoreSecFilter('all');
        },
        className: "font-black text-sm text-indigo-700 dark:text-indigo-300 hover:underline text-right"
      }, st.name), /*#__PURE__*/React.createElement("div", {
        className: "flex flex-wrap gap-1"
      }, /*#__PURE__*/React.createElement("span", {
        className: `text-[10px] px-2 py-0.5 rounded-md font-black ${stType.badgeClass}`
      }, stType.shortLabel || stType.label), agencyBrandObj && /*#__PURE__*/React.createElement("span", {
        className: `text-[10px] px-2 py-0.5 rounded-md font-black ${agencyBrandObj.badgeClass}`
      }, "\uD83C\uDFAF ", agencyBrandObj.label), (() => {
        const subInfo = getEntitySubscriptionInfo(st, 'isVipStore');
        return /*#__PURE__*/React.createElement("button", {
          type: "button",
          onClick: () => openSubscriptionModal('stores', st, 'isVipStore'),
          className: `text-[10px] px-2 py-0.5 rounded-md font-black border transition-all ${subInfo.isActive ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700' : subInfo.isExpired ? 'bg-rose-100 text-rose-700 border-rose-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'}`,
          title: "\u0627\u0636\u063A\u0637 \u0644\u062A\u062D\u062F\u064A\u062F \u0645\u062F\u0629 \u0627\u0634\u062A\u0631\u0627\u0643 \u0627\u0644\u0645\u0639\u0631\u0636 (\u0634\u0647\u0631\u064A / \u0633\u0646\u0648\u064A)"
        }, subInfo.isActive ? `💎 VIP (${subInfo.planLabel}${subInfo.daysLeft !== null ? ` • ${subInfo.daysLeft} يوم` : ''})` : subInfo.isExpired ? '⚠️ اشتراك منتهي (تجديد)' : 'تجريبي (ترقية VIP)');
      })()))), /*#__PURE__*/React.createElement("td", {
        className: "p-3.5"
      }, /*#__PURE__*/React.createElement("div", {
        className: "text-slate-700 dark:text-slate-200 font-black"
      }, st.gov || 'بغداد'), /*#__PURE__*/React.createElement("div", {
        className: "text-[11px] text-slate-400 truncate max-w-[180px]"
      }, st.address || '—'), /*#__PURE__*/React.createElement("div", {
        className: "text-[11px] font-mono text-emerald-600 dark:text-emerald-400 dir-ltr text-right"
      }, st.phone || '—')), /*#__PURE__*/React.createElement("td", {
        className: "p-3.5 text-center"
      }, /*#__PURE__*/React.createElement("div", {
        className: "inline-flex flex-wrap justify-center gap-1"
      }, /*#__PURE__*/React.createElement("span", {
        className: "px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 text-[10px] font-black"
      }, "\uD83D\uDECD\uFE0F ", storeProductsCount), /*#__PURE__*/React.createElement("span", {
        className: "px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-[10px] font-black"
      }, "\uD83D\uDCC2 ", secsCount), /*#__PURE__*/React.createElement("span", {
        className: "px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-black"
      }, "\uD83D\uDCAC ", waSt.ordersCount))), /*#__PURE__*/React.createElement("td", {
        className: "p-3.5 text-center"
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex flex-col items-center gap-1"
      }, /*#__PURE__*/React.createElement("span", {
        className: `text-[10px] px-2 py-0.5 rounded-full font-black ${st.isActive !== false ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700'}`
      }, st.isActive !== false ? 'مفعّل ✓' : 'موقوف'), /*#__PURE__*/React.createElement("span", {
        className: `text-[10px] font-bold ${coords ? 'text-emerald-600' : 'text-amber-500'}`
      }, coords ? '📍 GPS' : 'بدون GPS'))), /*#__PURE__*/React.createElement("td", {
        className: "p-3.5 text-center"
      }, /*#__PURE__*/React.createElement("div", {
        className: "inline-flex items-center gap-1.5"
      }, /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => setStoreLinkModal(st),
        className: "px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 text-[10px] font-black hover:bg-indigo-100",
        title: "\u0631\u0627\u0628\u0637 \u0648\u0631\u0645\u0632 \u0627\u0644\u0628\u0648\u0627\u0628\u0629"
      }, "\uD83D\uDD17 \u0627\u0644\u0628\u0648\u0627\u0628\u0629"), /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => setPaymentQrModal(st),
        className: "px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-slate-900 text-emerald-600 dark:text-emerald-300 text-[10px] font-black hover:bg-emerald-100",
        title: "\u0628\u0627\u0631\u0643\u0648\u062F \u0627\u0644\u062F\u0641\u0639"
      }, "\uD83D\uDCB3 QR"))), /*#__PURE__*/React.createElement("td", {
        className: "p-3.5 text-left"
      }, /*#__PURE__*/React.createElement("div", {
        className: "inline-flex items-center gap-1"
      }, /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => {
          setActiveStore(st);
          setActiveStoreSubTab('products');
          setActiveStoreSecFilter('all');
        },
        className: "px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black"
      }, "\u062F\u062E\u0648\u0644"), /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => openModal('products', null, st),
        className: "px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black",
        title: "\u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C"
      }, "+ \u0645\u0646\u062A\u062C"), /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => openModal('stores', st),
        className: "p-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-lg",
        title: "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0645\u0639\u0631\u0636"
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "edit-2",
        size: 14
      })), /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => triggerDelete('stores', st.id, 'stores'),
        className: "p-1.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 rounded-lg",
        title: "\u062D\u0630\u0641"
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "trash-2",
        size: 14
      })))));
    })))) : /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    }, filteredStores.map(st => {
      const stType = STORE_TYPES.find(t => t.id === st.storeType) || STORE_TYPES[0];
      const agencyBrandObj = st.agencyBrandKey ? PAINT_AGENCY_BRANDS.find(b => b.id === st.agencyBrandKey) : null;
      const coords = extractCoords(st.location);
      const storeProductsCount = data.products.filter(p => p.storeId === st.id).length;
      const sectionsList = getStoreSectionsList(st);
      const waSt = getStoreWhatsAppStats(st);
      const hasPayment = Boolean(getStoreAccountNumber(st) || st.paymentQrImage);
      const subInfo = getEntitySubscriptionInfo(st, 'isVipStore');
      return /*#__PURE__*/React.createElement("div", {
        key: st.id,
        className: "bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-3.5 hover:border-indigo-500 transition-all"
      }, /*#__PURE__*/React.createElement("div", {
        className: "space-y-2.5"
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex items-start justify-between gap-2"
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex flex-wrap items-center gap-1.5"
      }, /*#__PURE__*/React.createElement("span", {
        className: `text-[10px] px-2 py-0.5 rounded-lg font-black ${stType.badgeClass}`
      }, stType.shortLabel || stType.label), agencyBrandObj && /*#__PURE__*/React.createElement("span", {
        className: `text-[10px] px-2 py-0.5 rounded-lg font-black ${agencyBrandObj.badgeClass}`
      }, "\uD83C\uDFAF ", agencyBrandObj.label), /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => openSubscriptionModal('stores', st, 'isVipStore'),
        className: `text-[10px] px-2 py-0.5 rounded-lg font-black border transition-all ${subInfo.isActive ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700' : subInfo.isExpired ? 'bg-rose-100 text-rose-700 border-rose-300' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'}`,
        title: "\u062A\u062D\u062F\u064A\u062F \u0645\u062F\u0629 \u0627\u0634\u062A\u0631\u0627\u0643 \u0627\u0644\u0645\u0639\u0631\u0636 (\u0634\u0647\u0631\u064A / \u0633\u0646\u0648\u064A)"
      }, subInfo.isActive ? `💎 VIP • ${subInfo.planLabel}${subInfo.daysLeft !== null ? ` (${subInfo.daysLeft} يوم)` : ''}` : subInfo.isExpired ? '⚠️ اشتراك منتهي' : 'تجريبي (ترقية)')), /*#__PURE__*/React.createElement("div", {
        className: "flex items-center gap-1 shrink-0"
      }, /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: async () => {
          const nextActive = st.isActive === false;
          try {
            await db.collection('stores').doc(st.id).update({
              isActive: nextActive,
              updatedAt: new Date().toISOString()
            });
            setData(prev => ({
              ...prev,
              stores: prev.stores.map(x => x.id === st.id ? {
                ...x,
                isActive: nextActive
              } : x)
            }));
            showToast(nextActive ? `تم تفعيل "${st.name}" ✓` : `تم إيقاف "${st.name}" مؤقتاً`);
          } catch (err) {
            showToast('تعذر تغيير الحالة');
          }
        },
        className: `px-2 py-1 rounded-lg text-[10px] font-black transition-all ${st.isActive !== false ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600'}`,
        title: "\u062A\u0628\u062F\u064A\u0644 \u062D\u0627\u0644\u0629 \u0627\u0644\u0638\u0647\u0648\u0631"
      }, st.isActive !== false ? '● مفعّل' : '○ موقوف'), /*#__PURE__*/React.createElement("button", {
        onClick: () => openModal('stores', st),
        className: "p-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-lg hover:bg-amber-100",
        title: "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0645\u0639\u0631\u0636"
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "edit-2",
        size: 14
      })), /*#__PURE__*/React.createElement("button", {
        onClick: () => triggerDelete('stores', st.id, 'stores'),
        className: "p-1.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 rounded-lg hover:bg-rose-100",
        title: "\u062D\u0630\u0641 \u0627\u0644\u0645\u0639\u0631\u0636"
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "trash-2",
        size: 14
      })))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => {
          setActiveStore(st);
          setActiveStoreSubTab('products');
          setActiveStoreSecFilter('all');
        },
        className: "font-black text-base text-slate-800 dark:text-white hover:text-indigo-600 text-right leading-snug"
      }, st.name), /*#__PURE__*/React.createElement("div", {
        className: "mt-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400 font-bold"
      }, /*#__PURE__*/React.createElement("p", {
        className: "flex items-center gap-1.5 truncate"
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "map-pin",
        size: 13,
        className: "text-indigo-500 shrink-0"
      }), /*#__PURE__*/React.createElement("span", {
        className: "truncate"
      }, st.gov || 'بغداد', " \u2014 ", st.address || 'بدون عنوان')), /*#__PURE__*/React.createElement("p", {
        className: "flex items-center gap-1.5 dir-ltr text-right"
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "phone",
        size: 13,
        className: "text-emerald-500 shrink-0"
      }), /*#__PURE__*/React.createElement("span", null, st.phone || 'بدون هاتف')))), /*#__PURE__*/React.createElement("div", {
        className: "flex flex-wrap items-center gap-1.5 pt-1"
      }, /*#__PURE__*/React.createElement("span", {
        className: "text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded-lg font-black"
      }, "\uD83D\uDECD\uFE0F ", storeProductsCount, " \u0645\u0646\u062A\u062C"), /*#__PURE__*/React.createElement("span", {
        className: "text-[10px] bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-lg font-black"
      }, "\uD83D\uDCC2 ", sectionsList.length, " \u0623\u0642\u0633\u0627\u0645"), /*#__PURE__*/React.createElement("span", {
        className: "text-[10px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-lg font-black"
      }, "\uD83D\uDCAC ", waSt.ordersCount, " \u0637\u0644\u0628"), /*#__PURE__*/React.createElement("span", {
        className: `text-[10px] px-2 py-0.5 rounded-lg font-black ${coords ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40'}`
      }, coords ? '📍 GPS' : 'بدون GPS'), hasPayment && /*#__PURE__*/React.createElement("span", {
        className: "text-[10px] bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-lg font-black"
      }, "\uD83D\uDCB3 \u062F\u0641\u0639")), sectionsList.length > 0 && /*#__PURE__*/React.createElement("div", {
        className: "flex flex-wrap items-center gap-1 pt-1 border-t border-slate-100 dark:border-slate-700/70"
      }, sectionsList.slice(0, 3).map(sec => /*#__PURE__*/React.createElement("span", {
        key: sec.id,
        className: "text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700"
      }, sec.icon || '📂', " ", sec.label)), sectionsList.length > 3 && /*#__PURE__*/React.createElement("span", {
        className: "text-[10px] font-black text-indigo-600 dark:text-indigo-400 px-1"
      }, "+", sectionsList.length - 3))), /*#__PURE__*/React.createElement("div", {
        className: "pt-2.5 border-t border-slate-100 dark:border-slate-700 flex items-center gap-1.5"
      }, /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => {
          setActiveStore(st);
          setActiveStoreSubTab('products');
          setActiveStoreSecFilter('all');
        },
        className: "flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-sm"
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "shopping-bag",
        size: 14
      }), " \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0639\u0631\u0636 (", storeProductsCount, ")"), /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => openModal('products', null, st),
        className: "px-3 py-2.5 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl font-black text-xs shrink-0",
        title: "\u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C \u0633\u0631\u064A\u0639 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0639\u0631\u0636"
      }, "+ \u0645\u0646\u062A\u062C"), /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => setStoreLinkModal(st),
        className: "p-2.5 bg-slate-100 dark:bg-slate-900 hover:bg-indigo-50 text-indigo-600 dark:text-indigo-300 rounded-xl shrink-0",
        title: "\u0631\u0627\u0628\u0637 \u0648\u0631\u0645\u0632 \u0628\u0648\u0627\u0628\u0629 \u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u0639\u0631\u0636"
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "link",
        size: 15
      })), /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => setPaymentQrModal(st),
        className: "p-2.5 bg-slate-100 dark:bg-slate-900 hover:bg-emerald-50 text-emerald-600 dark:text-emerald-300 rounded-xl shrink-0",
        title: "\u0628\u0627\u0631\u0643\u0648\u062F \u0648\u062D\u0633\u0627\u0628 \u0627\u0644\u062F\u0641\u0639"
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "qr-code",
        size: 15
      }))));
    })));
  })()) : view === 'products' ? (() => {
    const currentTargetStore = activeStore || null;
    const storeSecOptions = currentTargetStore ? getStoreSectionsList(currentTargetStore) : [];
    const filteredProds = data.products.filter(p => !currentTargetStore || p.storeId === currentTargetStore.id).filter(p => !currentTargetStore || activeStoreSecFilter === 'all' || p.category === activeStoreSecFilter).filter(p => !searchQuery || (p.name || '').includes(searchQuery) || (p.brand || '').includes(searchQuery) || (p.storeName || '').includes(searchQuery));
    return /*#__PURE__*/React.createElement("div", {
      className: "animate-enter space-y-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-gradient-to-l from-violet-900 via-indigo-950 to-slate-900 text-white p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-fuchsia-400/20 text-fuchsia-300 border border-fuchsia-400/30 px-2.5 py-0.5 rounded-full"
    }, "\uD83D\uDECD\uFE0F \u0643\u062A\u0627\u0644\u0648\u062C \u0648\u0645\u0646\u062A\u062C\u0627\u062A \u0627\u0644\u0645\u0639\u0627\u0631\u0636"), /*#__PURE__*/React.createElement("h2", {
      className: "font-black text-lg sm:text-xl mt-1.5"
    }, currentTargetStore ? `منتجات: ${currentTargetStore.name}` : `جميع منتجات المعارض (${data.products.length})`)), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-2 shrink-0"
    }, data.products.length === 0 && /*#__PURE__*/React.createElement("button", {
      onClick: seedDefaultEcommerceData,
      className: "bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-1.5 shadow-lg"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "sparkles",
      size: 15
    }), " \u062A\u0639\u0628\u0626\u0629 \u0642\u064A\u0627\u0633\u064A\u0629"), /*#__PURE__*/React.createElement("button", {
      onClick: () => openModal('products', null, currentTargetStore || data.stores[0] || null),
      className: "bg-amber-400 hover:bg-amber-300 text-slate-950 px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-1.5 shadow-lg"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 16
    }), " \u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C"))), /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2 flex-1 min-w-0"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-xs font-black text-slate-600 dark:text-slate-300 shrink-0"
    }, "\uD83C\uDFEA \u0627\u0644\u0645\u0639\u0631\u0636:"), /*#__PURE__*/React.createElement("select", {
      value: currentTargetStore?.id || 'all',
      onChange: e => {
        const val = e.target.value;
        setActiveStoreSecFilter('all');
        setActiveStore(val === 'all' ? null : data.stores.find(s => s.id === val) || null);
      },
      className: "flex-1 max-w-md p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-xs outline-none"
    }, /*#__PURE__*/React.createElement("option", {
      value: "all"
    }, "\u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0639\u0627\u0631\u0636 (", data.products.length, " \u0645\u0646\u062A\u062C)"), data.stores.map(st => /*#__PURE__*/React.createElement("option", {
      key: st.id,
      value: st.id
    }, st.name, " \u2014 ", st.gov || 'بغداد', " (", data.products.filter(p => p.storeId === st.id).length, " \u0645\u0646\u062A\u062C)")))), currentTargetStore && /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-1.5 shrink-0"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setStoreLinkModal(currentTargetStore),
      className: "px-3 py-2 bg-indigo-50 dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-slate-700 rounded-xl font-black text-xs flex items-center gap-1"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "link",
      size: 13
    }), " \u0631\u0627\u0628\u0637 \u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u0639\u0631\u0636"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => {
        setView('stores');
        setActiveStoreSubTab('products');
      },
      className: "px-3 py-2 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-xl font-black text-xs"
    }, "\u0641\u062A\u062D \u0645\u0644\u0641 \u0627\u0644\u0645\u0639\u0631\u0636"))), currentTargetStore && storeSecOptions.length > 0 && /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setActiveStoreSecFilter('all'),
      className: `px-2.5 py-1 rounded-lg font-black text-[11px] ${activeStoreSecFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`
    }, "\u0643\u0644 \u0627\u0644\u0623\u0642\u0633\u0627\u0645"), storeSecOptions.map(sec => /*#__PURE__*/React.createElement("button", {
      key: sec.id,
      type: "button",
      onClick: () => setActiveStoreSecFilter(sec.id),
      className: `px-2.5 py-1 rounded-lg font-black text-[11px] ${activeStoreSecFilter === sec.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`
    }, sec.icon || '📂', " ", sec.label)))), filteredProds.length === 0 ? /*#__PURE__*/React.createElement("div", {
      className: "text-center py-12 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("p", {
      className: "font-black text-sm text-slate-600 dark:text-slate-300"
    }, "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0646\u062A\u062C\u0627\u062A \u0645\u0637\u0627\u0628\u0642\u0629 \u0644\u0644\u0639\u0631\u0636")) : /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    }, filteredProds.map(prod => renderStoreProductCard(prod, currentTargetStore || data.stores.find(s => s.id === prod.storeId)))));
  })() : view === 'storeOrders' ? /*#__PURE__*/React.createElement("div", {
    className: "animate-enter space-y-5"
  }, (() => {
    const allStoresMap = new Map();
    data.stores.forEach(st => allStoresMap.set(st.id, st));
    whatsappOrders.forEach(o => {
      const sid = o.storeId || o.storeName || 'store_default';
      if (!allStoresMap.has(sid) && !Array.from(allStoresMap.values()).some(s => s.name === o.storeName)) {
        allStoresMap.set(sid, {
          id: sid,
          name: o.storeName || 'معرض المواد',
          gov: 'بغداد',
          address: ''
        });
      }
    });
    const storeStatsRows = Array.from(allStoresMap.values()).map(st => ({
      store: st,
      stats: getStoreWhatsAppStats(st)
    }));
    const totalOrdersCount = storeStatsRows.reduce((s, r) => s + r.stats.ordersCount, 0);
    const totalSoldQuantities = storeStatsRows.reduce((s, r) => s + r.stats.totalSoldQty, 0);
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      className: "bg-gradient-to-l from-emerald-900 via-teal-900 to-slate-900 text-white p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "text-xs font-black bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 px-3 py-1 rounded-full"
    }, "\uD83D\uDCAC \u062A\u064F\u062D\u0633\u0628 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0641\u0642\u0637 \u0628\u0639\u062F \u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u0639\u0628\u0631 \u0648\u0627\u062A\u0633\u0627\u0628"), /*#__PURE__*/React.createElement("h2", {
      className: "font-black text-xl mt-2"
    }, "\u0639\u062F\u0627\u062F \u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0645\u062A\u062C\u0631 \u0648\u0627\u0644\u0643\u0645\u064A\u0627\u062A \u0627\u0644\u0645\u0628\u0627\u0639\u0629 \u0644\u0643\u0644 \u0645\u062D\u0644"), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-emerald-100 mt-1 font-bold"
    }, "\u064A\u062A\u0645 \u0627\u062D\u062A\u0633\u0627\u0628 \u0639\u062F\u062F \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0648\u0627\u0644\u0643\u0645\u064A\u0627\u062A \u0627\u0644\u0645\u0628\u0627\u0639\u0629 \u0644\u0643\u0644 \u0645\u062D\u0644 \u0641\u0642\u0637 \u0628\u0639\u062F \u0642\u064A\u0627\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628\u064A\u0629 \u0639\u0628\u0631 \u0648\u0627\u062A\u0633\u0627\u0628 \u0644\u0644\u0645\u062D\u0644.")), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3 shrink-0"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-white/10 border border-white/15 px-5 py-3 rounded-2xl text-center"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] text-emerald-200 font-bold"
    }, "\u0625\u062C\u0645\u0627\u0644\u064A \u0639\u062F\u062F \u0627\u0644\u0637\u0644\u0628\u0627\u062A"), /*#__PURE__*/React.createElement("p", {
      className: "text-2xl font-black text-amber-300 mt-0.5"
    }, totalOrdersCount)), /*#__PURE__*/React.createElement("div", {
      className: "bg-white/10 border border-white/15 px-5 py-3 rounded-2xl text-center"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] text-emerald-200 font-bold"
    }, "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0643\u0645\u064A\u0627\u062A \u0627\u0644\u0645\u0628\u0627\u0639\u0629"), /*#__PURE__*/React.createElement("p", {
      className: "text-2xl font-black text-emerald-300 mt-0.5"
    }, totalSoldQuantities)))), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    }, storeStatsRows.map(({
      store,
      stats
    }) => /*#__PURE__*/React.createElement("div", {
      key: store.id,
      className: "bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between gap-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "space-y-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-start gap-2"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black text-indigo-600 dark:text-indigo-400"
    }, "\uD83C\uDFEA ", store.gov || 'بغداد', " ", store.address ? `- ${store.address}` : ''), /*#__PURE__*/React.createElement("h3", {
      className: "font-black text-base text-slate-800 dark:text-white mt-0.5"
    }, store.name)), stats.ordersCount > 0 && /*#__PURE__*/React.createElement("button", {
      onClick: () => clearStoreWhatsAppCounter(store, stats.matchedIds),
      className: "text-[11px] px-2.5 py-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl font-black hover:bg-rose-100 flex items-center gap-1",
      title: "\u062A\u0635\u0641\u064A\u0631 \u0639\u062F\u0627\u062F \u0647\u0630\u0627 \u0627\u0644\u0645\u062D\u0644"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "trash-2",
      size: 13
    }), " \u062A\u0635\u0641\u064A\u0631")), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-2 gap-2.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 p-3.5 rounded-2xl text-center"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] font-black text-indigo-700 dark:text-indigo-300"
    }, "\u0639\u062F\u062F \u0627\u0644\u0637\u0644\u0628\u0627\u062A (\u0648\u0627\u062A\u0633\u0627\u0628)"), /*#__PURE__*/React.createElement("p", {
      className: "text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-1"
    }, stats.ordersCount), /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] font-bold text-slate-400"
    }, "\u0637\u0644\u0628 \u0645\u0631\u0633\u0644")), /*#__PURE__*/React.createElement("div", {
      className: "bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60 p-3.5 rounded-2xl text-center"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] font-black text-emerald-700 dark:text-emerald-300"
    }, "\u0627\u0644\u0643\u0645\u064A\u0627\u062A \u0627\u0644\u0645\u0628\u0627\u0639\u0629"), /*#__PURE__*/React.createElement("p", {
      className: "text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1"
    }, stats.totalSoldQty), /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] font-bold text-slate-400"
    }, "\u0645\u0627\u062F\u0629 / \u0642\u0637\u0639\u0629"))), /*#__PURE__*/React.createElement("div", {
      className: "pt-2 border-t border-slate-100 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-xs font-black text-slate-600 dark:text-slate-300 mb-2"
    }, "\uD83D\uDCE6 \u062A\u0641\u0635\u064A\u0644 \u0627\u0644\u0643\u0645\u064A\u0627\u062A \u0627\u0644\u0645\u0628\u0627\u0639\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u062D\u0644:"), stats.soldItemsList.length > 0 ? /*#__PURE__*/React.createElement("div", {
      className: "space-y-1.5 max-h-44 overflow-y-auto pr-0.5"
    }, stats.soldItemsList.map((item, idx) => /*#__PURE__*/React.createElement("div", {
      key: idx,
      className: "flex items-center justify-between bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl text-xs font-bold border border-slate-100 dark:border-slate-700/70"
    }, /*#__PURE__*/React.createElement("span", {
      className: "truncate font-black text-slate-700 dark:text-slate-200"
    }, item.name), /*#__PURE__*/React.createElement("span", {
      className: "px-2.5 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-black shrink-0"
    }, "\u0627\u0644\u0643\u0645\u064A\u0629: ", item.qty, " ", item.unit)))) : /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-slate-400 font-bold text-center py-4 bg-slate-50 dark:bg-slate-900 rounded-2xl"
    }, "\u0644\u0627 \u062A\u0648\u062C\u062F \u0637\u0644\u0628\u0627\u062A \u0645\u0631\u0633\u0644\u0629 \u0639\u0628\u0631 \u0648\u0627\u062A\u0633\u0627\u0628 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u062D\u0644 \u062D\u062A\u0649 \u0627\u0644\u0622\u0646"))), stats.lastDate && /*#__PURE__*/React.createElement("div", {
      className: "text-[11px] font-bold text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("span", null, "\u0622\u062E\u0631 \u0637\u0644\u0628 \u0639\u0628\u0631 \u0648\u0627\u062A\u0633\u0627\u0628:"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-emerald-600 dark:text-emerald-400"
    }, stats.lastDate))))));
  })()) : view === 'announcements' ? /*#__PURE__*/React.createElement("div", {
    className: "animate-enter space-y-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-gradient-to-l from-indigo-900 via-violet-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl space-y-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-black bg-amber-400/20 text-amber-300 border border-amber-400/30 px-3 py-1 rounded-full"
  }, "\uD83D\uDCE2 \u0645\u0631\u0643\u0632 \u0625\u0639\u0644\u0627\u0646\u0627\u062A \u0648\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0648\u0635\u064A\u0627\u0646\u0629 \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u0628\u0627\u0634\u0631"), /*#__PURE__*/React.createElement("span", {
    className: `text-xs font-black px-3 py-1 rounded-full border ${data.settings?.maintenanceMode ? 'bg-rose-500/25 text-rose-200 border-rose-400/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'}`
  }, data.settings?.maintenanceMode ? '🛠️ وضع الصيانة مفعل حالياً' : '✅ النظام يعمل بشكل طبيعي')), /*#__PURE__*/React.createElement("h2", {
    className: "font-black text-2xl mt-2"
  }, "\u0625\u062F\u0627\u0631\u0629 \u0625\u0639\u0644\u0627\u0646\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645 \u0648\u0627\u0644\u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u0645\u0646\u0628\u062B\u0642\u0629 \u0644\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-indigo-200 mt-1 font-bold"
  }, "\u062A\u062D\u0643\u0645 \u0643\u0627\u0645\u0644 \u0641\u064A \u0627\u0644\u0625\u0639\u0644\u0627\u0646\u0627\u062A \u0648\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0641\u0648\u0631\u064A\u0629 \u0627\u0644\u062A\u064A \u062A\u0638\u0647\u0631 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646 \u0648\u0627\u0644\u0639\u0645\u0627\u0644 \u0639\u0646\u062F \u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642\u060C \u0645\u0639 \u062F\u0639\u0645 \u0627\u0644\u0635\u0648\u0631 \u0648\u0627\u0644\u0631\u0648\u0627\u0628\u0637 \u0648\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0628\u062B \u0627\u0644\u0641\u0648\u0631\u064A.")), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-2.5 shrink-0"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: toggleSystemMaintenance,
    className: `px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2 border transition-all shadow-lg ${data.settings?.maintenanceMode ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-400' : 'bg-white/10 hover:bg-white/20 text-amber-300 border-white/15'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "tool",
    size: 16
  }), /*#__PURE__*/React.createElement("span", null, data.settings?.maintenanceMode ? 'إنهاء وضع الصيانة وتشغيل التطبيق' : 'تفعيل وضع الصيانة المؤقت')), /*#__PURE__*/React.createElement("button", {
    onClick: () => openModal('announcements', null),
    className: "bg-amber-400 hover:bg-amber-300 text-slate-950 px-5 py-3 rounded-2xl font-black text-xs flex items-center gap-2 shadow-xl transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 18
  }), " + \u0625\u0646\u0634\u0627\u0621 \u0625\u0639\u0644\u0627\u0646 \u0623\u0648 \u062A\u0646\u0628\u064A\u0647 \u062C\u062F\u064A\u062F"))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white/10 border border-white/10 rounded-2xl p-3.5 text-center"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] text-indigo-200 font-bold"
  }, "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0625\u0639\u0644\u0627\u0646\u0627\u062A"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black text-white mt-0.5"
  }, data.announcements.length)), /*#__PURE__*/React.createElement("div", {
    className: "bg-emerald-500/15 border border-emerald-400/25 rounded-2xl p-3.5 text-center"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] text-emerald-200 font-bold"
  }, "\u0627\u0644\u0625\u0639\u0644\u0627\u0646\u0627\u062A \u0627\u0644\u0646\u0634\u0637\u0629 \u0627\u0644\u0622\u0646"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black text-emerald-300 mt-0.5"
  }, data.announcements.filter(a => a.isActive).length)), /*#__PURE__*/React.createElement("div", {
    className: "bg-amber-500/15 border border-amber-400/25 rounded-2xl p-3.5 text-center"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] text-amber-200 font-bold"
  }, "\u0645\u062E\u0635\u0635\u0629 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black text-amber-300 mt-0.5"
  }, data.announcements.filter(a => a.target === 'admin' || !a.target || a.target === 'all').length)), /*#__PURE__*/React.createElement("div", {
    className: "bg-cyan-500/15 border border-cyan-400/25 rounded-2xl p-3.5 text-center"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] text-cyan-200 font-bold"
  }, "\u0645\u062E\u0635\u0635\u0629 \u0644\u0644\u0639\u0645\u0627\u0644"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black text-cyan-300 mt-0.5"
  }, data.announcements.filter(a => a.target === 'worker' || !a.target || a.target === 'all').length)))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-2.5"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "zap",
    size: 15,
    className: "text-amber-500"
  }), /*#__PURE__*/React.createElement("span", null, "\u0642\u0648\u0627\u0644\u0628 \u0625\u0639\u0644\u0627\u0646\u0627\u062A \u0648\u0635\u064A\u0627\u0646\u0629 \u062C\u0627\u0647\u0632\u0629 \u0644\u0644\u0646\u0634\u0631 \u0627\u0644\u0633\u0631\u064A\u0639 \u0628\u0636\u063A\u0637\u0629 \u0648\u0627\u062D\u062F\u0629:")), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-bold text-slate-400"
  }, "\u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u0623\u064A \u0642\u0627\u0644\u0628 \u0644\u062A\u0639\u0628\u0626\u062A\u0647 \u0648\u062A\u0639\u062F\u064A\u0644\u0647")), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, ANNOUNCEMENT_TEMPLATES.map((tpl, idx) => /*#__PURE__*/React.createElement("button", {
    key: idx,
    type: "button",
    onClick: () => createFromTemplate(tpl),
    className: "px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-200 hover:text-indigo-600 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-xs font-black transition-all flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", null, tpl.label))))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center justify-between gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, [{
    id: 'all',
    label: `الكل (${data.announcements.length})`
  }, {
    id: 'active',
    label: `النشطة (${data.announcements.filter(a => a.isActive).length})`
  }, {
    id: 'paused',
    label: `المتوقفة (${data.announcements.filter(a => !a.isActive).length})`
  }, {
    id: 'admin',
    label: 'للمقاولين'
  }, {
    id: 'worker',
    label: 'للعمال والحرفيين'
  }].map(tab => /*#__PURE__*/React.createElement("button", {
    key: tab.id,
    onClick: () => setAnnFilter(tab.id),
    className: `px-3.5 py-2 rounded-xl text-xs font-black transition-all ${annFilter === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`
  }, tab.label)))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 gap-4"
  }, data.announcements.filter(ann => {
    if (annFilter === 'active' && !ann.isActive) return false;
    if (annFilter === 'paused' && ann.isActive) return false;
    if (annFilter === 'admin' && ann.target !== 'admin' && ann.target !== 'all') return false;
    if (annFilter === 'worker' && ann.target !== 'worker' && ann.target !== 'all') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (ann.title || '').toLowerCase().includes(q) || (ann.content || '').toLowerCase().includes(q);
    }
    return true;
  }).map(ann => {
    const typeMeta = {
      info: {
        label: '📢 إعلان عام',
        badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
        border: 'border-indigo-200 dark:border-slate-700'
      },
      promo: {
        label: '🔥 عرض ترويجي',
        badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        border: 'border-amber-200 dark:border-slate-700'
      },
      urgent: {
        label: '🚨 تنبيه عاجل',
        badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
        border: 'border-rose-200 dark:border-slate-700'
      },
      maintenance: {
        label: '🛠️ صيانة وتحديث',
        badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
        border: 'border-purple-200 dark:border-slate-700'
      }
    }[ann.adType || 'info'] || {
      label: '📢 إعلان عام',
      badge: 'bg-indigo-100 text-indigo-700',
      border: 'border-slate-200'
    };
    const targetMeta = {
      all: {
        label: '👥 الجميع (مقاولين وعمال)',
        cls: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
      },
      admin: {
        label: '💼 المقاولين فقط',
        cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
      },
      worker: {
        label: '👷 العمال والحرفيين فقط',
        cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
      }
    }[ann.target || 'all'] || {
      label: '👥 الجميع',
      cls: 'bg-slate-100 text-slate-700'
    };
    const isExpired = ann.expiresAt && new Date(ann.expiresAt).getTime() < Date.now();
    return /*#__PURE__*/React.createElement("div", {
      key: ann.id,
      className: `bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-sm border ${typeMeta.border} flex flex-col justify-between gap-4 transition-all hover:shadow-md`
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center justify-between gap-2 mb-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-1.5"
    }, /*#__PURE__*/React.createElement("span", {
      className: `text-[10px] px-2.5 py-1 rounded-lg font-black ${typeMeta.badge}`
    }, typeMeta.label), /*#__PURE__*/React.createElement("span", {
      className: `text-[10px] px-2.5 py-1 rounded-lg font-black ${targetMeta.cls}`
    }, targetMeta.label), ann.isPinned && /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] px-2 py-1 rounded-lg font-black bg-amber-400/20 text-amber-600 dark:text-amber-300"
    }, "\uD83D\uDCCC \u0645\u062B\u0628\u0651\u062A \u0628\u0627\u0644\u0623\u0648\u0644\u0648\u064A\u0629")), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => toggleAnnouncementActive(ann),
      className: `text-[11px] px-3 py-1 rounded-xl font-black flex items-center gap-1.5 transition-all ${ann.isActive && !isExpired ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400 hover:bg-slate-300'}`,
      title: "\u0627\u0636\u063A\u0637 \u0644\u0644\u062A\u0641\u0639\u064A\u0644 \u0623\u0648 \u0627\u0644\u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u0641\u0648\u0631\u064A"
    }, /*#__PURE__*/React.createElement("span", {
      className: `w-2 h-2 rounded-full ${ann.isActive && !isExpired ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`
    }), /*#__PURE__*/React.createElement("span", null, isExpired ? 'منتهي الصلاحية' : ann.isActive ? 'نشط الآن ✓' : 'متوقف مؤقتاً'))), ann.imageUrl && /*#__PURE__*/React.createElement("div", {
      className: "mb-3 h-36 w-full rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("img", {
      src: ann.imageUrl,
      alt: ann.title,
      className: "w-full h-full object-cover",
      onError: e => {
        e.target.style.display = 'none';
      }
    })), /*#__PURE__*/React.createElement("h3", {
      className: "font-black text-base text-slate-800 dark:text-white mb-1.5"
    }, ann.title), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-slate-900/70 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-700/60"
    }, ann.content), ann.linkUrl && /*#__PURE__*/React.createElement("div", {
      className: "mt-2.5 flex items-center justify-between bg-indigo-50/70 dark:bg-indigo-950/30 px-3 py-2 rounded-xl border border-indigo-100 dark:border-indigo-900/50 text-xs"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-black text-indigo-700 dark:text-indigo-300 truncate"
    }, "\uD83D\uDD17 \u0632\u0631 \u0627\u0644\u0631\u0627\u0628\u0637: ", ann.buttonLabel || 'فتح الرابط المرفق'), /*#__PURE__*/React.createElement("a", {
      href: ann.linkUrl,
      target: "_blank",
      rel: "noreferrer",
      className: "text-[11px] font-mono text-indigo-600 dark:text-indigo-400 underline truncate max-w-[160px] dir-ltr"
    }, ann.linkUrl))), /*#__PURE__*/React.createElement("div", {
      className: "pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400"
    }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDC41\uFE0F \u0627\u0644\u0638\u0647\u0648\u0631 \u0644\u0643\u0644 \u0645\u0633\u062A\u062E\u062F\u0645: ", /*#__PURE__*/React.createElement("b", {
      className: "text-slate-700 dark:text-slate-200"
    }, Number(ann.maxViews) >= 999 ? 'في كل مرة (مستمر)' : `${ann.maxViews || 1} مرات`)), ann.expiresAt && /*#__PURE__*/React.createElement("span", {
      className: isExpired ? 'text-rose-500 font-black' : 'text-amber-600 dark:text-amber-400'
    }, "\u23F3 \u064A\u0646\u062A\u0647\u064A: ", ann.expiresAt)), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center justify-between gap-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-1.5"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setPreviewAnn(ann),
      className: "px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl font-black text-xs flex items-center gap-1 transition-all"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "eye",
      size: 14
    }), " \u0645\u0639\u0627\u064A\u0646\u0629"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => rebroadcastAnnouncement(ann),
      className: "px-3 py-2 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 rounded-xl font-black text-xs flex items-center gap-1 transition-all",
      title: "\u0625\u0639\u0627\u062F\u0629 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0625\u0639\u0644\u0627\u0646 \u0644\u064A\u0638\u0647\u0631 \u0645\u0646 \u062C\u062F\u064A\u062F \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646 \u062D\u062A\u0649 \u0645\u0646 \u0634\u0627\u0647\u062F\u0647 \u0633\u0627\u0628\u0642\u0627\u064B"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "refresh-cw",
      size: 14
    }), " \u0625\u0639\u0627\u062F\u0629 \u0628\u062B \u0644\u0644\u062C\u0645\u064A\u0639")), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-1.5"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => openModal('announcements', ann),
      className: "px-3 py-2 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 text-amber-600 dark:text-amber-300 rounded-xl font-black text-xs flex items-center gap-1"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "edit-2",
      size: 14
    }), " \u062A\u0639\u062F\u064A\u0644"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => triggerDelete('announcements', ann.id),
      className: "p-2 bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 text-rose-600 rounded-xl",
      title: "\u062D\u0630\u0641 \u0627\u0644\u0625\u0639\u0644\u0627\u0646"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "trash-2",
      size: 15
    }))))));
  }), data.announcements.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "col-span-full text-center py-12 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-slate-700 text-indigo-600 mx-auto flex items-center justify-center mb-3"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "megaphone",
    size: 32
  })), /*#__PURE__*/React.createElement("h3", {
    className: "font-black text-base text-slate-800 dark:text-white"
  }, "\u0644\u0627 \u062A\u0648\u062C\u062F \u0625\u0639\u0644\u0627\u0646\u0627\u062A \u0646\u0638\u0627\u0645 \u0645\u0633\u062C\u0644\u0629 \u062D\u0627\u0644\u064A\u0627\u064B"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 mt-1 mb-4 font-bold"
  }, "\u064A\u0645\u0643\u0646\u0643 \u0625\u0646\u0634\u0627\u0621 \u0625\u0639\u0644\u0627\u0646 \u062C\u062F\u064A\u062F \u0623\u0648 \u0627\u062E\u062A\u064A\u0627\u0631 \u0623\u062D\u062F \u0627\u0644\u0642\u0648\u0627\u0644\u0628 \u0627\u0644\u062C\u0627\u0647\u0632\u0629 \u0628\u0627\u0644\u0623\u0639\u0644\u0649 \u0644\u0625\u0631\u0633\u0627\u0644 \u062A\u0646\u0628\u064A\u0647 \u0641\u0648\u0631\u064A \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646 \u0623\u0648 \u0627\u0644\u0639\u0645\u0627\u0644."), /*#__PURE__*/React.createElement("button", {
    onClick: () => openModal('announcements', null),
    className: "bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black text-xs inline-flex items-center gap-2 shadow-lg"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 16
  }), " \u0625\u0646\u0634\u0627\u0621 \u0623\u0648\u0644 \u0625\u0639\u0644\u0627\u0646 \u0644\u0644\u0646\u0638\u0627\u0645")))) : view === 'settings' ? /*#__PURE__*/React.createElement("div", {
    className: "max-w-xl mx-auto animate-enter"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-bold text-lg mb-4 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "settings",
    className: "text-indigo-600"
  }), " \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645 \u0648\u0631\u0645\u0632 \u0627\u0644\u062F\u062E\u0648\u0644"), /*#__PURE__*/React.createElement("div", {
    className: "bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700"
  }, /*#__PURE__*/React.createElement("form", {
    id: "dash-settings-form",
    key: `settings_${data.settings?.updatedAt || 'init'}_${data.settings?.latestVersion || ''}_${data.settings?.apkUrl || ''}`,
    onSubmit: handleSaveSettings,
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-xl"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-black text-indigo-700 dark:text-indigo-300 mb-1.5 flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDD11 \u0631\u0645\u0632 \u062F\u062E\u0648\u0644 \u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 (\u0627\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F)"), /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[11px] bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded"
  }, "\u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u0623\u0633\u0627\u0633\u064A: ", MASTER_PASSWORD)), /*#__PURE__*/React.createElement("input", {
    type: "text",
    name: "adminPassword",
    defaultValue: data.settings?.adminPasswordCipher && AlOstaCrypto.decryptSecret(data.settings.adminPasswordCipher, 'waad_dashboard_admin') || (data.settings?.adminPassword && data.settings.adminPassword !== AlOstaCrypto.ENCRYPTED_MASK ? data.settings.adminPassword : '') || localStorage.getItem('waad_custom_admin_pass_enc') && AlOstaCrypto.decryptSecret(localStorage.getItem('waad_custom_admin_pass_enc'), 'waad_dashboard_admin') || localStorage.getItem('waad_custom_admin_pass') || MASTER_PASSWORD,
    placeholder: "\u0623\u062F\u062E\u0644 \u0631\u0645\u0632 \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F",
    className: "w-full p-3 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-slate-700 rounded-xl outline-none dir-ltr text-center font-mono font-black text-sm",
    required: true
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] text-slate-500 mt-1.5 font-bold"
  }, "\u064A\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0631\u0645\u0632 \u0645\u0634\u0641\u0631\u0627\u064B \u0628\u0645\u0639\u064A\u0627\u0631 (SHA-256 + E2EE) \u0641\u064A \u0627\u0644\u0633\u062D\u0627\u0628\u0629. \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u062F\u062E\u0648\u0644 \u062F\u0627\u0626\u0645\u0627\u064B \u0628\u0647\u0630\u0627 \u0627\u0644\u0631\u0645\u0632 \u0623\u0648 \u0628\u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u0623\u0633\u0627\u0633\u064A (", MASTER_PASSWORD, ").")), /*#__PURE__*/React.createElement("div", {
    className: "p-4 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2 flex-wrap"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-sm font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCF1"), /*#__PURE__*/React.createElement("span", null, "\u062A\u062D\u062F\u064A\u062B \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0623\u0633\u0637\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A (AlOsta_App.apk)")), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 dir-ltr"
  }, "Live: v", data.settings?.latestVersion || DASHBOARD_VERSION)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0623\u062D\u062F\u062B \u0625\u0635\u062F\u0627\u0631 \u0644\u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0631\u0626\u064A\u0633\u064A (\u0645\u062B\u0627\u0644: 1.0.9)"), /*#__PURE__*/React.createElement("input", {
    name: "latestVersion",
    defaultValue: data.settings?.latestVersion || DASHBOARD_VERSION,
    className: "w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none dir-ltr text-right font-black",
    required: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2 mb-1"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold block"
  }, "\u0631\u0627\u0628\u0637 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0631\u0626\u064A\u0633\u064A (AlOsta_App.apk)"), data.settings?.portalBaseUrl && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      const f = document.getElementById('dash-settings-form');
      if (f && f.apkUrl) {
        const base = String(data.settings.portalBaseUrl).replace(/\/?$/, '/');
        f.apkUrl.value = base + 'AlOsta_App.apk';
        showToast("تم تعبئة رابط AlOsta_App.apk المباشر من الخادم ✓");
      }
    },
    className: "text-[10px] font-black bg-indigo-600 text-white px-2 py-1 rounded-lg active:scale-95"
  }, "\u062A\u0639\u0628\u0626\u0629 \u0631\u0627\u0628\u0637 \u0627\u0644\u062E\u0627\u062F\u0645 \u26A1")), /*#__PURE__*/React.createElement("input", {
    type: "text",
    name: "apkUrl",
    defaultValue: data.settings?.apkUrl || data.settings?.rawApkUrl || '',
    placeholder: "https://drive.google.com/file/d/... \u0623\u0648 \u0631\u0627\u0628\u0637 \u0645\u0628\u0627\u0634\u0631 .apk",
    className: "w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none dir-ltr text-left text-xs font-mono"
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] text-emerald-700 dark:text-emerald-400 font-bold mt-1"
  }, "\u26A0\uFE0F \u062A\u0646\u0628\u064A\u0647 \u0647\u0627\u0645: \u062A\u0623\u0643\u062F \u0623\u0646 \u0627\u0644\u0631\u0627\u0628\u0637 \u064A\u062E\u0635 \u0645\u0644\u0641 ", /*#__PURE__*/React.createElement("b", null, "AlOsta_App.apk"), " (\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0645\u0642\u0627\u0648\u0644 \u0648\u0627\u0644\u0639\u0627\u0645\u0644) \u0648\u0644\u064A\u0633 \u0645\u0644\u0641 \u0627\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F.")), /*#__PURE__*/React.createElement("div", {
    className: "pt-2 border-t border-emerald-200/70 dark:border-emerald-800/50 space-y-2.5"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "text-xs font-black text-indigo-800 dark:text-indigo-300 flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDEE1\uFE0F \u062A\u062D\u062F\u064A\u062B \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F \u0646\u0641\u0633\u0647 (AlOsta_Dashboard.apk)"), /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[10px] bg-indigo-100 dark:bg-indigo-900 px-2 py-0.5 rounded"
  }, "\u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629: v", DASHBOARD_VERSION)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-3 gap-2"
  }, /*#__PURE__*/React.createElement("input", {
    name: "latestDashboardVersion",
    defaultValue: data.settings?.latestDashboardVersion || DASHBOARD_VERSION,
    placeholder: "1.0.9",
    className: "p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none dir-ltr text-center font-black text-xs"
  }), /*#__PURE__*/React.createElement("input", {
    type: "text",
    name: "dashboardApkUrl",
    defaultValue: data.settings?.dashboardApkUrl || '',
    placeholder: "\u0631\u0627\u0628\u0637 AlOsta_Dashboard.apk",
    className: "sm:col-span-2 p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none dir-ltr text-left text-xs font-mono"
  })), data.settings?.dashboardApkUrl && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      if (typeof window.__triggerDashboardUpdate === 'function') {
        window.__triggerDashboardUpdate();
      }
    },
    className: "w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "download",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "\u062A\u062D\u0645\u064A\u0644 \u0648\u062A\u062B\u0628\u064A\u062A \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F \u0627\u0644\u0622\u0646 \uD83D\uDCF2")))), data.settings?.portalBaseUrl && /*#__PURE__*/React.createElement("div", {
    className: "p-4 rounded-2xl border-2 border-sky-200 dark:border-sky-800/70 bg-sky-50/50 dark:bg-sky-950/20 space-y-2.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2 flex-wrap"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-sm font-black text-sky-900 dark:text-sky-200 flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83C\uDF4E"), /*#__PURE__*/React.createElement("span", null, "\u0646\u0633\u062E\u0629 \u0627\u0644\u0622\u064A\u0641\u0648\u0646 (iOS \u2014 \u0646\u0641\u0633 \u0646\u0633\u062E\u0629 \u0627\u0644\u0623\u0646\u062F\u0631\u0648\u064A\u062F 100%)")), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300"
  }, "PWA Standalone")), /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] font-bold text-slate-600 dark:text-slate-300 leading-relaxed"
  }, "\u0644\u0644\u062A\u0634\u063A\u064A\u0644 \u0639\u0644\u0649 \u0627\u0644\u0622\u064A\u0641\u0648\u0646 \u0628\u062F\u0648\u0646 \u0645\u062A\u062C\u0631 App Store: \u0627\u0641\u062A\u062D \u0627\u0644\u0631\u0627\u0628\u0637 \u0623\u062F\u0646\u0627\u0647 \u0641\u064A \u0645\u062A\u0635\u0641\u062D Safari \u062B\u0645 \u0627\u0636\u063A\u0637 \u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629 \u2B06\uFE0F \u2190 \xAB\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629\xBB."), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      const base = String(data.settings.portalBaseUrl).replace(/\/?$/, '/');
      const url = base + 'index.html';
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).catch(() => {});
      showToast("تم نسخ رابط نسخة الآيفون (الأسطة) ✓");
    },
    className: "py-2.5 px-3 rounded-xl bg-slate-900 dark:bg-slate-700 text-white font-black text-xs flex items-center justify-center gap-1.5 active:scale-95"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCF1"), /*#__PURE__*/React.createElement("span", null, "\u0646\u0633\u062E \u0631\u0627\u0628\u0637 \u0627\u0644\u0622\u064A\u0641\u0648\u0646 (\u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0631\u0626\u064A\u0633\u064A)")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      const base = String(data.settings.portalBaseUrl).replace(/\/?$/, '/');
      const url = base + 'dashboard.html';
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).catch(() => {});
      showToast("تم نسخ رابط الآيفون للداشبورد ✓");
    },
    className: "py-2.5 px-3 rounded-xl bg-sky-600 text-white font-black text-xs flex items-center justify-center gap-1.5 active:scale-95"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDEE1\uFE0F"), /*#__PURE__*/React.createElement("span", null, "\u0646\u0633\u062E \u0631\u0627\u0628\u0637 \u0627\u0644\u0622\u064A\u0641\u0648\u0646 (\u0644\u0648\u062D\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629)")))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 p-3 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/50 rounded-xl"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    id: "forceUpdate",
    name: "forceUpdate",
    defaultChecked: data.settings?.forceUpdate || false,
    className: "w-5 h-5 accent-rose-600"
  }), /*#__PURE__*/React.createElement("label", {
    htmlFor: "forceUpdate",
    className: "text-sm font-bold text-rose-600 dark:text-rose-400 cursor-pointer"
  }, "\u0625\u062C\u0628\u0627\u0631 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646 \u0639\u0644\u0649 \u0627\u0644\u062A\u062D\u062F\u064A\u062B")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/50 rounded-xl mt-3"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    id: "maintenanceMode",
    name: "maintenanceMode",
    defaultChecked: data.settings?.maintenanceMode || false,
    className: "w-5 h-5 accent-amber-600"
  }), /*#__PURE__*/React.createElement("label", {
    htmlFor: "maintenanceMode",
    className: "text-sm font-bold text-amber-600 dark:text-amber-400 cursor-pointer"
  }, "\u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0644\u0644\u0635\u064A\u0627\u0646\u0629")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/50 rounded-xl mt-3"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    id: "stopUpdate",
    name: "stopUpdate",
    defaultChecked: data.settings?.stopUpdate || false,
    className: "w-5 h-5 accent-indigo-600"
  }), /*#__PURE__*/React.createElement("label", {
    htmlFor: "stopUpdate",
    className: "text-sm font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer"
  }, "\u0625\u064A\u0642\u0627\u0641 \u0646\u0627\u0641\u0630\u0629 \u0627\u0644\u062A\u062D\u062F\u064A\u062B")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      const f = document.getElementById('dash-settings-form');
      if (f) saveSettingsPayload(f, true);
    },
    className: "w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-sm shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "send",
    size: 16
  }), /*#__PURE__*/React.createElement("span", null, "\u062D\u0641\u0638 \u0648\u062F\u0641\u0639 \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0641\u0648\u0631\u064A \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u062A\u0637\u0628\u064A\u0642\u0627\u062A \u0627\u0644\u0622\u0646 \uD83D\uDE80")), (() => {
    const targetContractors = Math.max(1, parseInt(data.settings?.targetContractorsCount) || 500);
    const targetWorkers = Math.max(1, parseInt(data.settings?.targetWorkersCount) || 2000);
    const targetStores = Math.max(1, parseInt(data.settings?.targetStoresCount) || 15);
    const curContractors = data.admins.length;
    const curWorkers = data.workers.length;
    const curStores = data.stores.length;
    const pctContractors = Math.min(100, Math.round(curContractors / targetContractors * 100));
    const pctWorkers = Math.min(100, Math.round(curWorkers / targetWorkers * 100));
    const pctStores = Math.min(100, Math.round(curStores / targetStores * 100));
    const overallReady = curContractors >= targetContractors && curWorkers >= targetWorkers && curStores >= targetStores;
    const isPaidActive = Boolean(data.settings?.monetizationEnabled);
    return /*#__PURE__*/React.createElement("div", {
      className: "p-5 mt-4 rounded-3xl border-2 border-indigo-200 dark:border-indigo-800/80 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30 space-y-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center justify-between gap-2"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", {
      className: "font-black text-sm md:text-base text-indigo-900 dark:text-indigo-200 flex items-center gap-2"
    }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDC8E"), /*#__PURE__*/React.createElement("span", null, "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u062E\u0637\u0629 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0629 \u0648\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A (\u0645\u0648\u0642\u0648\u0641\u0629 \u062D\u0627\u0644\u064A\u0627\u064B \u2014 \u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u0645\u062C\u0627\u0646\u064A \u0645\u0641\u0639\u0651\u0644)")), /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5"
    }, "\u062C\u0645\u064A\u0639 \u0642\u064A\u0648\u062F \u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u0645\u062C\u0627\u0646\u064A\u0629 \u0648\u0645\u0645\u064A\u0632\u0627\u062A \u0628\u0627\u0642\u0629 Pro \u0645\u0628\u0631\u0645\u062C\u0629 \u0628\u0627\u0644\u0643\u0627\u0645\u0644 \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642\u060C \u0648\u062A\u0628\u0642\u0649 \u0645\u0648\u0642\u0648\u0641\u0629 \u062D\u062A\u0649 \u062A\u0642\u0648\u0645 \u0628\u062A\u0641\u0639\u064A\u0644\u0647\u0627 \u0645\u0646 \u0647\u0646\u0627 \u0639\u0646\u062F \u0627\u0643\u062A\u0645\u0627\u0644 \u0627\u0644\u0639\u062F\u062F \u0627\u0644\u0645\u0646\u0627\u0633\u0628.")), /*#__PURE__*/React.createElement("span", {
      className: `px-3 py-1.5 rounded-full text-xs font-black border ${isPaidActive ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm' : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'}`
    }, isPaidActive ? '👑 الخطة المدفوعة مفعّلة حالياً' : '🟢 الوضع المجاني الشامل مفعّل (مرحلة النمو)')), /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800/90 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-xs font-black text-slate-700 dark:text-slate-200"
    }, "\uD83D\uDCCA \u0645\u0624\u0634\u0631 \u0627\u0643\u062A\u0645\u0627\u0644 \u0627\u0644\u0639\u062F\u062F \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641 \u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u062E\u0637\u0629 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0629:"), /*#__PURE__*/React.createElement("span", {
      className: `text-[11px] font-black px-2.5 py-0.5 rounded-lg ${overallReady ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`
    }, overallReady ? '✅ اكتمل العدد المستهدف — جاهز للتفعيل!' : '⏳ في مرحلة بناء القاعدة الجماهيرية')), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-1 md:grid-cols-3 gap-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between text-xs font-black mb-1"
    }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDC77 \u0627\u0644\u0645\u0642\u0627\u0648\u0644\u0648\u0646 \u0627\u0644\u0645\u0633\u062C\u0644\u0648\u0646"), /*#__PURE__*/React.createElement("span", {
      className: "dir-ltr text-indigo-600 dark:text-indigo-400"
    }, curContractors, " / ", targetContractors, " (", pctContractors, "%)")), /*#__PURE__*/React.createElement("div", {
      className: "w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"
    }, /*#__PURE__*/React.createElement("div", {
      className: "h-full bg-indigo-600 rounded-full transition-all",
      style: {
        width: `${pctContractors}%`
      }
    }))), /*#__PURE__*/React.createElement("div", {
      className: "p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between text-xs font-black mb-1"
    }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDEE0\uFE0F \u0627\u0644\u0623\u0633\u0637\u0648\u0627\u062A \u0648\u0627\u0644\u0639\u0645\u0627\u0644"), /*#__PURE__*/React.createElement("span", {
      className: "dir-ltr text-emerald-600 dark:text-emerald-400"
    }, curWorkers, " / ", targetWorkers, " (", pctWorkers, "%)")), /*#__PURE__*/React.createElement("div", {
      className: "w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"
    }, /*#__PURE__*/React.createElement("div", {
      className: "h-full bg-emerald-600 rounded-full transition-all",
      style: {
        width: `${pctWorkers}%`
      }
    }))), /*#__PURE__*/React.createElement("div", {
      className: "p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between text-xs font-black mb-1"
    }, /*#__PURE__*/React.createElement("span", null, "\uD83C\uDFEA \u0627\u0644\u0645\u0639\u0627\u0631\u0636 \u0648\u0627\u0644\u0648\u0643\u0627\u0644\u0627\u062A"), /*#__PURE__*/React.createElement("span", {
      className: "dir-ltr text-fuchsia-600 dark:text-fuchsia-400"
    }, curStores, " / ", targetStores, " (", pctStores, "%)")), /*#__PURE__*/React.createElement("div", {
      className: "w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"
    }, /*#__PURE__*/React.createElement("div", {
      className: "h-full bg-fuchsia-600 rounded-full transition-all",
      style: {
        width: `${pctStores}%`
      }
    }))))), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-1 md:grid-cols-2 gap-3"
    }, /*#__PURE__*/React.createElement("label", {
      className: "flex items-start gap-3 cursor-pointer p-3.5 bg-white dark:bg-slate-800 rounded-2xl border-2 border-indigo-300 dark:border-indigo-700 shadow-xs"
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      name: "monetizationEnabled",
      defaultChecked: Boolean(data.settings?.monetizationEnabled),
      className: "w-5 h-5 mt-0.5 accent-indigo-600 rounded shrink-0"
    }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "font-black text-xs md:text-sm block text-indigo-950 dark:text-white"
    }, "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062E\u0637\u0629 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0629 \u0641\u064A \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0622\u0646 (Master Switch)"), /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-bold text-slate-500 dark:text-slate-400 block mt-0.5"
    }, "\u0639\u0646\u062F \u0625\u0628\u0642\u0627\u0626\u0647 \u063A\u064A\u0631 \u0645\u0641\u0639\u0651\u0644 (\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u062D\u0627\u0644\u064A)\u060C \u064A\u0639\u0645\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0645\u062C\u0627\u0646\u0627\u064B \u0628\u0627\u0644\u0643\u0627\u0645\u0644 \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646 \u0648\u0627\u0644\u0639\u0645\u0627\u0644 \u0648\u0627\u0644\u0645\u0639\u0627\u0631\u0636 \u0628\u062F\u0648\u0646 \u0623\u064A \u0642\u064A\u0648\u062F."))), /*#__PURE__*/React.createElement("label", {
      className: "flex items-start gap-3 cursor-pointer p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      name: "autoEnableOnTarget",
      defaultChecked: Boolean(data.settings?.autoEnableOnTarget),
      className: "w-5 h-5 mt-0.5 accent-emerald-600 rounded shrink-0"
    }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "font-black text-xs md:text-sm block text-slate-800 dark:text-white"
    }, "\u062A\u0641\u0639\u064A\u0644 \u062A\u0644\u0642\u0627\u0626\u064A \u0639\u0646\u062F \u0627\u0643\u062A\u0645\u0627\u0644 \u0627\u0644\u0639\u062F\u062F \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641 \uD83C\uDFAF"), /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-bold text-slate-500 dark:text-slate-400 block mt-0.5"
    }, "\u064A\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062E\u0637\u0629 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0629 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0641\u0648\u0631 \u0648\u0635\u0648\u0644 \u0639\u062F\u062F \u0627\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646 \u0648\u0627\u0644\u0639\u0645\u0627\u0644 \u0648\u0627\u0644\u0645\u0639\u0627\u0631\u0636 \u0644\u0644\u062D\u062F \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641 \u0623\u062F\u0646\u0627\u0647.")))), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-2 sm:grid-cols-3 gap-3"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[11px] font-black text-slate-600 dark:text-slate-300 block mb-1"
    }, "\u0627\u0644\u0639\u062F\u062F \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      name: "targetContractorsCount",
      defaultValue: data.settings?.targetContractorsCount || 500,
      className: "w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-xs text-center dir-ltr outline-none"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[11px] font-black text-slate-600 dark:text-slate-300 block mb-1"
    }, "\u0627\u0644\u0639\u062F\u062F \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641 \u0644\u0644\u0639\u0645\u0627\u0644"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      name: "targetWorkersCount",
      defaultValue: data.settings?.targetWorkersCount || 2000,
      className: "w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-xs text-center dir-ltr outline-none"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[11px] font-black text-slate-600 dark:text-slate-300 block mb-1"
    }, "\u0627\u0644\u0639\u062F\u062F \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641 \u0644\u0644\u0645\u0639\u0627\u0631\u0636"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      name: "targetStoresCount",
      defaultValue: data.settings?.targetStoresCount || 15,
      className: "w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-xs text-center dir-ltr outline-none"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[11px] font-black text-slate-600 dark:text-slate-300 block mb-1"
    }, "\u062D\u062F \u0627\u0644\u0645\u0634\u0627\u0631\u064A\u0639 \u0628\u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u0645\u062C\u0627\u0646\u064A\u0629"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      name: "freeMaxProjects",
      defaultValue: data.settings?.freeMaxProjects || 2,
      className: "w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-xs text-center dir-ltr outline-none"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[11px] font-black text-slate-600 dark:text-slate-300 block mb-1"
    }, "\u062D\u062F \u0627\u0644\u0639\u0645\u0627\u0644 \u0628\u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u0645\u062C\u0627\u0646\u064A\u0629"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      name: "freeMaxWorkers",
      defaultValue: data.settings?.freeMaxWorkers || 5,
      className: "w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-xs text-center dir-ltr outline-none"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[11px] font-black text-slate-600 dark:text-slate-300 block mb-1"
    }, "\u062D\u062F \u0645\u0646\u062A\u062C\u0627\u062A \u0627\u0644\u0645\u0639\u0631\u0636 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      name: "freeStoreMaxProducts",
      defaultValue: data.settings?.freeStoreMaxProducts || 10,
      className: "w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-xs text-center dir-ltr outline-none"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800/90 p-3.5 rounded-2xl border border-indigo-200 dark:border-slate-700 space-y-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-xs font-black text-indigo-900 dark:text-indigo-200"
    }, "\uD83D\uDCB0 \u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0627\u0644\u0634\u0647\u0631\u064A\u0629 \u0648\u0627\u0644\u0633\u0646\u0648\u064A\u0629 (\u062F\u064A\u0646\u0627\u0631 \u0639\u0631\u0627\u0642\u064A):"), /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-black bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-lg"
    }, "\u064A\u062F\u0639\u0645 \u0627\u0644\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0634\u0647\u0631\u064A / \u0627\u0644\u0631\u0628\u0639 \u0633\u0646\u0648\u064A / \u0627\u0644\u0646\u0635\u0641 \u0633\u0646\u0648\u064A / \u0627\u0644\u0633\u0646\u0648\u064A")), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-2 sm:grid-cols-3 gap-3"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[11px] font-black text-indigo-700 dark:text-indigo-300 block mb-1"
    }, "\u0645\u0642\u0627\u0648\u0644 Pro (\uD83D\uDDD3\uFE0F \u0634\u0647\u0631\u064A\u0627\u064B)"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      name: "proContractorPrice",
      defaultValue: data.settings?.proContractorPrice || 25000,
      className: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-indigo-200 dark:border-slate-700 rounded-xl font-black text-xs text-center dir-ltr outline-none"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[11px] font-black text-indigo-700 dark:text-indigo-300 block mb-1"
    }, "\u0645\u0642\u0627\u0648\u0644 Pro (\uD83C\uDFC6 \u0633\u0646\u0648\u064A\u0627\u064B)"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      name: "proContractorAnnualPrice",
      defaultValue: data.settings?.proContractorAnnualPrice || 250000,
      className: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-indigo-300 dark:border-slate-700 rounded-xl font-black text-xs text-center dir-ltr outline-none"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[11px] font-black text-fuchsia-700 dark:text-fuchsia-300 block mb-1"
    }, "\u0645\u0639\u0631\u0636 VIP (\uD83D\uDDD3\uFE0F \u0634\u0647\u0631\u064A\u0627\u064B)"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      name: "proStorePrice",
      defaultValue: data.settings?.proStorePrice || 75000,
      className: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-fuchsia-200 dark:border-slate-700 rounded-xl font-black text-xs text-center dir-ltr outline-none"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[11px] font-black text-fuchsia-700 dark:text-fuchsia-300 block mb-1"
    }, "\u0645\u0639\u0631\u0636 VIP (\uD83C\uDFC6 \u0633\u0646\u0648\u064A\u0627\u064B)"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      name: "proStoreAnnualPrice",
      defaultValue: data.settings?.proStoreAnnualPrice || 750000,
      className: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-fuchsia-300 dark:border-slate-700 rounded-xl font-black text-xs text-center dir-ltr outline-none"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[11px] font-black text-emerald-700 dark:text-emerald-300 block mb-1"
    }, "\u062A\u0648\u062B\u064A\u0642 \u0623\u0633\u0637\u0629 \u2B50 (\uD83D\uDDD3\uFE0F \u0634\u0647\u0631\u064A\u0627\u064B)"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      name: "verifiedWorkerPrice",
      defaultValue: data.settings?.verifiedWorkerPrice || 5000,
      className: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-emerald-200 dark:border-slate-700 rounded-xl font-black text-xs text-center dir-ltr outline-none"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[11px] font-black text-emerald-700 dark:text-emerald-300 block mb-1"
    }, "\u062A\u0648\u062B\u064A\u0642 \u0623\u0633\u0637\u0629 \u2B50 (\uD83C\uDFC6 \u0633\u0646\u0648\u064A\u0627\u064B)"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      name: "verifiedWorkerAnnualPrice",
      defaultValue: data.settings?.verifiedWorkerAnnualPrice || 50000,
      className: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-emerald-300 dark:border-slate-700 rounded-xl font-black text-xs text-center dir-ltr outline-none"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "pt-1"
    }, /*#__PURE__*/React.createElement("label", {
      className: "text-[11px] font-black text-slate-700 dark:text-slate-300 block mb-1"
    }, "\uD83D\uDCF1 \u0631\u0642\u0645 \u0648\u0627\u062A\u0633\u0627\u0628 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0644\u0627\u0633\u062A\u0644\u0627\u0645 \u0637\u0644\u0628\u0627\u062A \u0648\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A:"), /*#__PURE__*/React.createElement("input", {
      type: "tel",
      name: "subscriptionWhatsapp",
      defaultValue: data.settings?.subscriptionWhatsapp || '',
      placeholder: "0770XXXXXXX",
      className: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-xs text-center dir-ltr outline-none"
    }))));
  })(), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "w-full bg-indigo-600 text-white py-3.5 rounded-xl font-black hover:bg-indigo-700 transition-colors mt-4 shadow-lg"
  }, "\u062D\u0641\u0638 \u0648\u062A\u0634\u0641\u064A\u0631 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0648\u062E\u0637\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \uD83D\uDD12\u2713"))), (() => {
    let pkgInfo = {
      isDashboard: true,
      packageName: 'com.aistudio.alosta.dashboard',
      versionName: DASHBOARD_VERSION
    };
    try {
      if (window.AndroidApp && typeof window.AndroidApp.getAppPackageInfo === 'function') {
        pkgInfo = JSON.parse(window.AndroidApp.getAppPackageInfo());
      }
    } catch (e) {}
    return /*#__PURE__*/React.createElement("div", {
      className: "bg-emerald-50 dark:bg-emerald-900/15 p-6 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 mt-6 shadow-sm space-y-3"
    }, /*#__PURE__*/React.createElement("h3", {
      className: "font-bold text-lg text-emerald-700 dark:text-emerald-400 flex items-center gap-2"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "download"
    }), " \u0627\u0633\u062A\u062E\u0631\u0627\u062C \u0648\u0645\u0634\u0627\u0631\u0643\u0629 \u0645\u0644\u0641 \u0627\u0644\u0640 APK \u0627\u0644\u062D\u0627\u0644\u064A (", pkgInfo.isDashboard ? 'AlOsta_Dashboard.apk' : 'AlOsta_App.apk', ")"), pkgInfo.isDashboard && /*#__PURE__*/React.createElement("div", {
      className: "p-3 rounded-xl bg-amber-100/90 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-bold leading-relaxed"
    }, "\u26A0\uFE0F \u062A\u0646\u0628\u064A\u0647: \u0623\u0646\u062A \u062A\u0641\u062A\u062D ", /*#__PURE__*/React.createElement("b", null, "\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F"), " \u062D\u0627\u0644\u064A\u0627\u064B \u2014 \u0627\u0644\u0632\u0631 \u0628\u0627\u0644\u0623\u0633\u0641\u0644 \u064A\u0633\u062A\u062E\u0631\u062C \u0645\u0644\u0641 ", /*#__PURE__*/React.createElement("b", null, "AlOsta_Dashboard.apk"), " \u0627\u0644\u062E\u0627\u0635 \u0628\u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0641\u0642\u0637. \u0644\u062A\u0635\u062F\u064A\u0631 \u0645\u0644\u0641 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0631\u0626\u064A\u0633\u064A ", /*#__PURE__*/React.createElement("b", null, "AlOsta_App.apk"), " \u064A\u062C\u0628 \u062A\u0635\u062F\u064A\u0631\u0647 \u0645\u0646 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0631\u0626\u064A\u0633\u064A \u0623\u0648 \u062A\u062D\u0645\u064A\u0644\u0647 \u0645\u0646 \u0631\u0627\u0628\u0637 \u0627\u0644\u062E\u0627\u062F\u0645 \u0627\u0644\u0645\u0628\u0627\u0634\u0631."), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => {
        if (window.AndroidApp && typeof window.AndroidApp.exportAndShareApk === 'function') {
          window.AndroidApp.exportAndShareApk();
          showToast(`تم تجهيز ملف ${pkgInfo.isDashboard ? 'AlOsta_Dashboard.apk' : 'AlOsta_App.apk'} وحفظه في التنزيلات ✓`);
        } else {
          showToast("يمكنك تنزيل AlOsta_App.apk و AlOsta_Dashboard.apk من روابط الخادم المباشرة");
        }
      },
      className: "w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "share-2",
      size: 16
    }), /*#__PURE__*/React.createElement("span", null, "\u062D\u0641\u0638 \u0648\u0645\u0634\u0627\u0631\u0643\u0629 (", pkgInfo.isDashboard ? 'AlOsta_Dashboard.apk' : 'AlOsta_App.apk', ") \uD83D\uDCE5")));
  })(), /*#__PURE__*/React.createElement("div", {
    className: "bg-rose-50 dark:bg-rose-900/10 p-6 rounded-2xl border border-rose-200 dark:border-rose-900/50 mt-6 shadow-sm"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-lg mb-2 text-rose-600 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield-alert"
  }), " \u0623\u062F\u0627\u0629 \u0627\u0644\u062A\u0634\u0641\u064A\u0631 \u0648\u0627\u0644\u062A\u0631\u062D\u064A\u0644 \u0627\u0644\u0623\u0645\u0646\u064A \u0627\u0644\u0634\u0627\u0645\u0644 (SHA-256 + Firebase Auth)"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 dark:text-slate-400 mb-4"
  }, "\u0647\u0630\u0647 \u0627\u0644\u0623\u062F\u0627\u0629 \u062A\u0642\u0648\u0645 \u0628\u062A\u0634\u0641\u064A\u0631 \u0643\u0627\u0641\u0629 \u0643\u0644\u0645\u0627\u062A \u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646 \u0648\u0627\u0644\u0639\u0645\u0627\u0644 \u0628\u0645\u0639\u064A\u0627\u0631 (SHA-256 + HMAC-CTR) \u0648\u0625\u0646\u0634\u0627\u0621 \u0647\u0648\u064A\u0629 \u0645\u0635\u0627\u062F\u0642\u0629 \u0633\u062D\u0627\u0628\u064A\u0629 \u0644\u0647\u0645."), /*#__PURE__*/React.createElement("button", {
    onClick: migrateAccounts,
    disabled: isMigrating,
    className: `w-full text-white py-3 rounded-xl font-bold transition-colors ${isMigrating ? 'bg-slate-400' : 'bg-rose-600 hover:bg-rose-700 active:scale-95'}`
  }, isMigrating ? 'جاري التشفير والترحيل... يرجى الانتظار' : 'بدء التشفير والترحيل الشامل لجميع الحسابات 🔒'), migrationLog.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "mt-4 bg-slate-900 text-emerald-400 font-mono text-[10px] md:text-sm p-4 rounded-xl max-h-40 overflow-y-auto dir-ltr text-left"
  }, migrationLog.map((log, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, log))))) : view === 'subscriptions' ? (() => {
    const q = searchQuery.trim().toLowerCase();
    const allEntities = [...data.admins.map(a => ({
      ...a,
      _col: 'admins',
      _flag: 'isPro',
      _roleLabel: '👷 مقاول',
      _badgeLabel: '👑 مقاول Pro',
      _displayName: a.name || a.id || 'مقاول',
      _subText: `معرف الدخول: ${a.id}`,
      _subInfo: getEntitySubscriptionInfo(a, 'isPro')
    })), ...data.stores.map(s => ({
      ...s,
      _col: 'stores',
      _flag: 'isVipStore',
      _roleLabel: '🏪 معرض / وكالة',
      _badgeLabel: '💎 معرض VIP',
      _displayName: s.name || 'معرض',
      _subText: `${s.gov || 'بغداد'} • ${s.phone || 'بدون هاتف'}`,
      _subInfo: getEntitySubscriptionInfo(s, 'isVipStore')
    })), ...data.workers.map(w => ({
      ...w,
      _col: 'workers',
      _flag: 'isVerifiedPro',
      _roleLabel: '🛠️ أسطة / عامل',
      _badgeLabel: '⭐ أسطة موثّق',
      _displayName: w.name || w.phone || 'عامل',
      _subText: `${w.specialty || 'عامل'} • ${w.phone || ''}`,
      _subInfo: getEntitySubscriptionInfo(w, 'isVerifiedPro')
    }))];
    const filteredEntities = allEntities.filter(ent => {
      if (subFilterTab === 'admins' && ent._col !== 'admins') return false;
      if (subFilterTab === 'stores' && ent._col !== 'stores') return false;
      if (subFilterTab === 'workers' && ent._col !== 'workers') return false;
      if (subFilterTab === 'expiring') {
        const inf = ent._subInfo;
        if (!inf.rawFlag) return false;
        if (!inf.isExpired && (inf.daysLeft === null || inf.daysLeft > 14)) return false;
      }
      if (!q) return true;
      return [ent._displayName, ent._subText, ent.id, ent.phone, ent._subInfo.planLabel].some(v => String(v || '').toLowerCase().includes(q));
    });
    const activeAdminsPro = data.admins.filter(a => getEntitySubscriptionInfo(a, 'isPro').isActive).length;
    const activeStoresVip = data.stores.filter(s => getEntitySubscriptionInfo(s, 'isVipStore').isActive).length;
    const activeWorkersVer = data.workers.filter(w => getEntitySubscriptionInfo(w, 'isVerifiedPro').isActive).length;
    const expiringCount = allEntities.filter(e => e._subInfo.rawFlag && (e._subInfo.isExpired || e._subInfo.daysLeft !== null && e._subInfo.daysLeft <= 14)).length;
    return /*#__PURE__*/React.createElement("div", {
      className: "max-w-5xl mx-auto space-y-4 animate-enter"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-gradient-to-l from-indigo-900 via-indigo-950 to-slate-900 text-white p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-amber-400 text-slate-950 px-3 py-0.5 rounded-full"
    }, "\uD83D\uDC8E \u0625\u062F\u0627\u0631\u0629 \u0648\u062A\u062C\u062F\u064A\u062F \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0648\u0627\u0644\u0628\u0627\u0642\u0627\u062A"), /*#__PURE__*/React.createElement("h2", {
      className: "font-black text-lg sm:text-xl mt-2"
    }, "\u062A\u062D\u062F\u064A\u062F \u0648\u062A\u062C\u062F\u064A\u062F \u0645\u062F\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 (\u0634\u0647\u0631\u064A / 3 \u0623\u0634\u0647\u0631 / 6 \u0623\u0634\u0647\u0631 / \u0633\u0646\u0648\u064A / \u0645\u0641\u062A\u0648\u062D)"), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-indigo-200 mt-1"
    }, "\u0627\u062E\u062A\u0631 \u0623\u064A \u0645\u0642\u0627\u0648\u0644 \u0623\u0648 \u0645\u0639\u0631\u0636 \u0623\u0648 \u0623\u0633\u0637\u0629 \u0628\u0627\u0644\u0623\u0633\u0641\u0644 \u0648\u062D\u062F\u062F \u0645\u062F\u0629 \u0627\u0634\u062A\u0631\u0627\u0643\u0647 \u0628\u0636\u063A\u0637\u0629 \u0648\u0627\u062D\u062F\u0629 \u0623\u0648 \u0627\u0641\u062A\u062D \u0646\u0627\u0641\u0630\u0629 \u0627\u0644\u062A\u0645\u062F\u064A\u062F \u0648\u0627\u0644\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0645\u062E\u0635\u0635.")), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setView('settings'),
      className: "bg-white/15 hover:bg-white/25 text-white px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 shrink-0"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "settings",
      size: 15
    }), /*#__PURE__*/React.createElement("span", null, "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0648\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u0645\u062F\u0641\u0648\u0639"))), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-2 sm:grid-cols-4 gap-2.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-bold text-slate-500 block"
    }, "\uD83D\uDC51 \u0645\u0642\u0627\u0648\u0644\u0648\u0646 Pro \u0646\u0634\u0637\u0648\u0646"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-xl text-amber-600 dark:text-amber-400"
    }, activeAdminsPro), /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-bold text-slate-400 mr-1"
    }, "/ ", data.admins.length)), /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-bold text-slate-500 block"
    }, "\uD83D\uDC8E \u0645\u0639\u0627\u0631\u0636 VIP \u0646\u0634\u0637\u0629"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-xl text-indigo-600 dark:text-indigo-400"
    }, activeStoresVip), /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-bold text-slate-400 mr-1"
    }, "/ ", data.stores.length)), /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-bold text-slate-500 block"
    }, "\u2B50 \u0623\u0633\u0637\u0648\u0627\u062A \u0645\u0648\u062B\u0642\u0648\u0646"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-xl text-emerald-600 dark:text-emerald-400"
    }, activeWorkersVer), /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-bold text-slate-400 mr-1"
    }, "/ ", data.workers.length)), /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-bold text-slate-500 block"
    }, "\u26A0\uFE0F \u0645\u0646\u062A\u0647\u064A\u0629 / \u0642\u0631\u064A\u0628\u0629 \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-xl text-rose-600"
    }, expiringCount))), /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-wrap gap-1.5"
    }, [{
      id: 'all',
      label: `الكل (${allEntities.length})`
    }, {
      id: 'admins',
      label: `👷 المقاولين (${data.admins.length})`
    }, {
      id: 'stores',
      label: `🏪 المعارض (${data.stores.length})`
    }, {
      id: 'workers',
      label: `🛠️ العمال والأسطوات (${data.workers.length})`
    }, {
      id: 'expiring',
      label: `⚠️ منتهية / للتجديد (${expiringCount})`
    }].map(t => /*#__PURE__*/React.createElement("button", {
      key: t.id,
      type: "button",
      onClick: () => setSubFilterTab(t.id),
      className: `px-3.5 py-2 rounded-xl font-black text-xs transition-all ${subFilterTab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`
    }, t.label))), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-1 md:grid-cols-2 gap-3.5"
    }, filteredEntities.map(ent => {
      const inf = ent._subInfo;
      return /*#__PURE__*/React.createElement("div", {
        key: `${ent._col}_${ent.id}`,
        className: "bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-3"
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex items-start justify-between gap-2"
      }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
        className: "text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300"
      }, ent._roleLabel), /*#__PURE__*/React.createElement("h3", {
        className: "font-black text-sm sm:text-base text-slate-900 dark:text-white mt-1"
      }, ent._displayName), /*#__PURE__*/React.createElement("p", {
        className: "text-xs font-bold text-slate-400"
      }, ent._subText)), /*#__PURE__*/React.createElement("div", {
        className: "text-left shrink-0"
      }, /*#__PURE__*/React.createElement("span", {
        className: `inline-block px-2.5 py-1 rounded-xl text-xs font-black border ${inf.isActive ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' : inf.isExpired ? 'bg-rose-100 text-rose-700 border-rose-300' : 'bg-slate-100 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700'}`
      }, inf.isActive ? `${ent._badgeLabel} (${inf.planLabel})` : inf.isExpired ? '⚠️ اشتراك منتهي' : 'باقة مجانية'), inf.rawFlag && /*#__PURE__*/React.createElement("div", {
        className: `text-[11px] font-black mt-1 ${inf.isExpired ? 'text-rose-600' : 'text-indigo-600 dark:text-indigo-400'}`
      }, inf.daysLeft === null ? '♾️ اشتراك مفتوح دائم' : inf.isExpired ? `انتهى منذ ${Math.abs(inf.daysLeft)} يوم` : `⏳ متبقي ${inf.daysLeft} يوم (${String(inf.expiresAt).slice(0, 10)})`))), /*#__PURE__*/React.createElement("div", {
        className: "bg-slate-50 dark:bg-slate-900 p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-700 space-y-2"
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex items-center justify-between"
      }, /*#__PURE__*/React.createElement("span", {
        className: "text-[11px] font-black text-slate-600 dark:text-slate-300"
      }, "\u26A1 \u062A\u0641\u0639\u064A\u0644 / \u062A\u062C\u062F\u064A\u062F \u0641\u0648\u0631\u064A \u0628\u0636\u063A\u0637\u0629 \u0648\u0627\u062D\u062F\u0629:"), /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => openSubscriptionModal(ent._col, ent, ent._flag),
        className: "text-[11px] font-black text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
      }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCC5 \u062A\u0645\u062F\u064A\u062F / \u062A\u0627\u0631\u064A\u062E \u0645\u062E\u0635\u0635"))), /*#__PURE__*/React.createElement("div", {
        className: "grid grid-cols-3 sm:grid-cols-5 gap-1.5"
      }, SUBSCRIPTION_DURATION_OPTIONS.filter(o => o.id !== 'custom').map(opt => {
        const isCurrent = inf.isActive && inf.planType === opt.id;
        return /*#__PURE__*/React.createElement("button", {
          key: opt.id,
          type: "button",
          onClick: () => quickSetSubscriptionDuration(ent._col, ent, ent._flag, opt.id),
          className: `py-2 px-1.5 rounded-xl text-[11px] font-black border transition-all ${isCurrent ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400'}`
        }, opt.icon, " ", opt.shortLabel);
      })), inf.rawFlag && /*#__PURE__*/React.createElement("div", {
        className: "flex justify-end pt-1"
      }, /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => quickSetSubscriptionDuration(ent._col, ent, ent._flag, 'free'),
        className: "text-[10px] font-black text-rose-600 hover:underline"
      }, "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0648\u062A\u062D\u0648\u064A\u0644\u0647 \u0644\u0644\u0645\u062C\u0627\u0646\u064A \u2715"))));
    })));
  })() : /*#__PURE__*/React.createElement("div", {
    className: "space-y-3 animate-enter w-full"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/70 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-black text-amber-900 dark:text-amber-200"
  }, "\uD83D\uDCC5 \u0644\u062A\u062D\u062F\u064A\u062F \u0623\u0648 \u062A\u062C\u062F\u064A\u062F \u0645\u062F\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 (\u0634\u0647\u0631\u064A / 3 \u0623\u0634\u0647\u0631 / 6 \u0623\u0634\u0647\u0631 / \u0633\u0646\u0648\u064A)\u060C \u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u0632\u0631 \u0627\u0644\u0628\u0627\u0642\u0629 \u0628\u062C\u0627\u0646\u0628 \u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0627\u0644\u0645\u0648\u062D\u062F\u0629."), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setView('subscriptions'),
    className: "px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl font-black text-xs shrink-0 shadow-xs"
  }, "\uD83D\uDC8E \u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0648\u062A\u062C\u062F\u064A\u062F \u0627\u0644\u0628\u0627\u0642\u0627\u062A")), /*#__PURE__*/React.createElement("div", {
    className: "bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden w-full"
  }, /*#__PURE__*/React.createElement("div", {
    className: "overflow-x-auto w-full hide-scroll"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-right text-sm min-w-[650px]"
  }, /*#__PURE__*/React.createElement("thead", {
    className: "bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700"
  }, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "p-4 whitespace-nowrap"
  }, view === 'workers' ? 'الاسم' : 'اسم المقاول (المعرف)'), /*#__PURE__*/React.createElement("th", {
    className: "p-4 whitespace-nowrap"
  }, "\u0627\u0644\u0628\u0627\u0642\u0629 / \u0627\u0644\u062A\u0648\u062B\u064A\u0642"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 whitespace-nowrap"
  }, "\u062D\u0627\u0644\u0629 \u0627\u0644\u062A\u0634\u0641\u064A\u0631 / \u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062F"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 whitespace-nowrap"
  }, "\u0627\u0644\u0647\u0627\u062A\u0641 / \u0627\u0644\u062A\u062D\u0642\u0642"), view === 'workers' && /*#__PURE__*/React.createElement("th", {
    className: "p-4 whitespace-nowrap"
  }, "\u0627\u0644\u0645\u0647\u0646\u0629 \u0648\u0627\u0644\u0645\u062D\u0627\u0641\u0638\u0629"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 text-center whitespace-nowrap"
  }, "\u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A"))), /*#__PURE__*/React.createElement("tbody", {
    className: "divide-y divide-slate-100 dark:divide-slate-700/50 font-semibold"
  }, (view === 'workers' ? data.workers : data.admins).filter(item => (item.title || item.name || item.id || '').toLowerCase().includes(searchQuery.toLowerCase()) || (item.phone || '').includes(searchQuery)).map(item => {
    const saltKey = view === 'workers' ? item.phone || item.id : item.id;
    const decryptedPass = AlOstaCrypto.revealPassword(item, saltKey);
    const isRevealed = !!revealedPasswords[item.id];
    return /*#__PURE__*/React.createElement("tr", {
      key: item.id,
      className: "hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors"
    }, /*#__PURE__*/React.createElement("td", {
      className: "p-4 flex items-center gap-3 whitespace-nowrap"
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-8 h-8 shrink-0 rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400 flex items-center justify-center font-bold"
    }, (item.name || item.id)?.[0] || '?'), /*#__PURE__*/React.createElement("span", {
      className: "truncate max-w-[200px]"
    }, item.name || item.id || 'بدون اسم')), /*#__PURE__*/React.createElement("td", {
      className: "p-4 whitespace-nowrap"
    }, (() => {
      const isAdm = view === 'admins';
      const flagField = isAdm ? 'isPro' : 'isVerifiedPro';
      const subInfo = getEntitySubscriptionInfo(item, flagField);
      return /*#__PURE__*/React.createElement("div", {
        className: "flex flex-col items-start gap-1"
      }, /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: () => openSubscriptionModal(isAdm ? 'admins' : 'workers', item, flagField),
        className: `px-3 py-1.5 rounded-xl text-xs font-black border transition-all flex items-center gap-1.5 ${subInfo.isActive ? isAdm ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 shadow-xs' : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-xs' : subInfo.isExpired ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-indigo-400'}`,
        title: "\u0627\u0636\u063A\u0637 \u0644\u062A\u062D\u062F\u064A\u062F \u0645\u062F\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 (\u0634\u0647\u0631\u064A / \u0633\u0646\u0648\u064A) \u0623\u0648 \u0627\u0644\u062A\u062C\u062F\u064A\u062F"
      }, /*#__PURE__*/React.createElement("span", null, subInfo.isActive ? isAdm ? `👑 مقاول Pro (${subInfo.planLabel})` : `⭐ أسطة موثّق (${subInfo.planLabel})` : subInfo.isExpired ? '⚠️ اشتراك منتهي (تجديد)' : isAdm ? 'مجاني (تفعيل باقة 📅)' : 'عادي (توثيق 📅)')), subInfo.rawFlag && /*#__PURE__*/React.createElement("span", {
        className: `text-[10px] font-bold px-1.5 ${subInfo.isExpired ? 'text-rose-600' : subInfo.daysLeft !== null && subInfo.daysLeft <= 7 ? 'text-amber-600' : 'text-slate-400'}`
      }, subInfo.daysLeft === null ? '♾️ اشتراك مفتوح بدون تاريخ انتهاء' : subInfo.isExpired ? `انتهى منذ ${Math.abs(subInfo.daysLeft)} يوم` : `⏳ متبقي ${subInfo.daysLeft} يوم (${String(subInfo.expiresAt).slice(0, 10)})`));
    })()), /*#__PURE__*/React.createElement("td", {
      className: "p-4 whitespace-nowrap"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2"
    }, isRevealed ? /*#__PURE__*/React.createElement("span", {
      className: "font-mono text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 rounded-lg dir-ltr"
    }, decryptedPass || 'مشفر (One-Way SHA-256)') : /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 rounded-lg"
    }, "\uD83D\uDD12 \u0645\u0634\u0641\u0631 (SHA-256)"), decryptedPass && /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setRevealedPasswords(prev => ({
        ...prev,
        [item.id]: !prev[item.id]
      })),
      className: "text-[11px] font-bold text-slate-500 hover:text-indigo-600 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700"
    }, isRevealed ? 'إخفاء' : 'إظهار 👁️'))), /*#__PURE__*/React.createElement("td", {
      className: "p-4 whitespace-nowrap"
    }, item.phone ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "text-sm font-mono font-bold dir-ltr text-right text-slate-800 dark:text-slate-200"
    }, item.phone), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-1.5 mt-1 flex-wrap"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60"
    }, "\u2713 \u0631\u0642\u0645 \u0647\u0627\u062A\u0641 \u0645\u0648\u062B\u0651\u0642"), item.loginCode && /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono"
    }, item.loginCode))) : /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col items-start gap-1"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-black px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60"
    }, "\u26A0\uFE0F \u0628\u062F\u0648\u0646 \u0631\u0642\u0645 \u0647\u0627\u062A\u0641"), item.loginCode && /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono"
    }, item.loginCode))), view === 'workers' && /*#__PURE__*/React.createElement("td", {
      className: "p-4 text-xs text-slate-500 whitespace-nowrap"
    }, item.specialty || '-', " \u2022 ", item.gov || '-'), /*#__PURE__*/React.createElement("td", {
      className: "p-4 whitespace-nowrap"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-center gap-2"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => openModal(view, item),
      className: "p-2 bg-amber-50 text-amber-600 dark:bg-amber-900/20 rounded-lg hover:bg-amber-100 transition-colors"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "edit-2",
      size: 16
    })), /*#__PURE__*/React.createElement("button", {
      onClick: () => triggerDelete(view, item.id),
      className: "p-2 bg-rose-50 text-rose-600 dark:bg-rose-900/20 rounded-lg hover:bg-rose-100 transition-colors"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "trash-2",
      size: 16
    })))));
  }), data[view]?.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "6",
    className: "p-8 text-center text-slate-500"
  }, "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A"))))))))), /*#__PURE__*/React.createElement(Modal, {
    isOpen: editModal.isOpen,
    onClose: () => setEditModal({
      isOpen: false,
      type: null,
      item: null,
      storeObj: null
    }),
    maxWidthClass: editModal.type === 'stores' || editModal.type === 'products' ? 'max-w-2xl' : 'max-w-lg',
    title: editModal.type === 'stores' ? editModal.item ? `تعديل المعرض: ${editModal.item.name}` : 'إضافة معرض / وكالة جديد' : editModal.type === 'products' ? editModal.item ? `تعديل منتج في (${editModal.storeObj?.name || activeStore?.name || 'المحل'})` : `إضافة منتج لـ (${editModal.storeObj?.name || activeStore?.name || 'المحل'})` : editModal.type === 'announcements' ? editModal.item ? 'تعديل إعلان' : 'إعلان جديد' : `تعديل بيانات ${editModal.type === 'workers' ? 'العامل' : 'المقاول'}`
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSaveEdit,
    noValidate: editModal.type === 'stores',
    className: "space-y-3.5"
  }, editModal.type === 'stores' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "sticky top-0 z-10 bg-white dark:bg-slate-800 pb-2.5 border-b border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-1.5"
  }, [{
    id: 'basic',
    label: '1. الأساسي والوكالة'
  }, {
    id: 'sections',
    label: `2. الأقسام (${storeSectionsDraft.length})`
  }, {
    id: 'location_payment',
    label: '3. الموقع والدفع'
  }, {
    id: 'portal',
    label: '4. البوابة والإعدادات'
  }].map(tab => /*#__PURE__*/React.createElement("button", {
    key: tab.id,
    type: "button",
    onClick: () => {
      setStoreModalTab(tab.id);
      setModalError('');
    },
    className: `py-2 px-2.5 rounded-xl font-black text-[11px] transition-all text-center border ${storeModalTab === tab.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'}`
  }, tab.label))), storeModalTab === 'basic' && /*#__PURE__*/React.createElement("div", {
    className: "space-y-3.5 animate-enter"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-black text-slate-800 dark:text-white mb-1 block"
  }, "\u0627\u0633\u0645 \u0627\u0644\u0645\u0639\u0631\u0636 / \u0627\u0644\u0648\u0643\u0627\u0644\u0629 / \u0645\u0643\u0627\u0646 \u0627\u0644\u0628\u064A\u0639 *"), /*#__PURE__*/React.createElement("input", {
    name: "name",
    value: storeFormDraft.name,
    onChange: e => {
      setStoreFormDraft(prev => ({
        ...prev,
        name: e.target.value
      }));
      setModalError('');
    },
    placeholder: storeTypeDraft === 'paint_agency' ? 'مثال: وكالة أصباغ جوتن المعتمدة - المنصور' : 'مثال: معرض النور للجبس بورد والأصباغ',
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl outline-none font-bold text-sm"
  })), /*#__PURE__*/React.createElement("div", {
    className: "bg-indigo-50/60 dark:bg-slate-900 p-3 rounded-2xl border border-indigo-200 dark:border-slate-700 space-y-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-black text-indigo-900 dark:text-indigo-200 block"
  }, "\uD83C\uDFF7\uFE0F \u0646\u0648\u0639 \u0627\u0644\u0645\u0639\u0631\u0636 / \u0627\u0644\u062A\u062E\u0635\u0635 *"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 sm:grid-cols-3 gap-2"
  }, STORE_TYPES.map(t => {
    const isSel = storeTypeDraft === t.id;
    return /*#__PURE__*/React.createElement("button", {
      key: t.id,
      type: "button",
      onClick: () => {
        setStoreTypeDraft(t.id);
        if (t.id === 'paint_agency') {
          if (!storeAgencyBrandDraft) setStoreAgencyBrandDraft('jotun');
        } else {
          setStoreAgencyBrandDraft('');
        }
        if (!editModal.item) {
          setStoreSectionsDraft(getDefaultSectionsForStoreType(t.id));
        }
      },
      className: `p-2 rounded-xl border text-right transition-all ${isSel ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-500/25' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400'}`
    }, /*#__PURE__*/React.createElement("span", {
      className: "block font-black text-xs"
    }, t.shortLabel || t.label), t.id === 'paint_agency' && /*#__PURE__*/React.createElement("span", {
      className: `block text-[10px] font-bold mt-0.5 ${isSel ? 'text-amber-300' : 'text-fuchsia-600 dark:text-fuchsia-400'}`
    }, "\u0643\u062A\u0627\u0644\u0648\u062C \u0623\u0644\u0648\u0627\u0646 \u062D\u0635\u0631\u064A"));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "bg-fuchsia-50/80 dark:bg-fuchsia-950/20 p-3 rounded-2xl border border-fuchsia-200 dark:border-fuchsia-800/60 space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-black text-fuchsia-900 dark:text-fuchsia-200"
  }, "\uD83C\uDFAF \u0634\u0631\u0643\u0629 \u0648\u0643\u0627\u0644\u0629 \u0627\u0644\u0623\u0635\u0628\u0627\u063A ", storeTypeDraft === 'paint_agency' ? '(مفعّلة لهذا المعرض)' : '(اختياري — اضغط لتفعيل وكالة)'), storeTypeDraft === 'paint_agency' && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setStoreTypeDraft('paint');
      setStoreAgencyBrandDraft('');
    },
    className: "text-[10px] font-black text-rose-600 hover:underline"
  }, "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0648\u0643\u0627\u0644\u0629 \u0627\u0644\u062D\u0635\u0631\u064A\u0629 \u2715")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 sm:grid-cols-3 gap-2"
  }, PAINT_AGENCY_BRANDS.map(b => {
    const active = storeTypeDraft === 'paint_agency' && storeAgencyBrandDraft === b.id;
    return /*#__PURE__*/React.createElement("button", {
      key: b.id,
      type: "button",
      onClick: () => {
        setStoreTypeDraft('paint_agency');
        setStoreAgencyBrandDraft(b.id);
      },
      className: `p-2 rounded-xl border text-right transition-all ${active ? 'bg-fuchsia-700 text-white border-fuchsia-700 shadow-sm ring-2 ring-fuchsia-500/30' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-fuchsia-200/80 dark:border-slate-700 hover:border-fuchsia-400'}`
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between gap-1"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-black text-xs"
    }, b.icon, " ", b.label), active && /*#__PURE__*/React.createElement("span", {
      className: "text-xs"
    }, "\u2713")), /*#__PURE__*/React.createElement("span", {
      className: `block text-[10px] font-bold mt-0.5 truncate ${active ? 'text-fuchsia-100' : 'text-slate-400'}`
    }, b.desc));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0645\u062D\u0627\u0641\u0638\u0629 *"), /*#__PURE__*/React.createElement("select", {
    name: "gov",
    value: storeFormDraft.gov,
    onChange: e => setStoreFormDraft(prev => ({
      ...prev,
      gov: e.target.value
    })),
    className: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
  }, GOVERNORATES.map(g => /*#__PURE__*/React.createElement("option", {
    key: g,
    value: g
  }, g)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 / \u0648\u0627\u062A\u0633\u0627\u0628 \u0627\u0644\u0637\u0644\u0628\u0627\u062A *"), /*#__PURE__*/React.createElement("input", {
    name: "phone",
    value: storeFormDraft.phone,
    onChange: e => {
      setStoreFormDraft(prev => ({
        ...prev,
        phone: e.target.value
      }));
      setModalError('');
    },
    placeholder: "07xxxxxxxxx",
    className: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none dir-ltr text-left font-bold text-sm"
  })), /*#__PURE__*/React.createElement("div", {
    className: "sm:col-span-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062A\u0641\u0635\u064A\u0644\u064A \u0648\u0623\u0642\u0631\u0628 \u0646\u0642\u0637\u0629 \u062F\u0627\u0644\u0629"), /*#__PURE__*/React.createElement("input", {
    name: "address",
    value: storeFormDraft.address,
    onChange: e => {
      setStoreFormDraft(prev => ({
        ...prev,
        address: e.target.value
      }));
      setModalError('');
    },
    placeholder: "\u0627\u0644\u0645\u0646\u0637\u0642\u0629 - \u0627\u0644\u0634\u0627\u0631\u0639 - \u0642\u0631\u0628...",
    className: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 gap-3 items-center"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0623\u0648\u0642\u0627\u062A \u0627\u0644\u062F\u0648\u0627\u0645"), /*#__PURE__*/React.createElement("input", {
    name: "workHours",
    value: storeFormDraft.workHours,
    onChange: e => setStoreFormDraft(prev => ({
      ...prev,
      workHours: e.target.value
    })),
    placeholder: "8:00 \u0635 - 8:00 \u0645",
    className: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col gap-2 pt-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-2 text-xs font-bold cursor-pointer"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: storeFormDraft.hasDelivery,
    onChange: e => setStoreFormDraft(prev => ({
      ...prev,
      hasDelivery: e.target.checked
    })),
    className: "w-4 h-4 accent-indigo-600"
  }), "\u064A\u0648\u0641\u0631 \u062A\u0648\u0635\u064A\u0644 \u0644\u0645\u0648\u0642\u0639 \u0627\u0644\u0639\u0645\u0644 \uD83D\uDE9A"), /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-2 text-xs font-bold cursor-pointer"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: storeFormDraft.isActive,
    onChange: e => setStoreFormDraft(prev => ({
      ...prev,
      isActive: e.target.checked
    })),
    className: "w-4 h-4 accent-emerald-600"
  }), "\u062A\u0641\u0639\u064A\u0644 \u0648\u0639\u0631\u0636 \u0627\u0644\u0645\u062A\u062C\u0631 \u0628\u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u2713"))), /*#__PURE__*/React.createElement("div", {
    className: "p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/70 space-y-2.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-2 text-xs font-black text-amber-900 dark:text-amber-300 cursor-pointer"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: storeFormDraft.isVipStore !== false,
    onChange: e => setStoreFormDraft(prev => ({
      ...prev,
      isVipStore: e.target.checked
    })),
    className: "w-4 h-4 accent-amber-600 rounded"
  }), /*#__PURE__*/React.createElement("span", null, "\uD83D\uDC8E \u062A\u0641\u0639\u064A\u0644 \u0628\u0627\u0642\u0629 \u0627\u0644\u0645\u0639\u0631\u0636 \u0627\u0644\u0645\u0639\u062A\u0645\u062F (VIP \u2014 \u0645\u0646\u062A\u062C\u0627\u062A \u0648\u0623\u0642\u0633\u0627\u0645 \u063A\u064A\u0631 \u0645\u062D\u062F\u0648\u062F\u0629)"))), storeFormDraft.isVipStore !== false && /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1"
  }, SUBSCRIPTION_DURATION_OPTIONS.filter(o => o.id !== 'custom').map(opt => {
    const active = (storeFormDraft.subscriptionPlanType || 'yearly') === opt.id;
    return /*#__PURE__*/React.createElement("button", {
      key: opt.id,
      type: "button",
      onClick: () => setStoreFormDraft(prev => ({
        ...prev,
        subscriptionPlanType: opt.id
      })),
      className: `py-2 px-2 rounded-xl text-[11px] font-black border transition-all ${active ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-amber-200 dark:border-slate-700'}`
    }, opt.icon, " ", opt.shortLabel);
  })))), storeModalTab === 'sections' && /*#__PURE__*/React.createElement("div", {
    className: "space-y-3 animate-enter"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-black text-slate-700 dark:text-slate-200"
  }, "\uD83D\uDCC2 \u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0627\u0644\u0645\u0641\u0639\u0651\u0644\u0629 \u062F\u0627\u062E\u0644 \u0647\u0630\u0627 \u0627\u0644\u0645\u0639\u0631\u0636 (", storeSectionsDraft.length, ")"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setStoreSectionsDraft(getDefaultSectionsForStoreType(storeTypeDraft)),
    className: "text-[11px] font-black px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-slate-700"
  }, "\u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \uD83D\uDD04")), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-700"
  }, storeSectionsDraft.length === 0 ? /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-bold text-rose-500 text-center py-2"
  }, "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0642\u0633\u0627\u0645 \u0645\u062D\u062F\u062F\u0629 \u2014 \u0627\u062E\u062A\u0631 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0648 \u0623\u0636\u0641 \u0642\u0633\u0645\u0627\u064B \u062C\u062F\u064A\u062F\u0627\u064B.") : /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, storeSectionsDraft.map(sec => /*#__PURE__*/React.createElement("span", {
    key: sec.id,
    className: "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-600 text-white text-xs font-black"
  }, /*#__PURE__*/React.createElement("span", null, sec.icon || '📂'), /*#__PURE__*/React.createElement("span", null, sec.label), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setStoreSectionsDraft(prev => prev.filter(s => s.id !== sec.id)),
    className: "w-4 h-4 rounded-full bg-white/20 hover:bg-rose-500 text-white text-[10px] flex items-center justify-center"
  }, "\u2715"))))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[11px] font-black text-slate-600 dark:text-slate-300 block"
  }, "\u26A1 \u0625\u0636\u0627\u0641\u0629 / \u0625\u0632\u0627\u0644\u0629 \u0633\u0631\u064A\u0639\u0629 \u0645\u0646 \u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0627\u0644\u062C\u0627\u0647\u0632\u0629:"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, PRODUCT_CATEGORIES.map(preset => {
    const shortLbl = preset.shortLabel || preset.label.replace(/^[^\s]+\s/, '');
    const exists = storeSectionsDraft.some(s => s.id === preset.id);
    return /*#__PURE__*/React.createElement("button", {
      key: preset.id,
      type: "button",
      onClick: () => {
        setStoreSectionsDraft(prev => prev.some(s => s.id === preset.id) ? prev.filter(s => s.id !== preset.id) : [...prev, {
          id: preset.id,
          label: shortLbl,
          icon: preset.icon
        }]);
      },
      className: `px-2.5 py-1.5 rounded-xl text-[11px] font-black border transition-all ${exists ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'}`
    }, exists ? '✓ ' : '+ ', preset.icon, " ", shortLbl);
  }))), /*#__PURE__*/React.createElement("div", {
    className: "bg-indigo-50/70 dark:bg-slate-900 p-3 rounded-2xl border border-indigo-200 dark:border-slate-700 space-y-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[11px] font-black text-indigo-800 dark:text-indigo-300 block"
  }, "\u2795 \u0625\u0636\u0627\u0641\u0629 \u0642\u0633\u0645 \u0645\u062E\u0635\u0635 \u062C\u062F\u064A\u062F \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0639\u0631\u0636:"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col sm:flex-row gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-indigo-200 dark:border-slate-700 shrink-0"
  }, ['🎨', '🏠', '🏢', '🪣', '⬜', '🔩', '✨', '🛠️', '📂'].map(ic => /*#__PURE__*/React.createElement("button", {
    key: ic,
    type: "button",
    onClick: () => setNewSectionIconDraft(ic),
    className: `w-7 h-7 rounded-lg text-sm flex items-center justify-center ${newSectionIconDraft === ic ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`
  }, ic))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-1 gap-1.5"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: newSectionLabelDraft,
    onChange: e => setNewSectionLabelDraft(e.target.value),
    placeholder: "\u0645\u062B\u0627\u0644: \u0623\u0635\u0628\u0627\u063A \u0625\u064A\u0628\u0648\u0643\u0633\u064A / \u0628\u062F\u064A\u0644 \u0627\u0644\u062E\u0634\u0628...",
    className: "flex-1 p-2.5 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 rounded-xl font-bold text-xs outline-none"
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      const trimmed = newSectionLabelDraft.trim();
      if (!trimmed) return;
      const customId = 'sec_' + Date.now().toString(36);
      setStoreSectionsDraft(prev => [...prev, {
        id: customId,
        label: trimmed,
        icon: newSectionIconDraft || '📂'
      }]);
      setNewSectionLabelDraft('');
      showToast(`تمت إضافة قسم "${trimmed}" ✓`);
    },
    className: "px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs shrink-0"
  }, "+ \u0625\u0636\u0627\u0641\u0629"))))), storeModalTab === 'location_payment' && /*#__PURE__*/React.createElement("div", {
    className: "space-y-3.5 animate-enter"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-indigo-50/70 dark:bg-slate-900 p-3.5 rounded-2xl border border-indigo-200 dark:border-slate-700 space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-black text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin",
    size: 14
  }), " \u0645\u0648\u0642\u0639 \u0627\u0644\u0645\u0639\u0631\u0636 \u0627\u0644\u062C\u063A\u0631\u0627\u0641\u064A (GPS / Google Maps)"), locInput && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setLocInput('');
      setLocParsed(null);
    },
    className: "text-[11px] font-black text-rose-500 hover:underline"
  }, "\u0645\u0633\u062D \u2715")), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col sm:flex-row gap-2"
  }, /*#__PURE__*/React.createElement("input", {
    name: "locationRaw",
    value: locInput,
    onChange: e => handleStoreLocChange(e.target.value, storeFormDraft.gov || 'بغداد'),
    onPaste: e => {
      const pasted = e.clipboardData?.getData('text');
      if (pasted) {
        e.preventDefault();
        handleStoreLocChange(pasted, storeFormDraft.gov || 'بغداد');
        showToast("تم لصق الموقع بنجاح ✓");
      }
    },
    placeholder: "\u0627\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0627\u0644\u062E\u0631\u064A\u0637\u0629 \u0623\u0648 \u0627\u0644\u0625\u062D\u062F\u0627\u062B\u064A\u0627\u062A",
    className: `flex-1 p-2.5 bg-white dark:bg-slate-800 border rounded-xl dir-ltr text-left text-xs font-mono outline-none ${locParsed ? 'border-emerald-500' : 'border-slate-300 dark:border-slate-700'}`
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-1.5 shrink-0"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => pasteStoreLocation(storeFormDraft.gov || 'بغداد'),
    className: "px-3 py-2 bg-emerald-600 text-white rounded-xl font-black text-xs flex items-center gap-1"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clipboard",
    size: 13
  }), " \u0644\u0635\u0642"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: captureAdminGps,
    disabled: gpsBusy,
    className: "px-3 py-2 bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center gap-1"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "crosshair",
    size: 13
  }), " ", gpsBusy ? '...' : 'موقعي'))), locParsed && /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] font-bold text-emerald-600 dark:text-emerald-400"
  }, "\u2713 \u0627\u0644\u0625\u062D\u062F\u0627\u062B\u064A\u0627\u062A \u062C\u0627\u0647\u0632\u0629: (", locParsed.lat.toFixed(4), ", ", locParsed.lng.toFixed(4), ")")), /*#__PURE__*/React.createElement("div", {
    className: "bg-amber-50/70 dark:bg-slate-900 p-3.5 rounded-2xl border border-amber-300 dark:border-amber-700/70 space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-black text-amber-900 dark:text-amber-300 flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCB3"), /*#__PURE__*/React.createElement("span", null, "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u0641\u0639 \u0648\u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062F \u0644\u0644\u0645\u0639\u0631\u0636")), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-black bg-emerald-600 text-white px-2.5 py-0.5 rounded-full"
  }, "\uD83D\uDD12 \u062D\u0635\u0631\u064A\u0627\u064B \u0645\u0646 \u0627\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F (\u0645\u062D\u0645\u064A \u0645\u0646 \u0627\u0644\u062A\u0639\u062F\u064A\u0644 \u0639\u0628\u0631 \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0639\u0631\u0636)")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-3 gap-2"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1"
  }, "\u0627\u0644\u0645\u062D\u0641\u0638\u0629 / \u0627\u0644\u0637\u0631\u064A\u0642\u0629:"), /*#__PURE__*/React.createElement("select", {
    name: "paymentMethod",
    value: storePaymentDraft.paymentMethod,
    onChange: e => setStorePaymentDraft(prev => ({
      ...prev,
      paymentMethod: e.target.value
    })),
    className: "w-full p-2.5 bg-white dark:bg-slate-800 border border-amber-300 dark:border-slate-700 rounded-xl font-bold text-xs outline-none"
  }, PAYMENT_METHODS.map(m => /*#__PURE__*/React.createElement("option", {
    key: m.id,
    value: m.id
  }, m.icon, " ", m.label)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1"
  }, "\u0631\u0642\u0645 \u0627\u0644\u062D\u0633\u0627\u0628 / \u0627\u0644\u0645\u062D\u0641\u0638\u0629:"), /*#__PURE__*/React.createElement("input", {
    name: "paymentAccountNumber",
    value: storePaymentDraft.paymentAccountNumber,
    onChange: e => setStorePaymentDraft(prev => ({
      ...prev,
      paymentAccountNumber: e.target.value
    })),
    placeholder: "0770xxxxxxx",
    className: "w-full p-2.5 bg-white dark:bg-slate-800 border border-amber-300 dark:border-slate-700 rounded-xl font-mono font-black text-xs dir-ltr text-center outline-none"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1"
  }, "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u0644\u0645:"), /*#__PURE__*/React.createElement("input", {
    name: "paymentAccountHolder",
    value: storePaymentDraft.paymentAccountHolder,
    onChange: e => setStorePaymentDraft(prev => ({
      ...prev,
      paymentAccountHolder: e.target.value
    })),
    placeholder: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0639\u0631\u0636",
    className: "w-full p-2.5 bg-white dark:bg-slate-800 border border-amber-300 dark:border-slate-700 rounded-xl font-bold text-xs outline-none"
  }))), /*#__PURE__*/React.createElement("input", {
    ref: storeQrFileInputRef,
    type: "file",
    accept: "image/*",
    onChange: handleStoreQrImageUpload,
    className: "hidden"
  }), (() => {
    const draftStoreForQr = {
      name: storePaymentDraft.paymentAccountHolder || storeFormDraft.name || 'معرض معتمد',
      gov: storeFormDraft.gov || 'بغداد',
      phone: storeFormDraft.phone || storePaymentDraft.paymentAccountNumber || '',
      paymentMethod: storePaymentDraft.paymentMethod,
      paymentAccountNumber: storePaymentDraft.paymentAccountNumber || storeFormDraft.phone || '07700000000',
      paymentAccountHolder: storePaymentDraft.paymentAccountHolder || storeFormDraft.name || 'معرض معتمد',
      paymentQrImage: storeQrImgPreview
    };
    const previewQrSrc = getStoreQrImageSrc(draftStoreForQr, 220);
    return /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-slate-800 p-2.5 rounded-2xl border border-amber-200 dark:border-slate-700"
    }, previewQrSrc && /*#__PURE__*/React.createElement("img", {
      src: previewQrSrc,
      alt: "QR Preview",
      className: "w-20 h-20 rounded-xl bg-white p-1 border border-emerald-500 object-contain shrink-0"
    }), /*#__PURE__*/React.createElement("div", {
      className: "flex-1 space-y-2 w-full"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black text-slate-700 dark:text-slate-200"
    }, storeQrImgPreview ? '✅ صورة باركود مرفقة' : '⚡ باركود تلقائي من رقم الحساب'), storeQrImgPreview && /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setStoreQrImgPreview(''),
      className: "text-[10px] font-black text-rose-500 hover:underline"
    }, "\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u062A\u0644\u0642\u0627\u0626\u064A \u2715")), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-2"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => storeQrFileInputRef.current?.click(),
      disabled: imgBusy,
      className: "flex-1 py-2 px-3 bg-indigo-600 text-white rounded-xl font-black text-[11px] flex items-center justify-center gap-1"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "upload",
      size: 13
    }), " \u0631\u0641\u0639 \u0635\u0648\u0631\u0629 \u0628\u0627\u0631\u0643\u0648\u062F"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => saveStorePaymentBarcodeToDevice(draftStoreForQr, showToast),
      className: "flex-1 py-2 px-3 bg-emerald-600 text-white rounded-xl font-black text-[11px] flex items-center justify-center gap-1"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 13
    }), " \u062D\u0641\u0638 \u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062F"))));
  })())), storeModalTab === 'portal' && /*#__PURE__*/React.createElement("div", {
    className: "space-y-3.5 animate-enter"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 rounded-2xl border border-emerald-300 dark:border-emerald-800/70 space-y-2.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-black text-emerald-800 dark:text-emerald-300"
  }, "\uD83D\uDD17 \u0628\u0648\u0627\u0628\u0629 \u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u0639\u0631\u0636 \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setStorePortalCodeDraft(generateRandomPortalCode()),
    className: "text-[10px] font-black bg-emerald-600 text-white px-2.5 py-1 rounded-lg"
  }, "\u062A\u0648\u0644\u064A\u062F \u0643\u0648\u062F \u062C\u062F\u064A\u062F \uD83D\uDD04")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 gap-2"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-bold text-slate-500 block mb-1"
  }, "\u0643\u0648\u062F \u0627\u0644\u062F\u062E\u0648\u0644 \u0627\u0644\u062E\u0627\u0635 \u0628\u0627\u0644\u0645\u0639\u0631\u0636:"), /*#__PURE__*/React.createElement("input", {
    name: "portalCode",
    value: storePortalCodeDraft,
    onChange: e => setStorePortalCodeDraft(e.target.value.toUpperCase()),
    className: "w-full p-2.5 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-xl font-mono font-black text-sm text-center dir-ltr outline-none"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-bold text-slate-500 block mb-1"
  }, "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0645\u0639\u0631\u0636 (ID):"), /*#__PURE__*/React.createElement("div", {
    className: "w-full p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold text-xs text-center dir-ltr truncate"
  }, editModal.item?.id || storeDraftId))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 p-2 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700 rounded-xl font-mono text-[10px] dir-ltr text-left truncate select-all"
  }, getStorePortalLink({
    id: editModal.item?.id || storeDraftId,
    portalCode: storePortalCodeDraft
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => copyTextToClipboard(getStorePortalLink({
      id: editModal.item?.id || storeDraftId,
      portalCode: storePortalCodeDraft
    }), () => showToast('تم نسخ رابط بوابة المعرض ✓')),
    className: "px-3 py-2 bg-indigo-600 text-white rounded-xl font-black text-[10px] shrink-0"
  }, "\u0646\u0633\u062E \u0627\u0644\u0631\u0627\u0628\u0637"))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2.5"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0634\u0627\u0631\u0629 \u0627\u0644\u0645\u062A\u062C\u0631 \u0628\u0627\u0644\u062A\u0637\u0628\u064A\u0642 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)"), /*#__PURE__*/React.createElement("input", {
    name: "badge",
    value: storeFormDraft.badge,
    onChange: e => setStoreFormDraft(prev => ({
      ...prev,
      badge: e.target.value
    })),
    placeholder: "\u0648\u0643\u064A\u0644 \u0645\u0639\u062A\u0645\u062F / \u062A\u0648\u0635\u064A\u0644 \u0644\u0644\u0645\u0648\u0642\u0639",
    className: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0623\u0648 \u0648\u0635\u0641 \u0627\u0644\u0645\u0639\u0631\u0636 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)"), /*#__PURE__*/React.createElement("textarea", {
    name: "notes",
    value: storeFormDraft.notes,
    onChange: e => setStoreFormDraft(prev => ({
      ...prev,
      notes: e.target.value
    })),
    rows: "2",
    placeholder: "\u062A\u0648\u0635\u064A\u0644 \u0641\u0648\u0631\u064A \u0644\u0645\u0648\u0627\u0642\u0639 \u0627\u0644\u0639\u0645\u0644 \u0645\u0639 \u062E\u0644\u0637 \u0627\u0644\u0623\u0644\u0648\u0627\u0646 \u0628\u0627\u0644\u0643\u0645\u0628\u064A\u0648\u062A\u0631...",
    className: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs resize-none"
  }))))) : editModal.type === 'products' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "bg-indigo-50 dark:bg-indigo-950/40 p-3.5 rounded-2xl border border-indigo-200 dark:border-indigo-800 space-y-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-black text-indigo-800 dark:text-indigo-300 flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83C\uDFEA \u0627\u0644\u0645\u062D\u0644 / \u0627\u0644\u0645\u0639\u0631\u0636 \u0627\u0644\u062E\u0627\u0635 \u0628\u0647\u0630\u0627 \u0627\u0644\u0645\u0646\u062A\u062C *"), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-md"
  }, "\u0645\u0646\u062A\u062C\u0627\u062A \u0645\u0633\u062A\u0642\u0644\u0629 \u0644\u0643\u0644 \u0645\u062D\u0644")), /*#__PURE__*/React.createElement("select", {
    name: "storeId",
    value: selectedModalStoreId,
    onChange: e => setSelectedModalStoreId(e.target.value),
    className: "w-full p-3 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-slate-700 rounded-xl outline-none font-black text-xs",
    required: true
  }, data.stores.map(s => /*#__PURE__*/React.createElement("option", {
    key: s.id,
    value: s.id
  }, "\uD83C\uDFEA ", s.name, " (", s.gov || 'بغداد', ")")))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062A\u062C / \u0627\u0644\u0635\u0628\u063A / \u0644\u0648\u062D \u0623\u0648 \u062F\u064A\u0643\u0648\u0631 \u0627\u0644\u062C\u0628\u0633 \u0628\u0648\u0631\u062F *"), /*#__PURE__*/React.createElement("input", {
    name: "name",
    defaultValue: editModal.item?.name,
    placeholder: "\u0645\u062B\u0627\u0644: \u0635\u0628\u063A \u062C\u0648\u062A\u0646 \u0641\u064A\u0646\u0648\u0645\u0627\u0633\u062A\u064A\u0643 18 \u0644\u062A\u0631 / \u0644\u0648\u062D \u062C\u0628\u0633 \u0628\u0648\u0631\u062F \u0623\u062E\u0636\u0631 \u0643\u0646\u0627\u0648\u0641",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-sm",
    required: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800/70 space-y-2.5"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-black text-emerald-800 dark:text-emerald-300 block"
  }, "\uD83D\uDCB0 \u062A\u0633\u0639\u064A\u0631 \u0627\u0644\u0645\u0646\u062A\u062C \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0645\u062D\u0644 (\u062F.\u0639) \u0648\u0627\u0644\u0648\u062D\u062F\u0629:"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-3 gap-2.5"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[11px] font-bold mb-1 block"
  }, "\u0627\u0644\u0633\u0639\u0631 (\u062F.\u0639) *"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    name: "price",
    defaultValue: editModal.item?.price || '',
    placeholder: "85000 \u0623\u0648 85",
    className: "w-full p-3 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-slate-700 rounded-xl outline-none font-black text-xs dir-ltr text-center",
    required: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[11px] font-bold mb-1 block"
  }, "\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0633\u0627\u0628\u0642 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    name: "oldPrice",
    defaultValue: editModal.item?.oldPrice || '',
    placeholder: "95000",
    className: "w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs dir-ltr text-center"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[11px] font-bold mb-1 block"
  }, "\u0627\u0644\u0648\u062D\u062F\u0629 *"), /*#__PURE__*/React.createElement("input", {
    name: "unit",
    defaultValue: editModal.item?.unit || 'قطعة',
    placeholder: "\u062F\u0628\u0629 18 \u0644\u062A\u0631 / \u0644\u0648\u062D",
    className: "w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs text-center",
    required: true
  }))), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-emerald-700 dark:text-emerald-400 font-bold"
  }, "\uD83D\uDCA1 \u064A\u062F\u0639\u0645 \u0627\u0644\u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0630\u0643\u064A: \u064A\u0645\u0643\u0646\u0643 \u0643\u062A\u0627\u0628\u0629 85 \u0644\u064A\u062D\u0641\u0638 85,000 \u062F.\u0639 \u0623\u0648 \u0643\u062A\u0627\u0628\u0629 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0643\u0627\u0645\u0644 85000.")), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDDBC\uFE0F \u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u0646\u062A\u062C (\u062A\u0638\u0647\u0631 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646 \u0641\u064A \u0627\u0644\u0645\u062A\u062C\u0631)")), prodImgPreview && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setProdImgPreview(''),
    className: "text-[11px] text-rose-500 font-black hover:underline"
  }, "\u0645\u0633\u062D \u0627\u0644\u0635\u0648\u0631\u0629 \u2715")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-24 h-24 rounded-2xl bg-white dark:bg-slate-800 border-2 border-dashed border-indigo-300 dark:border-slate-600 flex items-center justify-center overflow-hidden shrink-0"
  }, prodImgPreview ? /*#__PURE__*/React.createElement("img", {
    src: prodImgPreview,
    alt: "\u0645\u0639\u0627\u064A\u0646\u0629",
    className: "w-full h-full object-cover"
  }) : /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] text-slate-400 font-bold text-center px-2"
  }, "\u0644\u0627 \u062A\u0648\u062C\u062F \u0635\u0648\u0631\u0629 \u0628\u0639\u062F")), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 space-y-2"
  }, /*#__PURE__*/React.createElement("input", {
    ref: fileInputRef,
    type: "file",
    accept: "image/*",
    onChange: handleProductImageUpload,
    className: "hidden"
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => fileInputRef.current?.click(),
    disabled: imgBusy,
    className: "w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "camera",
    size: 16
  }), /*#__PURE__*/React.createElement("span", null, imgBusy ? 'جاري ضغط الصورة...' : '📷 رفع / التقاط صورة للمنتج من الهاتف')), /*#__PURE__*/React.createElement("input", {
    name: "imageUrl",
    type: "text",
    value: prodImgPreview,
    onChange: e => setProdImgPreview(e.target.value),
    placeholder: "\u0623\u0648 \u0627\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0635\u0648\u0631\u0629 \u0645\u0628\u0627\u0634\u0631 (https://...)",
    className: "w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none dir-ltr text-left text-[11px]"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-black text-slate-500 mb-1.5"
  }, "\u0623\u0648 \u0627\u062E\u062A\u0631 \u0635\u0648\u0631\u0629 \u062C\u0627\u0647\u0632\u0629 \u0644\u0644\u0645\u0646\u062A\u062C \u0628\u0636\u063A\u0637\u0629 \u0648\u0627\u062D\u062F\u0629:"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-1.5 overflow-x-auto hide-scroll pb-1"
  }, PRESET_PRODUCT_IMAGES.map((preset, idx) => /*#__PURE__*/React.createElement("button", {
    key: idx,
    type: "button",
    onClick: () => setProdImgPreview(preset.url),
    className: `shrink-0 px-2.5 py-1.5 rounded-xl text-[10px] font-black border flex items-center gap-1 transition-all ${prodImgPreview === preset.url ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`
  }, /*#__PURE__*/React.createElement("span", null, preset.label)))))), (() => {
    const currentModalStore = data.stores.find(s => s.id === selectedModalStoreId) || editModal.storeObj || activeStore || data.stores[0] || null;
    const storeSecOptions = getStoreSectionsList(currentModalStore);
    return /*#__PURE__*/React.createElement("div", {
      className: "space-y-2.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-1 sm:grid-cols-3 gap-2.5"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-xs font-bold mb-1 block"
    }, "\uD83D\uDCC2 \u0627\u0644\u0642\u0633\u0645 \u062F\u0627\u062E\u0644 (", currentModalStore?.name || 'المعرض', ") *"), /*#__PURE__*/React.createElement("select", {
      name: "category",
      defaultValue: editModal.item?.category || storeSecOptions[0]?.id || 'paint',
      className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
    }, storeSecOptions.map(sec => /*#__PURE__*/React.createElement("option", {
      key: sec.id,
      value: sec.id
    }, sec.icon || '📂', " ", sec.label)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-xs font-bold mb-1 block"
    }, "\u0627\u0644\u0645\u0627\u0631\u0643\u0629 / \u0627\u0644\u0645\u0646\u0634\u0623"), /*#__PURE__*/React.createElement("input", {
      id: "adminBrandInput",
      name: "brand",
      defaultValue: editModal.item?.brand || currentModalStore?.agencyBrandLabel || '',
      placeholder: "\u062C\u0648\u062A\u0646 / \u0628\u0631\u062C\u0631 / \u0633\u0627\u0646 \u0645\u0627\u0631\u0643\u0648 / \u0644\u0648\u062C\u064A\u0627",
      className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-xs font-bold mb-1 block"
    }, "\u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u062A\u0639\u0628\u064A\u0631\u064A"), /*#__PURE__*/React.createElement("input", {
      name: "icon",
      defaultValue: editModal.item?.icon || '🎨',
      placeholder: "\uD83C\uDFA8 \u0623\u0648 \u2B1C",
      className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-sm text-center"
    }))), currentModalStore && /*#__PURE__*/React.createElement("div", {
      className: "bg-indigo-50/60 dark:bg-slate-900 p-2.5 rounded-xl border border-indigo-200/70 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-black text-indigo-800 dark:text-indigo-300"
    }, "\u2795 \u0625\u0636\u0627\u0641\u0629 \u0642\u0633\u0645 \u062C\u062F\u064A\u062F \u062E\u0627\u0635 \u0628\u0645\u0639\u0631\u0636 \"", currentModalStore.name, "\":"), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-1.5 flex-1 max-w-sm"
    }, /*#__PURE__*/React.createElement("input", {
      type: "text",
      value: inlineProdNewSec,
      onChange: e => setInlineProdNewSec(e.target.value),
      placeholder: "\u0627\u0633\u0645 \u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u062C\u062F\u064A\u062F (\u0645\u062B\u0627\u0644: \u0623\u0635\u0628\u0627\u063A \u062F\u0627\u062E\u0644\u064A\u0629)...",
      className: "flex-1 p-2 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 rounded-lg font-bold text-xs outline-none"
    }), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: async () => {
        const lbl = inlineProdNewSec.trim();
        if (!lbl || !currentModalStore?.id) return;
        const newSecObj = {
          id: 'sec_' + Date.now().toString(36),
          label: lbl,
          icon: '📂'
        };
        const updatedSecs = [...storeSecOptions, newSecObj];
        try {
          await db.collection('stores').doc(currentModalStore.id).set({
            customSections: updatedSecs
          }, {
            merge: true
          });
          setData(prev => ({
            ...prev,
            stores: prev.stores.map(s => s.id === currentModalStore.id ? {
              ...s,
              customSections: updatedSecs
            } : s)
          }));
          if (activeStore?.id === currentModalStore.id) {
            setActiveStore(prev => ({
              ...prev,
              customSections: updatedSecs
            }));
          }
          setInlineProdNewSec('');
          showToast(`تمت إضافة القسم "${lbl}" إلى معرض "${currentModalStore.name}" ✓`);
        } catch (e) {
          showToast('تعذر حفظ القسم الجديد');
        }
      },
      className: "px-3 py-2 bg-indigo-600 text-white rounded-lg font-black text-[11px] shrink-0"
    }, "+ \u0625\u0636\u0627\u0641\u0629 \u0644\u0644\u0645\u0639\u0631\u0636"))));
  })(), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-black text-slate-500"
  }, "\uD83C\uDFA8 \u0634\u0631\u0643\u0627\u062A \u0627\u0644\u0623\u0635\u0628\u0627\u063A \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629 (\u0627\u0636\u063A\u0637 \u0644\u0644\u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0644\u0633\u0631\u064A\u0639):"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, OFFICIAL_PAINT_BRANDS.map(b => /*#__PURE__*/React.createElement("button", {
    key: b.id,
    type: "button",
    onClick: () => {
      const inp = document.getElementById('adminBrandInput');
      if (inp) inp.value = b.nameAr;
    },
    className: `px-2.5 py-1 rounded-xl text-[10px] font-black ${b.badgeClass}`
  }, b.shortAr, " ", b.hasCatalog ? '🎨' : '🏷️')))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0648\u0635\u0641 \u0648\u0645\u0648\u0627\u0635\u0641\u0627\u062A \u0627\u0644\u0645\u0646\u062A\u062C"), /*#__PURE__*/React.createElement("textarea", {
    name: "desc",
    defaultValue: editModal.item?.desc || '',
    rows: "2",
    placeholder: "\u0645\u0648\u0627\u0635\u0641\u0627\u062A \u0627\u0644\u0635\u0628\u063A \u0623\u0648 \u0642\u064A\u0627\u0633 \u0644\u0648\u062D \u0627\u0644\u062C\u0628\u0633 \u0628\u0648\u0631\u062F \u0648\u0645\u0645\u064A\u0632\u0627\u062A\u0647...",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs resize-none"
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-2 text-xs font-bold cursor-pointer"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    name: "requiresColorCode",
    defaultChecked: editModal.item ? editModal.item.requiresColorCode !== false : true,
    className: "w-4 h-4 accent-fuchsia-600"
  }), /*#__PURE__*/React.createElement("span", null, "\uD83C\uDFA8 \u064A\u062A\u0637\u0644\u0628 \u062A\u062D\u062F\u064A\u062F \u0643\u0648\u062F \u0627\u0644\u0644\u0648\u0646 \u0639\u0646\u062F \u0627\u0644\u0637\u0644\u0628 (\u0644\u0644\u0623\u0635\u0628\u0627\u063A)")), /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-2 text-xs font-bold cursor-pointer"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    name: "inStock",
    defaultChecked: editModal.item ? editModal.item.inStock !== false : true,
    className: "w-4 h-4 accent-emerald-600"
  }), "\u0627\u0644\u0645\u0646\u062A\u062C \u0645\u062A\u0648\u0641\u0631 \u062D\u0627\u0644\u064A\u0627\u064B \u0644\u0644\u0637\u0644\u0628 \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u2713"))) : editModal.type === 'announcements' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0646\u0648\u0639 \u0648\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0625\u0639\u0644\u0627\u0646 *"), /*#__PURE__*/React.createElement("select", {
    name: "adType",
    value: annDraft.adType,
    onChange: e => setAnnDraft(p => ({
      ...p,
      adType: e.target.value
    })),
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
  }, /*#__PURE__*/React.createElement("option", {
    value: "info"
  }, "\uD83D\uDCE2 \u0625\u0639\u0644\u0627\u0646 \u0639\u0627\u0645 / \u0623\u062E\u0628\u0627\u0631 \u0627\u0644\u0646\u0638\u0627\u0645"), /*#__PURE__*/React.createElement("option", {
    value: "promo"
  }, "\uD83D\uDD25 \u0639\u0631\u0636 \u062A\u0631\u0648\u064A\u062C\u064A / \u0645\u062A\u062C\u0631 \u0627\u0644\u0645\u0648\u0627\u062F"), /*#__PURE__*/React.createElement("option", {
    value: "urgent"
  }, "\uD83D\uDEA8 \u062A\u0646\u0628\u064A\u0647 \u0639\u0627\u062C\u0644 \u0648\u0647\u0627\u0645"), /*#__PURE__*/React.createElement("option", {
    value: "maintenance"
  }, "\uD83D\uDEE0\uFE0F \u0625\u0634\u0639\u0627\u0631 \u0635\u064A\u0627\u0646\u0629 \u0648\u062A\u062D\u062F\u064A\u062B"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0641\u0626\u0629 \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641\u0629 *"), /*#__PURE__*/React.createElement("select", {
    name: "target",
    value: annDraft.target,
    onChange: e => setAnnDraft(p => ({
      ...p,
      target: e.target.value
    })),
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "\uD83D\uDC65 \u0627\u0644\u062C\u0645\u064A\u0639 (\u0627\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646 \u0648\u0627\u0644\u0639\u0645\u0627\u0644)"), /*#__PURE__*/React.createElement("option", {
    value: "admin"
  }, "\uD83D\uDCBC \u0627\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646 \u0641\u0642\u0637"), /*#__PURE__*/React.createElement("option", {
    value: "worker"
  }, "\uD83D\uDC77 \u0627\u0644\u0639\u0645\u0627\u0644 \u0648\u0627\u0644\u062D\u0631\u0641\u064A\u064A\u0646 \u0641\u0642\u0637")))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0625\u0639\u0644\u0627\u0646 *"), /*#__PURE__*/React.createElement("input", {
    name: "title",
    value: annDraft.title,
    onChange: e => setAnnDraft(p => ({
      ...p,
      title: e.target.value
    })),
    placeholder: "\u0645\u062B\u0627\u0644: \u062A\u062D\u062F\u064A\u062B \u062C\u062F\u064A\u062F \u0641\u064A \u0646\u0638\u0627\u0645 \u0627\u0644\u0623\u0633\u0637\u0629 / \u0639\u0631\u0648\u0636 \u062E\u0627\u0635\u0629 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u064A\u0646",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-sm",
    required: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0646\u0635 \u0627\u0644\u0625\u0639\u0644\u0627\u0646 \u0623\u0648 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u0627\u062A \u0627\u0644\u062A\u0641\u0635\u064A\u0644\u064A\u0629 *"), /*#__PURE__*/React.createElement("textarea", {
    name: "content",
    value: annDraft.content,
    onChange: e => setAnnDraft(p => ({
      ...p,
      content: e.target.value
    })),
    rows: "4",
    placeholder: "\u0627\u0643\u062A\u0628 \u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0625\u0639\u0644\u0627\u0646 \u0623\u0648 \u0627\u0644\u062A\u0646\u0628\u064A\u0647 \u0627\u0644\u0630\u064A \u0633\u064A\u0638\u0647\u0631 \u0644\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646...",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs resize-none leading-relaxed",
    required: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-black text-slate-700 dark:text-slate-200"
  }, "\uD83D\uDDBC\uFE0F \u0635\u0648\u0631\u0629 \u0645\u0631\u0641\u0642\u0629 \u0645\u0639 \u0627\u0644\u0625\u0639\u0644\u0627\u0646 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)"), annImgPreview && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setAnnImgPreview(''),
    className: "text-[11px] font-black text-rose-500 hover:underline"
  }, "\u062D\u0630\u0641 \u0627\u0644\u0635\u0648\u0631\u0629 \u2715")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, annImgPreview && /*#__PURE__*/React.createElement("img", {
    src: annImgPreview,
    alt: "",
    className: "w-16 h-16 rounded-xl object-cover border border-slate-300 dark:border-slate-600 shrink-0"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 space-y-1.5"
  }, /*#__PURE__*/React.createElement("input", {
    ref: annFileInputRef,
    type: "file",
    accept: "image/*",
    onChange: handleAnnImageUpload,
    className: "hidden"
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => annFileInputRef.current?.click(),
    disabled: imgBusy,
    className: "w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "camera",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, imgBusy ? 'جاري ضغط الصورة...' : 'رفع صورة من الجهاز')), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: annImgPreview,
    onChange: e => setAnnImgPreview(e.target.value),
    placeholder: "\u0623\u0648 \u0627\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0635\u0648\u0631\u0629 \u0645\u0628\u0627\u0634\u0631 (https://...)",
    className: "w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none dir-ltr text-left text-[11px]"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0631\u0627\u0628\u0637 \u0627\u0644\u0625\u0639\u0644\u0627\u0646 \u0623\u0648 \u0627\u0644\u062A\u0648\u062C\u064A\u0647 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)"), /*#__PURE__*/React.createElement("input", {
    name: "linkUrl",
    type: "url",
    value: annDraft.linkUrl,
    onChange: e => setAnnDraft(p => ({
      ...p,
      linkUrl: e.target.value
    })),
    placeholder: "https://wa.me/964770...",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none dir-ltr text-left text-xs font-mono"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0646\u0635 \u0632\u0631 \u0627\u0644\u0631\u0627\u0628\u0637 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)"), /*#__PURE__*/React.createElement("input", {
    name: "buttonLabel",
    value: annDraft.buttonLabel,
    onChange: e => setAnnDraft(p => ({
      ...p,
      buttonLabel: e.target.value
    })),
    placeholder: "\u0645\u062B\u0627\u0644: \u062A\u0635\u0641\u062D \u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u0622\u0646 / \u062A\u0648\u0627\u0635\u0644 \u0645\u0639\u0646\u0627",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0639\u062F\u062F \u0645\u0631\u0627\u062A \u0627\u0644\u0638\u0647\u0648\u0631 \u0644\u0643\u0644 \u0645\u0633\u062A\u062E\u062F\u0645 *"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-1.5"
  }, /*#__PURE__*/React.createElement("input", {
    type: "number",
    name: "maxViews",
    value: annDraft.maxViews,
    onChange: e => setAnnDraft(p => ({
      ...p,
      maxViews: parseInt(e.target.value) || 1
    })),
    min: "1",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-black text-xs text-center dir-ltr",
    required: true
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setAnnDraft(p => ({
      ...p,
      maxViews: 999
    })),
    className: "px-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 rounded-xl text-[10px] font-black shrink-0 border border-indigo-200 dark:border-indigo-800"
  }, "\u062F\u0627\u0626\u0645\u0627\u064B (999)"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u062A\u0627\u0631\u064A\u062E \u0627\u0646\u062A\u0647\u0627\u0621 \u0627\u0644\u0625\u0639\u0644\u0627\u0646 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    name: "expiresAt",
    value: annDraft.expiresAt,
    onChange: e => setAnnDraft(p => ({
      ...p,
      expiresAt: e.target.value
    })),
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-xs dir-ltr text-center"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-4 pt-1"
  }, /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-2 text-xs font-black cursor-pointer text-emerald-700 dark:text-emerald-400"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    name: "isActive",
    checked: annDraft.isActive,
    onChange: e => setAnnDraft(p => ({
      ...p,
      isActive: e.target.checked
    })),
    className: "w-4 h-4 accent-emerald-600"
  }), "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0625\u0639\u0644\u0627\u0646 \u0648\u0625\u0638\u0647\u0627\u0631\u0647 \u0644\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646 \u0627\u0644\u0622\u0646 \u2713"), /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-2 text-xs font-black cursor-pointer text-amber-600 dark:text-amber-400"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    name: "isPinned",
    checked: annDraft.isPinned,
    onChange: e => setAnnDraft(p => ({
      ...p,
      isPinned: e.target.checked
    })),
    className: "w-4 h-4 accent-amber-500"
  }), "\u062A\u062B\u0628\u064A\u062A \u0627\u0644\u0625\u0639\u0644\u0627\u0646 \u0628\u0623\u0639\u0644\u0649 \u0627\u0644\u0623\u0648\u0644\u0648\u064A\u0629 \uD83D\uDCCC"))) : editModal.type === 'workers' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0627\u0633\u0645"), /*#__PURE__*/React.createElement("input", {
    name: "name",
    defaultValue: editModal.item?.name,
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none",
    required: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641"), /*#__PURE__*/React.createElement("input", {
    name: "phone",
    defaultValue: editModal.item?.phone,
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none dir-ltr text-left",
    required: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0645\u0647\u0646\u0629"), /*#__PURE__*/React.createElement("input", {
    name: "specialty",
    defaultValue: editModal.item?.specialty,
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062F (\u064A\u062A\u0645 \u062D\u0641\u0638\u0647 \u0645\u0634\u0641\u0631\u0627\u064B SHA-256 \uD83D\uDD12)"), /*#__PURE__*/React.createElement("input", {
    name: "password",
    defaultValue: AlOstaCrypto.revealPassword(editModal.item, editModal.item?.phone || editModal.item?.id),
    placeholder: "\u0623\u062F\u062E\u0644 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none dir-ltr text-left",
    required: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2.5"
  }, /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-2.5 cursor-pointer text-xs font-black text-emerald-800 dark:text-emerald-300"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    name: "isVerifiedPro",
    defaultChecked: Boolean(editModal.item?.isVerifiedPro),
    className: "w-4 h-4 accent-emerald-600 rounded"
  }), /*#__PURE__*/React.createElement("span", null, "\u2B50 \u0645\u0646\u062D \u0634\u0627\u0631\u0629 \"\u0623\u0633\u0637\u0629 \u0645\u0648\u062B\u0651\u0642\" (\u0623\u0648\u0644\u0648\u064A\u0629 \u0627\u0644\u0638\u0647\u0648\u0631 \u0641\u064A \u0623\u0639\u0644\u0649 \u0633\u0648\u0642 \u0627\u0644\u0639\u0645\u0644)")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[11px] font-black text-emerald-700 dark:text-emerald-300 block mb-1"
  }, "\uD83D\uDCC5 \u0645\u062F\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0648\u0627\u0644\u062A\u0648\u062B\u064A\u0642:"), /*#__PURE__*/React.createElement("select", {
    name: "subscriptionPlanType",
    defaultValue: editModal.item?.subscriptionPlanType || 'monthly',
    className: "w-full p-2.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-slate-700 rounded-xl font-black text-xs outline-none"
  }, SUBSCRIPTION_DURATION_OPTIONS.filter(o => o.id !== 'custom').map(opt => /*#__PURE__*/React.createElement("option", {
    key: opt.id,
    value: opt.id
  }, opt.icon, " ", opt.label)))))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block text-slate-500"
  }, "\u0645\u0639\u0631\u0641 \u0627\u0644\u062D\u0633\u0627\u0628 (ID): ", /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-indigo-600 dark:text-indigo-400"
  }, editModal.item?.id))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0633\u0645 \u0627\u0644\u0645\u0642\u0627\u0648\u0644 \u0627\u0644\u0643\u0627\u0645\u0644"), /*#__PURE__*/React.createElement("input", {
    name: "fullName",
    defaultValue: editModal.item?.fullName || editModal.item?.name || editModal.item?.id,
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none",
    required: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0627\u0644\u0639\u0631\u0627\u0642\u064A \u0627\u0644\u0645\u0648\u062B\u0651\u0642 (077 / 078 / 079 / 075)"), /*#__PURE__*/React.createElement("input", {
    name: "phone",
    type: "tel",
    maxLength: 11,
    defaultValue: editModal.item?.phone || '',
    placeholder: "07XXXXXXXXX",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none dir-ltr text-left font-mono",
    required: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold mb-1 block"
  }, "\u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062F (\u064A\u062A\u0645 \u062D\u0641\u0638\u0647 \u0645\u0634\u0641\u0631\u0627\u064B SHA-256 \uD83D\uDD12)"), /*#__PURE__*/React.createElement("input", {
    name: "password",
    defaultValue: AlOstaCrypto.revealPassword(editModal.item, editModal.item?.id),
    placeholder: "\u0623\u062F\u062E\u0644 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629",
    className: "w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none dir-ltr text-left",
    required: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2.5"
  }, /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-2.5 cursor-pointer text-xs font-black text-amber-800 dark:text-amber-300"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    name: "isPro",
    defaultChecked: Boolean(editModal.item?.isPro),
    className: "w-4 h-4 accent-amber-600 rounded"
  }), /*#__PURE__*/React.createElement("span", null, "\uD83D\uDC51 \u062A\u0641\u0639\u064A\u0644 \u0628\u0627\u0642\u0629 \u0627\u0644\u0645\u0642\u0627\u0648\u0644 \u0627\u0644\u0645\u062D\u062A\u0631\u0641 (Pro \u2014 \u0645\u0634\u0627\u0631\u064A\u0639 \u0648\u0639\u0645\u0627\u0644 \u0648\u0645\u0645\u064A\u0632\u0627\u062A \u063A\u064A\u0631 \u0645\u062D\u062F\u0648\u062F\u0629)")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[11px] font-black text-amber-800 dark:text-amber-300 block mb-1"
  }, "\uD83D\uDCC5 \u0645\u062F\u0629 \u0627\u0634\u062A\u0631\u0627\u0643 \u0627\u0644\u0628\u0627\u0642\u0629 (\u0634\u0647\u0631\u064A / \u0633\u0646\u0648\u064A):"), /*#__PURE__*/React.createElement("select", {
    name: "subscriptionPlanType",
    defaultValue: editModal.item?.subscriptionPlanType || 'monthly',
    className: "w-full p-2.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-slate-700 rounded-xl font-black text-xs outline-none"
  }, SUBSCRIPTION_DURATION_OPTIONS.filter(o => o.id !== 'custom').map(opt => /*#__PURE__*/React.createElement("option", {
    key: opt.id,
    value: opt.id
  }, opt.icon, " ", opt.label)))))), modalError && /*#__PURE__*/React.createElement("div", {
    className: "p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 text-xs font-black text-center"
  }, "\u26A0\uFE0F ", modalError), /*#__PURE__*/React.createElement("div", {
    className: "bg-white dark:bg-slate-800 pt-3 pb-1 border-t border-slate-200 dark:border-slate-700"
  }, /*#__PURE__*/React.createElement("button", {
    type: "submit",
    disabled: savingModal,
    className: "w-full bg-indigo-600 disabled:opacity-60 text-white py-3.5 rounded-xl font-black hover:bg-indigo-700 transition-colors shadow-lg flex items-center justify-center gap-2"
  }, savingModal ? '⏳ جاري حفظ البيانات...' : editModal.type === 'stores' ? 'حفظ بيانات المعرض ✓' : editModal.type === 'products' ? 'حفظ المنتج ✓' : editModal.type === 'announcements' ? 'حفظ ونشر الإعلان ✓' : 'حفظ وتشفير البيانات 🔒✓')))), previewAnn && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[700] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-enter",
    onClick: () => setPreviewAnn(null)
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white dark:bg-slate-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative overflow-hidden text-center",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("span", {
    className: "inline-block text-[10px] font-black px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 mb-3"
  }, "\uD83D\uDCF1 \u0645\u0639\u0627\u064A\u0646\u0629 \u0638\u0647\u0648\u0631 \u0627\u0644\u0625\u0639\u0644\u0627\u0646 \u0641\u064A \u0647\u0627\u062A\u0641 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645"), previewAnn.imageUrl ? /*#__PURE__*/React.createElement("div", {
    className: "w-full h-40 rounded-2xl overflow-hidden mb-4 bg-slate-100 dark:bg-slate-900 border dark:border-slate-700"
  }, /*#__PURE__*/React.createElement("img", {
    src: previewAnn.imageUrl,
    alt: previewAnn.title,
    className: "w-full h-full object-cover"
  })) : /*#__PURE__*/React.createElement("div", {
    className: `w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${previewAnn.adType === 'urgent' ? 'bg-rose-100 text-rose-600' : previewAnn.adType === 'promo' ? 'bg-amber-100 text-amber-600' : previewAnn.adType === 'maintenance' ? 'bg-purple-100 text-purple-600' : 'bg-indigo-100 text-indigo-600'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "megaphone",
    size: 32
  })), /*#__PURE__*/React.createElement("h2", {
    className: "text-xl font-black mb-3 text-slate-800 dark:text-slate-100"
  }, previewAnn.title), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl mb-4 border dark:border-slate-700 text-right"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-semibold"
  }, previewAnn.content)), previewAnn.linkUrl && /*#__PURE__*/React.createElement("a", {
    href: previewAnn.linkUrl,
    target: "_blank",
    rel: "noreferrer",
    className: "w-full mb-2.5 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-2xl font-black text-sm shadow-md flex items-center justify-center gap-2"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "external-link",
    size: 16
  }), /*#__PURE__*/React.createElement("span", null, previewAnn.buttonLabel || 'فتح الرابط المرفق')), /*#__PURE__*/React.createElement("button", {
    onClick: () => setPreviewAnn(null),
    className: "w-full bg-indigo-600 text-white py-3.5 rounded-2xl font-black text-sm shadow-lg"
  }, "\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629 \u2713"))), storeLinkModal && (() => {
    const portalLink = getStorePortalLink(storeLinkModal);
    const appDeepLink = getStoreAppDeepLink(storeLinkModal);
    const portalCode = getStorePortalCode(storeLinkModal);
    const waPhone = formatStoreWhatsAppPhone(storeLinkModal.phone);
    const shareMessage = `مرحباً بك في نظام الأسطة 🏪\nتم تفعيل معرضكم: *${storeLinkModal.name}*\n\n🌐 *الرابط المباشر لتحديث معلومات الاتصال وإضافة وتعديل منتجاتكم وأسعاركم عبر المتصفح:*\n${portalLink}\n\n📱 *أو عبر تطبيق الأسطة مباشرة باستخدام رمز المعرض:*\n🔑 رمز الدخول السري للمعرض: *${portalCode}*\n🆔 معرف المعرض: *${storeLinkModal.id}*\n🔒 (ملاحظة: حساب التحويل المالي محمي ويُعتمد من إدارة النظام فقط)`;
    return /*#__PURE__*/React.createElement("div", {
      className: "fixed inset-0 z-[750] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-enter",
      onClick: () => setStoreLinkModal(null)
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-indigo-200 dark:border-slate-700 space-y-4 text-right",
      onClick: e => e.stopPropagation()
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between border-b dark:border-slate-700 pb-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-black text-lg"
    }, "\uD83D\uDD17"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
      className: "font-black text-base"
    }, "\u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u062E\u0627\u0635 \u0628\u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u0639\u0631\u0636"), /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] text-slate-500 font-bold"
    }, storeLinkModal.name))), /*#__PURE__*/React.createElement("button", {
      onClick: () => setStoreLinkModal(null),
      className: "p-2 bg-slate-100 dark:bg-slate-700 rounded-full"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "x",
      size: 16
    }))), /*#__PURE__*/React.createElement("div", {
      className: "bg-slate-50 dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between text-xs font-bold"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-slate-500"
    }, "\uD83C\uDD94 \u0645\u0639\u0631\u0641 \u0627\u0644\u0645\u0639\u0631\u0636 (ID):"), /*#__PURE__*/React.createElement("span", {
      className: "font-mono font-black text-indigo-600 dark:text-indigo-400 dir-ltr select-all"
    }, storeLinkModal.id)), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between text-xs font-bold"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-slate-500"
    }, "\uD83D\uDD11 \u0631\u0645\u0632 \u062F\u062E\u0648\u0644 \u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u062D\u0644:"), /*#__PURE__*/React.createElement("span", {
      className: "font-mono font-black text-emerald-600 dark:text-emerald-400 dir-ltr select-all"
    }, portalCode)), /*#__PURE__*/React.createElement("div", {
      className: "pt-2 border-t border-slate-200 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] font-black text-slate-500 mb-1"
    }, "\uD83C\uDF10 \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0639\u0628\u0631 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0644\u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0625\u0644\u0649 \u0627\u0644\u0645\u0639\u0631\u0636:"), /*#__PURE__*/React.createElement("div", {
      className: "p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-indigo-200 dark:border-slate-700 font-mono text-[11px] text-indigo-700 dark:text-indigo-300 break-all dir-ltr text-left select-all"
    }, portalLink)), /*#__PURE__*/React.createElement("div", {
      className: "pt-1"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] font-black text-slate-500 mb-1"
    }, "\uD83D\uDCF1 \u0631\u0627\u0628\u0637 \u0627\u0644\u0641\u062A\u062D \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u062F\u0627\u062E\u0644 \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0623\u0646\u062F\u0631\u0648\u064A\u062F:"), /*#__PURE__*/React.createElement("div", {
      className: "p-2 bg-white dark:bg-slate-800 rounded-xl border border-emerald-200 dark:border-slate-700 font-mono text-[10px] text-emerald-700 dark:text-emerald-300 break-all dir-ltr text-left select-all"
    }, appDeepLink))), /*#__PURE__*/React.createElement("div", {
      className: "space-y-2"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => copyTextToClipboard(portalLink, () => showToast('تم نسخ الرابط المباشر للمعرض ✓')),
      className: "w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-md"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "copy",
      size: 16
    }), " \u0646\u0633\u062E \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0644\u0644\u0645\u0639\u0631\u0636"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => copyTextToClipboard(shareMessage, () => showToast('تم نسخ رسالة الدعوة كاملة مع الرابط والرمز ✓')),
      className: "w-full py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-800 dark:text-slate-100 rounded-2xl font-black text-xs flex items-center justify-center gap-2"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "clipboard",
      size: 16
    }), " \u0646\u0633\u062E \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u062F\u0639\u0648\u0629 \u0643\u0627\u0645\u0644\u0629 (\u0627\u0644\u0631\u0627\u0628\u0637 + \u0627\u0644\u0645\u0639\u0631\u0641 + \u0627\u0644\u0631\u0645\u0632)"), waPhone && /*#__PURE__*/React.createElement("a", {
      href: `https://wa.me/${waPhone}?text=${encodeURIComponent(shareMessage)}`,
      target: "_blank",
      rel: "noreferrer",
      className: "w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-md"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "send",
      size: 16
    }), " \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0627\u0628\u0637 \u0644\u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u062D\u0644 \u0639\u0628\u0631 \u0648\u0627\u062A\u0633\u0627\u0628"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => {
        const st = storeLinkModal;
        setStoreLinkModal(null);
        setPortalPreviewStore(st);
      },
      className: "w-full py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-2xl font-black text-xs flex items-center justify-center gap-2"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "eye",
      size: 16
    }), " \u0641\u062A\u062D \u0648\u0645\u0639\u0627\u064A\u0646\u0629 \u0628\u0648\u0627\u0628\u0629 \u0635\u0627\u062D\u0628 \u0627\u0644\u0645\u062D\u0644 \u0627\u0644\u0622\u0646"))));
  })(), paymentQrModal && (() => {
    const payMethod = getStorePaymentMethodInfo(paymentQrModal.paymentMethod);
    const accNum = getStoreAccountNumber(paymentQrModal);
    const qrSrc = getStoreQrImageSrc(paymentQrModal, 360);
    return /*#__PURE__*/React.createElement("div", {
      className: "fixed inset-0 z-[760] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-enter",
      onClick: () => setPaymentQrModal(null)
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl border-2 border-emerald-500/40 space-y-4 text-right",
      onClick: e => e.stopPropagation()
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between border-b dark:border-slate-700 pb-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-black text-xl"
    }, "\uD83D\uDCB3"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
      className: "font-black text-base"
    }, "\u0628\u0627\u0631\u0643\u0648\u062F \u0648\u0631\u0642\u0645 \u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0639\u0631\u0636 \u0644\u0644\u062A\u062D\u0648\u064A\u0644"), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-slate-500 font-bold"
    }, paymentQrModal.name))), /*#__PURE__*/React.createElement("button", {
      onClick: () => setPaymentQrModal(null),
      className: "p-2 bg-slate-100 dark:bg-slate-700 rounded-full"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "x",
      size: 16
    }))), /*#__PURE__*/React.createElement("div", {
      className: "bg-slate-50 dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center space-y-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: `text-xs px-3 py-1 rounded-full font-black ${payMethod.badgeClass}`
    }, payMethod.icon, " ", payMethod.label), qrSrc ? /*#__PURE__*/React.createElement("div", {
      className: "bg-white p-3 rounded-3xl border-4 border-emerald-500 shadow-lg"
    }, /*#__PURE__*/React.createElement("img", {
      src: qrSrc,
      alt: "Store QR Code",
      className: "w-56 h-56 object-contain mx-auto"
    })) : /*#__PURE__*/React.createElement("div", {
      className: "w-48 h-48 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-4xl"
    }, "\uD83D\uDCB3"), /*#__PURE__*/React.createElement("div", {
      className: "w-full bg-white dark:bg-slate-800 p-3 rounded-2xl border border-emerald-200 dark:border-slate-700 space-y-1"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] font-bold text-slate-500"
    }, "\u0631\u0642\u0645 \u0627\u0644\u062D\u0633\u0627\u0628 / \u0627\u0644\u0645\u062D\u0641\u0638\u0629 \u0644\u0644\u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0645\u0627\u0644\u064A:"), /*#__PURE__*/React.createElement("p", {
      className: "font-mono font-black text-xl text-emerald-600 dark:text-emerald-400 dir-ltr select-all"
    }, accNum || 'غير محدد'), /*#__PURE__*/React.createElement("p", {
      className: "text-xs font-bold text-slate-600 dark:text-slate-300"
    }, "\u0628\u0627\u0633\u0645: ", paymentQrModal.paymentAccountHolder || paymentQrModal.name))), /*#__PURE__*/React.createElement("div", {
      className: "space-y-2"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => saveStorePaymentBarcodeToDevice(paymentQrModal, showToast),
      className: "w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 16
    }), " \uD83D\uDCBE \u062D\u0641\u0638 \u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062F \u0645\u0639 \u0631\u0642\u0645 \u0627\u0644\u062D\u0633\u0627\u0628 \u0641\u064A \u0627\u0644\u062C\u0647\u0627\u0632"), accNum && /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => copyTextToClipboard(accNum, () => showToast(`تم نسخ رقم الحساب (${accNum}) ✓`)),
      className: "w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-md"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "copy",
      size: 16
    }), " \u0646\u0633\u062E \u0631\u0642\u0645 \u0627\u0644\u062D\u0633\u0627\u0628 \u0644\u0644\u062A\u062D\u0648\u064A\u0644"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => {
        const st = paymentQrModal;
        setPaymentQrModal(null);
        openModal('stores', st);
      },
      className: "w-full py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-2xl font-black text-xs flex items-center justify-center gap-2"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "edit-2",
      size: 14
    }), " \u062A\u0639\u062F\u064A\u0644 \u0631\u0642\u0645 \u0627\u0644\u062D\u0633\u0627\u0628 \u0623\u0648 \u0635\u0648\u0631\u0629 \u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062F"))));
  })(), subModal.isOpen && subModal.item && (() => {
    const isContractor = subModal.collectionName === 'admins';
    const isStore = subModal.collectionName === 'stores';
    const entityTitle = isContractor ? `مقاول: ${subModal.item.name || subModal.item.id}` : isStore ? `معرض: ${subModal.item.name}` : `أسطة / عامل: ${subModal.item.name || subModal.item.phone}`;
    const badgeTitle = isContractor ? '👑 باقة المقاول المحترف (Pro)' : isStore ? '💎 باقة المعرض المعتمد (VIP)' : '⭐ شارة أسطة موثّق';
    const monthlyBase = isContractor ? parseInt(data.settings?.proContractorPrice) || 25000 : isStore ? parseInt(data.settings?.proStorePrice) || 75000 : parseInt(data.settings?.verifiedWorkerPrice) || 5000;
    const annualBase = isContractor ? parseInt(data.settings?.proContractorAnnualPrice) || monthlyBase * 10 : isStore ? parseInt(data.settings?.proStoreAnnualPrice) || monthlyBase * 10 : parseInt(data.settings?.verifiedWorkerAnnualPrice) || monthlyBase * 10;
    const calcPlanPrice = pId => {
      if (pId === 'monthly') return monthlyBase;
      if (pId === 'quarterly') return monthlyBase * 3;
      if (pId === 'semiannual') return monthlyBase * 6;
      if (pId === 'yearly') return annualBase;
      return null;
    };
    const curInfo = getEntitySubscriptionInfo(subModal.item, subModal.flagField);
    const previewExpIso = computeSubscriptionExpiryIso(subModal.planType, subModal.customDate);
    const previewPrice = calcPlanPrice(subModal.planType);
    return /*#__PURE__*/React.createElement("div", {
      className: "fixed inset-0 z-[780] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-enter",
      onClick: () => setSubModal(p => ({
        ...p,
        isOpen: false
      }))
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl p-5 sm:p-6 shadow-2xl border-2 border-indigo-500/40 space-y-4 text-right max-h-[92vh] overflow-y-auto",
      onClick: e => e.stopPropagation()
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between border-b dark:border-slate-700 pb-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center font-black text-xl"
    }, "\uD83D\uDCC5"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
      className: "font-black text-base text-slate-900 dark:text-white"
    }, "\u062A\u062D\u062F\u064A\u062F \u0645\u062F\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0648\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0628\u0627\u0642\u0629"), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-indigo-600 dark:text-indigo-400 font-black"
    }, entityTitle))), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setSubModal(p => ({
        ...p,
        isOpen: false
      })),
      className: "p-2 bg-slate-100 dark:bg-slate-700 rounded-full"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "x",
      size: 16
    }))), /*#__PURE__*/React.createElement("div", {
      className: `p-3.5 rounded-2xl border flex items-center justify-between gap-2 ${curInfo.isActive ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200' : curInfo.isExpired ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-700' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-bold block opacity-80"
    }, "\u0627\u0644\u062D\u0627\u0644\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0644\u0644\u062D\u0633\u0627\u0628:"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-xs sm:text-sm"
    }, curInfo.isActive ? `✅ مفعّل (${badgeTitle} — ${curInfo.planLabel})` : curInfo.isExpired ? `⚠️ اشتراك منتهي (${curInfo.planLabel})` : '🔒 الباقة المجانية / العادية')), curInfo.rawFlag && /*#__PURE__*/React.createElement("span", {
      className: "text-xs font-black px-2.5 py-1 rounded-xl bg-white/80 dark:bg-slate-800 border border-current/20 shrink-0"
    }, curInfo.daysLeft === null ? '♾️ دائم' : curInfo.isExpired ? `منتهي منذ ${Math.abs(curInfo.daysLeft)} يوم` : `متبقي ${curInfo.daysLeft} يوم`)), /*#__PURE__*/React.createElement("div", {
      className: "space-y-2"
    }, /*#__PURE__*/React.createElement("label", {
      className: "text-xs font-black text-slate-700 dark:text-slate-200 block"
    }, "\u23F3 \u0627\u062E\u062A\u0631 \u0645\u062F\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 (\u0634\u0647\u0631\u064A / \u0631\u0628\u0639 \u0633\u0646\u0648\u064A / \u0646\u0635\u0641 \u0633\u0646\u0648\u064A / \u0633\u0646\u0648\u064A / \u0645\u0641\u062A\u0648\u062D):"), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-2 sm:grid-cols-3 gap-2"
    }, SUBSCRIPTION_DURATION_OPTIONS.map(opt => {
      const active = subModal.planType === opt.id;
      const pPrice = calcPlanPrice(opt.id);
      return /*#__PURE__*/React.createElement("button", {
        key: opt.id,
        type: "button",
        onClick: () => setSubModal(p => ({
          ...p,
          planType: opt.id
        })),
        className: `p-3 rounded-2xl border text-right transition-all relative flex flex-col justify-between gap-1 ${active ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-500/30' : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400'}`
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex items-center justify-between gap-1"
      }, /*#__PURE__*/React.createElement("span", {
        className: "font-black text-xs"
      }, opt.icon, " ", opt.shortLabel), opt.badge && /*#__PURE__*/React.createElement("span", {
        className: `text-[9px] px-1.5 py-0.5 rounded-full font-black ${active ? 'bg-amber-400 text-slate-950' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`
      }, opt.badge)), /*#__PURE__*/React.createElement("span", {
        className: `text-[10px] font-bold ${active ? 'text-indigo-100' : 'text-slate-400'}`
      }, opt.days ? `${opt.days} يوم` : opt.id === 'lifetime' ? 'بدون تاريخ انتهاء' : 'تحديد باليوم'), pPrice !== null && /*#__PURE__*/React.createElement("span", {
        className: `text-xs font-black dir-ltr text-right mt-0.5 ${active ? 'text-amber-300' : 'text-emerald-600 dark:text-emerald-400'}`
      }, pPrice.toLocaleString('en-US'), " \u062F.\u0639"));
    }))), subModal.planType === 'custom' && /*#__PURE__*/React.createElement("div", {
      className: "p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-slate-900 border border-indigo-200 dark:border-slate-700 space-y-1.5"
    }, /*#__PURE__*/React.createElement("label", {
      className: "text-xs font-black text-indigo-900 dark:text-indigo-300 block"
    }, "\uD83D\uDCC6 \u062D\u062F\u062F \u062A\u0627\u0631\u064A\u062E \u0627\u0646\u062A\u0647\u0627\u0621 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0627\u0644\u0645\u062E\u0635\u0635:"), /*#__PURE__*/React.createElement("input", {
      type: "date",
      value: subModal.customDate,
      onChange: e => setSubModal(p => ({
        ...p,
        customDate: e.target.value
      })),
      className: "w-full p-2.5 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-slate-700 rounded-xl font-black text-xs dir-ltr text-center outline-none"
    })), /*#__PURE__*/React.createElement("div", {
      className: "bg-slate-50 dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs font-bold"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-slate-500"
    }, "\u0646\u0648\u0639 \u0627\u0644\u0628\u0627\u0642\u0629 \u0648\u0627\u0644\u0645\u062F\u0629:"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-indigo-600 dark:text-indigo-400"
    }, (SUBSCRIPTION_DURATION_OPTIONS.find(o => o.id === subModal.planType) || SUBSCRIPTION_DURATION_OPTIONS[0]).label)), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-slate-500"
    }, "\u062A\u0627\u0631\u064A\u062E \u0627\u0646\u062A\u0647\u0627\u0621 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629:"), /*#__PURE__*/React.createElement("span", {
      className: "font-mono font-black text-emerald-600 dark:text-emerald-400 dir-ltr"
    }, previewExpIso ? String(previewExpIso).slice(0, 10) : '♾️ مفتوح (لا ينتهي)')), previewPrice !== null && /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-slate-500"
    }, "\u0642\u064A\u0645\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0627\u0644\u0645\u0642\u062A\u0631\u062D\u0629:"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-amber-600 dark:text-amber-400 dir-ltr"
    }, previewPrice.toLocaleString('en-US'), " \u062F.\u0639"))), /*#__PURE__*/React.createElement("div", {
      className: "space-y-2 pt-1"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      disabled: subModal.saving,
      onClick: () => handleApplySubscription('activate'),
      className: "w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25"
    }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDC51"), /*#__PURE__*/React.createElement("span", null, subModal.saving ? 'جاري الحفظ...' : `تفعيل الاشتراك (${(SUBSCRIPTION_DURATION_OPTIONS.find(o => o.id === subModal.planType) || SUBSCRIPTION_DURATION_OPTIONS[0]).shortLabel}) يبدأ من اليوم ✓`)), curInfo.rawFlag && curInfo.expiresAt && subModal.planType !== 'lifetime' && /*#__PURE__*/React.createElement("button", {
      type: "button",
      disabled: subModal.saving,
      onClick: () => handleApplySubscription('extend'),
      className: "w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-md"
    }, /*#__PURE__*/React.createElement("span", null, "\u2795"), /*#__PURE__*/React.createElement("span", null, "\u062A\u0645\u062F\u064A\u062F \u0648\u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u062F\u0629 \u0641\u0648\u0642 \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621 \u0627\u0644\u062D\u0627\u0644\u064A")), curInfo.rawFlag && /*#__PURE__*/React.createElement("button", {
      type: "button",
      disabled: subModal.saving,
      onClick: () => handleApplySubscription('revoke'),
      className: "w-full py-2.5 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-2xl font-black text-xs flex items-center justify-center gap-2"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "x-circle",
      size: 15
    }), /*#__PURE__*/React.createElement("span", null, "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0648\u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628 \u0644\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u0645\u062C\u0627\u0646\u064A\u0629")))));
  })(), /*#__PURE__*/React.createElement(ConfirmModal, {
    isOpen: confirmDialog.isOpen,
    onClose: () => setConfirmDialog({
      isOpen: false,
      text: '',
      onConfirm: null
    }),
    onConfirm: confirmDialog.onConfirm,
    text: confirmDialog.text
  }));
};
const ADMIN_EMAILS = ['waadpc90@gmail.com', 'xyzpc90@gmail.com'];
const App = () => {
  const getSavedDashAuth = () => {
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('waad_admin_auth') === '1') return true;
    } catch (e) {}
    try {
      const sec = AlOstaCrypto.loadSecureSession('waad_admin_auth');
      if (sec && sec.authenticated === true) return true;
    } catch (e) {}
    return false;
  };
  const saveDashAuth = val => {
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (val) sessionStorage.setItem('waad_admin_auth', '1');else sessionStorage.removeItem('waad_admin_auth');
      }
    } catch (e) {}
    try {
      if (val) AlOstaCrypto.saveSecureSession('waad_admin_auth', {
        authenticated: true,
        ts: Date.now()
      });else localStorage.removeItem('waad_admin_auth');
    } catch (e) {}
  };
  const [isAuth, setIsAuth] = useState(() => getSavedDashAuth());
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryMsg, setRecoveryMsg] = useState('');
  const [recoveredCode, setRecoveredCode] = useState('');
  useEffect(() => {
    if (!window.firebase || !firebase.auth) return;
    const unsub = firebase.auth().onAuthStateChanged(user => {
      if (user && ADMIN_EMAILS.includes((user.email || '').toLowerCase()) || getSavedDashAuth()) {
        setIsAuth(true);
      }
      setCheckingAuth(false);
    });
    return () => unsub();
  }, []);
  const handleLogin = async e => {
    e.preventDefault();
    if (Date.now() < lockoutUntil) {
      setError(true);
      return;
    }
    setError(false);
    const trimmed = pass.trim();
    const localEncPass = localStorage.getItem('waad_custom_admin_pass_enc');
    const localDecPass = localEncPass ? AlOstaCrypto.decryptSecret(localEncPass, 'waad_dashboard_admin') : localStorage.getItem('waad_custom_admin_pass');
    if (AlOstaCrypto.constantTimeEqual(trimmed, MASTER_PASSWORD) || localDecPass && AlOstaCrypto.constantTimeEqual(trimmed, localDecPass)) {
      setFailedAttempts(0);
      saveDashAuth(true);
      setIsAuth(true);
      return;
    }
    try {
      const cfgDoc = await db.collection('settings').doc('app_config').get();
      if (cfgDoc.exists) {
        const cfg = cfgDoc.data() || {};
        const expectedHash = cfg.adminPasswordHash;
        const decCloudPass = cfg.adminPasswordCipher ? AlOstaCrypto.decryptSecret(cfg.adminPasswordCipher, 'waad_dashboard_admin') : '';
        const legacyPass = cfg.adminPassword && cfg.adminPassword !== AlOstaCrypto.ENCRYPTED_MASK ? String(cfg.adminPassword).trim() : '';
        const inputHash = AlOstaCrypto.hashPassword(trimmed, 'waad_dashboard_admin');
        if (expectedHash && AlOstaCrypto.constantTimeEqual(inputHash, expectedHash) || decCloudPass && AlOstaCrypto.constantTimeEqual(trimmed, decCloudPass) || legacyPass && AlOstaCrypto.constantTimeEqual(trimmed, legacyPass)) {
          localStorage.setItem('waad_custom_admin_pass_enc', AlOstaCrypto.encryptSecret(trimmed, 'waad_dashboard_admin'));
          setFailedAttempts(0);
          saveDashAuth(true);
          setIsAuth(true);
          return;
        }
      }
    } catch (err) {}
    for (const email of ADMIN_EMAILS) {
      try {
        await firebase.auth().signInWithEmailAndPassword(email, trimmed);
        setFailedAttempts(0);
        saveDashAuth(true);
        setIsAuth(true);
        return;
      } catch (err) {}
    }
    const nextFails = failedAttempts + 1;
    setFailedAttempts(nextFails);
    if (nextFails >= 5) {
      setLockoutUntil(Date.now() + 30000);
    }
    setError(true);
  };
  const handleRecoverPassword = async e => {
    e.preventDefault();
    setRecoveryMsg('');
    setRecoveredCode('');
    const val = recoveryInput.trim().toLowerCase();
    if (val === 'waadpc90@gmail.com' || val === 'xyzpc90@gmail.com' || val === 'waad' || val === 'وعد') {
      let customCode = '';
      const localEnc = localStorage.getItem('waad_custom_admin_pass_enc');
      if (localEnc) customCode = AlOstaCrypto.decryptSecret(localEnc, 'waad_dashboard_admin');
      if (!customCode) customCode = localStorage.getItem('waad_custom_admin_pass') || '';
      try {
        const cfgDoc = await db.collection('settings').doc('app_config').get();
        if (cfgDoc.exists) {
          const cfg = cfgDoc.data() || {};
          if (cfg.adminPasswordCipher) {
            customCode = AlOstaCrypto.decryptSecret(cfg.adminPasswordCipher, 'waad_dashboard_admin') || customCode;
          } else if (cfg.adminPassword && cfg.adminPassword !== AlOstaCrypto.ENCRYPTED_MASK) {
            customCode = cfg.adminPassword;
          }
        }
      } catch (err) {}
      setRecoveredCode(customCode && customCode !== MASTER_PASSWORD ? `${MASTER_PASSWORD} (أو الرمز المخصص: ${customCode})` : MASTER_PASSWORD);
      setPass(MASTER_PASSWORD);
      setRecoveryMsg('تم استرجاع رمز الدخول وتعبئته تلقائياً ✓');
    } else {
      setRecoveryMsg('يرجى كتابة البريد الإداري (waadpc90@gmail.com) أو اسم المالك (waad) لاستعادة الرمز.');
    }
  };
  const handleSendResetEmail = async () => {
    try {
      await firebase.auth().sendPasswordResetEmail('waadpc90@gmail.com');
      setRecoveryMsg('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك waadpc90@gmail.com ✓');
    } catch (e) {
      setRecoveryMsg('يمكنك استخدام الرمز الأساسي المباشر: ' + MASTER_PASSWORD);
      setRecoveredCode(MASTER_PASSWORD);
    }
  };
  const handleLogout = () => {
    saveDashAuth(false);
    setIsAuth(false);
    try {
      firebase.auth().signOut();
    } catch (e) {}
  };
  const [storePortalInput, setStorePortalInput] = useState(() => {
    try {
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      if (/storePortal=/i.test(search) || /storePortal=/i.test(hash)) {
        return window.location.href;
      }
    } catch (e) {}
    return '';
  });
  const [activeStorePortalKey, setActiveStorePortalKey] = useState(() => {
    try {
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      const host = (window.location.hostname || '').toLowerCase();
      const path = (window.location.pathname || '').toLowerCase();
      if (/storePortal=/i.test(search) || /storePortal=/i.test(hash)) {
        return window.location.href;
      }
      // On the public web portal domain root (not /dashboard.html), always show Store Owner Portal only
      if (host.includes('alosta-portal.surge.sh') && !path.endsWith('dashboard.html')) {
        return 'prompt';
      }
    } catch (e) {}
    return '';
  });
  const [showStorePortalBox, setShowStorePortalBox] = useState(false);
  if (activeStorePortalKey) {
    return /*#__PURE__*/React.createElement(StoreOwnerPortal, {
      storeKeyInput: activeStorePortalKey,
      onExit: () => setActiveStorePortalKey('prompt')
    });
  }
  if (checkingAuth) return null;
  if (!isAuth) {
    return /*#__PURE__*/React.createElement("div", {
      className: "min-h-screen flex items-center justify-center p-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "max-w-sm w-full bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-700 text-center animate-enter"
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-20 h-20 bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400 rounded-full mx-auto flex items-center justify-center mb-5"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "shield",
      size: 32
    })), /*#__PURE__*/React.createElement("h2", {
      className: "text-xl font-black mb-6"
    }, "\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645 \u0648\u0627\u0644\u0645\u062A\u062C\u0631"), /*#__PURE__*/React.createElement("form", {
      onSubmit: handleLogin,
      className: "space-y-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "relative"
    }, /*#__PURE__*/React.createElement("input", {
      type: showPass ? "text" : "password",
      value: pass,
      onChange: e => {
        setPass(e.target.value);
        setError(false);
      },
      placeholder: "\u0631\u0645\u0632 \u0645\u0631\u0648\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u0629",
      className: "w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-xl text-center font-bold outline-none border border-slate-200 dark:border-slate-700 focus:border-indigo-500",
      autoFocus: true
    }), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setShowPass(!showPass),
      className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 text-xs font-bold"
    }, showPass ? 'إخفاء' : 'إظهار')), error && /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-rose-500 font-bold -mt-2"
    }, "\u0631\u0645\u0632 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u060C \u062C\u0631\u0628 \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0627\u0644\u0631\u0645\u0632 \u0628\u0627\u0644\u0623\u0633\u0641\u0644"), /*#__PURE__*/React.createElement("button", {
      type: "submit",
      className: "w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20"
    }, "\u062F\u062E\u0648\u0644 \u0644\u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645")), /*#__PURE__*/React.createElement("div", {
      className: "mt-4 pt-4 border-t border-slate-100 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setShowStorePortalBox(!showStorePortalBox),
      className: "w-full py-3 px-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-black text-xs flex items-center justify-center gap-2"
    }, /*#__PURE__*/React.createElement("span", null, "\uD83C\uDFEA"), /*#__PURE__*/React.createElement("span", null, "\u062F\u062E\u0648\u0644 \u0635\u0627\u062D\u0628 \u0645\u0639\u0631\u0636 (\u0639\u0628\u0631 \u0627\u0644\u0631\u0627\u0628\u0637 \u0623\u0648 \u0631\u0645\u0632 \u0627\u0644\u0645\u0639\u0631\u0636)")), showStorePortalBox && /*#__PURE__*/React.createElement("div", {
      className: "mt-3 p-3.5 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 space-y-2.5 text-right animate-enter"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] font-bold text-slate-600 dark:text-slate-300"
    }, "\u0627\u0644\u0635\u0642 \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u062E\u0627\u0635 \u0628\u0627\u0644\u0645\u0639\u0631\u0636 \u0623\u0648 \u0623\u062F\u062E\u0644 \u0631\u0645\u0632/\u0645\u0639\u0631\u0641 \u0627\u0644\u0645\u0639\u0631\u0636 (\u0645\u062B\u0627\u0644: ", /*#__PURE__*/React.createElement("span", {
      className: "font-mono"
    }, "ST-XXXXXX"), ") \u0644\u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C\u0627\u062A\u0643:"), /*#__PURE__*/React.createElement("input", {
      type: "text",
      value: storePortalInput,
      onChange: e => setStorePortalInput(e.target.value),
      placeholder: "\u0627\u0644\u0635\u0642 \u0627\u0644\u0631\u0627\u0628\u0637 \u0623\u0648 \u0631\u0645\u0632 \u0627\u0644\u0645\u0639\u0631\u0636 ST-XXXXXX",
      className: "w-full p-2.5 bg-white dark:bg-slate-800 rounded-xl text-center font-mono font-bold text-xs outline-none border border-slate-200 dark:border-slate-700 dir-ltr"
    }), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => {
        if (storePortalInput.trim()) {
          setActiveStorePortalKey(storePortalInput.trim());
        }
      },
      className: "w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs"
    }, "\u0641\u062A\u062D \u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u0645\u0639\u0631\u0636 \u0648\u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A"))), /*#__PURE__*/React.createElement("div", {
      className: "mt-4 pt-4 border-t border-slate-100 dark:border-slate-700"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setShowRecovery(!showRecovery),
      className: "text-xs font-black text-indigo-600 dark:text-indigo-400 hover:underline flex items-center justify-center gap-1.5 mx-auto"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "key",
      size: 14
    }), /*#__PURE__*/React.createElement("span", null, "\u0646\u0633\u064A\u062A \u0631\u0645\u0632 \u0627\u0644\u062F\u062E\u0648\u0644\u061F \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0627\u0644\u0631\u0645\u0632")), showRecovery && /*#__PURE__*/React.createElement("div", {
      className: "mt-3 p-4 bg-slate-50 dark:bg-slate-900/90 rounded-2xl border border-indigo-200 dark:border-indigo-800/60 text-right space-y-3 animate-enter"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] font-bold text-slate-600 dark:text-slate-300 leading-relaxed"
    }, "\u0644\u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0631\u0645\u0632 \u0627\u0644\u062F\u062E\u0648\u0644 \u0627\u0644\u0641\u0648\u0631\u064A\u060C \u0623\u062F\u062E\u0644 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u062F\u0627\u0631\u064A (", /*#__PURE__*/React.createElement("span", {
      className: "font-mono text-indigo-600 dark:text-indigo-400"
    }, "waadpc90@gmail.com"), ") \u0623\u0648 \u0627\u0633\u0645 \u0627\u0644\u0645\u0627\u0644\u0643 (", /*#__PURE__*/React.createElement("span", {
      className: "font-mono text-indigo-600 dark:text-indigo-400"
    }, "waad"), "):"), /*#__PURE__*/React.createElement("form", {
      onSubmit: handleRecoverPassword,
      className: "space-y-2"
    }, /*#__PURE__*/React.createElement("input", {
      type: "text",
      value: recoveryInput,
      onChange: e => setRecoveryInput(e.target.value),
      placeholder: "waadpc90@gmail.com \u0623\u0648 waad",
      className: "w-full p-2.5 bg-white dark:bg-slate-800 rounded-xl text-center font-bold text-xs outline-none border border-slate-200 dark:border-slate-700 dir-ltr"
    }), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-2 gap-2"
    }, /*#__PURE__*/React.createElement("button", {
      type: "submit",
      className: "bg-indigo-600 text-white py-2.5 rounded-xl font-black text-xs hover:bg-indigo-700"
    }, "\u0625\u0638\u0647\u0627\u0631 \u0648\u062A\u0639\u0628\u0626\u0629 \u0627\u0644\u0631\u0645\u0632"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: handleSendResetEmail,
      className: "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl font-bold text-xs hover:bg-slate-300"
    }, "\u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0639\u0628\u0631 \u0627\u0644\u0625\u064A\u0645\u064A\u0644"))), recoveredCode && /*#__PURE__*/React.createElement("div", {
      className: "p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[11px] font-bold text-emerald-700 dark:text-emerald-300"
    }, "\u0631\u0645\u0632 \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F \u0647\u0648:"), /*#__PURE__*/React.createElement("div", {
      className: "text-base font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1 select-all dir-ltr"
    }, recoveredCode)), recoveryMsg && /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] font-bold text-center text-indigo-600 dark:text-indigo-400"
    }, recoveryMsg)))));
  }
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Dashboard, {
    onLogout: handleLogout
  }), /*#__PURE__*/React.createElement(DashboardUpdateChecker, null));
};
const DashboardUpdateChecker = () => {
  const [updateCfg, setUpdateCfg] = useState(null);
  const [dlState, setDlState] = useState('idle');
  const [dlProgress, setDlProgress] = useState(0);
  const [dlMessage, setDlMessage] = useState('');
  useEffect(() => {
    window.onApkUpdateState = payload => {
      if (!payload) return;
      if (payload.status === 'installed') {
        setDlState('idle');
        setDlProgress(100);
        setUpdateCfg(null);
        return;
      }
      if (payload.status) setDlState(payload.status);
      if (typeof payload.progress === 'number') setDlProgress(payload.progress);
      if (payload.message) setDlMessage(payload.message);
    };
    return () => {
      window.onApkUpdateState = null;
    };
  }, []);
  useEffect(() => {
    window.__triggerDashboardUpdate = async () => {
      localStorage.removeItem('dash_skipped_ver');
      if (db) {
        try {
          const doc = await db.collection('settings').doc('app_config').get();
          if (doc.exists) {
            const cfg = doc.data() || {};
            const url = String(cfg.dashboardApkUrl || '').trim();
            if (!url) {
              alert('لا يوجد رابط تحديث محفوظ للداشبورد حالياً في الإعدادات.');
              return;
            }
            setDlState('idle');
            setUpdateCfg({
              ...cfg,
              latestDashboardVersion: cfg.latestDashboardVersion || DASHBOARD_VERSION
            });
          }
        } catch (e) {}
      }
    };
    return () => {
      window.__triggerDashboardUpdate = null;
    };
  }, []);
  useEffect(() => {
    if (!db) return;
    const unsub = db.collection('settings').doc('app_config').onSnapshot(doc => {
      if (!doc.exists) return;
      const cfg = doc.data() || {};
      if (cfg.stopUpdate || !window.AndroidApp) {
        setUpdateCfg(null);
        setDlState('idle');
        return;
      }
      let pkgInfo = {};
      try {
        if (window.AndroidApp && typeof window.AndroidApp.getAppPackageInfo === 'function') {
          pkgInfo = JSON.parse(window.AndroidApp.getAppPackageInfo() || '{}') || {};
        }
      } catch (e) {}
      const nativeVer = String(pkgInfo.versionName || '').trim();
      const effectiveDashVer = nativeVer && isDashServerVersionNewer(nativeVer, DASHBOARD_VERSION) ? nativeVer : DASHBOARD_VERSION;
      const dashVer = String(cfg.latestDashboardVersion || '').trim();
      const dashUrl = String(cfg.dashboardApkUrl || '').trim();
      const skipped = localStorage.getItem('dash_skipped_ver');
      if (dashVer && dashUrl && isDashServerVersionNewer(dashVer, effectiveDashVer) && skipped !== dashVer) {
        setUpdateCfg(cfg);
      } else {
        setUpdateCfg(null);
        if (!dashVer || !isDashServerVersionNewer(dashVer, effectiveDashVer)) {
          localStorage.removeItem('dash_skipped_ver');
        }
        setDlState('idle');
      }
    }, () => {});
    return () => unsub();
  }, []);
  if (!updateCfg) return null;
  const targetUrl = normalizeDashApkUrl(updateCfg.dashboardApkUrl || '');
  const isBusy = dlState === 'downloading';
  const isReady = dlState === 'ready' || dlState === 'installing' || dlState === 'permission_needed';
  const isErr = dlState === 'error';
  const startDashUpdate = () => {
    if (!targetUrl) return;
    if (isReady && window.AndroidApp && typeof window.AndroidApp.installDownloadedApk === 'function') {
      window.AndroidApp.installDownloadedApk();
      return;
    }
    setDlState('downloading');
    setDlProgress(8);
    setDlMessage('جاري تحميل تحديث الداشبورد...');
    if (window.AndroidApp && typeof window.AndroidApp.startUpdate === 'function') {
      window.AndroidApp.startUpdate(targetUrl);
    } else {
      window.open(targetUrl, '_blank');
      setDlState('external');
      setDlProgress(100);
      setDlMessage('تم فتح رابط التحميل في المتصفح.');
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 animate-enter",
    style: {
      direction: 'rtl'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white dark:bg-slate-800 w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: `w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${isErr ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: isErr ? 'alert-triangle' : 'download-cloud',
    size: 32
  })), /*#__PURE__*/React.createElement("h3", {
    className: "text-lg font-black text-slate-800 dark:text-white"
  }, "\u062A\u062D\u062F\u064A\u062B \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u062F\u0627\u0634\u0628\u0648\u0631\u062F"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-bold text-slate-500 dark:text-slate-300"
  }, "\u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u0627\u0644\u0645\u062A\u0648\u0641\u0631: v", updateCfg.latestDashboardVersion || DASHBOARD_VERSION, " (\u0627\u0644\u062D\u0627\u0644\u064A: v", DASHBOARD_VERSION, ")"), dlState !== 'idle' && /*#__PURE__*/React.createElement("div", {
    className: `p-3 rounded-xl text-right text-xs font-bold border ${isErr ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between mb-1"
  }, /*#__PURE__*/React.createElement("span", null, dlMessage), dlProgress > 0 && !isErr && /*#__PURE__*/React.createElement("span", {
    className: "dir-ltr"
  }, dlProgress, "%")), !isErr && /*#__PURE__*/React.createElement("div", {
    className: "w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-full bg-indigo-600 rounded-full",
    style: {
      width: `${Math.max(8, dlProgress)}%`
    }
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: startDashUpdate,
    disabled: isBusy,
    className: "w-full py-3.5 rounded-xl bg-indigo-600 text-white font-black text-sm shadow-lg active:scale-95 disabled:opacity-50"
  }, isBusy ? `جاري التحميل (${dlProgress}%)...` : isReady ? 'تثبيت تحديث الداشبورد الآن 📲' : 'تحميل وتثبيت تحديث الداشبورد'), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (window.AndroidApp && typeof window.AndroidApp.openExternalUpdateUrl === 'function') {
        window.AndroidApp.openExternalUpdateUrl(targetUrl);
      } else {
        window.open(targetUrl, '_blank');
      }
    },
    className: "w-full py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold text-xs"
  }, "\u0641\u062A\u062D \u0627\u0644\u0631\u0627\u0628\u0637 \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D \uD83C\uDF10"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (updateCfg.latestDashboardVersion) localStorage.setItem('dash_skipped_ver', String(updateCfg.latestDashboardVersion));
      setUpdateCfg(null);
      setDlState('idle');
    },
    className: "w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs"
  }, "\u0625\u063A\u0644\u0627\u0642")));
};
ReactDOM.createRoot(document.getElementById('root')).render( /*#__PURE__*/React.createElement(App, null));