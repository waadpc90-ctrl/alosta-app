const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadModulesIntoSandbox() {
    const storage = new Map();
    const sandbox = {
        window: null,
        globalThis: null,
        navigator: { userAgent: 'TestRunner/1.0', language: 'ar', onLine: true },
        screen: { width: 1080, height: 2400 },
        btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
        localStorage: {
            getItem: (k) => (storage.has(k) ? storage.get(k) : null),
            setItem: (k, v) => storage.set(k, String(v)),
            removeItem: (k) => storage.delete(k)
        },
        Date,
        Math,
        Number,
        String,
        Boolean,
        Array,
        Object,
        Map,
        Set,
        JSON,
        Promise,
        console
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const ctx = vm.createContext(sandbox);

    const files = [
        'src/modules/security-auth-engine.js',
        'src/modules/financial-index-archiver.js',
        'src/modules/media-blob-optimizer.js',
        'src/modules/indexeddb-vault.js'
    ];
    for (const f of files) {
        vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
    }
    return sandbox;
}

function computeMonotonicVersionCode(versionName) {
    const parts = String(versionName).split('.').map(n => parseInt(n, 10) || 0);
    return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
}

test('Financial Engine: O(1) project & worker stats accuracy', () => {
    const sb = loadModulesIntoSandbox();
    const engine = sb.AlOstaLedgerEngine;
    assert.ok(engine, 'AlOstaLedgerEngine should be loaded');

    const projects = [{ id: 'p1', title: 'مشروع الفيلا', amount: 10000000 }];
    const workers = [
        { id: 'w1', name: 'أحمد', wage: 50000 },
        { id: 'w2', name: 'علي', wage: 40000 }
    ];
    const payments = [
        { id: 'pay1', projectId: 'p1', amount: 4000000 },
        { id: 'pay2', projectId: 'p1', amount: 2000000 }
    ];
    const expenses = [
        { id: 'e1', projectId: 'p1', cost: 500000, fundingMode: 'cash', settled: true },
        { id: 'e2', projectId: 'p1', cost: 300000, fundingMode: 'credit', settled: false },
        { id: 'e3', projectId: 'p1', cost: 200000, fundingMode: 'personal', settled: false },
        { id: 'e4', projectId: 'p1', cost: 100000, fundingMode: 'worker', paidByWorkerId: 'w1', settled: false }
    ];
    const attendance = [
        { id: 'a1', projectId: 'p1', workerId: 'w1', status: 'full', settled: false },
        { id: 'a2', projectId: 'p1', workerId: 'w1', status: 'half', settled: false },
        { id: 'a3', projectId: 'p1', workerId: 'w1', status: 'overtime', settled: false },
        { id: 'a4', projectId: 'p1', workerId: 'w2', status: 'absent', settled: false }
    ];
    const advances = [
        { id: 'adv1', projectId: 'p1', workerId: 'w1', amount: 50000, settled: false }
    ];

    const calcWage = (status, wage) => {
        if (status === 'full') return wage;
        if (status === 'half') return wage * 0.5;
        if (status === 'overtime') return wage * 1.5;
        return 0;
    };

    const getWage = (w) => w.wage;
    const resolveOwner = (a) => a.projectId;
    const ledger = engine.buildIndexedLedger(
        { projects, workers, payments, expenses, attendance, advances },
        resolveOwner,
        getWage,
        calcWage
    );

    const p1 = ledger.computeForProject('p1');
    assert.equal(p1.contract, 10000000, 'Contract should be 10,000,000');
    assert.equal(p1.inAmt, 6000000, 'Total income should be 6,000,000');
    assert.equal(p1.matCost, 1100000, 'Total material expenses should be 1,100,000');
    assert.equal(p1.unsettledCreditMat, 300000, 'Unpaid credit should be 300,000');
    assert.equal(p1.explicitPersonalMat, 200000, 'Unpaid personal should be 200,000');
    assert.equal(p1.unsettledWorkerMat, 100000, 'Worker material credit should be 100,000');
    assert.equal(p1.wageCost, 150000, 'Wages (50k + 25k + 75k) should be 150,000');
    assert.equal(p1.advCost, 50000, 'Advances should be 50,000');
    assert.equal(p1.totalCost, 1250000, 'Total cost = matCost + wageCost');
    assert.equal(p1.profit, 10000000 - 1250000, 'Profit = contract - totalCost');

    const w1 = ledger.getWorkerStats('w1');
    assert.equal(w1.activeDays, 3, 'Worker 1 active days should be 3');
    assert.equal(w1.wageEarned, 150000, 'Worker 1 wage earned should be 150,000');
    assert.equal(w1.workerMatCredit, 100000, 'Worker 1 material credit should be 100,000');
    assert.equal(w1.advances, 50000, 'Worker 1 advances should be 50,000');
    assert.equal(w1.currentDue, 200000, 'Worker 1 net due = 150k + 100k - 50k = 200,000');

    const w2 = ledger.getWorkerStats('w2');
    assert.equal(w2.activeDays, 0, 'Worker 2 absent day should not count as active');
    assert.equal(w2.currentDue, 0, 'Worker 2 current due should be 0');
});

test('Security Guard: Exponential brute-force lockout & reset', () => {
    const sb = loadModulesIntoSandbox();
    const guard = sb.AlOstaSecurityGuard;
    guard.resetLoginAttempts();

    for (let i = 1; i <= 4; i++) {
        const st = guard.recordFailedLoginAttempt();
        assert.equal(st.count, i);
        assert.equal(st.lockUntil, 0);
    }
    const fifth = guard.recordFailedLoginAttempt();
    assert.equal(fifth.count, 5);
    assert.ok(fifth.lockUntil > Date.now(), '5th failed attempt must enforce lockout');

    const reset = guard.resetLoginAttempts();
    assert.equal(reset.count, 0);
    assert.equal(reset.lockUntil, 0);
});

test('Monotonic versionCode never regresses across minor/major bumps', () => {
    const v14 = 14;
    const v15 = computeMonotonicVersionCode('1.0.15');
    const v99 = computeMonotonicVersionCode('1.0.99');
    const v110 = computeMonotonicVersionCode('1.1.0');
    const v200 = computeMonotonicVersionCode('2.0.0');

    assert.equal(v15, 10015);
    assert.ok(v15 > v14, '1.0.15 versionCode must exceed legacy 14');
    assert.ok(v99 > v15);
    assert.ok(v110 > v99, '1.1.0 must exceed 1.0.99');
    assert.ok(v200 > v110, '2.0.0 must exceed 1.1.0');
});
