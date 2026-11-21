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
    private const val IDLE_THRESHOLD_MS = 10 * 60 * 1000L
    private var isRegistered = false
    private var appContext: Context? = null
    private var hasStepCounterSensor = false
    private var hasStepDetectorSensor = false
    @Volatile
    private var trackingEnabled = false
    @Volatile
    private var activeWorkerId: String = ""
    @Volatile
    private var rebaselineNeeded = true

    // Timestamps to coordinate hardware sensors vs accelerometer fallback without double counting
    private var lastStepCounterEventMs = 0L
    private var lastHardwareStepMs = 0L

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

    // Stationary trade work motion detector (detects sustained manual work without faking footsteps)
    private var lastWorkMotionSampleMs = 0L
    private var motionWindowStartMs = 0L
    private var motionImpulseCount = 0

    // Anti-noise low-pass gravity & multi-step cadence state for accelerometer / detector
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

    private fun recordWorkMotion(
        prefs: android.content.SharedPreferences,
        today: String,
        workerId: String,
        nowMs: Long
    ) {
        ensureCacheLoaded(prefs, today, workerId)
        cachedLastMotionAtMs = nowMs
        val minuteBucket = nowMs / 60_000L
        pruneRollingBuckets(minuteBucket)
        recentMotionBuckets.add(minuteBucket)
        if (minuteBucket != cachedLastActiveBucket) {
            cachedLastActiveBucket = minuteBucket
            cachedActiveMinutes = (cachedActiveMinutes + 1).coerceAtMost(960)
        }
        flushToPrefsIfDue(prefs, today, workerId, nowMs, forceFlush = false)
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
            recordWorkMotion(prefs, today, workerId, nowMs)
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
        consecutiveDetectorSteps = 0
        consecutiveRhythmicSteps = 0
        isWalkingConfirmed = false
        lastWorkMotionSampleMs = 0L
        motionWindowStartMs = 0L
        motionImpulseCount = 0
    }

    fun hasActivityRecognitionPermission(ctx: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    @Synchronized
    fun ensureRegisteredIfTracking(context: Context) {
        if (trackingEnabled && activeWorkerId.isNotEmpty() && !isRegistered) {
            start(context)
        }
    }

    @Synchronized
    fun setTrackingState(context: Context, enabled: Boolean, workerId: String) {
        val ctx = context.applicationContext
        appContext = ctx
        val cleanId = workerId.trim()
        if (!enabled || cleanId.isEmpty()) {
            if (trackingEnabled || isRegistered || WorkerShiftMonitorService.isRunning) {
                trackingEnabled = false
                activeWorkerId = ""
                rebaselineNeeded = true
                resetCadenceFilter()
                stop(ctx)
                WorkerShiftMonitorService.stop(ctx)
            }
            return
        }
        // Only reset baseline/cadence if tracking was off or switched to a different worker
        if (!trackingEnabled || activeWorkerId != cleanId) {
            rebaselineNeeded = true
            resetCadenceFilter()
        }
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
            rebaselineNeeded = true
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
            if (stepCounter != null) {
                val ok = sensorManager.registerListener(this, stepCounter, SensorManager.SENSOR_DELAY_UI, 0)
                hasStepCounterSensor = ok
                anyRegistered = anyRegistered || ok
            }
            if (stepDetector != null) {
                val ok = sensorManager.registerListener(this, stepDetector, SensorManager.SENSOR_DELAY_FASTEST, 0)
                hasStepDetectorSensor = ok
                anyRegistered = anyRegistered || ok
            }
            // Register accelerometer at battery-friendly UI rate when hardware step sensor exists
            // (used for stationary craft work detection), or GAME rate when acting as walking fallback
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

        when (event.sensor.type) {
            Sensor.TYPE_STEP_COUNTER -> {
                val totalSinceBoot = event.values.firstOrNull() ?: return
                if (totalSinceBoot <= 0f) return
                lastStepCounterEventMs = now
                lastHardwareStepMs = now
                val existingDaily = readLiveSteps(prefs, today, workerId)
                val savedBaseline = prefs.getFloat(baseKey, -1f)
                if (rebaselineNeeded || savedBaseline < 0f || totalSinceBoot < savedBaseline) {
                    val newBaseline = (totalSinceBoot - existingDaily).coerceAtLeast(0f)
                    prefs.edit().putFloat(baseKey, newBaseline).apply()
                    rebaselineNeeded = false
                } else {
                    val computedDaily = (totalSinceBoot - savedBaseline).roundToInt().coerceAtLeast(0)
                    val delta = computedDaily - existingDaily
                    if (delta in 1..2500) {
                        recordConfirmedSteps(prefs, today, workerId, computedDaily, delta, now)
                    } else if (delta > 2500) {
                        // Guard against multi-hour off-shift jump: rebase to current existingDaily
                        prefs.edit().putFloat(baseKey, (totalSinceBoot - existingDaily).coerceAtLeast(0f)).apply()
                    }
                }
            }
            Sensor.TYPE_STEP_DETECTOR -> {
                // Avoid double-counting if TYPE_STEP_COUNTER is actively delivering updates within the last 3.5 seconds
                if (hasStepCounterSensor && (now - lastStepCounterEventMs) < 3500L) return
                val interval = now - lastDetectorStepTimestampMs
                if (interval in 1..240L) return
                if (interval > 2400L) {
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
                // Low-pass filter to isolate gravity component
                gravityEstimate = 0.88f * gravityEstimate + 0.12f * mag
                val dynamicAccel = mag - gravityEstimate

                // 1) Stationary craft work motion detection (runs even if hardware step sensor is active)
                // Captures sustained manual work (painting, gypsum, electrical, plumbing) without adding fake steps
                if ((now - lastWorkMotionSampleMs) >= 200L) {
                    lastWorkMotionSampleMs = now
                    if (abs(dynamicAccel) >= 0.48f) {
                        if (motionWindowStartMs == 0L || (now - motionWindowStartMs) > 4000L) {
                            motionWindowStartMs = now
                            motionImpulseCount = 1
                        } else {
                            motionImpulseCount++
                            if (motionImpulseCount >= 6) {
                                recordWorkMotion(prefs, today, workerId, now)
                                motionWindowStartMs = now
                                motionImpulseCount = 0
                            }
                        }
                    } else if (motionWindowStartMs > 0L && (now - motionWindowStartMs) > 4500L) {
                        motionWindowStartMs = 0L
                        motionImpulseCount = 0
                    }
                }

                // 2) Walking-step fallback: ONLY runs if neither hardware step sensor has fired in the last 4 seconds
                if ((now - lastHardwareStepMs) < 4000L) return

                // Reset walking cadence if paused for > 2.0 seconds
                if (lastAccelStepTimestampMs > 0L && (now - lastAccelStepTimestampMs) > 2000L) {
                    consecutiveRhythmicSteps = 0
                    isWalkingConfirmed = false
                    awaitingTrough = false
                }

                if (!awaitingTrough) {
                    // Realistic walking peak for phone in pocket or hand (>= 1.15 m/s^2 above gravity)
                    if (dynamicAccel >= 1.15f) {
                        val sinceLastStep = now - lastAccelStepTimestampMs
                        if (lastAccelStepTimestampMs == 0L || sinceLastStep >= 280L) {
                            awaitingTrough = true
                            lastPeakTimestampMs = now
                        }
                    }
                } else {
                    val sincePeak = now - lastPeakTimestampMs
                    // Complete 1 walking wave when followed by a downward swing (<= -0.55 m/s^2) within 140ms..850ms
                    if (sincePeak in 140L..850L && dynamicAccel <= -0.55f) {
                        awaitingTrough = false
                        val stepInterval = if (lastAccelStepTimestampMs == 0L) 500L else (now - lastAccelStepTimestampMs)
                        lastAccelStepTimestampMs = now
                        if (stepInterval in 280L..1900L) {
                            consecutiveRhythmicSteps++
                        } else {
                            consecutiveRhythmicSteps = 1
                            isWalkingConfirmed = false
                        }
                        // Confirm real walking after 3 consecutive rhythmic steps (rejects isolated hand/table bumps)
                        if (!isWalkingConfirmed && consecutiveRhythmicSteps >= 3) {
                            isWalkingConfirmed = true
                            val current = readLiveSteps(prefs, today, workerId)
                            recordConfirmedSteps(prefs, today, workerId, current + 3, 3, now)
                        } else if (isWalkingConfirmed) {
                            val current = readLiveSteps(prefs, today, workerId)
                            recordConfirmedSteps(prefs, today, workerId, current + 1, 1, now)
                        }
                    } else if (sincePeak > 850L) {
                        awaitingTrough = false
                    }
                }
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    fun getLiveNotificationSummary(context: Context, workerIdParam: String): String {
        val prefs = context.applicationContext.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
        val today = todayKey()
        val targetId = workerIdParam.trim().ifEmpty { activeWorkerId }
        if (targetId.isEmpty()) return "جاري قياس الخطوات والنشاط بالموقع"
        val dayKey = workerDayId(today, targetId)
        val isSameCache = cachedWorkerDayKey == dayKey && cachedDailySteps >= 0
        val steps = if (isSameCache) cachedDailySteps else prefs.getInt(workerStepsKey(today, targetId), 0).coerceAtLeast(0)
        val activeMin = if (isSameCache) cachedActiveMinutes else prefs.getInt(workerActiveMinKey(today, targetId), 0).coerceAtLeast(0)
        val lastMotion = if (isSameCache) cachedLastMotionAtMs else prefs.getLong(workerLastMotionKey(today, targetId), 0L).coerceAtLeast(0L)
        val now = System.currentTimeMillis()
        val statusAr = when {
            lastMotion <= 0L -> "بانتظار الحركة"
            (now - lastMotion) <= IDLE_THRESHOLD_MS -> "يعمل بنشاط"
            else -> "متوقف منذ ${((now - lastMotion) / 60_000L).coerceAtLeast(1L)}د"
        }
        return "$steps خطوة • $activeMin د نشطة • $statusAr"
    }

    @Synchronized
    fun getStepMetricsJson(context: Context, workerIdParam: String = ""): String {
        val prefs = context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
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

        val distanceMeters = (steps * 0.75).roundToInt()
        val calories = (steps * 0.045).roundToInt()
        val effortScore = min(100, ((steps.toDouble() / 6000.0) * 100.0).roundToInt())
        val effortStars = when {
            steps >= 6000 -> 6
            steps >= 4500 -> 5
            steps >= 3000 -> 4
            steps >= 1800 -> 3
            steps >= 700 -> 2
            steps > 0 -> 1
            else -> 0
        }
        val activeNow = isRegistered && trackingEnabled && activeWorkerId.isNotEmpty()
        val permGranted = hasActivityRecognitionPermission(context)
        val fgsActive = WorkerShiftMonitorService.isRunning
        return """{"steps":$steps,"distanceMeters":$distanceMeters,"calories":$calories,"effortScore":$effortScore,"effortStars":$effortStars,"activeMinutes":$activeMinutes,"lastStepAt":$lastStepAt,"lastMotionAt":$lastMotionAt,"recentSteps10m":$recentSteps10m,"recentMotionMin10m":$recentMotionMin10m,"idleMinutes":$idleMinutes,"motionState":"$motionState","foregroundServiceActive":$fgsActive,"sensorActive":$activeNow,"permissionGranted":$permGranted,"date":"$today"}"""
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
