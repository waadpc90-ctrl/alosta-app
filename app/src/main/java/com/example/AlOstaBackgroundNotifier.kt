package com.example

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

object AlOstaBackgroundNotifier {

    private const val PREFS_NAME = "alosta_bg_notif_prefs"
    private const val KEY_ROLE = "role"
    private const val KEY_USER_ID = "user_id"
    private const val KEY_APP_VERSION = "app_version"
    private const val KEY_PROJECT_ID = "fb_project_id"
    private const val KEY_API_KEY = "fb_api_key"
    private const val KEY_ID_TOKEN = "fb_id_token"
    private const val KEY_REFRESH_TOKEN = "fb_refresh_token"
    private const val KEY_TOKEN_EXPIRES_AT = "fb_token_expires_at"
    private const val KEY_LAST_GLOBAL_CHECK = "last_global_check_ms"
    private const val KEY_SEEN_IDS = "seen_notif_ids"
    private const val KEY_LAST_OTA_KEY = "last_ota_notified_key"

    private const val JOB_ID = 4901
    private const val PERIODIC_INTERVAL_MS = 15L * 60L * 1000L // 15 minutes (Android JobScheduler min)
    private const val GLOBAL_CHECK_COOLDOWN_MS = 60L * 60L * 1000L // Check OTA + announcements once per hour
    private const val MAX_SEEN_IDS = 120
    private const val CHANNEL_ID = "al_osta_notifications"

    private val notifIdSeq = AtomicInteger(5000)

    fun saveProfile(
        context: Context,
        role: String,
        userId: String,
        appVersion: String,
        projectId: String,
        apiKey: String
    ) {
        if (context.packageName.contains("dashboard", ignoreCase = true)) return
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val editor = prefs.edit()
        if (role.isNotBlank()) editor.putString(KEY_ROLE, role.trim())
        editor.putString(KEY_USER_ID, userId.trim())
        if (appVersion.isNotBlank()) editor.putString(KEY_APP_VERSION, appVersion.trim())
        if (projectId.isNotBlank()) editor.putString(KEY_PROJECT_ID, projectId.trim())
        if (apiKey.isNotBlank()) editor.putString(KEY_API_KEY, apiKey.trim())
        editor.apply()
        schedulePeriodicCheck(context)
    }

    fun clearUserSession(context: Context) {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_ROLE, "guest")
            .remove(KEY_USER_ID)
            .apply()
    }

    fun schedulePeriodicCheck(context: Context) {
        if (context.packageName.contains("dashboard", ignoreCase = true)) return
        try {
            val appCtx = context.applicationContext
            val scheduler = appCtx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
            val existing = scheduler.allPendingJobs.any { it.id == JOB_ID }
            if (existing) return

            val component = ComponentName(appCtx, AlOstaBackgroundNotifierService::class.java)
            val builder = JobInfo.Builder(JOB_ID, component)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                builder.setPeriodic(PERIODIC_INTERVAL_MS, 5L * 60L * 1000L)
            } else {
                builder.setPeriodic(PERIODIC_INTERVAL_MS)
            }
            scheduler.schedule(builder.build())
        } catch (_: Exception) {
        }
    }

    internal fun isVersionNewer(remoteVersion: String, localVersion: String): Boolean {
        val rParts = remoteVersion.trim().removePrefix("v").removePrefix("V")
            .split(".").map { it.toIntOrNull() ?: 0 }
        val lParts = localVersion.trim().removePrefix("v").removePrefix("V")
            .split(".").map { it.toIntOrNull() ?: 0 }
        val maxLen = maxOf(rParts.size, lParts.size, 3)
        for (i in 0 until maxLen) {
            val rv = rParts.getOrElse(i) { 0 }
            val lv = lParts.getOrElse(i) { 0 }
            if (rv > lv) return true
            if (rv < lv) return false
        }
        return false
    }

    internal fun audienceMatchesRole(audience: String?, role: String): Boolean {
        val norm = (audience ?: "all").trim().lowercase()
        if (norm.isEmpty() || norm == "all" || norm == "الكل") return true
        return when (role.lowercase()) {
            "contractor", "admin" -> norm == "contractors" || norm == "contractor" || norm == "admins"
            "worker" -> norm == "workers" || norm == "worker"
            else -> norm == "all"
        }
    }

    internal fun formatPersonalAlert(type: String, workerName: String, projectTitle: String, rawMessage: String): Pair<String, String> {
        return when (type.lowercase()) {
            "left_site" -> Pair(
                "⚠️ تنبيه مغادرة موقع العمل",
                buildString {
                    append(if (workerName.isNotBlank()) "العامل $workerName" else "أحد العمال")
                    append(" غادر نطاق الموقع")
                    if (projectTitle.isNotBlank()) append(" ($projectTitle)")
                }
            )
            "worker_material" -> Pair(
                "🧱 طلب مواد جديد من الموقع",
                if (rawMessage.isNotBlank()) rawMessage
                else "${if (workerName.isNotBlank()) workerName else "عامل"} أرسل طلب مواد للمراجعة"
            )
            "clock_in", "attendance", "" -> Pair(
                "📍 طلب تسجيل حضور جديد",
                buildString {
                    append(if (workerName.isNotBlank()) "العامل $workerName" else "عامل جديد")
                    append(" بانتظار موافقتك على الحضور")
                    if (projectTitle.isNotBlank()) append(" — $projectTitle")
                }
            )
            else -> Pair(
                "🔔 إشعار جديد من الأسطة",
                rawMessage.ifBlank { "لديك إشعار جديد داخل تطبيق الأسطة" }
            )
        }
    }

    internal fun runBackgroundPoll(context: Context) {
        if (context.packageName.contains("dashboard", ignoreCase = true)) return
        if (MainActivity.isAppInForeground) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return
        }

        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val projectId = prefs.getString(KEY_PROJECT_ID, "")?.trim().orEmpty()
        val apiKey = prefs.getString(KEY_API_KEY, "")?.trim().orEmpty()
        if (projectId.isEmpty() || apiKey.isEmpty()) return

        val role = prefs.getString(KEY_ROLE, "guest")?.trim().orEmpty()
        val userId = prefs.getString(KEY_USER_ID, "")?.trim().orEmpty()
        val installedVersion = prefs.getString(KEY_APP_VERSION, BuildConfig.VERSION_NAME)?.trim().orEmpty()
        val nowMs = System.currentTimeMillis()

        // 1) Check OTA Update & Global System Announcements (once per hour -> ultra-low read budget)
        val lastGlobalCheck = prefs.getLong(KEY_LAST_GLOBAL_CHECK, 0L)
        if ((nowMs - lastGlobalCheck) >= GLOBAL_CHECK_COOLDOWN_MS) {
            prefs.edit().putLong(KEY_LAST_GLOBAL_CHECK, nowMs).apply()
            checkOtaUpdate(context, prefs, projectId, installedVersion)
            checkGlobalAnnouncements(context, prefs, projectId, role)
        }

        // 2) Check Personal Unread Notifications & Worker Job Offers (every 15 min when signed in)
        if (userId.isNotEmpty() && (role == "contractor" || role == "worker")) {
            val idToken = getOrRefreshAnonymousIdToken(prefs, apiKey) ?: return
            checkPersonalNotifications(context, prefs, projectId, idToken, role, userId)
            if (role == "worker") {
                checkWorkerMarketInvites(context, prefs, projectId, idToken, userId)
            }
        }
    }

    private fun checkOtaUpdate(
        context: Context,
        prefs: android.content.SharedPreferences,
        projectId: String,
        installedVersion: String
    ) {
        try {
            val url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/settings/app_config"
            val body = httpGet(url, null) ?: return
            val doc = JSONObject(body)
            val fields = doc.optJSONObject("fields") ?: return

            val stopUpdate = readBoolField(fields, "stopUpdate")
            if (stopUpdate) return

            val latestVersion = readStringField(fields, "latestVersion")
            val pushToken = readStringField(fields, "pushUpdateToken")
            if (latestVersion.isBlank()) return
            if (!isVersionNewer(latestVersion, installedVersion)) return

            val otaKey = "${latestVersion}_${pushToken}"
            if (prefs.getString(KEY_LAST_OTA_KEY, "") == otaKey) return

            prefs.edit().putString(KEY_LAST_OTA_KEY, otaKey).apply()
            postSystemNotification(
                context,
                "🚀 تحديث جديد لتطبيق الأسطة (v$latestVersion)",
                "يتوفر إصدار أحدث من تطبيق الأسطة بتحسينات مهمة — اضغط هنا للتحديث الآن."
            )
        } catch (_: Exception) {
        }
    }

    private fun checkGlobalAnnouncements(
        context: Context,
        prefs: android.content.SharedPreferences,
        projectId: String,
        role: String
    ) {
        try {
            val url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents:runQuery"
            val queryBody = JSONObject().put(
                "structuredQuery",
                JSONObject()
                    .put("from", JSONArray().put(JSONObject().put("collectionId", "announcements")))
                    .put("limit", 10)
            )
            val resp = httpPostJson(url, queryBody.toString(), null) ?: return
            val arr = JSONArray(resp)
            val seen = loadSeenIds(prefs)
            var dirty = false

            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                val doc = item.optJSONObject("document") ?: continue
                val docId = doc.optString("name", "").substringAfterLast("/")
                val fields = doc.optJSONObject("fields") ?: continue
                if (docId.isBlank()) continue

                val isActive = if (fields.has("isActive")) readBoolField(fields, "isActive") else true
                if (!isActive) continue
                val audience = readStringField(fields, "targetAudience")
                if (!audienceMatchesRole(audience, role)) continue

                val updatedAt = readStringField(fields, "updatedAt").ifBlank { readStringField(fields, "date") }
                val dedupeKey = "ann_${docId}_${updatedAt}"
                if (seen.contains(dedupeKey)) continue

                val title = readStringField(fields, "title").ifBlank { "إعلان من إدارة الأسطة" }
                val message = readStringField(fields, "message").ifBlank { readStringField(fields, "body") }
                if (message.isBlank() && title.isBlank()) continue

                postSystemNotification(context, "📢 $title", message.ifBlank { title })
                seen.add(dedupeKey)
                dirty = true
                break // At most 1 announcement notification per poll to avoid spamming
            }

            if (dirty) saveSeenIds(prefs, seen)
        } catch (_: Exception) {
        }
    }

    private fun checkPersonalNotifications(
        context: Context,
        prefs: android.content.SharedPreferences,
        projectId: String,
        idToken: String,
        role: String,
        userId: String
    ) {
        try {
            val filterField = if (role == "contractor") "adminId" else "workerId"
            val url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents:runQuery"
            val queryBody = JSONObject().put(
                "structuredQuery",
                JSONObject()
                    .put("from", JSONArray().put(JSONObject().put("collectionId", "notifications")))
                    .put(
                        "where",
                        JSONObject().put(
                            "fieldFilter",
                            JSONObject()
                                .put("field", JSONObject().put("fieldPath", filterField))
                                .put("op", "EQUAL")
                                .put("value", JSONObject().put("stringValue", userId))
                        )
                    )
                    .put("limit", 15)
            )
            val resp = httpPostJson(url, queryBody.toString(), idToken) ?: return
            val arr = JSONArray(resp)
            val seen = loadSeenIds(prefs)
            var dirty = false
            var fired = 0

            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                val doc = item.optJSONObject("document") ?: continue
                val docId = doc.optString("name", "").substringAfterLast("/")
                val fields = doc.optJSONObject("fields") ?: continue
                if (docId.isBlank()) continue

                val status = readStringField(fields, "status")
                if (status != "unread") continue

                val dedupeKey = "ntf_$docId"
                if (seen.contains(dedupeKey)) continue

                val type = readStringField(fields, "type")
                val workerName = readStringField(fields, "workerName")
                val projectTitle = readStringField(fields, "projectTitle")
                val msg = readStringField(fields, "message").ifBlank { readStringField(fields, "body") }
                val (title, body) = formatPersonalAlert(type, workerName, projectTitle, msg)

                if (fired < 2) {
                    postSystemNotification(context, title, body)
                    fired++
                }
                seen.add(dedupeKey)
                dirty = true
            }

            if (dirty) saveSeenIds(prefs, seen)
        } catch (_: Exception) {
        }
    }

    private fun checkWorkerMarketInvites(
        context: Context,
        prefs: android.content.SharedPreferences,
        projectId: String,
        idToken: String,
        workerId: String
    ) {
        try {
            val url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents:runQuery"
            val queryBody = JSONObject().put(
                "structuredQuery",
                JSONObject()
                    .put("from", JSONArray().put(JSONObject().put("collectionId", "market_requests")))
                    .put(
                        "where",
                        JSONObject().put(
                            "fieldFilter",
                            JSONObject()
                                .put("field", JSONObject().put("fieldPath", "workerId"))
                                .put("op", "EQUAL")
                                .put("value", JSONObject().put("stringValue", workerId))
                        )
                    )
                    .put("limit", 10)
            )
            val resp = httpPostJson(url, queryBody.toString(), idToken) ?: return
            val arr = JSONArray(resp)
            val seen = loadSeenIds(prefs)
            var dirty = false

            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                val doc = item.optJSONObject("document") ?: continue
                val docId = doc.optString("name", "").substringAfterLast("/")
                val fields = doc.optJSONObject("fields") ?: continue
                if (docId.isBlank()) continue

                val status = readStringField(fields, "status")
                if (status != "pending" && status != "invited") continue

                val dedupeKey = "mkt_$docId"
                if (seen.contains(dedupeKey)) continue

                val contractorName = readStringField(fields, "adminName").ifBlank { readStringField(fields, "contractorName") }
                val projectTitle = readStringField(fields, "projectTitle")
                val body = buildString {
                    append(if (contractorName.isNotBlank()) "المقاول $contractorName" else "مقاول")
                    append(" أرسل لك عرض عمل جديد")
                    if (projectTitle.isNotBlank()) append(" — $projectTitle")
                }
                postSystemNotification(context, "💼 عرض عمل جديد في الأسطة", body)
                seen.add(dedupeKey)
                dirty = true
                break
            }

            if (dirty) saveSeenIds(prefs, seen)
        } catch (_: Exception) {
        }
    }

    private fun getOrRefreshAnonymousIdToken(prefs: android.content.SharedPreferences, apiKey: String): String? {
        val nowMs = System.currentTimeMillis()
        val cachedToken = prefs.getString(KEY_ID_TOKEN, "")?.trim().orEmpty()
        val expiresAt = prefs.getLong(KEY_TOKEN_EXPIRES_AT, 0L)
        if (cachedToken.isNotEmpty() && nowMs < (expiresAt - 120_000L)) {
            return cachedToken
        }

        // Reuse existing anonymous account via refresh_token so we NEVER create extra Firebase Auth users
        val refreshToken = prefs.getString(KEY_REFRESH_TOKEN, "")?.trim().orEmpty()
        if (refreshToken.isNotEmpty()) {
            try {
                val refreshUrl = "https://securetoken.googleapis.com/v1/token?key=$apiKey"
                val payload = JSONObject()
                    .put("grant_type", "refresh_token")
                    .put("refresh_token", refreshToken)
                val resp = httpPostJson(refreshUrl, payload.toString(), null)
                if (resp != null) {
                    val json = JSONObject(resp)
                    val newId = json.optString("id_token", "")
                    val newRefresh = json.optString("refresh_token", refreshToken)
                    val expSec = json.optString("expires_in", "3600").toLongOrNull() ?: 3600L
                    if (newId.isNotBlank()) {
                        prefs.edit()
                            .putString(KEY_ID_TOKEN, newId)
                            .putString(KEY_REFRESH_TOKEN, newRefresh)
                            .putLong(KEY_TOKEN_EXPIRES_AT, nowMs + expSec * 1000L)
                            .apply()
                        return newId
                    }
                }
            } catch (_: Exception) {
            }
        }

        // First-time anonymous token minting (runs once per install)
        try {
            val signUpUrl = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$apiKey"
            val resp = httpPostJson(signUpUrl, """{"returnSecureToken":true}""", null) ?: return null
            val json = JSONObject(resp)
            val idToken = json.optString("idToken", "")
            val newRefresh = json.optString("refreshToken", "")
            val expSec = json.optString("expiresIn", "3600").toLongOrNull() ?: 3600L
            if (idToken.isNotBlank()) {
                prefs.edit()
                    .putString(KEY_ID_TOKEN, idToken)
                    .putString(KEY_REFRESH_TOKEN, newRefresh)
                    .putLong(KEY_TOKEN_EXPIRES_AT, nowMs + expSec * 1000L)
                    .apply()
                return idToken
            }
        } catch (_: Exception) {
        }
        return null
    }

    private fun postSystemNotification(context: Context, title: String, body: String) {
        try {
            val appCtx = context.applicationContext
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    appCtx.getString(R.string.notification_channel_name),
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = appCtx.getString(R.string.notification_channel_desc)
                    enableVibration(true)
                }
                val mgr = appCtx.getSystemService(NotificationManager::class.java)
                mgr?.createNotificationChannel(channel)
            }

            val launchIntent = Intent(appCtx, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                appCtx,
                notifIdSeq.get() % 9000,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notif = NotificationCompat.Builder(appCtx, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build()

            val manager = appCtx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            manager?.notify(notifIdSeq.getAndIncrement(), notif)
        } catch (_: Exception) {
        }
    }

    private fun readStringField(fields: JSONObject, key: String): String {
        val obj = fields.optJSONObject(key) ?: return ""
        return obj.optString("stringValue", "").trim()
    }

    private fun readBoolField(fields: JSONObject, key: String): Boolean {
        val obj = fields.optJSONObject(key) ?: return false
        return obj.optBoolean("booleanValue", false)
    }

    private fun loadSeenIds(prefs: android.content.SharedPreferences): MutableList<String> {
        val raw = prefs.getString(KEY_SEEN_IDS, "") ?: ""
        if (raw.isBlank()) return mutableListOf()
        return raw.split("|").filter { it.isNotBlank() }.toMutableList()
    }

    private fun saveSeenIds(prefs: android.content.SharedPreferences, list: MutableList<String>) {
        val trimmed = if (list.size > MAX_SEEN_IDS) list.takeLast(MAX_SEEN_IDS) else list
        prefs.edit().putString(KEY_SEEN_IDS, trimmed.joinToString("|")).apply()
    }

    private fun httpGet(urlStr: String, bearerToken: String?): String? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 8000
                readTimeout = 8000
                if (!bearerToken.isNullOrBlank()) {
                    setRequestProperty("Authorization", "Bearer $bearerToken")
                }
            }
            if (conn.responseCode in 200..299) {
                BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { it.readText() }
            } else null
        } catch (_: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }

    private fun httpPostJson(urlStr: String, jsonBody: String, bearerToken: String?): String? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 8000
                readTimeout = 8000
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                if (!bearerToken.isNullOrBlank()) {
                    setRequestProperty("Authorization", "Bearer $bearerToken")
                }
            }
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(jsonBody) }
            if (conn.responseCode in 200..299) {
                BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { it.readText() }
            } else null
        } catch (_: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }
}

class AlOstaBackgroundNotifierService : JobService() {
    private val executor = Executors.newSingleThreadExecutor()

    override fun onStartJob(params: JobParameters?): Boolean {
        executor.execute {
            try {
                AlOstaBackgroundNotifier.runBackgroundPoll(applicationContext)
            } catch (_: Exception) {
            } finally {
                jobFinished(params, false)
            }
        }
        return true
    }

    override fun onStopJob(params: JobParameters?): Boolean {
        return true
    }
}
