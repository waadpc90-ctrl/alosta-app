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
import java.util.concurrent.Executors
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

    companion object {
        @Volatile
        var isAppInForeground: Boolean = false
    }

    protected open val isDashboardMode: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        window.setBackgroundDrawable(
            android.graphics.drawable.ColorDrawable(android.graphics.Color.parseColor("#EEF2FF"))
        )
        createNotificationChannel()
        if (!isDashboardMode && !packageName.contains("dashboard", ignoreCase = true)) {
            AlOstaBackgroundNotifier.schedulePeriodicCheck(this)
        }
        // Clear WebView disk caches whenever versionCode OR build timestamp changes
        // (guarantees every APK rebuild loads fresh assets immediately while keeping warm-start fast)
        try {
            val cachePrefs = getSharedPreferences("al_osta_cache_meta", Context.MODE_PRIVATE)
            val lastCacheVersion = cachePrefs.getInt("last_version_code", -1)
            val lastBuildTs = cachePrefs.getLong("last_build_ts", -1L)
            if (lastCacheVersion != BuildConfig.VERSION_CODE || lastBuildTs != BuildConfig.BUILD_TIMESTAMP_MS) {
                java.io.File(filesDir, "wv_cdn_cache").deleteRecursively()
                java.io.File(filesDir, "jsx_compiled_cache").deleteRecursively()
                val dataDirFile = java.io.File(applicationInfo.dataDir)
                java.io.File(dataDirFile, "app_webview/Default/Code Cache").deleteRecursively()
                java.io.File(dataDirFile, "app_webview/Default/Cache").deleteRecursively()
                cachePrefs.edit()
                    .putInt("last_version_code", BuildConfig.VERSION_CODE)
                    .putLong("last_build_ts", BuildConfig.BUILD_TIMESTAMP_MS)
                    .apply()
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
        val cacheBuster = "v=${BuildConfig.VERSION_CODE}_${BuildConfig.BUILD_TIMESTAMP_MS}"
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
        isAppInForeground = true
        AlOstaApkUpdater.onActivityResume(this)
    }

    override fun onPause() {
        isAppInForeground = false
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

// Extracted modules in package com.example:
// - AlOstaSecurityVault.kt (AES-256-GCM keystore vault, PBKDF2, URL/origin guards)
// - WorkerStepTracker.kt (hardware step sensors + stationary craft motion engine)
// - AlOstaLocationManager.kt (battery-aware shift & one-shot GPS manager)
// - AlOstaApkUpdater.kt (in-app APK downloader, Drive bypass, nested-zip unwrap, installer)

class AndroidAppBridge(
    private val context: Context,
    private val webViewProvider: () -> WebView?,
    private val onThemeModeChange: (Boolean) -> Unit
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val localDbExecutor = Executors.newSingleThreadExecutor()
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
        if (!isTrustedCallerOrigin()) return
        val sanitized = AlOstaApkUpdater.sanitizeInputUrl(apkUrl ?: "")
        if (sanitized.isBlank() || !AlOstaSecurityVault.isSafeExternalHttpUrl(sanitized)) {
            AlOstaApkUpdater.notifyWebView(
                webViewProvider,
                "error",
                0,
                "⚠️ رابط التحديث غير صالح — يرجى التحقق من الرابط في لوحة التحكم."
            )
            return
        }
        AlOstaApkUpdater.startSmartUpdate(context, sanitized, webViewProvider)
    }

    @JavascriptInterface
    fun installDownloadedApk(): Boolean {
        return AlOstaApkUpdater.launchPackageInstaller(context, webViewProvider = webViewProvider)
    }

    @JavascriptInterface
    fun openExternalUpdateUrl(apkUrl: String?) {
        val sanitized = AlOstaApkUpdater.sanitizeInputUrl(apkUrl ?: "")
        if (sanitized.isBlank() || !AlOstaSecurityVault.isSafeExternalHttpUrl(sanitized)) return
        AlOstaApkUpdater.openInExternalBrowser(context, sanitized)
    }

    @JavascriptInterface
    fun verifyUpdateApkUrl(apkUrl: String?): String {
        if (!isTrustedCallerOrigin()) {
            return """{"ok":false,"statusCode":0,"message":"Unauthorized origin"}"""
        }
        return AlOstaApkUpdater.verifyApkUrl(apkUrl ?: "")
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
    fun registerNotificationProfile(
        role: String?,
        userId: String?,
        appVersion: String?,
        projectId: String?,
        apiKey: String?
    ) {
        if (!isTrustedCallerOrigin()) return
        AlOstaBackgroundNotifier.saveProfile(
            context = context,
            role = role ?: "guest",
            userId = userId ?: "",
            appVersion = appVersion ?: BuildConfig.VERSION_NAME,
            projectId = projectId ?: "",
            apiKey = apiKey ?: ""
        )
    }

    @JavascriptInterface
    fun clearNotificationProfile() {
        if (!isTrustedCallerOrigin()) return
        AlOstaBackgroundNotifier.clearUserSession(context)
    }

    @JavascriptInterface
    fun setThemeMode(mode: String?) {
        mainHandler.post {
            onThemeModeChange(mode == "dark")
        }
    }

    @Volatile
    private var latestLocalDbJson: String? = null

    @JavascriptInterface
    fun loadLocalDb(): String {
        if (!isTrustedCallerOrigin()) return "{}"
        latestLocalDbJson?.let { return it }
        return try {
            val prefs = context.getSharedPreferences("al_osta_local_db", Context.MODE_PRIVATE)
            val raw = prefs.getString("db_json", "{}") ?: "{}"
            val decrypted = AlOstaSecurityVault.decryptAtRest(raw)
            latestLocalDbJson = decrypted
            decrypted
        } catch (e: Exception) {
            "{}"
        }
    }

    @JavascriptInterface
    fun saveLocalDb(json: String?) {
        if (json == null || !isTrustedCallerOrigin()) return
        latestLocalDbJson = json
        val appCtx = context.applicationContext
        localDbExecutor.execute {
            try {
                val encrypted = AlOstaSecurityVault.encryptAtRest(json)
                val prefs = appCtx.getSharedPreferences("al_osta_local_db", Context.MODE_PRIVATE)
                prefs.edit().putString("db_json", encrypted).apply()
            } catch (_: Exception) {
            }
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

                            setDownloadListener { url, _, _, mimeType, _ ->
                                val sanitized = AlOstaApkUpdater.sanitizeInputUrl(url ?: "")
                                if (sanitized.isNotBlank() && AlOstaSecurityVault.isSafeExternalHttpUrl(sanitized)) {
                                    if (sanitized.endsWith(".apk", ignoreCase = true) ||
                                        mimeType.equals("application/vnd.android.package-archive", ignoreCase = true)
                                    ) {
                                        AlOstaApkUpdater.startSmartUpdate(ctx, sanitized) { this }
                                    } else {
                                        AlOstaApkUpdater.openInExternalBrowser(ctx, sanitized)
                                    }
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

