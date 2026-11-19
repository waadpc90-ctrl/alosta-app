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
     * Builds O(1) lookup maps once per data change so project calculations don't re-scan arrays repeatedly.
     */
    const buildIndexedLedger = (data, resolveOwnerFn, getWageFn, calcWageFn) => {
        const projects = Array.isArray(data?.projects) ? data.projects : [];
        const workers = Array.isArray(data?.workers) ? data.workers : [];
        const payments = Array.isArray(data?.payments) ? data.payments : [];
        const expenses = Array.isArray(data?.expenses) ? data.expenses : [];
        const advances = Array.isArray(data?.advances) ? data.advances : [];
        const attendance = Array.isArray(data?.attendance) ? data.attendance : [];

        const workerMap = new Map();
        for (let i = 0; i < workers.length; i++) {
            const w = workers[i];
            if (w && w.id) workerMap.set(w.id, w);
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
            if (x) pushToMap(expByProj, x.projectId, x);
        }
        for (let i = 0; i < advances.length; i++) {
            const x = advances[i];
            if (x) pushToMap(advByProj, x.projectId, x);
        }
        for (let i = 0; i < attendance.length; i++) {
            const a = attendance[i];
            if (!a) continue;
            const ownerProjId = typeof resolveOwnerFn === 'function' ? resolveOwnerFn(a, projects) : a.projectId;
            if (ownerProjId) pushToMap(attByProj, ownerProjId, a);
        }

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

            // Build Monthly Breakdown Index for instant month filtering & archiving
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
