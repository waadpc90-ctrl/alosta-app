package com.example

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

object WorkerStepTracker : SensorEventListener {
    private const val PREF_FILE = "al_osta_step_prefs_v2"
    private const val KEY_GLOBAL_TRACKING = "global_active_tracking"
    private const val KEY_GLOBAL_WORKER_ID = "global_active_worker_id"
    private const val KEY_GLOBAL_SHIFT_DATE = "global_active_shift_date"
    private const val IDLE_THRESHOLD_MS = 10 * 60 * 1000L
    private const val ACTIVE_WORK_MIN_SECONDS_REQUIRED = 12
    private const val ACTIVE_WORK_MIN_STEPS_REQUIRED = 10
    private const val MAX_PLAUSIBLE_STEPS_PER_SEC = 3.6
    private const val MAX_SINGLE_GAP_RECOVERY_STEPS = 2500

    data class StepSnapshot(
        val workerId: String,
        val date: String,
        val steps: Int,
        val activeMinutes: Int,
        val lastStepAt: Long,
        val lastMotionAt: Long,
        val recentSteps10m: Int,
        val recentMotionMin10m: Int,
        val idleMinutes: Int,
        val motionState: String,
        val sensorSource: String,
        val sensorActive: Boolean,
        val foregroundServiceActive: Boolean,
        val permissionGranted: Boolean,
        val inSiteBounds: Boolean
    )

    private var isRegistered = false
    private var appContext: Context? = null
    private var hasStepCounterSensor = false
    private var hasStepDetectorSensor = false
    @Volatile
    private var trackingEnabled = false
    @Volatile
    private var activeWorkerId: String = ""
    @Volatile
    private var inSiteBounds: Boolean = true
    @Volatile
    private var rebaselineNeeded = true

    // Timestamps to coordinate hardware sensors vs accelerometer fallback without double counting
    private var lastStepCounterEventMs = 0L
    private var lastHardwareStepMs = 0L
    private var lastAccelTimestampMs = 0L

    // In-memory live cache to avoid hammering SharedPreferences flash storage on every sensor tick
    @Volatile
    private var cachedWorkerDayKey: String = ""
    @Volatile
    private var cachedStepsKey: String = ""
    @Volatile
    private var cachedDailySteps: Int = -1
    @Volatile
    private var cachedActiveMinutes: Int = 0
    @Volatile
    private var cachedLastActiveBucket: Long = -1L
    @Volatile
    private var cachedLastStepAtMs: Long = 0L
    @Volatile
    private var cachedLastMotionAtMs: Long = 0L
    @Volatile
    private var lastDiskFlushMs: Long = 0L
    @Volatile
    private var dirtyStepsPending: Boolean = false

    // Rolling 10-minute telemetry buckets (minuteEpoch -> step count / motion presence)
    private val recentStepBuckets = LinkedHashMap<Long, Int>()
    private val recentMotionBuckets = LinkedHashSet<Long>()

    // Per-minute sustained manual work accumulator (prevents brief phone pickups from counting as a full active minute)
    private var workMinuteEpoch = -1L
    private var workMinuteCredited = false
    private var workMinuteSteps = 0
    private var workMinuteActiveSeconds = 0
    private var currentSecondEpoch = -1L
    private var currentSecondImpulses = 0
    private var recentMotionWindowStartMs = 0L
    private var recentMotionActiveSecCount = 0

    // Time-constant-normalized low-pass gravity & multi-step cadence state for accelerometer / detector
    private var gravityEstimate = 9.81f
    private var awaitingTrough = false
    private var lastPeakTimestampMs = 0L
    private var lastAccelStepTimestampMs = 0L
    private var lastDetectorStepTimestampMs = 0L
    private var consecutiveDetectorSteps = 0
    private var consecutiveRhythmicSteps = 0
    private var isWalkingConfirmed = false

    private fun todayKey(): String {
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    }

    private fun workerDayId(today: String, workerId: String): String {
        val safeId = workerId.ifBlank { "default" }
        return "${today}_$safeId"
    }

    private fun workerStepsKey(today: String, workerId: String): String {
        return "steps_${workerDayId(today, workerId)}"
    }

    private fun workerBaselineKey(today: String, workerId: String): String {
        return "baseline_${workerDayId(today, workerId)}"
    }

    private fun workerBaselineTimeKey(today: String, workerId: String): String {
        return "baseline_ms_${workerDayId(today, workerId)}"
    }

    private fun workerShiftActiveKey(today: String, workerId: String): String {
        return "shift_active_${workerDayId(today, workerId)}"
    }

    private fun workerActiveMinKey(today: String, workerId: String): String {
        return "active_min_${workerDayId(today, workerId)}"
    }

    private fun workerActiveBucketKey(today: String, workerId: String): String {
        return "active_bucket_${workerDayId(today, workerId)}"
    }

    private fun workerLastStepKey(today: String, workerId: String): String {
        return "last_step_ms_${workerDayId(today, workerId)}"
    }

    private fun workerLastMotionKey(today: String, workerId: String): String {
        return "last_motion_ms_${workerDayId(today, workerId)}"
    }

    /**
     * Pure biomechanical helper shared by native metrics and JVM unit tests.
     * Uses MET-based active expenditure (walking + non-overlapping manual site work).
     */
    fun computeNativeEnergyKcal(steps: Int, activeMinutes: Int): Int {
        val safeSteps = steps.coerceAtLeast(0)
        val safeActiveMin = activeMinutes.coerceIn(0, 720)
        val walkingMinEst = safeSteps / 95.0
        val extraStationaryMin = (safeActiveMin - walkingMinEst).coerceAtLeast(0.0)
        return (safeSteps * 0.044 + extraStationaryMin * 2.6).roundToInt().coerceAtLeast(0)
    }

    /**
     * Pure physiological plausibility guard for hardware step counter deltas across background gaps.
     */
    fun isPlausibleStepDelta(deltaSteps: Int, elapsedMs: Long): Boolean {
        if (deltaSteps <= 0 || deltaSteps > MAX_SINGLE_GAP_RECOVERY_STEPS) return false
        if (elapsedMs <= 0L) return deltaSteps <= 40
        val elapsedSec = (elapsedMs / 1000.0).coerceAtLeast(1.0)
        // Allow short sensor batching jitter (+20 steps) plus realistic max fast walking cadence
        val maxAllowed = (elapsedSec * MAX_PLAUSIBLE_STEPS_PER_SEC + 20.0).roundToInt()
        return deltaSteps <= maxAllowed
    }

    private fun ensureCacheLoaded(prefs: android.content.SharedPreferences, today: String, workerId: String) {
        val dayKey = workerDayId(today, workerId)
        val stepsKey = workerStepsKey(today, workerId)
        if (cachedWorkerDayKey != dayKey || cachedStepsKey != stepsKey || cachedDailySteps < 0) {
            cachedWorkerDayKey = dayKey
            cachedStepsKey = stepsKey
            cachedDailySteps = prefs.getInt(stepsKey, 0).coerceAtLeast(0)
            cachedActiveMinutes = prefs.getInt(workerActiveMinKey(today, workerId), 0).coerceAtLeast(0)
            cachedLastActiveBucket = prefs.getLong(workerActiveBucketKey(today, workerId), -1L)
            cachedLastStepAtMs = prefs.getLong(workerLastStepKey(today, workerId), 0L).coerceAtLeast(0L)
            cachedLastMotionAtMs = prefs.getLong(workerLastMotionKey(today, workerId), 0L).coerceAtLeast(0L)
            dirtyStepsPending = false
            recentStepBuckets.clear()
            recentMotionBuckets.clear()
            workMinuteEpoch = cachedLastActiveBucket
            workMinuteCredited = cachedLastActiveBucket >= 0L
            workMinuteSteps = 0
            workMinuteActiveSeconds = 0
        }
    }

    private fun readLiveSteps(prefs: android.content.SharedPreferences, today: String, workerId: String): Int {
        ensureCacheLoaded(prefs, today, workerId)
        return cachedDailySteps
    }

    private fun pruneRollingBuckets(currentMinuteBucket: Long) {
        val cutoff = currentMinuteBucket - 9L
        val stepIter = recentStepBuckets.entries.iterator()
        while (stepIter.hasNext()) {
            if (stepIter.next().key < cutoff) stepIter.remove()
        }
        val motionIter = recentMotionBuckets.iterator()
        while (motionIter.hasNext()) {
            if (motionIter.next() < cutoff) motionIter.remove()
        }
    }

    private fun flushToPrefsIfDue(
        prefs: android.content.SharedPreferences,
        today: String,
        workerId: String,
        nowMs: Long,
        forceFlush: Boolean = false
    ) {
        dirtyStepsPending = true
        if (forceFlush || (nowMs - lastDiskFlushMs) >= 2500L) {
            prefs.edit()
                .putInt(workerStepsKey(today, workerId), cachedDailySteps.coerceAtLeast(0))
                .putInt(workerActiveMinKey(today, workerId), cachedActiveMinutes.coerceAtLeast(0))
                .putLong(workerActiveBucketKey(today, workerId), cachedLastActiveBucket)
                .putLong(workerLastStepKey(today, workerId), cachedLastStepAtMs)
                .putLong(workerLastMotionKey(today, workerId), cachedLastMotionAtMs)
                .apply()
            lastDiskFlushMs = nowMs
            dirtyStepsPending = false
        }
    }

    private fun advanceWorkMinuteState(minuteBucket: Long) {
        if (workMinuteEpoch != minuteBucket) {
            workMinuteEpoch = minuteBucket
            workMinuteCredited = (minuteBucket == cachedLastActiveBucket)
            workMinuteSteps = 0
            workMinuteActiveSeconds = 0
        }
    }

    private fun creditActiveMinuteIfQualified(
        prefs: android.content.SharedPreferences,
        today: String,
        workerId: String,
        minuteBucket: Long,
        nowMs: Long
    ) {
        if (workMinuteCredited) return
        val qualified = workMinuteSteps >= ACTIVE_WORK_MIN_STEPS_REQUIRED ||
            workMinuteActiveSeconds >= ACTIVE_WORK_MIN_SECONDS_REQUIRED
        if (!qualified) return

        workMinuteCredited = true
        if (minuteBucket != cachedLastActiveBucket) {
            cachedLastActiveBucket = minuteBucket
            cachedActiveMinutes = (cachedActiveMinutes + 1).coerceAtMost(720)
        }
        recentMotionBuckets.add(minuteBucket)
        cachedLastMotionAtMs = nowMs
        flushToPrefsIfDue(prefs, today, workerId, nowMs, forceFlush = false)
    }

    private fun recordSustainedWorkSecond(
        prefs: android.content.SharedPreferences,
        today: String,
        workerId: String,
        nowMs: Long
    ) {
        ensureCacheLoaded(prefs, today, workerId)
        val minuteBucket = nowMs / 60_000L
        pruneRollingBuckets(minuteBucket)
        advanceWorkMinuteState(minuteBucket)
        workMinuteActiveSeconds++

        // Update live motion timestamp once >= 4 distinct active work seconds occur inside a 10s window
        if (recentMotionWindowStartMs == 0L || (nowMs - recentMotionWindowStartMs) > 10_000L) {
            recentMotionWindowStartMs = nowMs
            recentMotionActiveSecCount = 1
        } else {
            recentMotionActiveSecCount++
            if (recentMotionActiveSecCount >= 4) {
                cachedLastMotionAtMs = nowMs
                recentMotionBuckets.add(minuteBucket)
                recentMotionWindowStartMs = nowMs
                recentMotionActiveSecCount = 0
                flushToPrefsIfDue(prefs, today, workerId, nowMs, forceFlush = false)
            }
        }

        creditActiveMinuteIfQualified(prefs, today, workerId, minuteBucket, nowMs)
    }

    private fun recordConfirmedSteps(
        prefs: android.content.SharedPreferences,
        today: String,
        workerId: String,
        newTotalSteps: Int,
        deltaSteps: Int,
        nowMs: Long
    ) {
        ensureCacheLoaded(prefs, today, workerId)
        val safeVal = newTotalSteps.coerceAtLeast(0)
        cachedDailySteps = safeVal
        if (deltaSteps > 0) {
            cachedLastStepAtMs = nowMs
            val minuteBucket = nowMs / 60_000L
            pruneRollingBuckets(minuteBucket)
            recentStepBuckets[minuteBucket] = (recentStepBuckets[minuteBucket] ?: 0) + deltaSteps
            advanceWorkMinuteState(minuteBucket)
            workMinuteSteps += deltaSteps
            if (deltaSteps >= 2) {
                cachedLastMotionAtMs = nowMs
                recentMotionBuckets.add(minuteBucket)
            }
            // If a large batch of steps arrived after background recovery, credit proportional walking minutes fairly
            if (deltaSteps >= 95 && !workMinuteCredited) {
                val recoveredWalkMin = (deltaSteps / 95).coerceIn(1, 25)
                cachedActiveMinutes = (cachedActiveMinutes + recoveredWalkMin).coerceAtMost(720)
                cachedLastActiveBucket = minuteBucket
                workMinuteCredited = true
            } else {
                creditActiveMinuteIfQualified(prefs, today, workerId, minuteBucket, nowMs)
            }
            flushToPrefsIfDue(prefs, today, workerId, nowMs, forceFlush = false)
        } else {
            flushToPrefsIfDue(prefs, today, workerId, nowMs, forceFlush = false)
        }
    }

    @Synchronized
    fun flushPendingDiskWrite(context: Context) {
        if (!dirtyStepsPending || cachedWorkerDayKey.isEmpty() || cachedDailySteps < 0) return
        try {
            val prefs = context.applicationContext.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
            prefs.edit()
                .putInt("steps_$cachedWorkerDayKey", cachedDailySteps.coerceAtLeast(0))
                .putInt("active_min_$cachedWorkerDayKey", cachedActiveMinutes.coerceAtLeast(0))
                .putLong("active_bucket_$cachedWorkerDayKey", cachedLastActiveBucket)
                .putLong("last_step_ms_$cachedWorkerDayKey", cachedLastStepAtMs)
                .putLong("last_motion_ms_$cachedWorkerDayKey", cachedLastMotionAtMs)
                .apply()
            lastDiskFlushMs = System.currentTimeMillis()
            dirtyStepsPending = false
        } catch (_: Exception) {
        }
    }

    private fun resetCadenceFilter() {
        awaitingTrough = false
        lastPeakTimestampMs = 0L
        lastAccelStepTimestampMs = 0L
        lastDetectorStepTimestampMs = 0L
        lastAccelTimestampMs = 0L
        consecutiveDetectorSteps = 0
        consecutiveRhythmicSteps = 0
        isWalkingConfirmed = false
        currentSecondEpoch = -1L
        currentSecondImpulses = 0
        recentMotionWindowStartMs = 0L
        recentMotionActiveSecCount = 0
    }

    fun hasActivityRecognitionPermission(ctx: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    @Synchronized
    fun setInSiteBounds(inBounds: Boolean) {
        if (inSiteBounds != inBounds) {
            inSiteBounds = inBounds
            // When returning inside the site geofence after being off-site, rebase step counter so off-site walking isn't added
            if (inBounds) {
                rebaselineNeeded = true
                resetCadenceFilter()
            }
        }
    }

    @Synchronized
    fun ensureRegisteredIfTracking(context: Context) {
        if (!trackingEnabled || activeWorkerId.isEmpty()) {
            restoreActiveShiftIfNeeded(context)
        }
        if (trackingEnabled && activeWorkerId.isNotEmpty() && !isRegistered) {
            start(context)
        }
    }

    /**
     * Restores persisted active shift state after Android kills/restarts the process (e.g. app swiped
     * away or reclaimed during Doze) while preserving today's steps and hardware step-counter baseline.
     */
    @Synchronized
    fun restoreActiveShiftIfNeeded(context: Context): String {
        val ctx = context.applicationContext
        appContext = ctx
        val today = todayKey()
        if (trackingEnabled && activeWorkerId.isNotEmpty()) {
            if (!isRegistered) start(ctx)
            return activeWorkerId
        }
        val prefs = ctx.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
        val wasActive = prefs.getBoolean(KEY_GLOBAL_TRACKING, false)
        val savedId = prefs.getString(KEY_GLOBAL_WORKER_ID, "").orEmpty().trim()
        val savedDate = prefs.getString(KEY_GLOBAL_SHIFT_DATE, "").orEmpty().trim()
        if (!wasActive || savedId.isEmpty() || savedDate != today) {
            if (wasActive && savedDate.isNotEmpty() && savedDate != today) {
                prefs.edit()
                    .putBoolean(KEY_GLOBAL_TRACKING, false)
                    .remove(KEY_GLOBAL_WORKER_ID)
                    .remove(KEY_GLOBAL_SHIFT_DATE)
                    .apply()
            }
            return ""
        }
        val hasExistingBaseline = prefs.getFloat(workerBaselineKey(today, savedId), -1f) >= 0f
        activeWorkerId = savedId
        trackingEnabled = true
        rebaselineNeeded = !hasExistingBaseline
        resetCadenceFilter()
        ensureCacheLoaded(prefs, today, savedId)
        if (!isRegistered) {
            start(ctx)
        }
        return savedId
    }

    @Synchronized
    fun flushHardwareSensor(context: Context) {
        if (!isRegistered) return
        try {
            val sm = context.applicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
            sm?.flush(this)
        } catch (_: Exception) {
        }
    }

    @Synchronized
    fun setTrackingState(context: Context, enabled: Boolean, workerId: String) {
        val ctx = context.applicationContext
        appContext = ctx
        val prefs = ctx.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
        val today = todayKey()
        val cleanId = workerId.trim()
        if (!enabled || cleanId.isEmpty()) {
            val prevId = activeWorkerId.ifEmpty { prefs.getString(KEY_GLOBAL_WORKER_ID, "").orEmpty().trim() }
            val editor = prefs.edit()
                .putBoolean(KEY_GLOBAL_TRACKING, false)
                .remove(KEY_GLOBAL_WORKER_ID)
                .remove(KEY_GLOBAL_SHIFT_DATE)
            if (prevId.isNotEmpty()) {
                editor.putBoolean(workerShiftActiveKey(today, prevId), false)
            }
            editor.apply()
            if (trackingEnabled || isRegistered || WorkerShiftMonitorService.isRunning) {
                trackingEnabled = false
                activeWorkerId = ""
                inSiteBounds = true
                rebaselineNeeded = true
                resetCadenceFilter()
                stop(ctx)
                WorkerShiftMonitorService.stop(ctx)
            }
            return
        }

        // Preserve existing hardware baseline when the app process restarts mid-shift on the same day
        val wasShiftPersistedActive = prefs.getBoolean(workerShiftActiveKey(today, cleanId), false)
        val hasExistingBaseline = prefs.getFloat(workerBaselineKey(today, cleanId), -1f) >= 0f
        if (!trackingEnabled || activeWorkerId != cleanId) {
            rebaselineNeeded = !(wasShiftPersistedActive && hasExistingBaseline)
            resetCadenceFilter()
        }
        prefs.edit()
            .putBoolean(workerShiftActiveKey(today, cleanId), true)
            .putBoolean(KEY_GLOBAL_TRACKING, true)
            .putString(KEY_GLOBAL_WORKER_ID, cleanId)
            .putString(KEY_GLOBAL_SHIFT_DATE, today)
            .apply()
        activeWorkerId = cleanId
        trackingEnabled = true
        if (!isRegistered) {
            start(ctx)
        }
        if (!WorkerShiftMonitorService.isRunning) {
            WorkerShiftMonitorService.startForWorker(ctx, cleanId)
        }
    }

    @Synchronized
    fun onPermissionUpdated(context: Context) {
        val ctx = context.applicationContext
        appContext = ctx
        if (trackingEnabled && activeWorkerId.isNotEmpty()) {
            stop(ctx)
            start(ctx)
        }
    }

    @Synchronized
    fun start(context: Context) {
        val ctx = context.applicationContext
        appContext = ctx
        if (!trackingEnabled || activeWorkerId.isEmpty()) return
        if (isRegistered) return

        val sensorManager = ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return

        val canUseHardwareStep = hasActivityRecognitionPermission(ctx)
        val stepCounter = if (canUseHardwareStep) sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) else null
        val stepDetector = if (canUseHardwareStep) sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) else null
        val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        var anyRegistered = false
        hasStepCounterSensor = false
        hasStepDetectorSensor = false

        try {
            // Strict single-source pedometer hierarchy prevents StepCounter vs StepDetector double-counting races
            if (stepCounter != null) {
                val ok = sensorManager.registerListener(this, stepCounter, SensorManager.SENSOR_DELAY_UI, 0)
                hasStepCounterSensor = ok
                anyRegistered = anyRegistered || ok
            }
            if (!hasStepCounterSensor && stepDetector != null) {
                val ok = sensorManager.registerListener(this, stepDetector, SensorManager.SENSOR_DELAY_UI, 0)
                hasStepDetectorSensor = ok
                anyRegistered = anyRegistered || ok
            }
            // Register accelerometer at battery-friendly UI rate for stationary craft work detection,
            // or GAME rate only when no hardware step sensor exists
            if (accelerometer != null) {
                val accelDelay = if (hasStepCounterSensor || hasStepDetectorSensor) {
                    SensorManager.SENSOR_DELAY_UI
                } else {
                    SensorManager.SENSOR_DELAY_GAME
                }
                val ok = sensorManager.registerListener(this, accelerometer, accelDelay)
                anyRegistered = anyRegistered || ok
            }
        } catch (_: Exception) {
        }
        isRegistered = anyRegistered
    }

    @Synchronized
    fun stop(context: Context) {
        flushPendingDiskWrite(context)
        val sensorManager = context.applicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        if (isRegistered && sensorManager != null) {
            try {
                sensorManager.unregisterListener(this)
            } catch (_: Exception) {
            }
        }
        isRegistered = false
        hasStepCounterSensor = false
        hasStepDetectorSensor = false
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null || !trackingEnabled) return
        val workerId = activeWorkerId
        if (workerId.isEmpty()) return
        val ctx = appContext ?: return
        val prefs = ctx.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
        val today = todayKey()
        val baseKey = workerBaselineKey(today, workerId)
        val now = System.currentTimeMillis()

        // Pause step & work-motion accumulation when confirmed outside the project site geofence
        if (!inSiteBounds) {
            if (event.sensor.type == Sensor.TYPE_STEP_COUNTER) {
                val totalSinceBoot = event.values.firstOrNull() ?: return
                if (totalSinceBoot >= 0f) {
                    val existingDaily = readLiveSteps(prefs, today, workerId)
                    prefs.edit()
                        .putFloat(baseKey, (totalSinceBoot - existingDaily).coerceAtLeast(0f))
                        .putLong(workerBaselineTimeKey(today, workerId), now)
                        .apply()
                    rebaselineNeeded = false
                }
            }
            return
        }

        when (event.sensor.type) {
            Sensor.TYPE_STEP_COUNTER -> {
                val totalSinceBoot = event.values.firstOrNull() ?: return
                if (totalSinceBoot < 0f) return
                val prevCounterMs = lastStepCounterEventMs
                lastStepCounterEventMs = now
                lastHardwareStepMs = now
                val existingDaily = readLiveSteps(prefs, today, workerId)
                val savedBaseline = prefs.getFloat(baseKey, -1f)
                val baseTimeKey = workerBaselineTimeKey(today, workerId)
                if (rebaselineNeeded || savedBaseline < 0f || totalSinceBoot < savedBaseline) {
                    val newBaseline = (totalSinceBoot - existingDaily).coerceAtLeast(0f)
                    prefs.edit()
                        .putFloat(baseKey, newBaseline)
                        .putLong(baseTimeKey, now)
                        .apply()
                    rebaselineNeeded = false
                } else {
                    val computedDaily = (totalSinceBoot - savedBaseline).roundToInt().coerceAtLeast(0)
                    val delta = computedDaily - existingDaily
                    val savedBaselineMs = prefs.getLong(baseTimeKey, 0L)
                    val elapsedMs = when {
                        prevCounterMs > 0L -> (now - prevCounterMs).coerceAtLeast(1000L)
                        cachedLastStepAtMs > 0L -> (now - cachedLastStepAtMs).coerceAtLeast(1000L)
                        savedBaselineMs > 0L -> (now - savedBaselineMs).coerceAtLeast(1000L)
                        else -> 10 * 60_000L
                    }
                    if (isPlausibleStepDelta(delta, elapsedMs)) {
                        recordConfirmedSteps(prefs, today, workerId, computedDaily, delta, now)
                        prefs.edit().putLong(baseTimeKey, now).apply()
                    } else if (delta > 0) {
                        // Guard against implausible off-shift/reboot/vehicle jump: rebase smoothly to existingDaily
                        prefs.edit()
                            .putFloat(baseKey, (totalSinceBoot - existingDaily).coerceAtLeast(0f))
                            .putLong(baseTimeKey, now)
                            .apply()
                    }
                }
            }
            Sensor.TYPE_STEP_DETECTOR -> {
                // Only active when TYPE_STEP_COUNTER is unavailable
                if (hasStepCounterSensor) return
                val interval = now - lastDetectorStepTimestampMs
                if (interval in 1..260L) return
                if (interval > 2200L) {
                    consecutiveDetectorSteps = 1
                } else {
                    consecutiveDetectorSteps++
                }
                lastDetectorStepTimestampMs = now
                lastHardwareStepMs = now
                // Confirm real movement from the 2nd rhythmic hardware step
                if (consecutiveDetectorSteps >= 2) {
                    val current = readLiveSteps(prefs, today, workerId)
                    val add = if (consecutiveDetectorSteps == 2) 2 else 1
                    recordConfirmedSteps(prefs, today, workerId, current + add, add, now)
                }
            }
            Sensor.TYPE_ACCELEROMETER -> {
                val x = event.values[0]
                val y = event.values[1]
                val z = event.values[2]
                val mag = sqrt(x * x + y * y + z * z)

                // Time-constant (tau = 0.35s) normalized gravity filter — consistent across 15Hz..100Hz sensors
                val dtSec = if (lastAccelTimestampMs > 0L) {
                    ((now - lastAccelTimestampMs) / 1000f).coerceIn(0.005f, 0.25f)
                } else {
                    0.05f
                }
                lastAccelTimestampMs = now
                val alpha = dtSec / (0.35f + dtSec)
                gravityEstimate = (1f - alpha) * gravityEstimate + alpha * mag
                val dynamicAccel = mag - gravityEstimate
                val absDyn = abs(dynamicAccel)

                // 1) Stationary craft work motion detection (requires sustained multi-second activity per minute)
                // Filters out phone drops (> 18 m/s^2) and tiny resting noise (< 0.62 m/s^2)
                if (absDyn in 0.62f..18.0f) {
                    val secEpoch = now / 1000L
                    if (secEpoch != currentSecondEpoch) {
                        currentSecondEpoch = secEpoch
                        currentSecondImpulses = 1
                    } else {
                        currentSecondImpulses++
                        if (currentSecondImpulses == 2) {
                            recordSustainedWorkSecond(prefs, today, workerId, now)
                        }
                    }
                }

                // 2) Walking-step fallback: ONLY runs when no hardware step sensor exists or has fired recently
                if (hasStepCounterSensor || hasStepDetectorSensor || (now - lastHardwareStepMs) < 5000L) return

                // Reset walking cadence if paused for > 1.9 seconds
                if (lastAccelStepTimestampMs > 0L && (now - lastAccelStepTimestampMs) > 1900L) {
                    consecutiveRhythmicSteps = 0
                    isWalkingConfirmed = false
                    awaitingTrough = false
                }

                if (!awaitingTrough) {
                    // Realistic walking vertical impulse (rejects gentle hand tilt and extreme vehicle jolts)
                    if (dynamicAccel in 1.25f..11.5f) {
                        val sinceLastStep = now - lastAccelStepTimestampMs
                        if (lastAccelStepTimestampMs == 0L || sinceLastStep >= 300L) {
                            awaitingTrough = true
                            lastPeakTimestampMs = now
                        }
                    }
                } else {
                    val sincePeak = now - lastPeakTimestampMs
                    // Complete 1 walking wave when followed by a downward swing (<= -0.60 m/s^2) within 130ms..800ms
                    if (sincePeak in 130L..800L && dynamicAccel <= -0.60f) {
                        awaitingTrough = false
                        val stepInterval = if (lastAccelStepTimestampMs == 0L) 520L else (now - lastAccelStepTimestampMs)
                        lastAccelStepTimestampMs = now
                        if (stepInterval in 300L..1800L) {
                            consecutiveRhythmicSteps++
                        } else {
                            consecutiveRhythmicSteps = 1
                            isWalkingConfirmed = false
                        }
                        // Confirm real walking after 4 consecutive rhythmic steps (rejects phone pickup / table bumps)
                        if (!isWalkingConfirmed && consecutiveRhythmicSteps >= 4) {
                            isWalkingConfirmed = true
                            val current = readLiveSteps(prefs, today, workerId)
                            recordConfirmedSteps(prefs, today, workerId, current + 4, 4, now)
                        } else if (isWalkingConfirmed) {
                            val current = readLiveSteps(prefs, today, workerId)
                            recordConfirmedSteps(prefs, today, workerId, current + 1, 1, now)
                        }
                    } else if (sincePeak > 800L) {
                        awaitingTrough = false
                    }
                }
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    /**
     * Neutral foreground-service notification on the worker device:
     * Keeps step/effort/energy metrics hidden from the worker (contractor-only visibility).
     */
    fun getLiveNotificationSummary(context: Context, workerIdParam: String): String {
        val targetId = workerIdParam.trim().ifEmpty { activeWorkerId }
        return if (targetId.isEmpty()) {
            "متابعة المناوبة في موقع العمل"
        } else {
            "المناوبة مسجلة ونشطة في موقع العمل"
        }
    }

    @Synchronized
    fun getSnapshot(context: Context, workerIdParam: String = ""): StepSnapshot {
        // Flush hardware FIFO batch so latest steps are reflected immediately
        if (isRegistered && hasStepCounterSensor) {
            flushHardwareSensor(context)
        }
        val prefs = context.applicationContext.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
        val today = todayKey()
        val targetWorkerId = workerIdParam.trim().ifEmpty { activeWorkerId }
        val now = System.currentTimeMillis()
        val currentBucket = now / 60_000L
        pruneRollingBuckets(currentBucket)

        val dayKey = if (targetWorkerId.isNotEmpty()) workerDayId(today, targetWorkerId) else ""
        val useCache = targetWorkerId.isNotEmpty() && cachedWorkerDayKey == dayKey && cachedDailySteps >= 0

        val steps = if (targetWorkerId.isNotEmpty()) {
            if (useCache) cachedDailySteps else prefs.getInt(workerStepsKey(today, targetWorkerId), 0).coerceAtLeast(0)
        } else 0
        val activeMinutes = if (targetWorkerId.isNotEmpty()) {
            if (useCache) cachedActiveMinutes else prefs.getInt(workerActiveMinKey(today, targetWorkerId), 0).coerceAtLeast(0)
        } else 0
        val lastStepAt = if (targetWorkerId.isNotEmpty()) {
            if (useCache) cachedLastStepAtMs else prefs.getLong(workerLastStepKey(today, targetWorkerId), 0L).coerceAtLeast(0L)
        } else 0L
        val lastMotionAt = if (targetWorkerId.isNotEmpty()) {
            if (useCache) cachedLastMotionAtMs else prefs.getLong(workerLastMotionKey(today, targetWorkerId), 0L).coerceAtLeast(0L)
        } else 0L

        val recentSteps10m = if (useCache) recentStepBuckets.values.sum() else 0
        val recentMotionMin10m = if (useCache) recentMotionBuckets.size else 0
        val idleMinutes = if (lastMotionAt > 0L) ((now - lastMotionAt) / 60_000L).toInt().coerceAtLeast(0) else 0
        val motionState = when {
            lastMotionAt <= 0L -> "waiting"
            (now - lastMotionAt) <= IDLE_THRESHOLD_MS -> "active"
            else -> "idle"
        }
        val sensorSource = when {
            hasStepCounterSensor -> "step_counter"
            hasStepDetectorSensor -> "step_detector"
            isRegistered -> "accelerometer"
            else -> "none"
        }
        val activeNow = isRegistered && trackingEnabled && activeWorkerId.isNotEmpty()
        val permGranted = hasActivityRecognitionPermission(context)
        val fgsActive = WorkerShiftMonitorService.isRunning
        return StepSnapshot(
            workerId = targetWorkerId,
            date = today,
            steps = steps,
            activeMinutes = activeMinutes,
            lastStepAt = lastStepAt,
            lastMotionAt = lastMotionAt,
            recentSteps10m = recentSteps10m,
            recentMotionMin10m = recentMotionMin10m,
            idleMinutes = idleMinutes,
            motionState = motionState,
            sensorSource = sensorSource,
            sensorActive = activeNow,
            foregroundServiceActive = fgsActive,
            permissionGranted = permGranted,
            inSiteBounds = inSiteBounds
        )
    }

    @Synchronized
    fun getStepMetricsJson(context: Context, workerIdParam: String = ""): String {
        val snap = getSnapshot(context, workerIdParam)
        val distanceMeters = (snap.steps * 0.74).roundToInt()
        val calories = computeNativeEnergyKcal(snap.steps, snap.activeMinutes)
        val effortScore = min(100, ((snap.steps.toDouble() / 6000.0) * 100.0).roundToInt())
        val effortStars = when {
            effortScore >= 100 -> 6
            effortScore >= 75 -> 5
            effortScore >= 50 -> 4
            effortScore >= 30 -> 3
            effortScore >= 12 -> 2
            snap.steps > 0 || snap.activeMinutes > 0 -> 1
            else -> 0
        }
        return """{"steps":${snap.steps},"distanceMeters":$distanceMeters,"calories":$calories,"effortScore":$effortScore,"effortStars":$effortStars,"activeMinutes":${snap.activeMinutes},"lastStepAt":${snap.lastStepAt},"lastMotionAt":${snap.lastMotionAt},"recentSteps10m":${snap.recentSteps10m},"recentMotionMin10m":${snap.recentMotionMin10m},"idleMinutes":${snap.idleMinutes},"motionState":"${snap.motionState}","sensorSource":"${snap.sensorSource}","foregroundServiceActive":${snap.foregroundServiceActive},"sensorActive":${snap.sensorActive},"permissionGranted":${snap.permissionGranted},"date":"${snap.date}"}"""
    }

    @Synchronized
    fun resetTodaySteps(context: Context, workerIdParam: String = ""): String {
        val prefs = context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
        val today = todayKey()
        val targetWorkerId = workerIdParam.trim().ifEmpty { activeWorkerId }
        rebaselineNeeded = true
        resetCadenceFilter()
        recentStepBuckets.clear()
        recentMotionBuckets.clear()
        workMinuteEpoch = -1L
        workMinuteCredited = false
        workMinuteSteps = 0
        workMinuteActiveSeconds = 0
        if (targetWorkerId.isNotEmpty()) {
            val dayKey = workerDayId(today, targetWorkerId)
            val k = workerStepsKey(today, targetWorkerId)
            cachedWorkerDayKey = dayKey
            cachedStepsKey = k
            cachedDailySteps = 0
            cachedActiveMinutes = 0
            cachedLastActiveBucket = -1L
            cachedLastStepAtMs = 0L
            cachedLastMotionAtMs = 0L
            dirtyStepsPending = false
            prefs.edit()
                .putInt(k, 0)
                .putFloat(workerBaselineKey(today, targetWorkerId), -1f)
                .putInt(workerActiveMinKey(today, targetWorkerId), 0)
                .putLong(workerActiveBucketKey(today, targetWorkerId), -1L)
                .putLong(workerLastStepKey(today, targetWorkerId), 0L)
                .putLong(workerLastMotionKey(today, targetWorkerId), 0L)
                .apply()
        }
        return getStepMetricsJson(context, targetWorkerId)
    }
}
