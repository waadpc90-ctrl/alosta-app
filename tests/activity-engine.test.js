const test = require('node:test');
const assert = require('node:assert/strict');
const ActivityEngine = require('../src/modules/worker-activity-engine.js');

test('Trade-calibrated effort gives fair score to stationary craft workers (painter/gypsum/electrician)', () => {
    // Painter working on ladder: 1,600 steps + 180 active work minutes
    const painterEff = ActivityEngine.computeEffortMetrics({
        steps: 1600,
        activeMinutes: 180,
        specialty: 'صباغ',
        lang: 'ar'
    });
    assert.equal(painterEff.tradeType, 'stationary');
    assert.equal(painterEff.stepTarget, 3200);
    // 50% step score * 0.45 + 85.7% active min score * 0.55 ≈ 70%
    assert.ok(painterEff.effortScore >= 65 && painterEff.effortScore <= 75, `Unexpected score: ${painterEff.effortScore}`);
    assert.ok(painterEff.effortStars >= 4);

    // General laborer (mobile trade): 6,000 steps -> 100% / 6 stars
    const laborerEff = ActivityEngine.computeEffortMetrics({
        steps: 6000,
        activeMinutes: 200,
        specialty: 'عامل عادي',
        lang: 'ar'
    });
    assert.equal(laborerEff.tradeType, 'mobile');
    assert.equal(laborerEff.effortScore, 100);
    assert.equal(laborerEff.effortStars, 6);
});

test('4-state live worker status accurately distinguishes active, idle, out_of_site, offline, and off_shift', () => {
    const today = '2026-11-20';
    const now = new Date('2026-11-20T10:00:00Z').getTime();
    const shiftStart = now - 60 * 60 * 1000; // 1 hour ago

    // 1. Active working on site (fresh heartbeat + fresh motion + inBounds)
    const active = ActivityEngine.classifyWorkerLiveStatus({
        worker: {
            id: 'w1',
            todayEffortDate: today,
            lastHeartbeatAt: now - 2 * 60 * 1000,
            lastMotionAt: now - 1 * 60 * 1000,
            todayRecentSteps10m: 45,
            liveInBounds: true
        },
        todayRec: { workerId: 'w1', date: today, status: 'full', timeIn: shiftStart },
        nowMs: now,
        todayDate: today,
        lang: 'ar'
    });
    assert.equal(active.code, 'active');
    assert.equal(active.idleMinutes, 0);

    // 2. Idle / stopped moving (fresh heartbeat + inBounds, but lastMotionAt 22 min ago)
    const idle = ActivityEngine.classifyWorkerLiveStatus({
        worker: {
            id: 'w2',
            todayEffortDate: today,
            lastHeartbeatAt: now - 2 * 60 * 1000,
            lastMotionAt: now - 22 * 60 * 1000,
            liveInBounds: true
        },
        todayRec: { workerId: 'w2', date: today, status: 'full', timeIn: shiftStart },
        nowMs: now,
        todayDate: today,
        lang: 'ar'
    });
    assert.equal(idle.code, 'idle');
    assert.equal(idle.idleMinutes, 22);

    // 3. Out of site geofence (fresh heartbeat, liveInBounds === false)
    const outOfSite = ActivityEngine.classifyWorkerLiveStatus({
        worker: {
            id: 'w3',
            todayEffortDate: today,
            lastHeartbeatAt: now - 1 * 60 * 1000,
            lastMotionAt: now - 1 * 60 * 1000,
            liveInBounds: false,
            liveSiteDist: 340
        },
        todayRec: { workerId: 'w3', date: today, status: 'full', timeIn: shiftStart },
        nowMs: now,
        todayDate: today,
        lang: 'ar'
    });
    assert.equal(outOfSite.code, 'out_of_site');
    assert.ok(outOfSite.title.includes('340'));

    // 4. Offline (heartbeat stale > 22 minutes — aligned with 16-min Ultra-Eco heartbeat)
    const offline = ActivityEngine.classifyWorkerLiveStatus({
        worker: {
            id: 'w4',
            todayEffortDate: today,
            lastHeartbeatAt: now - 26 * 60 * 1000,
            lastMotionAt: now - 26 * 60 * 1000,
            liveInBounds: true
        },
        todayRec: { workerId: 'w4', date: today, status: 'full', timeIn: shiftStart },
        nowMs: now,
        todayDate: today,
        lang: 'ar'
    });
    assert.equal(offline.code, 'offline');
    assert.equal(offline.offlineMinutes, 26);

    // 5. Off shift (clocked out)
    const offShift = ActivityEngine.classifyWorkerLiveStatus({
        worker: { id: 'w5', todayEffortDate: today, lastHeartbeatAt: now },
        todayRec: { workerId: 'w5', date: today, status: 'full', timeIn: shiftStart, timeOut: now - 5 * 60 * 1000 },
        nowMs: now,
        todayDate: today,
        lang: 'ar'
    });
    assert.equal(offShift.code, 'off_shift');
});

test('summarizeCrewActivity aggregates live crew statuses accurately', () => {
    const today = '2026-11-20';
    const now = new Date('2026-11-20T10:00:00Z').getTime();
    const shiftStart = now - 60 * 60 * 1000;
    const workers = [
        { id: 'w1', todayEffortDate: today, lastHeartbeatAt: now - 60000, lastMotionAt: now - 60000, liveInBounds: true },
        { id: 'w2', todayEffortDate: today, lastHeartbeatAt: now - 60000, lastMotionAt: now - 15 * 60000, liveInBounds: true },
        { id: 'w3', todayEffortDate: today, lastHeartbeatAt: now - 60000, lastMotionAt: now - 60000, liveInBounds: false },
        { id: 'w4', todayEffortDate: today, lastHeartbeatAt: now - 28 * 60000, lastMotionAt: now - 28 * 60000, liveInBounds: true },
        { id: 'w5', todayEffortDate: today }
    ];
    const atts = [
        { workerId: 'w1', date: today, status: 'full', timeIn: shiftStart },
        { workerId: 'w2', date: today, status: 'full', timeIn: shiftStart },
        { workerId: 'w3', date: today, status: 'full', timeIn: shiftStart },
        { workerId: 'w4', date: today, status: 'full', timeIn: shiftStart }
    ];
    const summary = ActivityEngine.summarizeCrewActivity(workers, atts, now, today, 'ar');
    assert.deepEqual(summary, {
        active: 1,
        idle: 1,
        outOfSite: 1,
        offline: 1,
        offShift: 1,
        onShiftTotal: 4
    });
});
