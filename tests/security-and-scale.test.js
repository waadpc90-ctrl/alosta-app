const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadWindowModule(relPath, extraGlobals = {}) {
    const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    const sandbox = {
        window: {},
        console,
        Date,
        Math,
        Promise,
        setTimeout,
        clearTimeout,
        Uint8Array,
        TextEncoder,
        crypto: globalThis.crypto,
        ...extraGlobals
    };
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;
    vm.runInNewContext(code, sandbox);
    return sandbox.window;
}

test('1. Firestore security rules cover ratings, announcements, worker_telemetry, Dashboard management, and default-deny', () => {
    const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
    assert.ok(rules.includes('match /ratings/{ratingId}'), 'Missing ratings rule');
    assert.ok(rules.includes('match /announcements/{annId}'), 'Missing announcements rule');
    assert.ok(rules.includes('match /worker_telemetry/{workerId}'), 'Missing worker_telemetry rule');
    assert.ok(rules.includes('match /admins/{adminId}'), 'Missing admins rule');
    assert.ok(rules.includes('match /workers/{workerId}'), 'Missing workers rule');
    assert.ok(rules.includes('request.resource.data[field] == null'), 'Numeric guards must tolerate null optional fields');
    assert.ok(rules.includes('allow update, delete: if false;'), 'audit_logs must remain append-only');
    assert.ok(rules.includes('allow read, write: if false;'), 'Missing default-deny fallback');
    const opens = (rules.match(/\{/g) || []).length;
    const closes = (rules.match(/\}/g) || []).length;
    assert.equal(opens, closes, `Unbalanced braces in firestore.rules (${opens} vs ${closes})`);
});

test('2. AlOstaAppConfigBus consolidates multiple subscribers into 1 Firestore listener', () => {
    const win = loadWindowModule('src/modules/security-auth-engine.js');
    assert.ok(win.AlOstaAppConfigBus, 'AlOstaAppConfigBus should be exported on window');

    let firestoreSubscribeCount = 0;
    let firestoreUnsubCount = 0;
    let emitSnapshot = null;

    const fakeDb = {
        collection(name) {
            assert.equal(name, 'settings');
            return {
                doc(id) {
                    assert.equal(id, 'app_config');
                    return {
                        onSnapshot(cb) {
                            firestoreSubscribeCount++;
                            emitSnapshot = cb;
                            return () => { firestoreUnsubCount++; };
                        }
                    };
                }
            };
        }
    };

    const received1 = [];
    const received2 = [];
    const received3 = [];
    const u1 = win.AlOstaAppConfigBus.subscribe(fakeDb, (cfg) => received1.push(cfg));
    const u2 = win.AlOstaAppConfigBus.subscribe(fakeDb, (cfg) => received2.push(cfg));
    const u3 = win.AlOstaAppConfigBus.subscribe(fakeDb, (cfg) => received3.push(cfg));

    assert.equal(firestoreSubscribeCount, 1, 'Expected exactly 1 underlying Firestore listener for 3 subscribers');

    emitSnapshot({ exists: true, data: () => ({ latestVersion: '1.0.17', maintenanceMode: false }) });
    assert.equal(received1.length, 1);
    assert.equal(received2.length, 1);
    assert.equal(received3.length, 1);
    assert.equal(received1[0].latestVersion, '1.0.17');

    // Late subscriber receives cached snapshot immediately
    const received4 = [];
    const u4 = win.AlOstaAppConfigBus.subscribe(fakeDb, (cfg) => received4.push(cfg));
    assert.equal(received4.length, 1);
    assert.equal(received4[0].latestVersion, '1.0.17');
    assert.equal(firestoreSubscribeCount, 1);

    u1(); u2(); u3();
    assert.equal(firestoreUnsubCount, 0, 'Should stay open while 4th subscriber is active');
    u4();
    assert.equal(firestoreUnsubCount, 1, 'Should unsubscribe underlying listener once all subscribers detach');
});

test('3. AlOstaMediaOptimizer decouples images > 16KB into blob://media_ pointers and resolves lazily', async () => {
    const win = loadWindowModule('src/modules/media-blob-optimizer.js');
    const opt = win.AlOstaMediaOptimizer;
    assert.ok(opt, 'AlOstaMediaOptimizer should exist');

    const storedDocs = new Map();
    const fakeDb = {
        collection(name) {
            assert.equal(name, 'media_blobs');
            return {
                doc(id) {
                    return {
                        async set(payload) { storedDocs.set(id, payload); },
                        async get() {
                            return {
                                exists: storedDocs.has(id),
                                data: () => storedDocs.get(id)
                            };
                        }
                    };
                }
            };
        }
    };

    // Small data URI (<= 16KB) stays inline
    const smallImg = 'data:image/jpeg;base64,' + 'A'.repeat(2000);
    const smallUri = await opt.optimizeAndBackupMediaBlob(fakeDb, smallImg, 'store_1');
    assert.equal(smallUri, smallImg);
    assert.equal(opt.isBlobRef(smallUri), false);
    assert.equal(storedDocs.size, 0);

    // Heavy data URI (> 16KB) is decoupled into media_blobs/{blobId}
    const heavyImg = 'data:image/jpeg;base64,' + 'B'.repeat(28000);
    const heavyUri = await opt.optimizeAndBackupMediaBlob(fakeDb, heavyImg, 'store_1');
    assert.ok(heavyUri.startsWith('blob://media_'), `Unexpected pointer: ${heavyUri}`);
    assert.ok(heavyUri.length < 64, 'Pointer URI should be tiny (<64 chars)');
    assert.equal(opt.isBlobRef(heavyUri), true);
    assert.equal(storedDocs.size, 1);

    // Lazy resolution retrieves original data URI (from memory cache and fresh instance from Firestore)
    const resolved = await opt.resolveMediaBlobUrl(heavyUri, fakeDb);
    assert.equal(resolved, heavyImg);

    // Verify cold resolution from Firestore with a fresh optimizer instance (empty memory cache)
    const freshWin = loadWindowModule('src/modules/media-blob-optimizer.js');
    const coldResolved = await freshWin.AlOstaMediaOptimizer.resolveMediaBlobUrl(heavyUri, fakeDb);
    assert.equal(coldResolved, heavyImg);
});

test('4. AlOstaCrypto v3 produces unique random-salted hashes, verifies correctly, and upgrades legacy v2 hashes', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/app-source.jsx'), 'utf8');
    const startIdx = src.indexOf('const AlOstaCrypto = (() => {');
    const endIdx = src.indexOf('})();', startIdx) + 5;
    assert.ok(startIdx > 0 && endIdx > startIdx, 'Could not locate AlOstaCrypto block');
    const cryptoCode = src.slice(startIdx, endIdx) + '\nwindow.AlOstaCrypto = AlOstaCrypto;';

    const DELETE_SENTINEL = { _methodName: 'FieldValue.delete' };
    const sandbox = {
        window: {},
        firebase: {
            firestore: {
                FieldValue: {
                    delete: () => DELETE_SENTINEL
                }
            }
        },
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        TextEncoder,
        Uint8Array,
        Uint32Array,
        crypto: globalThis.crypto,
        Math,
        Date,
        JSON,
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        atob: (s) => Buffer.from(s, 'base64').toString('binary'),
        encodeURIComponent,
        decodeURIComponent,
        unescape,
        escape,
        console
    };
    vm.runInNewContext(cryptoCode, sandbox);
    const C = sandbox.window.AlOstaCrypto;

    const cred1 = C.buildProtectedCredentials('MySecret123!', '07701234567');
    const cred2 = C.buildProtectedCredentials('MySecret123!', '07701234567');
    const credUpgrade = C.buildProtectedCredentials('MySecret123!', '07701234567', true);

    assert.equal(cred1.securityVersion, 3);
    assert.ok(cred1.passwordHash.startsWith('v3$pbkdf2-sha256$'), `Expected v3 hash prefix, got: ${cred1.passwordHash}`);
    assert.notEqual(cred1.passwordHash, cred2.passwordHash, 'Two hashes of the same password MUST use distinct random salts');
    assert.equal('passwordCipher' in cred1, false, 'New account credentials MUST NOT include passwordCipher or FieldValue.delete() for non-merge set()');
    assert.equal(credUpgrade.passwordCipher, DELETE_SENTINEL, 'Update/upgrade credentials MUST scrub legacy passwordCipher via FieldValue.delete()');

    // Verify valid v3 login needs NO upgrade
    const v3Ok = C.verifyPassword('MySecret123!', cred1, '07701234567');
    assert.equal(v3Ok.valid, true);
    assert.equal(v3Ok.needsUpgrade, false);

    // Verify wrong password fails
    const v3Bad = C.verifyPassword('WrongPass999', cred1, '07701234567');
    assert.equal(v3Bad.valid, false);

    // Verify legacy v2 account succeeds AND flags needsUpgrade = true
    const legacyV2Hash = C.hashPassword('LegacyPass456', '07709998877');
    assert.ok(legacyV2Hash.startsWith('v2$sha256$'));
    const v2Check = C.verifyPassword('LegacyPass456', { passwordHash: legacyV2Hash }, '07709998877');
    assert.equal(v2Check.valid, true);
    assert.equal(v2Check.needsUpgrade, true);

    // URL sanitizer allows blob://media_ and blocks javascript:
    assert.equal(C.sanitizeImageUrl('blob://media_1234567890abcdef'), 'blob://media_1234567890abcdef');
    assert.equal(C.sanitizeImageUrl('javascript:alert(1)'), '');
});

test('5. Slim index.html, static pre-compiled Tailwind CSS, Service Worker v1.0.22 Network-First, and synced root PWA files', () => {
    const assetHtml = fs.readFileSync(path.join(ROOT, 'app/src/main/assets/index.html'), 'utf8');
    const rootHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.equal(assetHtml, rootHtml, 'Root index.html must match assets index.html');
    assert.ok(assetHtml.length < 40_000, `index.html should be slim (<40KB), got ${assetHtml.length} bytes`);
    assert.ok(!assetHtml.includes('id="app-jsx-bundle"'), 'Inert 1.1MB JSX bundle must be removed from index.html');
    assert.ok(/const\s+APP_VERSION\s*=\s*"1\.0\.22";/.test(assetHtml), 'Gradle APP_VERSION 1.0.22 marker must exist');
    assert.ok(assetHtml.includes('./vendor/app-tailwind.css?v=v1_0_22'), 'index.html must load pre-compiled app-tailwind.css');
    assert.ok(assetHtml.includes('./vendor/app-compiled.js?v=v1_0_22'), 'index.html must load v1_0_22 app-compiled.js');
    assert.ok(!assetHtml.includes('tailwindcss.js'), 'Runtime tailwindcss.js script must be removed');

    const twCss = fs.readFileSync(path.join(ROOT, 'app/src/main/assets/vendor/app-tailwind.css'), 'utf8');
    assert.ok(twCss.length > 30_000 && twCss.length < 150_000, 'Static Tailwind CSS size sanity check');
    assert.ok(twCss.includes('.dark .dark\\:bg-slate-800'), 'Dark mode classes must be present in static Tailwind CSS');
    assert.ok(!fs.existsSync(path.join(ROOT, 'app/src/main/assets/vendor/tailwindcss.js')), 'Unused runtime tailwindcss.js must be deleted');

    const sw = fs.readFileSync(path.join(ROOT, 'app/src/main/assets/sw.js'), 'utf8');
    const rootSw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    assert.equal(sw, rootSw, 'Root sw.js must match assets sw.js');
    assert.ok(sw.includes('alosta-pwa-v1.0.22'));
    assert.ok(sw.includes('./vendor/app-tailwind.css?v=v1_0_22'));
    assert.ok(sw.includes("url.includes('app-compiled.js')"), 'sw.js must use Network-First for app-compiled.js');
    assert.ok(sw.includes("url.includes('dashboard-compiled.js')"), 'sw.js must use Network-First for dashboard-compiled.js');

    const assetDashHtml = fs.readFileSync(path.join(ROOT, 'app/src/main/assets/dashboard.html'), 'utf8');
    const rootDashHtml = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
    assert.equal(assetDashHtml, rootDashHtml, 'Root dashboard.html must match assets dashboard.html');
    assert.ok(fs.existsSync(path.join(ROOT, 'app/src/main/assets/vendor/dashboard-compiled.js')), 'assets/vendor/dashboard-compiled.js must exist');
    assert.ok(fs.existsSync(path.join(ROOT, 'vendor/dashboard-compiled.js')), 'vendor/dashboard-compiled.js must exist');
});

test('6. Portal server, Kotlin modularization, telemetry isolation, pagination, and worker rating UI are wired', () => {
    // Portal server checks
    const serverSrc = fs.readFileSync(path.join(ROOT, 'portal-server.js'), 'utf8');
    assert.ok(serverSrc.includes("const PORTAL_VERSION = '1.0.22'"), 'portal-server.js must be v1.0.22');
    assert.ok(serverSrc.includes('waadpc90-ctrl.github.io/alosta-app'), 'portal-server.js must point to active alosta-app GitHub Pages repo');
    assert.ok(serverSrc.includes('FIREBASE_ADMIN_TOKEN'), 'portal-server.js must gate Firestore PATCH with admin token');
    assert.ok(!serverSrc.includes("'Access-Control-Allow-Origin': '*'"), 'Wildcard CORS must be removed from portal-server.js');

    // Kotlin modularization checks
    const kotlinDir = path.join(ROOT, 'app/src/main/java/com/example');
    for (const file of ['AlOstaSecurityVault.kt', 'WorkerStepTracker.kt', 'AlOstaLocationManager.kt', 'AlOstaApkUpdater.kt', 'MainActivity.kt']) {
        assert.ok(fs.existsSync(path.join(kotlinDir, file)), `Missing modularized Kotlin file: ${file}`);
    }
    const mainKt = fs.readFileSync(path.join(kotlinDir, 'MainActivity.kt'), 'utf8');
    assert.ok(mainKt.split('\n').length < 1300, 'MainActivity.kt should be slimmed well below 1300 lines');
    assert.ok(mainKt.includes('localDbExecutor.execute'), 'saveLocalDb must run on background executor');
    assert.ok(mainKt.includes('BuildConfig.BUILD_TIMESTAMP_MS'), 'MainActivity must invalidate WebView cache per build timestamp');

    // App source architecture & UX checks
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/app-source.jsx'), 'utf8');
    assert.ok(appSrc.includes('const APP_VERSION = "1.0.22";'));
    assert.ok(appSrc.includes("collection('worker_telemetry')"), 'Worker telemetry must use isolated collection');
    assert.ok(appSrc.includes('storeProductsFetchLimit'), 'Per-store product pagination must be wired');
    assert.ok(appSrc.includes('storesFetchLimit'), 'Stores pagination must be wired');
    assert.ok(appSrc.includes('marketFetchLimit'), 'Labor market pagination must be wired');
    assert.ok(appSrc.includes('ledgerArchiveLoaded'), 'Cloud financial archive toggle must be wired');
    assert.ok(appSrc.includes('setRatingWorker(w)'), 'Worker rating button must exist in workers list');
    assert.ok(appSrc.includes('⭐ {(lW.ratingScore || 0).toFixed(1)}'), 'Worker own rating badge must appear in WorkerApp header');
    assert.ok(appSrc.includes('FieldValue.delete()'), 'Legacy passwordCipher deletion must be wired');
    assert.ok(appSrc.includes('isDeleteFieldSentinel'), 'Smart DB must strip FieldValue.delete() on non-merge set()');
});

test('7. High-Capacity Telemetry (Single-Doc Crew Board + Live Radar Lease + Eco/Turbo Sync) and Paginated Dashboard', () => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/app-source.jsx'), 'utf8');
    const dashSrc = fs.readFileSync(path.join(ROOT, 'src/dashboard-source.jsx'), 'utf8');

    // Contractor reads single packed doc `crew_${adminId}` instead of permanent collection stream
    assert.ok(appSrc.includes('const crewBoardDocId = `crew_${adminId}`;'), 'Crew board single-doc ID must be wired');
    assert.ok(appSrc.includes('activateLiveRadar'), 'On-demand Live Radar lease must exist');
    assert.ok(appSrc.includes('fetchCrewTelemetryOnce'), 'Cached single-doc telemetry fetch must exist');
    assert.ok(!appSrc.includes("db.collection('worker_telemetry').where('adminId', '==', adminId).onSnapshot"), 'Always-on contractor worker_telemetry collection listener must be removed');

    // Worker writes Ultra-Eco/Turbo adaptive telemetry into Crew Board and eliminates periodic attendance polling
    assert.ok(appSrc.includes("syncMode: isTurboWatched ? 'turbo' : 'eco'"), 'Adaptive Eco/Turbo telemetry sync must be wired');
    assert.ok(appSrc.includes('elapsedSinceSync >= 960000'), '16-minute Ultra-Eco heartbeat must stay inside 22-min offline threshold');
    assert.ok(appSrc.includes('const shouldSyncAttendance = Boolean(tA?.id && inBoundsChanged);'), 'Periodic attendance writes during shift must be eliminated');
    assert.ok(appSrc.includes('workerHistoryLimit'), 'Worker historical queries must be paginated');
    assert.ok(appSrc.includes("db.collection('announcements').limit(30)"), 'Announcements listener must be bounded');

    // Dashboard uses tab-scoped paginated listeners + server-side count() aggregation
    assert.ok(dashSrc.includes('refreshCloudCounts'), 'Dashboard server-side count() aggregation must exist');
    assert.ok(dashSrc.includes('dashLimits'), 'Dashboard collection pagination limits must exist');
    assert.ok(dashSrc.includes('loadMoreForCollection'), 'Dashboard load-more control must exist');
    assert.ok(!dashSrc.includes("db.collection('admins').onSnapshot("), 'Unbounded admins listener must be replaced with paginated limit()');
    assert.ok(!dashSrc.includes("db.collection('workers').onSnapshot("), 'Unbounded workers listener must be replaced with paginated limit()');

    // Worker UI must hide steps/effort/energy cards (contractor-only visibility) while preserving background sync & remote reset
    assert.ok(!appSrc.includes('قياس الجهد والنشاط المباشر'), 'Worker UI must not render Live Activity & Effort card');
    assert.ok(!appSrc.includes('setStepMetrics('), 'WorkerApp must not maintain stepMetrics UI state');
    assert.ok(appSrc.includes('remoteResetNonce'), 'WorkerApp must honor contractor remote resetNonce');
    assert.ok(appSrc.includes('setNativeStepSiteBounds'), 'WorkerApp must pause step counting when confirmed outside site');
});


