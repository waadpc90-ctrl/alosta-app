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

test('Biomechanical MET energy, shift-duration cap on activeMinutes, and distance formatting are accurate', () => {
    // 1. Shift-duration physiological cap prevents activeMinutes from exceeding actual elapsed shift time
    const capped = ActivityEngine.computeEffortMetrics({
        steps: 800,
        activeMinutes: 180, // inflated / erroneous value
        shiftElapsedMinutes: 30, // worker only on shift for 30 minutes
        specialty: 'صباغ',
        lang: 'ar'
    });
    assert.equal(capped.activeMinutes, 30, 'activeMinutes must be capped by shiftElapsedMinutes');
    assert.equal(capped.distanceMeters, 592);
    assert.equal(capped.distanceText, '592 م');
    assert.ok(capped.calories > 50 && capped.calories < 130, `Expected realistic 30m calories, got ${capped.calories}`);
    assert.equal(capped.energyText, `${capped.calories} سعرة`);

    // 2. Painter working 3 hours (1,600 steps + 180 active min) burns realistic MET active calories (~450-500 kcal)
    const painter = ActivityEngine.computeEffortMetrics({
        steps: 1600,
        activeMinutes: 180,
        shiftElapsedMinutes: 240,
        specialty: 'صباغ',
        lang: 'ar'
    });
    assert.ok(painter.calories >= 440 && painter.calories <= 520, `Unexpected painter calories: ${painter.calories}`);
    assert.equal(painter.distanceText, '1.18 كم');

    // 3. Heavy mobile laborer (6,000 steps + 200 active min) burns higher MET active calories (~650-710 kcal)
    const laborer = ActivityEngine.computeEffortMetrics({
        steps: 6000,
        activeMinutes: 200,
        shiftElapsedMinutes: 300,
        specialty: 'عامل عادي',
        lang: 'ar'
    });
    assert.ok(laborer.calories >= 640 && laborer.calories <= 720, `Unexpected laborer calories: ${laborer.calories}`);
    assert.equal(laborer.distanceText, '4.44 كم');

    // 4. Zero activity always yields 0 kcal and 0% effort
    const zero = ActivityEngine.computeEffortMetrics({ steps: 0, activeMinutes: 0, specialty: 'كهربائي', lang: 'ar' });
    assert.equal(zero.calories, 0);
    assert.equal(zero.effortScore, 0);
    assert.equal(zero.effortStars, 0);

    // 5. Shift elapsed minute calculator handles open and closed shifts cleanly
    const t0 = 1_700_000_000_000;
    assert.equal(ActivityEngine.computeShiftElapsedMinutes({ timeIn: t0 }, t0 + 45 * 60_000), 45);
    assert.equal(ActivityEngine.computeShiftElapsedMinutes({ timeIn: t0, timeOut: t0 + 120 * 60_000 }, t0 + 300 * 60_000), 120);
});

test('matchWorkerAcrossProjects detects newly added project site and prioritizes assigned sites', () => {
    const projects = [
        { id: 'proj_old', title: 'مشروع المنصور', location: '33.31520, 44.36610', radius: 150, workerIds: ['w1'] },
        { id: 'proj_new', title: 'مشروع الكرادة الجديد', location: '33.29800, 44.42200', radius: 150, workerIds: ['w1'] },
        { id: 'proj_other', title: 'مشروع غير مسند', location: '33.29805, 44.42205', radius: 150, workerIds: ['w99'] }
    ];

    // 1. Worker is physically standing at the newly added project (proj_new) while old project was preferred
    const atNewSite = ActivityEngine.matchWorkerAcrossProjects(
        { lat: 33.29802, lng: 44.42202, acc: 12 },
        projects,
        { workerId: 'w1', preferredProjectId: 'proj_old' }
    );
    assert.ok(atNewSite.matched, 'Worker must match a project site');
    assert.equal(atNewSite.matched.project.id, 'proj_new', 'Must select newly added assigned site over unassigned overlap & far old site');
    assert.equal(atNewSite.byId['proj_old'].inBounds, false);
    assert.equal(atNewSite.byId['proj_new'].inBounds, true);

    // 2. Worker is outside ALL sites -> matched is null, nearest returns closest project
    const farAway = ActivityEngine.matchWorkerAcrossProjects(
        { lat: 33.35000, lng: 44.36610, acc: 15 },
        projects,
        { workerId: 'w1', preferredProjectId: 'proj_new' }
    );
    assert.equal(farAway.matched, null);
    assert.equal(farAway.nearest.project.id, 'proj_old', 'Nearest site should be proj_old');

    // 3. Daily wage attribution routes to GPS-matched site even if legacy/manual projectId pointed to old site
    const billedToNew = ActivityEngine.resolveAttendanceProjectByLocation(
        { workerId: 'w1', projectId: 'proj_old', inLoc: { lat: 33.29802, lng: 44.42202, acc: 10 } },
        projects
    );
    assert.equal(billedToNew, 'proj_new', 'Worker daily wage must go to the project site where worker physically clocked in');

    // 4. Unscoped attendance with GPS routes to exact physical site
    const unscopedGps = ActivityEngine.resolveAttendanceProjectByLocation(
        { workerId: 'w1', inLoc: { lat: 33.31521, lng: 44.36611, acc: 12 } },
        projects
    );
    assert.equal(unscopedGps, 'proj_old');

    // 5. Manual attendance with no GPS keeps explicit projectId
    const manualNoGps = ActivityEngine.resolveAttendanceProjectByLocation(
        { workerId: 'w1', projectId: 'proj_new' },
        projects
    );
    assert.equal(manualNoGps, 'proj_new');
});


