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
            const accBuffer = Math.min(Math.max(0, acc), 45);
            const effectiveDist = Math.max(0, rawDist - accBuffer);
            const inBounds = effectiveDist <= radius;
            const isAssigned = Boolean(workerId && Array.isArray(p.workerIds) && p.workerIds.includes(workerId));
            const entry = { project: p, coords: pCoords, radius, rawDist, effectiveDist, inBounds, isAssigned };
            evaluated.push(entry);
            result.byId[p.id] = entry;
        }

        if (evaluated.length === 0) return result;

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
