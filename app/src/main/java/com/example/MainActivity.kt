package com.example

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.print.PrintAttributes
import android.print.PrintManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.example.ui.theme.MyApplicationTheme
import java.util.concurrent.atomic.AtomicInteger

private const val NOTIFICATION_CHANNEL_ID = "al_osta_notifications"

open class MainActivity : ComponentActivity() {

    protected open val isDashboardMode: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        window.setBackgroundDrawable(
            android.graphics.drawable.ColorDrawable(android.graphics.Color.parseColor("#EEF2FF"))
        )
        createNotificationChannel()
        // Only clear WebView disk caches when the installed app version actually changes
        // (preserves warm-start performance, fonts, and image cache across normal launches)
        try {
            val cachePrefs = getSharedPreferences("al_osta_cache_meta", Context.MODE_PRIVATE)
            val lastCacheVersion = cachePrefs.getInt("last_version_code", -1)
            if (lastCacheVersion != BuildConfig.VERSION_CODE) {
                java.io.File(filesDir, "wv_cdn_cache").deleteRecursively()
                java.io.File(filesDir, "jsx_compiled_cache").deleteRecursively()
                val dataDirFile = java.io.File(applicationInfo.dataDir)
                java.io.File(dataDirFile, "app_webview/Default/Code Cache").deleteRecursively()
                java.io.File(dataDirFile, "app_webview/Default/Cache").deleteRecursively()
                cachePrefs.edit().putInt("last_version_code", BuildConfig.VERSION_CODE).apply()
            }
        } catch (_: Exception) {
        }

        val deepLinkQuery = intent?.data?.encodedQuery?.takeIf { it.isNotBlank() }
        val isStorePortalLink = deepLinkQuery?.contains("storePortal", ignoreCase = true) == true ||
            intent?.data?.scheme.equals("alosta", ignoreCase = true)
        val basePage = if (
            isStorePortalLink ||
            isDashboardMode ||
            packageName.contains("dashboard", ignoreCase = true)
        ) {
            "dashboard.html"
        } else {
            "index.html"
        }
        val cacheBuster = "v=20261116_${BuildConfig.VERSION_CODE}"
        val startUrl = if (deepLinkQuery != null) {
            "file:///android_asset/$basePage?$deepLinkQuery&$cacheBuster"
        } else {
            "file:///android_asset/$basePage?$cacheBuster"
        }

        setContent {
            var isDarkTheme by rememberSaveable { mutableStateOf(false) }

            MyApplicationTheme(darkTheme = isDarkTheme) {
                AlOstaAppScreen(
                    onThemeChanged = { dark -> isDarkTheme = dark },
                    onExitApp = { finish() },
                    initialAssetUrl = startUrl
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        AlOstaApkUpdater.onActivityResume(this)
    }

    override fun onPause() {
        super.onPause()
        AlOstaLocationManager.pauseIfIdle(this)
        WorkerStepTracker.flushPendingDiskWrite(this)
    }

    override fun onDestroy() {
        AlOstaLocationManager.stopTracking(this)
        WorkerStepTracker.flushPendingDiskWrite(this)
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = getString(R.string.notification_channel_desc)
                enableVibration(true)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }
}

object AlOstaSecurityVault {
    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val KEY_ALIAS = "al_osta_master_aes256_gcm_key_v2"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val GCM_TAG_BITS = 128
    private const val ENCRYPTED_PREFIX = "ENC_GCM_V2:"

    @Synchronized
    private fun getOrCreateAesKey(): javax.crypto.SecretKey? {
        return try {
            val keyStore = java.security.KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
            val existing = keyStore.getEntry(KEY_ALIAS, null) as? java.security.KeyStore.SecretKeyEntry
            if (existing != null) {
                existing.secretKey
            } else {
                val keyGen = javax.crypto.KeyGenerator.getInstance(
                    android.security.keystore.KeyProperties.KEY_ALGORITHM_AES,
                    KEYSTORE_PROVIDER
                )
                val spec = android.security.keystore.KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or
                        android.security.keystore.KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
                keyGen.init(spec)
                keyGen.generateKey()
            }
        } catch (_: Exception) {
            null
        }
    }

    fun encryptAtRest(plainText: String): String {
        if (plainText.isEmpty() || plainText.startsWith(ENCRYPTED_PREFIX)) return plainText
        return try {
            val secretKey = getOrCreateAesKey() ?: return plainText
            val cipher = javax.crypto.Cipher.getInstance(TRANSFORMATION)
            cipher.init(javax.crypto.Cipher.ENCRYPT_MODE, secretKey)
            val iv = cipher.iv
            val cipherBytes = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
            val ivB64 = android.util.Base64.encodeToString(iv, android.util.Base64.NO_WRAP)
            val dataB64 = android.util.Base64.encodeToString(cipherBytes, android.util.Base64.NO_WRAP)
            "$ENCRYPTED_PREFIX$ivB64:$dataB64"
        } catch (_: Exception) {
            plainText
        }
    }

    fun decryptAtRest(storedValue: String): String {
        if (!storedValue.startsWith(ENCRYPTED_PREFIX)) return storedValue
        return try {
            val payload = storedValue.removePrefix(ENCRYPTED_PREFIX)
            val parts = payload.split(":", limit = 2)
            if (parts.size != 2) return storedValue
            val iv = android.util.Base64.decode(parts[0], android.util.Base64.NO_WRAP)
            val cipherBytes = android.util.Base64.decode(parts[1], android.util.Base64.NO_WRAP)
            val secretKey = getOrCreateAesKey() ?: return storedValue
            val cipher = javax.crypto.Cipher.getInstance(TRANSFORMATION)
            val spec = javax.crypto.spec.GCMParameterSpec(GCM_TAG_BITS, iv)
            cipher.init(javax.crypto.Cipher.DECRYPT_MODE, secretKey, spec)
            String(cipher.doFinal(cipherBytes), Charsets.UTF_8)
        } catch (_: Exception) {
            "{}"
        }
    }

    fun pbkdf2Hash(secret: String, salt: String): String {
        return try {
            val normalizedSalt = "alosta_v2_salt::${salt.trim().lowercase(Locale.ROOT)}"
            val spec = javax.crypto.spec.PBEKeySpec(
                secret.toCharArray(),
                normalizedSalt.toByteArray(Charsets.UTF_8),
                32768,
                256
            )
            val skf = javax.crypto.SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
            val hashBytes = skf.generateSecret(spec).encoded
            hashBytes.joinToString("") { "%02x".format(it) }
        } catch (_: Exception) {
            ""
        }
    }

    fun isTrustedWebViewOrigin(url: String?): Boolean {
        if (url.isNullOrBlank()) return true
        val clean = url.trim().lowercase(Locale.ROOT)
        return clean.startsWith("file:///android_asset/") || clean == "about:blank"
    }

    fun isSafeExternalHttpUrl(rawUrl: String?): Boolean {
        if (rawUrl.isNullOrBlank()) return false
        return try {
            val parsed = java.net.URI(rawUrl.trim())
            val scheme = (parsed.scheme ?: "").lowercase(Locale.ROOT)
            if (scheme != "https" && scheme != "http") return false
            val host = (parsed.host ?: "").lowercase(Locale.ROOT).trim('[', ']')
            if (host.isEmpty()) return false
            if (host == "localhost" ||
                host == "127.0.0.1" ||
                host == "0.0.0.0" ||
                host == "::1" ||
                host == "10.0.2.2" ||
                host.startsWith("10.") ||
                host.startsWith("127.") ||
                host.startsWith("169.254.") ||
                host.startsWith("192.168.") ||
                host.startsWith("fc") ||
                host.startsWith("fd") ||
                Regex("""^172\.(1[6-9]|2\d|3[01])\.""").containsMatchIn(host)
            ) {
                return false
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    fun isSafeIntentUrl(rawUrl: String?): Boolean {
        if (rawUrl.isNullOrBlank()) return false
        val clean = rawUrl.trim()
        val lower = clean.lowercase(Locale.ROOT)
        if (lower.startsWith("javascript:") ||
            lower.startsWith("vbscript:") ||
            lower.startsWith("file:") ||
            lower.startsWith("content:") ||
            lower.startsWith("data:")
        ) {
            return false
        }
        return lower.startsWith("https://") ||
            lower.startsWith("http://") ||
            lower.startsWith("whatsapp://") ||
            lower.startsWith("tel:") ||
            lower.startsWith("mailto:") ||
            lower.startsWith("geo:") ||
            lower.startsWith("alosta://") ||
            lower.startsWith("intent://")
    }
}

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

object AlOstaLocationManager {
    private val mainHandler by lazy { Handler(Looper.getMainLooper()) }
    @Volatile
    private var continuousShiftTracking = false
    @Volatile
    private var isListening = false
    @Volatile
    private var lastFreshLocation: android.location.Location? = null
    private var activeListener: android.location.LocationListener? = null
    private var singleShotStopRunnable: Runnable? = null

    private fun hasLocationPermission(ctx: Context): Boolean {
        val fine = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    @SuppressLint("MissingPermission")
    @Synchronized
    fun setShiftTracking(context: Context, enabled: Boolean) {
        continuousShiftTracking = enabled
        if (enabled) {
            startListening(context.applicationContext, minTimeMs = 15000L, minDistM = 8f)
        } else {
            stopTracking(context.applicationContext)
        }
    }

    @SuppressLint("MissingPermission")
    @Synchronized
    fun requestOneShotFreshFix(context: Context) {
        val appCtx = context.applicationContext
        if (!hasLocationPermission(appCtx)) return
        if (isListening) return
        startListening(appCtx, minTimeMs = 2000L, minDistM = 1f)
        singleShotStopRunnable?.let { mainHandler.removeCallbacks(it) }
        val stopTask = Runnable {
            if (!continuousShiftTracking) {
                stopTracking(appCtx)
            }
        }
        singleShotStopRunnable = stopTask
        mainHandler.postDelayed(stopTask, 12000L)
    }

    @SuppressLint("MissingPermission")
    @Synchronized
    private fun startListening(appCtx: Context, minTimeMs: Long, minDistM: Float) {
        if (!hasLocationPermission(appCtx) || isListening) return
        val lm = appCtx.getSystemService(Context.LOCATION_SERVICE) as? android.location.LocationManager ?: return
        val listener = android.location.LocationListener { loc ->
            lastFreshLocation = loc
        }
        activeListener = listener
        mainHandler.post {
            try {
                if (lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER)) {
                    lm.requestLocationUpdates(android.location.LocationManager.GPS_PROVIDER, minTimeMs, minDistM, listener, Looper.getMainLooper())
                }
                if (lm.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)) {
                    lm.requestLocationUpdates(android.location.LocationManager.NETWORK_PROVIDER, minTimeMs, minDistM, listener, Looper.getMainLooper())
                }
                isListening = true
            } catch (_: Exception) {
                isListening = false
            }
        }
    }

    @Synchronized
    fun pauseIfIdle(context: Context) {
        if (!continuousShiftTracking) {
            stopTracking(context)
        }
    }

    @Synchronized
    fun stopTracking(context: Context) {
        singleShotStopRunnable?.let { mainHandler.removeCallbacks(it) }
        singleShotStopRunnable = null
        val listener = activeListener ?: return
        val lm = context.applicationContext.getSystemService(Context.LOCATION_SERVICE) as? android.location.LocationManager
        mainHandler.post {
            try {
                lm?.removeUpdates(listener)
            } catch (_: Exception) {
            }
        }
        activeListener = null
        isListening = false
    }

    @SuppressLint("MissingPermission")
    fun getBestLocationJson(context: Context): String {
        val appCtx = context.applicationContext
        if (!hasLocationPermission(appCtx)) return ""
        return try {
            val lm = appCtx.getSystemService(Context.LOCATION_SERVICE) as? android.location.LocationManager ?: return ""
            var bestLocation: android.location.Location? = lastFreshLocation
            val providers = listOf(
                android.location.LocationManager.GPS_PROVIDER,
                android.location.LocationManager.NETWORK_PROVIDER,
                android.location.LocationManager.PASSIVE_PROVIDER
            )
            for (provider in providers) {
                try {
                    if (lm.isProviderEnabled(provider)) {
                        val loc = lm.getLastKnownLocation(provider)
                        if (loc != null) {
                            if (bestLocation == null || loc.time > bestLocation.time || (loc.time >= bestLocation.time - 15000L && loc.accuracy < bestLocation.accuracy)) {
                                bestLocation = loc
                            }
                        }
                    }
                } catch (_: Exception) {
                }
            }
            val now = System.currentTimeMillis()
            if (bestLocation == null || (now - bestLocation.time) > 30000L) {
                requestOneShotFreshFix(appCtx)
            }
            if (bestLocation != null) {
                """{"lat":${bestLocation.latitude},"lng":${bestLocation.longitude},"accuracy":${bestLocation.accuracy},"timestamp":${bestLocation.time}}"""
            } else {
                ""
            }
        } catch (_: Exception) {
            ""
        }
    }
}

object AlOstaApkUpdater {
    private val mainHandler by lazy { Handler(Looper.getMainLooper()) }
    @Volatile
    private var isDownloading = false
    @Volatile
    private var lastDownloadedApk: java.io.File? = null
    @Volatile
    private var pendingInstallOnResume = false
    @Volatile
    private var baselineLastUpdateTime = 0L
    @Volatile
    private var lastWebViewRef: (() -> WebView?)? = null

    fun getInstalledLastUpdateTime(context: Context): Long {
        return try {
            context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime
        } catch (_: Exception) {
            0L
        }
    }

    fun getInstalledFirstInstallTime(context: Context): Long {
        return try {
            context.packageManager.getPackageInfo(context.packageName, 0).firstInstallTime
        } catch (_: Exception) {
            0L
        }
    }

    fun extractGoogleDriveFileId(rawUrl: String): String? {
        val url = rawUrl.trim()
        if (!url.contains("drive.google.com", ignoreCase = true) &&
            !url.contains("docs.google.com", ignoreCase = true) &&
            !url.contains("drive.usercontent.google.com", ignoreCase = true)
        ) {
            return null
        }
        val patterns = listOf(
            Regex("""/file/d/([a-zA-Z0-9_-]{10,})"""),
            Regex("""/d/([a-zA-Z0-9_-]{10,})"""),
            Regex("""[?&]id=([a-zA-Z0-9_-]{10,})""")
        )
        for (p in patterns) {
            val match = p.find(url)
            if (match != null) {
                return match.groupValues[1]
            }
        }
        return null
    }

    fun toDirectDownloadUrl(rawUrl: String): String {
        val clean = rawUrl.trim()
        val gdriveId = extractGoogleDriveFileId(clean)
        if (!gdriveId.isNullOrBlank()) {
            return "https://drive.usercontent.google.com/download?id=$gdriveId&export=download&confirm=t&authuser=0"
        }
        if (clean.contains("dropbox.com", ignoreCase = true)) {
            return clean.replace("?dl=0", "?dl=1").replace("&dl=0", "&dl=1")
        }
        return clean
    }

    fun notifyWebView(
        webViewProvider: (() -> WebView?)?,
        status: String,
        progress: Int,
        message: String
    ) {
        val safeMsg = org.json.JSONObject.quote(message)
        val safeStatus = org.json.JSONObject.quote(status)
        mainHandler.post {
            try {
                val wv = webViewProvider?.invoke()
                wv?.evaluateJavascript(
                    "if(window.onApkUpdateState){window.onApkUpdateState({status:$safeStatus,progress:$progress,message:$safeMsg});}",
                    null
                )
            } catch (_: Exception) {
            }
        }
    }

    fun onActivityResume(context: Context) {
        if (baselineLastUpdateTime > 0L) {
            val nowUpdateTime = getInstalledLastUpdateTime(context)
            if (nowUpdateTime > baselineLastUpdateTime) {
                baselineLastUpdateTime = 0L
                pendingInstallOnResume = false
                try {
                    lastDownloadedApk?.delete()
                } catch (_: Exception) {
                }
                lastDownloadedApk = null
                notifyWebView(lastWebViewRef, "installed", 100, "تم تثبيت التحديث بنجاح! ✓")
                return
            }
        }
        if (pendingInstallOnResume) {
            val apk = lastDownloadedApk
            if (apk != null && apk.exists() && apk.length() > 50_000L) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()) {
                    pendingInstallOnResume = false
                    launchPackageInstaller(context, apk, lastWebViewRef)
                }
            }
        }
    }

    fun launchPackageInstaller(
        context: Context,
        apkFile: java.io.File? = lastDownloadedApk,
        webViewProvider: (() -> WebView?)? = lastWebViewRef
    ): Boolean {
        val target = apkFile ?: getTargetApkFile(context)
        if (!target.exists() || target.length() < 50_000L) {
            return false
        }
        lastDownloadedApk = target
        lastWebViewRef = webViewProvider
        if (baselineLastUpdateTime == 0L) {
            baselineLastUpdateTime = getInstalledLastUpdateTime(context)
        }

        mainHandler.post {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
                    pendingInstallOnResume = true
                    notifyWebView(
                        webViewProvider,
                        "permission_needed",
                        100,
                        "يرجى تفعيل خيار (السماح من هذا المصدر) لتثبيت التحديث فوراً"
                    )
                    Toast.makeText(
                        context,
                        "يرجى تفعيل (السماح من هذا المصدر) لتثبيت التحديث",
                        Toast.LENGTH_LONG
                    ).show()
                    val permIntent = Intent(
                        android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${context.packageName}")
                    ).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(permIntent)
                    return@post
                }

                pendingInstallOnResume = false
                val apkUri = androidx.core.content.FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    target
                )
                val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(apkUri, "application/vnd.android.package-archive")
                    clipData = ClipData.newRawUri("apk", apkUri)
                    addFlags(
                        Intent.FLAG_GRANT_READ_URI_PERMISSION or
                            Intent.FLAG_ACTIVITY_NEW_TASK
                    )
                }
                notifyWebView(
                    webViewProvider,
                    "installing",
                    100,
                    "تم فتح نافذة تثبيت التحديث! اضغط على (تثبيت / تحديث)."
                )
                try {
                    context.startActivity(installIntent)
                } catch (_: Exception) {
                    @Suppress("DEPRECATION")
                    val fallbackIntent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                        data = apkUri
                        clipData = ClipData.newRawUri("apk", apkUri)
                        putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
                        putExtra(Intent.EXTRA_RETURN_RESULT, true)
                        addFlags(
                            Intent.FLAG_GRANT_READ_URI_PERMISSION or
                                Intent.FLAG_ACTIVITY_NEW_TASK
                        )
                    }
                    context.startActivity(fallbackIntent)
                }
            } catch (e: Exception) {
                notifyWebView(
                    webViewProvider,
                    "ready",
                    100,
                    "تم تحميل التحديث. اضغط على زر تثبيت التحديث الآن."
                )
                Toast.makeText(context, "تعذر فتح المثبت تلقائياً، جرب فتح الرابط المباشر", Toast.LENGTH_SHORT).show()
            }
        }
        return true
    }

    private fun getTargetApkFile(context: Context): java.io.File {
        val baseDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.cacheDir
        val updateDir = java.io.File(baseDir, "apk_updates")
        if (!updateDir.exists()) updateDir.mkdirs()
        return java.io.File(updateDir, "AlOsta_Update.apk")
    }

    private fun parseGoogleDriveConfirmationUrl(html: String, fallbackFileId: String?): String? {
        val actionMatch = Regex("""<form[^>]*action=["']([^"']+)["']""", RegexOption.IGNORE_CASE).find(html)
        val actionUrl = actionMatch?.groupValues?.get(1)?.replace("&amp;", "&")
            ?: "https://drive.usercontent.google.com/download"

        val inputRegex = Regex(
            """<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']""",
            RegexOption.IGNORE_CASE
        )
        val params = mutableMapOf<String, String>()
        for (m in inputRegex.findAll(html)) {
            params[m.groupValues[1]] = m.groupValues[2]
        }
        // Also match inputs where value comes before name
        val revInputRegex = Regex(
            """<input[^>]*value=["']([^"']*)["'][^>]*name=["']([^"']+)["']""",
            RegexOption.IGNORE_CASE
        )
        for (m in revInputRegex.findAll(html)) {
            params[m.groupValues[2]] = m.groupValues[1]
        }

        if (!fallbackFileId.isNullOrBlank() && !params.containsKey("id")) {
            params["id"] = fallbackFileId
        }
        if (params.isNotEmpty() && (params.containsKey("uuid") || params.containsKey("confirm") || params.containsKey("id"))) {
            if (!params.containsKey("export")) params["export"] = "download"
            if (!params.containsKey("confirm")) params["confirm"] = "t"
            val query = params.entries.joinToString("&") { (k, v) ->
                "${java.net.URLEncoder.encode(k, "UTF-8")}=${java.net.URLEncoder.encode(v, "UTF-8")}"
            }
            return if (actionUrl.contains("?")) "$actionUrl&$query" else "$actionUrl?$query"
        }

        val hrefMatch = Regex("""href=["']([^"']*export=download[^"']*)["']""", RegexOption.IGNORE_CASE).find(html)
        if (hrefMatch != null) {
            val rawHref = hrefMatch.groupValues[1].replace("&amp;", "&")
            return if (rawHref.startsWith("http")) rawHref else "https://drive.google.com$rawHref"
        }
        return null
    }

    private fun openConnectionFollowingRedirects(
        startUrl: String,
        cookieJar: MutableMap<String, String>
    ): java.net.HttpURLConnection {
        var currentUrl = startUrl
        var hops = 0
        while (hops < 10) {
            if (!AlOstaSecurityVault.isSafeExternalHttpUrl(currentUrl)) {
                throw SecurityException("Blocked unsafe redirect URL: $currentUrl")
            }
            val conn = (java.net.URL(currentUrl).openConnection() as java.net.HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 15000
                readTimeout = 30000
                setRequestProperty(
                    "User-Agent",
                    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
                )
                setRequestProperty("Accept", "*/*")
                if (cookieJar.isNotEmpty()) {
                    setRequestProperty(
                        "Cookie",
                        cookieJar.entries.joinToString("; ") { "${it.key}=${it.value}" }
                    )
                }
            }
            val code = conn.responseCode
            val setCookies = conn.headerFields["Set-Cookie"] ?: conn.headerFields["set-cookie"]
            setCookies?.forEach { header ->
                val pair = header.substringBefore(";").split("=", limit = 2)
                if (pair.size == 2) {
                    cookieJar[pair[0].trim()] = pair[1].trim()
                }
            }
            if (code in 300..399) {
                val loc = conn.getHeaderField("Location") ?: break
                val nextUrl = try {
                    java.net.URL(java.net.URL(currentUrl), loc).toString()
                } catch (_: Exception) {
                    loc
                }
                conn.disconnect()
                currentUrl = nextUrl
                hops++
            } else {
                return conn
            }
        }
        return (java.net.URL(currentUrl).openConnection() as java.net.HttpURLConnection).apply {
            instanceFollowRedirects = true
            connectTimeout = 15000
            readTimeout = 30000
        }
    }

    fun startSmartUpdate(
        context: Context,
        rawUrl: String,
        webViewProvider: () -> WebView?
    ) {
        lastWebViewRef = webViewProvider
        val cleanUrl = rawUrl.trim()
        if (cleanUrl.isEmpty()) return

        if (isDownloading) {
            notifyWebView(webViewProvider, "downloading", 50, "جاري تحميل التحديث بالفعل...")
            return
        }

        val gdriveFileId = extractGoogleDriveFileId(cleanUrl)
        val initialUrl = toDirectDownloadUrl(cleanUrl)

        isDownloading = true
        notifyWebView(webViewProvider, "downloading", 5, "جاري الاتصال وتجهيز ملف التحديث...")

        Thread {
            val cookieJar = mutableMapOf<String, String>()
            val targetApk = getTargetApkFile(context)
            val tempApk = java.io.File(targetApk.parentFile, "AlOsta_Update.apk.tmp")

            try {
                var conn = openConnectionFollowingRedirects(initialUrl, cookieJar)
                var input = java.io.BufferedInputStream(conn.inputStream)
                input.mark(8192)
                val headerBytes = ByteArray(4)
                var headerRead = 0
                while (headerRead < 4) {
                    val r = input.read(headerBytes, headerRead, 4 - headerRead)
                    if (r <= 0) break
                    headerRead += r
                }
                val isZipMagic = headerRead == 4 &&
                    headerBytes[0] == 0x50.toByte() &&
                    headerBytes[1] == 0x4B.toByte() &&
                    headerBytes[2] == 0x03.toByte() &&
                    headerBytes[3] == 0x04.toByte()

                if (!isZipMagic) {
                    // Likely Google Drive HTML confirmation page; read HTML and extract confirmed download URL
                    input.reset()
                    val htmlBytes = ByteArray(262144)
                    var totalHtml = 0
                    while (totalHtml < htmlBytes.size) {
                        val r = input.read(htmlBytes, totalHtml, htmlBytes.size - totalHtml)
                        if (r <= 0) break
                        totalHtml += r
                    }
                    input.close()
                    conn.disconnect()

                    val htmlText = String(htmlBytes, 0, totalHtml, Charsets.UTF_8)
                    val confirmedUrl = parseGoogleDriveConfirmationUrl(htmlText, gdriveFileId)
                        ?: if (!gdriveFileId.isNullOrBlank()) {
                            "https://drive.google.com/uc?export=download&id=$gdriveFileId&confirm=t"
                        } else {
                            null
                        }

                    if (confirmedUrl != null) {
                        notifyWebView(webViewProvider, "downloading", 12, "تم تخطي فحص كوكل درايف، جاري تنزيل الحزمة...")
                        conn = openConnectionFollowingRedirects(confirmedUrl, cookieJar)
                        input = java.io.BufferedInputStream(conn.inputStream)
                        input.mark(8192)
                        val secondHeader = ByteArray(4)
                        val secondRead = input.read(secondHeader)
                        val secondIsZip = secondRead == 4 &&
                            secondHeader[0] == 0x50.toByte() &&
                            secondHeader[1] == 0x4B.toByte() &&
                            secondHeader[2] == 0x03.toByte() &&
                            secondHeader[3] == 0x04.toByte()

                        if (!secondIsZip) {
                            input.close()
                            conn.disconnect()
                            isDownloading = false
                            notifyWebView(
                                webViewProvider,
                                "external",
                                100,
                                "الرابط يتطلب فتح المتصفح أو تطبيق الدرايف للتنزيل المباشر"
                            )
                            openInExternalBrowser(context, confirmedUrl)
                            return@Thread
                        }
                        input.reset()
                    } else {
                        isDownloading = false
                        notifyWebView(
                            webViewProvider,
                            "external",
                            100,
                            "تم تحويلك للمتصفح لإكمال تنزيل التحديث"
                        )
                        openInExternalBrowser(context, initialUrl)
                        return@Thread
                    }
                } else {
                    input.reset()
                }

                val contentLength = conn.contentLengthLong
                var downloadedBytes = 0L
                val buffer = ByteArray(32768)
                var lastReportedPct = 10

                java.io.FileOutputStream(tempApk).use { out ->
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        out.write(buffer, 0, read)
                        downloadedBytes += read

                        val pct = if (contentLength > 0L) {
                            ((downloadedBytes * 100L) / contentLength).toInt().coerceIn(10, 99)
                        } else {
                            // Estimate based on ~15MB typical APK size
                            (15 + ((downloadedBytes * 80L) / (15L * 1024L * 1024L)).toInt()).coerceIn(15, 95)
                        }

                        if (pct >= lastReportedPct + 4) {
                            lastReportedPct = pct
                            val mbStr = String.format(Locale.US, "%.1f MB", downloadedBytes / (1024.0 * 1024.0))
                            notifyWebView(
                                webViewProvider,
                                "downloading",
                                pct,
                                "جاري تحميل التحديث... $pct% ($mbStr)"
                            )
                        }
                    }
                    out.flush()
                }
                input.close()
                conn.disconnect()

                if (tempApk.exists() && tempApk.length() > 50_000L) {
                    if (targetApk.exists()) targetApk.delete()
                    tempApk.renameTo(targetApk)
                    val readyApk = unwrapIfNestedZip(targetApk)

                    val archiveInfo = try {
                        context.packageManager.getPackageArchiveInfo(readyApk.absolutePath, 0)
                    } catch (_: Exception) {
                        null
                    }
                    if (archiveInfo != null) {
                        val downloadedPkg = archiveInfo.packageName ?: ""
                        if (downloadedPkg.isNotEmpty() && downloadedPkg != context.packageName) {
                            isDownloading = false
                            val mismatchMsg = if (downloadedPkg.contains("dashboard", ignoreCase = true)) {
                                "⚠️ الملف المرفوع في الرابط هو (تطبيق الداشبورد) وليس التطبيق الرئيسي (الأسطة)! يرجى رفع AlOsta_App.apk الصحيح في الإعدادات."
                            } else {
                                "⚠️ ملف التحديث يخص حزمة أخرى ($downloadedPkg) وليس هذا التطبيق (${context.packageName})."
                            }
                            notifyWebView(webViewProvider, "error", 0, mismatchMsg)
                            return@Thread
                        }
                        val archiveVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            archiveInfo.longVersionCode
                        } else {
                            @Suppress("DEPRECATION")
                            archiveInfo.versionCode.toLong()
                        }
                        val installedPkgInfo = try {
                            context.packageManager.getPackageInfo(context.packageName, 0)
                        } catch (_: Exception) {
                            null
                        }
                        val currentVersionCode = if (installedPkgInfo != null) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                                installedPkgInfo.longVersionCode
                            } else {
                                @Suppress("DEPRECATION")
                                installedPkgInfo.versionCode.toLong()
                            }
                        } else {
                            0L
                        }
                        if (archiveVersionCode in 1 until currentVersionCode) {
                            isDownloading = false
                            notifyWebView(
                                webViewProvider,
                                "error",
                                0,
                                "⚠️ إصدار ملف التحديث (بناء $archiveVersionCode) أقدم من النسخة المثبتة على جهازك حالياً ($currentVersionCode)."
                            )
                            return@Thread
                        }
                    }

                    lastDownloadedApk = readyApk
                    isDownloading = false
                    notifyWebView(
                        webViewProvider,
                        "ready",
                        100,
                        "اكتمل التحميل بنجاح! جاري فتح نافذة تثبيت التطبيق..."
                    )
                    launchPackageInstaller(context, readyApk, webViewProvider)
                } else {
                    tempApk.delete()
                    isDownloading = false
                    notifyWebView(
                        webViewProvider,
                        "external",
                        100,
                        "تم فتح رابط التحديث المباشر في المتصفح"
                    )
                    openInExternalBrowser(context, initialUrl)
                }
            } catch (e: Exception) {
                try {
                    tempApk.delete()
                } catch (_: Exception) {
                }
                isDownloading = false
                notifyWebView(
                    webViewProvider,
                    "error",
                    0,
                    "تعذر التحميل المباشر داخل التطبيق، جرب الضغط على (فتح الرابط في المتصفح)"
                )
                openInExternalBrowser(context, initialUrl)
            }
        }.start()
    }

    private fun unwrapIfNestedZip(downloadedFile: java.io.File): java.io.File {
        return try {
            java.util.zip.ZipFile(downloadedFile).use { zip ->
                if (zip.getEntry("AndroidManifest.xml") != null) {
                    // Already a direct Android APK file
                    return downloadedFile
                }
                // If user uploaded a .zip archive containing .apk file(s) inside it, extract AlOsta_App.apk automatically
                val entries = zip.entries().asSequence().toList()
                val apkEntry = entries.firstOrNull {
                    !it.name.contains("..") && it.name.endsWith("AlOsta_App.apk", ignoreCase = true)
                } ?: entries.firstOrNull {
                    !it.name.contains("..") && it.name.endsWith(".apk", ignoreCase = true) && !it.isDirectory
                }
                if (apkEntry != null) {
                    val maxAllowedApkBytes = 150L * 1024L * 1024L // 150 MB guard against Zip Bomb
                    val extractedFile = java.io.File(downloadedFile.parentFile, "AlOsta_Extracted_Update.apk")
                    if (extractedFile.exists()) extractedFile.delete()
                    zip.getInputStream(apkEntry).use { input ->
                        java.io.FileOutputStream(extractedFile).use { out ->
                            val buf = ByteArray(16384)
                            var totalCopied = 0L
                            while (true) {
                                val r = input.read(buf)
                                if (r <= 0) break
                                totalCopied += r
                                if (totalCopied > maxAllowedApkBytes) {
                                    throw SecurityException("APK entry exceeds maximum safe size")
                                }
                                out.write(buf, 0, r)
                            }
                        }
                    }
                    if (extractedFile.exists() && extractedFile.length() > 50_000L) {
                        downloadedFile.delete()
                        extractedFile.renameTo(downloadedFile)
                    }
                }
            }
            downloadedFile
        } catch (_: Exception) {
            downloadedFile
        }
    }

    fun exportAndShareCurrentApk(context: Context): String {
        return try {
            val sourceApk = java.io.File(context.applicationInfo.sourceDir)
            if (!sourceApk.exists()) return ""

            val isDashPkg = context.packageName.contains("dashboard", ignoreCase = true)
            val exportFileName = if (isDashPkg) "AlOsta_Dashboard.apk" else "AlOsta_App.apk"
            val baseDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.cacheDir
            val exportDir = java.io.File(baseDir, "exported_apks")
            if (!exportDir.exists()) exportDir.mkdirs()
            val outApk = java.io.File(exportDir, exportFileName)
            sourceApk.copyTo(outApk, overwrite = true)

            // Also save a copy in public Downloads if accessible
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val resolver = context.contentResolver
                    val contentValues = android.content.ContentValues().apply {
                        put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, exportFileName)
                        put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/vnd.android.package-archive")
                        put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                    if (uri != null) {
                        resolver.openOutputStream(uri)?.use { outStream ->
                            java.io.FileInputStream(sourceApk).use { inStream ->
                                inStream.copyTo(outStream)
                            }
                        }
                    }
                }
            } catch (_: Exception) {
            }

            mainHandler.post {
                try {
                    val apkUri = androidx.core.content.FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        outApk
                    )
                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "application/vnd.android.package-archive"
                        putExtra(Intent.EXTRA_STREAM, apkUri)
                        putExtra(Intent.EXTRA_TITLE, exportFileName)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    val chooser = Intent.createChooser(shareIntent, "حفظ أو رفع ملف ($exportFileName)").apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(chooser)
                    Toast.makeText(
                        context,
                        "تم حفظ $exportFileName في التنزيلات وفتح نافذة الرفع ✓",
                        Toast.LENGTH_LONG
                    ).show()
                } catch (_: Exception) {
                }
            }
            outApk.absolutePath
        } catch (e: Exception) {
            ""
        }
    }

    fun openInExternalBrowser(context: Context, rawUrl: String) {
        val directUrl = toDirectDownloadUrl(rawUrl)
        mainHandler.post {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(directUrl)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } catch (_: Exception) {
                try {
                    val fallback = Intent(Intent.ACTION_VIEW, Uri.parse(rawUrl.trim())).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(fallback)
                } catch (_: Exception) {
                }
            }
        }
    }
}

class AndroidAppBridge(
    private val context: Context,
    private val webViewProvider: () -> WebView?,
    private val onThemeModeChange: (Boolean) -> Unit
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val notificationIdCounter = AtomicInteger(1001)

    private fun isTrustedCallerOrigin(): Boolean {
        return try {
            val wv = webViewProvider() ?: return true
            if (Looper.myLooper() == Looper.getMainLooper()) {
                AlOstaSecurityVault.isTrustedWebViewOrigin(wv.url)
            } else {
                var trusted = true
                val latch = java.util.concurrent.CountDownLatch(1)
                mainHandler.post {
                    try {
                        trusted = AlOstaSecurityVault.isTrustedWebViewOrigin(wv.url)
                    } catch (_: Exception) {
                    } finally {
                        latch.countDown()
                    }
                }
                latch.await(800, java.util.concurrent.TimeUnit.MILLISECONDS)
                trusted
            }
        } catch (_: Exception) {
            true
        }
    }

    @JavascriptInterface
    fun startUpdate(apkUrl: String?) {
        if (apkUrl.isNullOrBlank() || !isTrustedCallerOrigin()) return
        if (!AlOstaSecurityVault.isSafeExternalHttpUrl(apkUrl)) return
        AlOstaApkUpdater.startSmartUpdate(context, apkUrl, webViewProvider)
    }

    @JavascriptInterface
    fun installDownloadedApk(): Boolean {
        return AlOstaApkUpdater.launchPackageInstaller(context, webViewProvider = webViewProvider)
    }

    @JavascriptInterface
    fun openExternalUpdateUrl(apkUrl: String?) {
        if (apkUrl.isNullOrBlank()) return
        AlOstaApkUpdater.openInExternalBrowser(context, apkUrl)
    }

    @JavascriptInterface
    fun exportAndShareApk(): String {
        return AlOstaApkUpdater.exportAndShareCurrentApk(context)
    }

    @JavascriptInterface
    fun getAppPackageInfo(): String {
        val isDash = context.packageName.contains("dashboard", ignoreCase = true)
        val lastUpdateTime = AlOstaApkUpdater.getInstalledLastUpdateTime(context)
        val firstInstallTime = AlOstaApkUpdater.getInstalledFirstInstallTime(context)
        return """{"packageName":"${context.packageName}","versionName":"${BuildConfig.VERSION_NAME}","versionCode":${BuildConfig.VERSION_CODE},"buildTimeMs":${BuildConfig.BUILD_TIMESTAMP_MS},"lastUpdateTime":$lastUpdateTime,"firstInstallTime":$firstInstallTime,"isDashboard":$isDash}"""
    }

    @JavascriptInterface
    fun printPage() {
        mainHandler.post {
            val webView = webViewProvider() ?: return@post
            try {
                val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return@post
                val jobName = context.getString(R.string.print_job_name)
                val printAdapter = webView.createPrintDocumentAdapter(jobName)
                printManager.print(jobName, printAdapter, PrintAttributes.Builder().build())
            } catch (e: Exception) {
                Toast.makeText(context, "تعذر فتح الطباعة", Toast.LENGTH_SHORT).show()
            }
        }
    }

    @JavascriptInterface
    fun copyText(text: String?) {
        if (text == null) return
        mainHandler.post {
            try {
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                clipboard?.setPrimaryClip(ClipData.newPlainText("AlOstaCode", text))
            } catch (_: Exception) {
            }
        }
    }

    @JavascriptInterface
    fun getClipboardText(): String {
        return try {
            var result = ""
            if (Looper.myLooper() == Looper.getMainLooper()) {
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                val clip = clipboard?.primaryClip
                if (clip != null && clip.itemCount > 0) {
                    result = clip.getItemAt(0).coerceToText(context)?.toString()?.trim() ?: ""
                }
            } else {
                val latch = java.util.concurrent.CountDownLatch(1)
                mainHandler.post {
                    try {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                        val clip = clipboard?.primaryClip
                        if (clip != null && clip.itemCount > 0) {
                            result = clip.getItemAt(0).coerceToText(context)?.toString()?.trim() ?: ""
                        }
                    } catch (_: Exception) {
                    } finally {
                        latch.countDown()
                    }
                }
                latch.await(1500, java.util.concurrent.TimeUnit.MILLISECONDS)
            }
            result
        } catch (_: Exception) {
            ""
        }
    }

    @JavascriptInterface
    fun resolveShortMapUrl(inputText: String?): String {
        if (inputText.isNullOrBlank() || !isTrustedCallerOrigin()) return "{}"
        return try {
            val urlRegex = Regex("""https?://[^\s"'<>]+""", RegexOption.IGNORE_CASE)
            val initialUrl = urlRegex.find(inputText)?.value ?: return "{}"
            if (!AlOstaSecurityVault.isSafeExternalHttpUrl(initialUrl)) return "{}"
            var currentUrl = initialUrl
            var foundCoords: Pair<Double, Double>? = extractLatLngFromText(currentUrl)

            var hops = 0
            var htmlSnippet = ""
            while (hops < 8 && foundCoords == null) {
                if (!AlOstaSecurityVault.isSafeExternalHttpUrl(currentUrl)) break
                val conn = (java.net.URL(currentUrl).openConnection() as? java.net.HttpURLConnection) ?: break
                try {
                    conn.instanceFollowRedirects = false
                    conn.connectTimeout = 5000
                    conn.readTimeout = 5000
                    conn.setRequestProperty(
                        "User-Agent",
                        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                    )
                    val code = conn.responseCode
                    if (code in 300..399) {
                        val locHeader = conn.getHeaderField("Location") ?: break
                        val nextUrl = try {
                            java.net.URL(java.net.URL(currentUrl), locHeader).toString()
                        } catch (_: Exception) {
                            locHeader
                        }
                        currentUrl = nextUrl
                        foundCoords = extractLatLngFromText(currentUrl)
                        hops++
                    } else {
                        val stream = try {
                            conn.inputStream
                        } catch (_: Exception) {
                            conn.errorStream
                        }
                        if (stream != null) {
                            val buffer = ByteArray(49152)
                            var totalRead = 0
                            while (totalRead < buffer.size) {
                                val r = stream.read(buffer, totalRead, buffer.size - totalRead)
                                if (r <= 0) break
                                totalRead += r
                            }
                            htmlSnippet = String(buffer, 0, totalRead, Charsets.UTF_8)
                            foundCoords = extractLatLngFromText(htmlSnippet)
                        }
                        break
                    }
                } finally {
                    conn.disconnect()
                }
            }

            val json = org.json.JSONObject()
            json.put("resolvedUrl", currentUrl)
            if (foundCoords != null) {
                json.put("lat", foundCoords.first)
                json.put("lng", foundCoords.second)
            }
            json.toString()
        } catch (_: Exception) {
            "{}"
        }
    }

    private fun extractLatLngFromText(raw: String): Pair<Double, Double>? {
        val decoded = try {
            java.net.URLDecoder.decode(raw, "UTF-8")
        } catch (_: Exception) {
            raw
        }
        val patterns = listOf(
            Regex("""@(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)"""),
            Regex("""!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)"""),
            Regex("""[?&](?:q|ll|query|center|destination|daddr)=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)""", RegexOption.IGNORE_CASE),
            Regex("""/(?:place|search|dir)/[^/]*?(-?\d{1,2}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)""", RegexOption.IGNORE_CASE),
            Regex("""staticmap\?[^"']*?center=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)""", RegexOption.IGNORE_CASE),
            Regex("""\[null,null,(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]""")
        )
        for (p in patterns) {
            val m = p.find(decoded) ?: p.find(raw)
            if (m != null) {
                val lat = m.groupValues[1].toDoubleOrNull()
                val lng = m.groupValues[2].toDoubleOrNull()
                if (lat != null && lng != null && kotlin.math.abs(lat) <= 90.0 && kotlin.math.abs(lng) <= 180.0) {
                    return Pair(lat, lng)
                }
            }
        }
        val reversePattern = Regex("""!2d(-?\d{1,3}\.\d+)!3d(-?\d{1,2}\.\d+)""")
        val revMatch = reversePattern.find(decoded) ?: reversePattern.find(raw)
        if (revMatch != null) {
            val lng = revMatch.groupValues[1].toDoubleOrNull()
            val lat = revMatch.groupValues[2].toDoubleOrNull()
            if (lat != null && lng != null && kotlin.math.abs(lat) <= 90.0 && kotlin.math.abs(lng) <= 180.0) {
                return Pair(lat, lng)
            }
        }
        return null
    }

    @JavascriptInterface
    fun showNotification(title: String?, body: String?) {
        if (title.isNullOrBlank() && body.isNullOrBlank()) return
        mainHandler.post {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    val granted = ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) == PackageManager.PERMISSION_GRANTED
                    if (!granted) return@post
                }
                val launchIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val pendingIntent = PendingIntent.getActivity(
                    context,
                    0,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                val notification = NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title ?: context.getString(R.string.app_name))
                    .setContentText(body ?: "")
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent)
                    .build()

                val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                manager?.notify(notificationIdCounter.getAndIncrement(), notification)
            } catch (_: Exception) {
            }
        }
    }

    @JavascriptInterface
    fun setThemeMode(mode: String?) {
        mainHandler.post {
            onThemeModeChange(mode == "dark")
        }
    }

    @JavascriptInterface
    fun loadLocalDb(): String {
        if (!isTrustedCallerOrigin()) return "{}"
        return try {
            val prefs = context.getSharedPreferences("al_osta_local_db", Context.MODE_PRIVATE)
            val raw = prefs.getString("db_json", "{}") ?: "{}"
            AlOstaSecurityVault.decryptAtRest(raw)
        } catch (e: Exception) {
            "{}"
        }
    }

    @JavascriptInterface
    fun saveLocalDb(json: String?) {
        if (json == null || !isTrustedCallerOrigin()) return
        try {
            val encrypted = AlOstaSecurityVault.encryptAtRest(json)
            val prefs = context.getSharedPreferences("al_osta_local_db", Context.MODE_PRIVATE)
            prefs.edit().putString("db_json", encrypted).apply()
        } catch (_: Exception) {
        }
    }

    @JavascriptInterface
    fun encryptVaultPayload(plainText: String?): String {
        if (plainText.isNullOrEmpty() || !isTrustedCallerOrigin()) return ""
        return AlOstaSecurityVault.encryptAtRest(plainText)
    }

    @JavascriptInterface
    fun decryptVaultPayload(cipherText: String?): String {
        if (cipherText.isNullOrEmpty() || !isTrustedCallerOrigin()) return ""
        return AlOstaSecurityVault.decryptAtRest(cipherText)
    }

    @JavascriptInterface
    fun hashCredential(secret: String?, salt: String?): String {
        if (secret.isNullOrEmpty() || !isTrustedCallerOrigin()) return ""
        return AlOstaSecurityVault.pbkdf2Hash(secret, salt ?: "")
    }

    @SuppressLint("MissingPermission")
    @JavascriptInterface
    fun getNativeLocation(): String {
        return AlOstaLocationManager.getBestLocationJson(context)
    }

    @JavascriptInterface
    fun setGpsTrackingActive(enabled: Boolean) {
        try {
            AlOstaLocationManager.setShiftTracking(context, enabled)
        } catch (_: Exception) {
        }
    }

    @JavascriptInterface
    fun setStepTrackingState(enabled: Boolean, workerId: String) {
        try {
            WorkerStepTracker.setTrackingState(context, enabled, workerId)
        } catch (_: Exception) {
        }
    }

    @JavascriptInterface
    fun getWorkerSteps(): String {
        return try {
            WorkerStepTracker.getStepMetricsJson(context)
        } catch (e: Exception) {
            """{"steps":0,"distanceMeters":0,"calories":0,"effortScore":0,"effortStars":0,"sensorActive":false}"""
        }
    }

    @JavascriptInterface
    fun getWorkerStepsForId(workerId: String): String {
        return try {
            WorkerStepTracker.getStepMetricsJson(context, workerId)
        } catch (e: Exception) {
            """{"steps":0,"distanceMeters":0,"calories":0,"effortScore":0,"effortStars":0,"sensorActive":false}"""
        }
    }

    @JavascriptInterface
    fun resetDailySteps(): String {
        return try {
            WorkerStepTracker.resetTodaySteps(context)
        } catch (e: Exception) {
            """{"steps":0,"distanceMeters":0,"calories":0,"effortScore":0,"effortStars":0,"sensorActive":false}"""
        }
    }

    @JavascriptInterface
    fun resetDailyStepsForId(workerId: String): String {
        return try {
            WorkerStepTracker.resetTodaySteps(context, workerId)
        } catch (e: Exception) {
            """{"steps":0,"distanceMeters":0,"calories":0,"effortScore":0,"effortStars":0,"sensorActive":false}"""
        }
    }

    @JavascriptInterface
    fun triggerHaptic() {
        mainHandler.post {
            try {
                webViewProvider()?.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP)
            } catch (_: Exception) {
            }
        }
    }

    @JavascriptInterface
    fun saveBase64ImageToDevice(base64Data: String, fileName: String): Boolean {
        return try {
            val cleanBase64 = base64Data.substringAfter("base64,", base64Data).trim()
            if (cleanBase64.isEmpty()) return false
            val bytes = android.util.Base64.decode(cleanBase64, android.util.Base64.DEFAULT)
            val safeName = fileName.replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "store_qr_${System.currentTimeMillis()}.png" }
            val finalName = if (safeName.endsWith(".png", true) || safeName.endsWith(".jpg", true)) safeName else "$safeName.png"

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val resolver = context.contentResolver
                val contentValues = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, finalName)
                    put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "image/png")
                    put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_PICTURES + "/AlOsta")
                    put(android.provider.MediaStore.Images.Media.IS_PENDING, 1)
                }
                val imageUri = resolver.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues) ?: return false
                resolver.openOutputStream(imageUri)?.use { out ->
                    out.write(bytes)
                    out.flush()
                }
                contentValues.clear()
                contentValues.put(android.provider.MediaStore.Images.Media.IS_PENDING, 0)
                resolver.update(imageUri, contentValues, null, null)
            } else {
                val dir = java.io.File(
                    android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_PICTURES),
                    "AlOsta"
                )
                if (!dir.exists()) dir.mkdirs()
                val outFile = java.io.File(dir, finalName)
                java.io.FileOutputStream(outFile).use { out ->
                    out.write(bytes)
                    out.flush()
                }
            }
            mainHandler.post {
                android.widget.Toast.makeText(
                    context,
                    "تم حفظ صورة الباركود في استوديو الجهاز (Pictures/AlOsta) ✓",
                    android.widget.Toast.LENGTH_LONG
                ).show()
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun loadCompiledJs(cacheKey: String): String {
        return try {
            val safeKey = cacheKey.replace(Regex("[^a-zA-Z0-9._-]"), "_")
            val cacheDir = java.io.File(context.filesDir, "jsx_compiled_cache")
            val file = java.io.File(cacheDir, "$safeKey.js")
            if (file.exists() && file.length() > 0L) {
                file.readText(Charsets.UTF_8)
            } else {
                ""
            }
        } catch (e: Exception) {
            ""
        }
    }

    @JavascriptInterface
    fun saveCompiledJs(cacheKey: String, code: String) {
        if (code.isBlank()) return
        Thread {
            try {
                val safeKey = cacheKey.replace(Regex("[^a-zA-Z0-9._-]"), "_")
                val prefix = safeKey.substringBefore("_", "jsx")
                val cacheDir = java.io.File(context.filesDir, "jsx_compiled_cache")
                if (!cacheDir.exists()) cacheDir.mkdirs()
                cacheDir.listFiles()?.forEach { existing ->
                    if (existing.name.startsWith(prefix) && existing.name != "$safeKey.js") {
                        existing.delete()
                    }
                }
                val file = java.io.File(cacheDir, "$safeKey.js")
                file.writeText(code, Charsets.UTF_8)
            } catch (_: Exception) {
            }
        }.start()
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun AlOstaAppScreen(
    onThemeChanged: (Boolean) -> Unit,
    onExitApp: () -> Unit,
    initialAssetUrl: String = "file:///android_asset/index.html"
) {
    val context = LocalContext.current
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var showExitDialog by rememberSaveable { mutableStateOf(false) }
    var isOnline by remember { mutableStateOf(checkIsOnline(context)) }

    // Pending geolocation callback from WebChromeClient when requesting Android runtime location permissions
    var pendingGeoOrigin by remember { mutableStateOf<String?>(null) }
    var pendingGeoCallback by remember { mutableStateOf<GeolocationPermissions.Callback?>(null) }
    var filePathCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }

    val fileChooserLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        val cb = filePathCallback
        filePathCallback = null
        if (uri != null) {
            cb?.onReceiveValue(arrayOf(uri))
        } else {
            cb?.onReceiveValue(null)
        }
    }

    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val fineGranted = results[Manifest.permission.ACCESS_FINE_LOCATION] == true
        val coarseGranted = results[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        val locationGranted = fineGranted || coarseGranted
        if (locationGranted) {
            hasLocationPermission = true
        }
        WorkerStepTracker.onPermissionUpdated(context)

        pendingGeoCallback?.let { callback ->
            val origin = pendingGeoOrigin ?: ""
            callback.invoke(origin, locationGranted, false)
            pendingGeoCallback = null
            pendingGeoOrigin = null
        }
    }

    // Request permissions on initial launch so GPS attendance, step counting, and notifications work seamlessly
    LaunchedEffect(Unit) {
        val permissionsToRequest = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.ACTIVITY_RECOGNITION)
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        if (permissionsToRequest.isNotEmpty()) {
            permissionLauncher.launch(permissionsToRequest.toTypedArray())
        }
    }

    // Battery-friendly GPS: stopped when screen disposes; active ONLY on-demand or during a worker's active shift
    DisposableEffect(context) {
        onDispose {
            AlOstaLocationManager.stopTracking(context)
        }
    }

    // Monitor network connectivity changes
    DisposableEffect(context) {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                isOnline = true
            }

            override fun onLost(network: Network) {
                isOnline = checkIsOnline(context)
            }
        }
        try {
            connectivityManager?.registerDefaultNetworkCallback(callback)
        } catch (_: Exception) {
        }
        onDispose {
            try {
                connectivityManager?.unregisterNetworkCallback(callback)
            } catch (_: Exception) {
            }
        }
    }

    BackHandler {
        val wv = webViewRef
        if (wv != null && wv.canGoBack()) {
            wv.goBack()
        } else {
            showExitDialog = true
        }
    }

    Surface(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.systemBars)
            .testTag("al_osta_root"),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            AnimatedVisibility(
                visible = !isOnline,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFE11D48))
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .testTag("offline_banner"),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = stringResource(R.string.offline_banner),
                            tint = Color.White
                        )
                        Text(
                            text = stringResource(R.string.offline_banner),
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    TextButton(
                        onClick = {
                            isOnline = checkIsOnline(context)
                            webViewRef?.reload()
                        },
                        modifier = Modifier.testTag("retry_connection_button")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(R.string.retry),
                            tint = Color.White
                        )
                    }
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f)
            ) {
                AndroidView(
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("al_osta_webview"),
                    factory = { ctx ->
                        WebView(ctx).apply {
                            layoutParams = android.view.ViewGroup.LayoutParams(
                                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                                android.view.ViewGroup.LayoutParams.MATCH_PARENT
                            )
                            webViewRef = this
                            setBackgroundColor(android.graphics.Color.parseColor("#EEF2FF"))
                            CookieManager.getInstance().setAcceptCookie(true)
                            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

                            settings.apply {
                                javaScriptEnabled = true
                                domStorageEnabled = true
                                @Suppress("DEPRECATION")
                                databaseEnabled = true
                                useWideViewPort = true
                                loadWithOverviewMode = true
                                setGeolocationEnabled(true)
                                allowFileAccess = true
                                allowContentAccess = true
                                @Suppress("DEPRECATION")
                                allowFileAccessFromFileURLs = false
                                @Suppress("DEPRECATION")
                                allowUniversalAccessFromFileURLs = false
                                javaScriptCanOpenWindowsAutomatically = true
                                setSupportMultipleWindows(true)
                                loadsImagesAutomatically = true
                                mediaPlaybackRequiresUserGesture = false
                                cacheMode = WebSettings.LOAD_DEFAULT
                                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                textZoom = 100
                            }

                            addJavascriptInterface(
                                AndroidAppBridge(
                                    context = ctx,
                                    webViewProvider = { this },
                                    onThemeModeChange = { dark ->
                                        val bgHex = if (dark) "#0F172A" else "#EEF2FF"
                                        try {
                                            setBackgroundColor(android.graphics.Color.parseColor(bgHex))
                                        } catch (_: Exception) {
                                        }
                                        onThemeChanged(dark)
                                    }
                                ),
                                "AndroidApp"
                            )

                            webViewClient = object : WebViewClient() {
                                override fun shouldOverrideUrlLoading(
                                    view: WebView?,
                                    request: WebResourceRequest?
                                ): Boolean {
                                    val url = request?.url?.toString() ?: return false
                                    if (url.contains("storePortal=", ignoreCase = true) && !url.startsWith("file:///android_asset")) {
                                        val qIdx = url.indexOf('?')
                                        val queryPart = if (qIdx >= 0) url.substring(qIdx) else ""
                                        view?.loadUrl("file:///android_asset/dashboard.html$queryPart")
                                        return true
                                    }
                                    return handleExternalUrl(ctx, url)
                                }

                                @Deprecated("Deprecated in Java")
                                override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                                    if (url == null) return false
                                    if (url.contains("storePortal=", ignoreCase = true) && !url.startsWith("file:///android_asset")) {
                                        val qIdx = url.indexOf('?')
                                        val queryPart = if (qIdx >= 0) url.substring(qIdx) else ""
                                        view?.loadUrl("file:///android_asset/dashboard.html$queryPart")
                                        return true
                                    }
                                    return handleExternalUrl(ctx, url)
                                }
                            }

                            webChromeClient = object : WebChromeClient() {
                                override fun onGeolocationPermissionsShowPrompt(
                                    origin: String?,
                                    callback: GeolocationPermissions.Callback?
                                ) {
                                    if (callback == null) return
                                    val hasFine = ContextCompat.checkSelfPermission(
                                        ctx,
                                        Manifest.permission.ACCESS_FINE_LOCATION
                                    ) == PackageManager.PERMISSION_GRANTED
                                    val hasCoarse = ContextCompat.checkSelfPermission(
                                        ctx,
                                        Manifest.permission.ACCESS_COARSE_LOCATION
                                    ) == PackageManager.PERMISSION_GRANTED

                                    if (hasFine || hasCoarse) {
                                        callback.invoke(origin, true, false)
                                    } else {
                                        pendingGeoOrigin = origin
                                        pendingGeoCallback = callback
                                        permissionLauncher.launch(
                                            arrayOf(
                                                Manifest.permission.ACCESS_FINE_LOCATION,
                                                Manifest.permission.ACCESS_COARSE_LOCATION
                                            )
                                        )
                                    }
                                }

                                override fun onShowFileChooser(
                                    webView: WebView?,
                                    filePathCallbackParam: ValueCallback<Array<Uri>>?,
                                    fileChooserParams: FileChooserParams?
                                ): Boolean {
                                    filePathCallback?.onReceiveValue(null)
                                    filePathCallback = filePathCallbackParam
                                    return try {
                                        fileChooserLauncher.launch("image/*")
                                        true
                                    } catch (e: Exception) {
                                        filePathCallback = null
                                        false
                                    }
                                }

                                override fun onCreateWindow(
                                    view: WebView?,
                                    isDialog: Boolean,
                                    isUserGesture: Boolean,
                                    resultMsg: Message?
                                ): Boolean {
                                    val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false
                                    val tempWebView = WebView(ctx)
                                    tempWebView.webViewClient = object : WebViewClient() {
                                        override fun shouldOverrideUrlLoading(
                                            v: WebView?,
                                            request: WebResourceRequest?
                                        ): Boolean {
                                            val targetUrl = request?.url?.toString()
                                            if (!targetUrl.isNullOrBlank()) {
                                                openExternalIntent(ctx, targetUrl)
                                            }
                                            tempWebView.destroy()
                                            return true
                                        }
                                    }
                                    transport.webView = tempWebView
                                    resultMsg.sendToTarget()
                                    return true
                                }
                            }

                            val startAssetUrl = if (
                                initialAssetUrl.contains("dashboard.html", ignoreCase = true)
                            ) {
                                initialAssetUrl
                            } else if (
                                BuildConfig.APPLICATION_ID.contains("dashboard", ignoreCase = true) ||
                                ctx.packageName.contains("dashboard", ignoreCase = true)
                            ) {
                                val qIdx = initialAssetUrl.indexOf('?')
                                val queryPart = if (qIdx >= 0) initialAssetUrl.substring(qIdx) else ""
                                "file:///android_asset/dashboard.html$queryPart"
                            } else {
                                initialAssetUrl
                            }
                            loadUrl(startAssetUrl)
                        }
                    }
                )
            }
        }
    }

    if (showExitDialog) {
        AlertDialog(
            onDismissRequest = { showExitDialog = false },
            title = {
                Text(
                    text = stringResource(R.string.exit_confirm_title),
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Text(text = stringResource(R.string.exit_confirm_message))
            },
            confirmButton = {
                Button(
                    onClick = {
                        showExitDialog = false
                        onExitApp()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFE11D48),
                        contentColor = Color.White
                    ),
                    modifier = Modifier.testTag("confirm_exit_button")
                ) {
                    Text(text = stringResource(R.string.yes))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showExitDialog = false },
                    modifier = Modifier.testTag("cancel_exit_button")
                ) {
                    Text(text = stringResource(R.string.cancel))
                }
            }
        )
    }
}

private fun handleExternalUrl(context: Context, url: String): Boolean {
    if (url.startsWith("file:///android_asset/")) {
        return false
    }
    if (AlOstaSecurityVault.isSafeIntentUrl(url)) {
        openExternalIntent(context, url)
        return true
    }
    // Block any untrusted scheme or non-asset URL from loading inside the privileged WebView
    return true
}

private fun openExternalIntent(context: Context, url: String) {
    if (!AlOstaSecurityVault.isSafeIntentUrl(url)) return
    try {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addCategory(Intent.CATEGORY_BROWSABLE)
        }
        context.startActivity(intent)
    } catch (e: Exception) {
        Toast.makeText(context, "تعذر فتح الرابط الخارجي", Toast.LENGTH_SHORT).show()
    }
}

private fun checkIsOnline(context: Context): Boolean {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return true
    val network = cm.activeNetwork ?: return false
    val capabilities = cm.getNetworkCapabilities(network) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
}

class DashboardActivity : MainActivity() {
    override val isDashboardMode: Boolean = true
}

