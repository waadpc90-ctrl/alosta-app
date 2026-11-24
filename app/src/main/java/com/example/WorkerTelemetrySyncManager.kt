package com.example

import android.content.Context
import org.json.JSONObject
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Native background telemetry & effort sync engine.
 *
 * Keeps uploading verified worker steps, trade-calibrated effort score, active work minutes,
 * calories, distance, GPS site-bounds, and device heartbeat directly to Firestore
 * (`worker_telemetry/crew_<adminId>`) via REST PATCH even when:
 * - The worker's phone screen is locked / in Doze mode
 * - The worker switched to another app
 * - The WebView is frozen or the Activity was swiped away from Recents during an active shift
 */
object WorkerTelemetrySyncManager {

    private const val PREFS_NAME = "alosta_telemetry_sync_prefs"
    private const val KEY_ACTIVE = "active"
    private const val KEY_WORKER_ID = "worker_id"
    private const val KEY_ADMIN_ID = "admin_id"
    private const val KEY_ATTENDANCE_ID = "attendance_id"
    private const val KEY_SPECIALTY = "specialty"
    private const val KEY_TIME_IN = "time_in"
    private const val KEY_DATE = "date"
    private const val KEY_FB_PROJECT_ID = "fb_project_id"
    private const val KEY_FB_API_KEY = "fb_api_key"
    private const val KEY_BASE_STEPS = "base_steps"
    private const val KEY_BASE_ACTIVE_MIN = "base_active_min"
    private const val KEY_LAST_SYNCED_STEPS = "last_synced_steps"
    private const val KEY_LAST_SYNCED_ACTIVE_MIN = "last_synced_active_min"
    private const val KEY_LAST_SYNCED_AT = "last_synced_at"
    private const val KEY_LAST_SYNCED_MOTION = "last_synced_motion"
    private const val KEY_LAST_SYNCED_IN_BOUNDS = "last_synced_in_bounds"
    private const val KEY_INITIAL_SYNC_DONE = "initial_sync_done"

    private const val MAX_SHIFT_DURATION_MS = 8L * 3600L * 1000L
    internal const val BG_ACTIVITY_SYNC_INTERVAL_MS = 90_000L
    internal const val BG_HEARTBEAT_INTERVAL_MS = 240_000L // 4 min (safely inside 22-min offline window)
    internal const val STATE_CHANGE_DEBOUNCE_MS = 15_000L

    private val STATIONARY_TRADE_KEYWORDS = listOf(
        "صباغ", "صبغ", "دهان", "جبس", "جبسم", "كهرب", "صحية", "سباك",
        "تكييف", "ألمنيوم", "المينيوم", "ديكور", "ورق جدران", "سقف ثانوي",
        "لحام", "نقاش", "زجاج", "فني", "paint", "electric", "plumb", "gypsum"
    )

    private val syncExecutor = Executors.newSingleThreadExecutor()

    @Volatile
    private var syncInFlight = false

    data class TelemetryConfig(
        val active: Boolean,
        val workerId: String,
        val adminId: String,
        val attendanceId: String,
        val specialty: String,
        val timeIn: Long,
        val date: String,
        val fbProjectId: String,
        val fbApiKey: String,
        val baseSteps: Int,
        val baseActiveMin: Int
    )

    data class CalibratedEffortMetrics(
        val steps: Int,
        val activeMinutes: Int,
        val distanceMeters: Int,
        val calories: Int,
        val effortScore: Int,
        val effortStars: Int,
        val tradeType: String
    )

    private fun todayKey(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    /**
     * Pure biomechanical & trade-calibrated effort engine mirroring `src/modules/worker-activity-engine.js`.
     */
    internal fun computeTradeCalibratedMetrics(
        steps: Int,
        activeMinutes: Int,
        shiftElapsedMinutes: Int,
        specialty: String
    ): CalibratedEffortMetrics {
        val safeSteps = steps.coerceAtLeast(0)
        val rawActiveMin = activeMinutes.coerceIn(0, 720)
        val safeShiftMin = shiftElapsedMinutes.coerceAtLeast(0)
        val safeActiveMin = if (safeShiftMin > 0) min(rawActiveMin, safeShiftMin) else rawActiveMin

        val normSpec = specialty.trim().lowercase(Locale.ROOT)
        val isStationary = STATIONARY_TRADE_KEYWORDS.any { normSpec.contains(it) }
        val tradeType = if (isStationary) "stationary" else "mobile"
        val stepTarget = if (isStationary) 3200.0 else 6000.0
        val activeMinTarget = if (isStationary) 210.0 else 240.0

        val distanceMeters = (safeSteps * 0.74).roundToInt()
        val walkingMinEst = safeSteps / 95.0
        val extraStationaryMin = max(0.0, safeActiveMin - walkingMinEst)
        val kcalPerStep = if (isStationary) 0.042 else 0.046
        val stationaryKcalPerMin = if (isStationary) 2.5 else 2.9
        val calories = (safeSteps * kcalPerStep + extraStationaryMin * stationaryKcalPerMin).roundToInt().coerceAtLeast(0)

        val stepPct = min(100.0, (safeSteps / stepTarget) * 100.0)
        var effortScore = stepPct.roundToInt()
        if (safeActiveMin > 0) {
            val activePct = min(100.0, (safeActiveMin / activeMinTarget) * 100.0)
            val blended = if (isStationary) {
                (stepPct * 0.45 + activePct * 0.55).roundToInt()
            } else {
                (stepPct * 0.70 + activePct * 0.30).roundToInt()
            }
            effortScore = min(100, max(stepPct.roundToInt(), blended))
        }

        val effortStars = when {
            effortScore >= 100 -> 6
            effortScore >= 75 -> 5
            effortScore >= 50 -> 4
            effortScore >= 30 -> 3
            effortScore >= 12 -> 2
            safeSteps > 0 || safeActiveMin > 0 -> 1
            else -> 0
        }

        return CalibratedEffortMetrics(
            steps = safeSteps,
            activeMinutes = safeActiveMin,
            distanceMeters = distanceMeters,
            calories = calories,
            effortScore = effortScore,
            effortStars = effortStars,
            tradeType = tradeType
        )
    }

    /**
     * Builds a Firestore REST v1 PATCH URL targeting ONLY `workers.<workerId>` (plus board metadata)
     * using backtick-escaped field path syntax so other workers in the crew board map are NEVER overwritten.
     */
    internal fun buildCrewBoardPatchUrl(projectId: String, adminId: String, workerId: String): String {
        val docId = URLEncoder.encode("crew_${adminId.trim()}", "UTF-8")
        val safeKey = workerId.trim().replace("`", "")
        val workerFieldPath = URLEncoder.encode("workers.`$safeKey`", "UTF-8")
        return "https://firestore.googleapis.com/v1/projects/${projectId.trim()}/databases/(default)/documents/worker_telemetry/$docId" +
            "?updateMask.fieldPaths=adminId" +
            "&updateMask.fieldPaths=isCrewBoard" +
            "&updateMask.fieldPaths=updatedAt" +
            "&updateMask.fieldPaths=$workerFieldPath"
    }

    /**
     * Pure cadence controller: guarantees instant first heartbeat, fast 90s activity sync & 4-min
     * heartbeat while backgrounded/locked, and zero duplicate writes while foreground JS is running.
     */
    internal fun shouldSyncTelemetry(
        forceSync: Boolean,
        initialSyncDone: Boolean,
        isAppInForeground: Boolean,
        stepDelta: Int,
        activeMinDelta: Int,
        motionStateChanged: Boolean,
        inBoundsChanged: Boolean,
        elapsedSinceSyncMs: Long
    ): Boolean {
        if (forceSync || !initialSyncDone) return true
        if ((inBoundsChanged || motionStateChanged) && elapsedSinceSyncMs >= STATE_CHANGE_DEBOUNCE_MS) {
            return true
        }
        if (!isAppInForeground) {
            if ((stepDelta >= 20 || activeMinDelta >= 1) && elapsedSinceSyncMs >= BG_ACTIVITY_SYNC_INTERVAL_MS) {
                return true
            }
            if (elapsedSinceSyncMs >= BG_HEARTBEAT_INTERVAL_MS) {
                return true
            }
            return false
        }
        // While foreground JS is active, act only as a 4-minute resilience fallback in case WebView WS stalls
        return elapsedSinceSyncMs >= BG_HEARTBEAT_INTERVAL_MS
    }

    @Synchronized
    fun configureFromJson(context: Context, jsonStr: String?) {
        val appCtx = context.applicationContext
        val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (jsonStr.isNullOrBlank()) {
            clearConfig(appCtx)
            return
        }
        try {
            val obj = JSONObject(jsonStr)
            val active = obj.optBoolean("active", false)
            if (!active) {
                clearConfig(appCtx)
                return
            }
            val workerId = obj.optString("workerId", "").trim()
            val attendanceId = obj.optString("attendanceId", "").trim()
            if (workerId.isEmpty()) {
                clearConfig(appCtx)
                return
            }
            val adminId = obj.optString("adminId", "").trim()
            val specialty = obj.optString("specialty", "").trim()
            val timeIn = obj.optLong("timeIn", System.currentTimeMillis()).takeIf { it > 0L }
                ?: System.currentTimeMillis()
            val date = obj.optString("date", "").trim().ifBlank { todayKey() }
            val fbProjectId = obj.optString("fbProjectId", "").trim()
            val fbApiKey = obj.optString("fbApiKey", "").trim()
            val baseSteps = obj.optInt("baseSteps", 0).coerceAtLeast(0)
            val baseActiveMin = obj.optInt("baseActiveMinutes", 0).coerceAtLeast(0)

            val prevAttId = prefs.getString(KEY_ATTENDANCE_ID, "").orEmpty()
            val prevWorkerId = prefs.getString(KEY_WORKER_ID, "").orEmpty()
            val isNewShift = (prevAttId != attendanceId || prevWorkerId != workerId || !prefs.getBoolean(KEY_ACTIVE, false))

            val editor = prefs.edit()
                .putBoolean(KEY_ACTIVE, true)
                .putString(KEY_WORKER_ID, workerId)
                .putString(KEY_ADMIN_ID, adminId)
                .putString(KEY_ATTENDANCE_ID, attendanceId)
                .putString(KEY_SPECIALTY, specialty)
                .putLong(KEY_TIME_IN, timeIn)
                .putString(KEY_DATE, date)
                .putString(KEY_FB_PROJECT_ID, fbProjectId)
                .putString(KEY_FB_API_KEY, fbApiKey)
                .putInt(KEY_BASE_STEPS, max(if (isNewShift) 0 else prefs.getInt(KEY_BASE_STEPS, 0), baseSteps))
                .putInt(KEY_BASE_ACTIVE_MIN, max(if (isNewShift) 0 else prefs.getInt(KEY_BASE_ACTIVE_MIN, 0), baseActiveMin))

            if (isNewShift) {
                editor
                    .putInt(KEY_LAST_SYNCED_STEPS, -1)
                    .putInt(KEY_LAST_SYNCED_ACTIVE_MIN, -1)
                    .putLong(KEY_LAST_SYNCED_AT, 0L)
                    .putString(KEY_LAST_SYNCED_MOTION, "")
                    .putInt(KEY_LAST_SYNCED_IN_BOUNDS, -1)
                    .putBoolean(KEY_INITIAL_SYNC_DONE, false)
            }
            editor.apply()

            if (isNewShift) {
                syncIfDue(appCtx, force = true)
            }
        } catch (_: Exception) {
        }
    }

    @Synchronized
    fun clearConfig(context: Context) {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putBoolean(KEY_ACTIVE, false)
            .putBoolean(KEY_INITIAL_SYNC_DONE, false)
            .apply()
    }

    fun hasActiveShiftForToday(context: Context): Boolean {
        val cfg = loadConfig(context) ?: return false
        if (cfg.date != todayKey()) return false
        val elapsed = System.currentTimeMillis() - cfg.timeIn
        return elapsed in 0L until MAX_SHIFT_DURATION_MS
    }

    fun getActiveShiftWorkerId(context: Context): String {
        val cfg = loadConfig(context) ?: return ""
        if (cfg.date != todayKey()) return ""
        val elapsed = System.currentTimeMillis() - cfg.timeIn
        return if (elapsed in 0L until MAX_SHIFT_DURATION_MS) cfg.workerId else ""
    }

    private fun loadConfig(context: Context): TelemetryConfig? {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ACTIVE, false)) return null
        val workerId = prefs.getString(KEY_WORKER_ID, "").orEmpty().trim()
        if (workerId.isEmpty()) return null
        return TelemetryConfig(
            active = true,
            workerId = workerId,
            adminId = prefs.getString(KEY_ADMIN_ID, "").orEmpty().trim(),
            attendanceId = prefs.getString(KEY_ATTENDANCE_ID, "").orEmpty().trim(),
            specialty = prefs.getString(KEY_SPECIALTY, "").orEmpty().trim(),
            timeIn = prefs.getLong(KEY_TIME_IN, System.currentTimeMillis()),
            date = prefs.getString(KEY_DATE, "").orEmpty().trim().ifBlank { todayKey() },
            fbProjectId = prefs.getString(KEY_FB_PROJECT_ID, "").orEmpty().trim(),
            fbApiKey = prefs.getString(KEY_FB_API_KEY, "").orEmpty().trim(),
            baseSteps = prefs.getInt(KEY_BASE_STEPS, 0).coerceAtLeast(0),
            baseActiveMin = prefs.getInt(KEY_BASE_ACTIVE_MIN, 0).coerceAtLeast(0)
        )
    }

    /**
     * Non-blocking entry point invoked by `WorkerShiftMonitorService` and `MainActivity.onPause`.
     */
    fun syncIfDue(context: Context, force: Boolean = false) {
        val appCtx = context.applicationContext
        if (syncInFlight) return
        val cfg = loadConfig(appCtx) ?: return
        syncInFlight = true
        syncExecutor.execute {
            try {
                // Allow a brief moment for hardware FIFO flush callbacks to land in WorkerStepTracker
                if (force) {
                    try { Thread.sleep(150L) } catch (_: InterruptedException) {}
                }
                performSyncBlocking(appCtx, cfg, force)
            } catch (_: Exception) {
            } finally {
                syncInFlight = false
            }
        }
    }

    /**
     * Layer-2 background resilience tick called by `AlOstaBackgroundNotifierService` (JobScheduler).
     * Even if an aggressive OEM killed the foreground service while the app was closed/locked,
     * this restores sensors, drains the hardware step counter hub, uploads fresh telemetry &
     * heartbeat to Firestore, and revives the foreground monitor when permitted.
     */
    fun runBackgroundRecoveryTick(context: Context) {
        val appCtx = context.applicationContext
        val cfg = loadConfig(appCtx) ?: return
        val today = todayKey()
        if (cfg.date != today) {
            clearConfig(appCtx)
            WorkerStepTracker.setTrackingState(appCtx, false, "")
            return
        }

        // Restore sensor listeners & flush hardware FIFO so accumulated steps are captured
        WorkerStepTracker.restoreActiveShiftIfNeeded(appCtx)
        WorkerStepTracker.flushHardwareSensor(appCtx)
        try { Thread.sleep(220L) } catch (_: InterruptedException) {}
        WorkerStepTracker.flushPendingDiskWrite(appCtx)

        performSyncBlocking(appCtx, cfg, force = true)

        // Revive foreground shift service if still within shift and not running (best-effort on Android 12+)
        if (hasActiveShiftForToday(appCtx) && !WorkerShiftMonitorService.isRunning) {
            WorkerShiftMonitorService.startForWorker(appCtx, cfg.workerId)
        }
    }

    private fun performSyncBlocking(appCtx: Context, cfg: TelemetryConfig, force: Boolean) {
        val nowMs = System.currentTimeMillis()
        val today = todayKey()

        // Date rolled over -> stop stale shift cleanly
        if (cfg.date != today) {
            clearConfig(appCtx)
            WorkerStepTracker.setTrackingState(appCtx, false, "")
            return
        }

        val shiftExpired = cfg.timeIn > 0L && (nowMs - cfg.timeIn) >= MAX_SHIFT_DURATION_MS
        val snapshot = WorkerStepTracker.getSnapshot(appCtx, cfg.workerId)
        val combinedSteps = max(snapshot.steps, cfg.baseSteps)
        val combinedActiveMin = max(snapshot.activeMinutes, cfg.baseActiveMin)
        val shiftElapsedMin = if (cfg.timeIn > 0L && nowMs > cfg.timeIn) {
            min(840, ceil((nowMs - cfg.timeIn) / 60_000.0).toInt())
        } else {
            0
        }

        val eff = computeTradeCalibratedMetrics(
            steps = combinedSteps,
            activeMinutes = combinedActiveMin,
            shiftElapsedMinutes = shiftElapsedMin,
            specialty = cfg.specialty
        )

        val (liveInBounds, liveSiteDist) = WorkerGeofenceMonitor.getLatestSiteBoundsSnapshot(appCtx)
        val effectiveInBounds = liveInBounds ?: snapshot.inSiteBounds
        val motionState = if (shiftExpired) "off_shift" else snapshot.motionState

        val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastSteps = prefs.getInt(KEY_LAST_SYNCED_STEPS, -1)
        val lastActiveMin = prefs.getInt(KEY_LAST_SYNCED_ACTIVE_MIN, -1)
        val lastSyncedAt = prefs.getLong(KEY_LAST_SYNCED_AT, 0L)
        val lastMotion = prefs.getString(KEY_LAST_SYNCED_MOTION, "").orEmpty()
        val lastInBoundsInt = prefs.getInt(KEY_LAST_SYNCED_IN_BOUNDS, -1)
        val initialDone = prefs.getBoolean(KEY_INITIAL_SYNC_DONE, false)

        val stepDelta = if (lastSteps >= 0) kotlin.math.abs(eff.steps - lastSteps) else eff.steps
        val activeMinDelta = if (lastActiveMin >= 0) kotlin.math.abs(eff.activeMinutes - lastActiveMin) else eff.activeMinutes
        val motionChanged = lastMotion.isNotEmpty() && lastMotion != motionState
        val inBoundsInt = if (effectiveInBounds) 1 else 0
        val inBoundsChanged = lastInBoundsInt != -1 && lastInBoundsInt != inBoundsInt
        val elapsedSinceSync = if (lastSyncedAt > 0L) max(0L, nowMs - lastSyncedAt) else Long.MAX_VALUE

        val shouldPush = shiftExpired || shouldSyncTelemetry(
            forceSync = force,
            initialSyncDone = initialDone,
            isAppInForeground = MainActivity.isAppInForeground,
            stepDelta = stepDelta,
            activeMinDelta = activeMinDelta,
            motionStateChanged = motionChanged,
            inBoundsChanged = inBoundsChanged,
            elapsedSinceSyncMs = elapsedSinceSync
        )
        if (!shouldPush) return

        val creds = AlOstaBackgroundNotifier.getFirebaseRestCredentials(
            context = appCtx,
            fallbackProjectId = cfg.fbProjectId,
            fallbackApiKey = cfg.fbApiKey
        ) ?: return
        val (projectId, idToken) = creds

        val packetFields = buildTelemetryPacketFields(
            cfg = cfg,
            eff = eff,
            snapshot = snapshot,
            motionState = motionState,
            sensorConnected = !shiftExpired,
            nowMs = nowMs,
            liveInBounds = effectiveInBounds,
            liveSiteDist = liveSiteDist
        )

        val delivered = if (cfg.adminId.isNotEmpty()) {
            val url = buildCrewBoardPatchUrl(projectId, cfg.adminId, cfg.workerId)
            val body = JSONObject().put(
                "fields",
                JSONObject()
                    .put("adminId", JSONObject().put("stringValue", cfg.adminId))
                    .put("isCrewBoard", JSONObject().put("booleanValue", true))
                    .put("updatedAt", JSONObject().put("integerValue", nowMs.toString()))
                    .put(
                        "workers",
                        JSONObject().put(
                            "mapValue",
                            JSONObject().put(
                                "fields",
                                JSONObject().put(
                                    cfg.workerId,
                                    JSONObject().put(
                                        "mapValue",
                                        JSONObject().put("fields", packetFields)
                                    )
                                )
                            )
                        )
                    )
            ).toString()
            AlOstaBackgroundNotifier.httpRequestJson("PATCH", url, body, idToken)
        } else {
            val encodedWorkerId = URLEncoder.encode(cfg.workerId, "UTF-8")
            val url =
                "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/worker_telemetry/$encodedWorkerId"
            val body = JSONObject().put("fields", packetFields).toString()
            AlOstaBackgroundNotifier.httpRequestJson("PATCH", url, body, idToken)
        }

        if (delivered) {
            prefs.edit()
                .putInt(KEY_LAST_SYNCED_STEPS, eff.steps)
                .putInt(KEY_LAST_SYNCED_ACTIVE_MIN, eff.activeMinutes)
                .putLong(KEY_LAST_SYNCED_AT, nowMs)
                .putString(KEY_LAST_SYNCED_MOTION, motionState)
                .putInt(KEY_LAST_SYNCED_IN_BOUNDS, inBoundsInt)
                .putBoolean(KEY_INITIAL_SYNC_DONE, true)
                .apply()
        }

        // If 8-hour shift auto-expired while app was closed, close attendance cleanly and stop sensors
        if (shiftExpired) {
            if (cfg.attendanceId.isNotEmpty()) {
                try {
                    val encodedAttId = URLEncoder.encode(cfg.attendanceId, "UTF-8")
                    val attUrl =
                        "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/attendance/$encodedAttId" +
                            "?updateMask.fieldPaths=timeOut&updateMask.fieldPaths=outStatus&updateMask.fieldPaths=steps" +
                            "&updateMask.fieldPaths=distanceMeters&updateMask.fieldPaths=calories&updateMask.fieldPaths=effortScore" +
                            "&updateMask.fieldPaths=effortStars&updateMask.fieldPaths=activeMinutes&updateMask.fieldPaths=sensorConnected" +
                            "&updateMask.fieldPaths=motionState&updateMask.fieldPaths=stepEngineV2"
                    val attBody = JSONObject().put(
                        "fields",
                        JSONObject()
                            .put("timeOut", JSONObject().put("integerValue", nowMs.toString()))
                            .put("outStatus", JSONObject().put("stringValue", "valid"))
                            .put("steps", JSONObject().put("integerValue", eff.steps.toString()))
                            .put("distanceMeters", JSONObject().put("integerValue", eff.distanceMeters.toString()))
                            .put("calories", JSONObject().put("integerValue", eff.calories.toString()))
                            .put("effortScore", JSONObject().put("integerValue", eff.effortScore.toString()))
                            .put("effortStars", JSONObject().put("integerValue", eff.effortStars.toString()))
                            .put("activeMinutes", JSONObject().put("integerValue", eff.activeMinutes.toString()))
                            .put("sensorConnected", JSONObject().put("booleanValue", false))
                            .put("motionState", JSONObject().put("stringValue", "off_shift"))
                            .put("stepEngineV2", JSONObject().put("booleanValue", true))
                    ).toString()
                    AlOstaBackgroundNotifier.httpRequestJson("PATCH", attUrl, attBody, idToken)
                } catch (_: Exception) {
                }
            }
            clearConfig(appCtx)
            WorkerStepTracker.setTrackingState(appCtx, false, "")
        }
    }

    internal fun buildTelemetryPacketFields(
        cfg: TelemetryConfig,
        eff: CalibratedEffortMetrics,
        snapshot: WorkerStepTracker.StepSnapshot,
        motionState: String,
        sensorConnected: Boolean,
        nowMs: Long,
        liveInBounds: Boolean,
        liveSiteDist: Int?
    ): JSONObject {
        val fields = JSONObject()
            .put("workerId", JSONObject().put("stringValue", cfg.workerId))
            .put("adminId", JSONObject().put("stringValue", cfg.adminId))
            .put("todaySteps", JSONObject().put("integerValue", eff.steps.toString()))
            .put("todayDistanceMeters", JSONObject().put("integerValue", eff.distanceMeters.toString()))
            .put("todayCalories", JSONObject().put("integerValue", eff.calories.toString()))
            .put("todayEffortScore", JSONObject().put("integerValue", eff.effortScore.toString()))
            .put("todayEffortStars", JSONObject().put("integerValue", eff.effortStars.toString()))
            .put("todayActiveMinutes", JSONObject().put("integerValue", eff.activeMinutes.toString()))
            .put("todayRecentSteps10m", JSONObject().put("integerValue", snapshot.recentSteps10m.toString()))
            .put("todayEffortDate", JSONObject().put("stringValue", cfg.date))
            .put("todayStepEngineV2", JSONObject().put("booleanValue", true))
            .put("sensorConnected", JSONObject().put("booleanValue", sensorConnected))
            .put("sensorUpdatedAt", JSONObject().put("integerValue", nowMs.toString()))
            .put("lastHeartbeatAt", JSONObject().put("integerValue", nowMs.toString()))
            .put("lastStepAt", JSONObject().put("integerValue", snapshot.lastStepAt.toString()))
            .put("lastMotionAt", JSONObject().put("integerValue", snapshot.lastMotionAt.toString()))
            .put("motionState", JSONObject().put("stringValue", motionState))
            .put("syncMode", JSONObject().put("stringValue", "native_bg"))
            .put("liveInBounds", JSONObject().put("booleanValue", liveInBounds))
        if (liveSiteDist != null && liveSiteDist >= 0) {
            fields.put("liveSiteDist", JSONObject().put("integerValue", liveSiteDist.toString()))
        }
        return fields
    }
}
