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
