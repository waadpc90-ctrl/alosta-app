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
    private const val JOB_ID_QUICK = 4902
    private const val PERIODIC_INTERVAL_MS = 15L * 60L * 1000L // 15 minutes (Android JobScheduler min)
    private const val QUICK_RECHECK_MIN_LATENCY_MS = 45L * 1000L // 45s after app goes background
    private const val QUICK_RECHECK_MAX_LATENCY_MS = 120L * 1000L // Within 2 min
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

    /**
     * Lightweight one-shot check scheduled when the user leaves the app so newly sent worker
     * notifications arrive within ~1 minute instead of waiting up to 15 minutes for the periodic job.
     */
    fun scheduleQuickRecheck(context: Context) {
        if (context.packageName.contains("dashboard", ignoreCase = true)) return
        try {
            val appCtx = context.applicationContext
            val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val role = prefs.getString(KEY_ROLE, "guest")?.trim().orEmpty()
            val userId = prefs.getString(KEY_USER_ID, "")?.trim().orEmpty()
            if (userId.isEmpty() || (role != "contractor" && role != "worker")) return

            val scheduler = appCtx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
            val component = ComponentName(appCtx, AlOstaBackgroundNotifierService::class.java)
            val builder = JobInfo.Builder(JOB_ID_QUICK, component)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setMinimumLatency(QUICK_RECHECK_MIN_LATENCY_MS)
                .setOverrideDeadline(QUICK_RECHECK_MAX_LATENCY_MS)
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

    internal fun formatPersonalAlert(
        type: String,
        workerName: String,
        projectTitle: String,
        rawMessage: String,
        itemName: String = "",
        costText: String = "",
        distText: String = ""
    ): Pair<String, String> {
        val who = if (workerName.isNotBlank()) workerName else "أحد العمال"
        return when (type.lowercase()) {
            "left_site" -> Pair(
                "⚠️ تنبيه مغادرة موقع العمل",
                buildString {
                    append("العامل $who غادر نطاق الموقع")
                    if (projectTitle.isNotBlank()) append(" ($projectTitle)")
                    if (distText.isNotBlank()) append(" • المسافة ${distText}م")
                }
            )
            "worker_material" -> Pair(
                "🧱 فاتورة مواد جديدة من الموقع",
                if (rawMessage.isNotBlank()) rawMessage
                else buildString {
                    append("$who أرسل طلب اعتماد مواد")
                    if (itemName.isNotBlank()) append(": $itemName")
                    if (costText.isNotBlank()) append(" ($costText د.ع)")
                    if (projectTitle.isNotBlank()) append(" — $projectTitle")
                }
            )
            "clock_out" -> Pair(
                "👋 تسجيل انصراف عامل من الموقع",
                buildString {
                    append("العامل $who سجّل انصرافه من العمل")
                    if (projectTitle.isNotBlank()) append(" — $projectTitle")
                }
            )
            "clock_in_verified" -> Pair(
                "✅ تأكيد تواجد عامل في الموقع",
                buildString {
                    append("العامل $who وثّق تواجده عبر GPS")
                    if (projectTitle.isNotBlank()) append(" — $projectTitle")
                }
            )
            "invite_accepted" -> Pair(
                "🤝 انضمام عامل جديد لكادرك",
                if (rawMessage.isNotBlank()) rawMessage
                else "العامل $who وافق على دعوتك وانضم إلى كادر العمل"
            )
            "job_apply" -> Pair(
                "💼 متقدم جديد على إعلان العمل",
                if (rawMessage.isNotBlank()) rawMessage
                else "العامل $who قدّم طلباً للعمل على إعلانك"
            )
            "clock_in", "attendance", "" -> Pair(
                "📍 طلب تسجيل حضور جديد",
                buildString {
                    append("العامل $who بانتظار موافقتك على الحضور")
                    if (projectTitle.isNotBlank()) append(" — $projectTitle")
                }
            )
            else -> Pair(
                "🔔 إشعار جديد من الأسطة",
                rawMessage.ifBlank { "لديك إشعار جديد من $who داخل تطبيق الأسطة" }
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

        // 2) Check Personal Unread Notifications & Market Requests (every poll when signed in)
        if (userId.isNotEmpty() && (role == "contractor" || role == "worker")) {
            val idToken = getOrRefreshAnonymousIdToken(prefs, apiKey) ?: return
            checkPersonalNotifications(context, prefs, projectId, idToken, role, userId)
            if (role == "worker") {
                checkWorkerMarketInvites(context, prefs, projectId, idToken, userId)
            } else if (role == "contractor") {
                checkContractorJobApplicants(context, prefs, projectId, idToken, userId)
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

    private fun runFieldEqualQuery(
        projectId: String,
        idToken: String,
        collectionId: String,
        fieldPath: String,
        value: String,
        limit: Int
    ): List<Pair<String, JSONObject>> {
        val result = mutableListOf<Pair<String, JSONObject>>()
        try {
            val url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents:runQuery"
            val queryBody = JSONObject().put(
                "structuredQuery",
                JSONObject()
                    .put("from", JSONArray().put(JSONObject().put("collectionId", collectionId)))
                    .put(
                        "where",
                        JSONObject().put(
                            "fieldFilter",
                            JSONObject()
                                .put("field", JSONObject().put("fieldPath", fieldPath))
                                .put("op", "EQUAL")
                                .put("value", JSONObject().put("stringValue", value))
                        )
                    )
                    .put("limit", limit)
            )
            val resp = httpPostJson(url, queryBody.toString(), idToken) ?: return result
            val arr = JSONArray(resp)
            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                val doc = item.optJSONObject("document") ?: continue
                val docId = doc.optString("name", "").substringAfterLast("/")
                val fields = doc.optJSONObject("fields") ?: continue
                if (docId.isNotBlank()) {
                    result.add(Pair(docId, fields))
                }
            }
        } catch (_: Exception) {
        }
        return result
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
            val mergedDocs = LinkedHashMap<String, JSONObject>()
            if (role == "contractor") {
                // Primary zero-index unread inbox (never truncated by historical approved/read notifications!)
                for ((docId, fields) in runFieldEqualQuery(
                    projectId, idToken, "notifications", "adminInboxKey", "${userId}__unread", 30
                )) {
                    mergedDocs[docId] = fields
                }
                // Backward-compatible fallback for workers running older APKs (generous limit=60)
                for ((docId, fields) in runFieldEqualQuery(
                    projectId, idToken, "notifications", "adminId", userId, 60
                )) {
                    if (!mergedDocs.containsKey(docId)) {
                        mergedDocs[docId] = fields
                    }
                }
            } else {
                for ((docId, fields) in runFieldEqualQuery(
                    projectId, idToken, "notifications", "workerId", userId, 40
                )) {
                    mergedDocs[docId] = fields
                }
            }

            if (mergedDocs.isEmpty()) return

            // Sort newest first so latest worker events always surface first
            val sortedEntries = mergedDocs.entries.sortedByDescending { (_, fields) ->
                maxOf(
                    readNumberField(fields, "createdAt"),
                    readNumberField(fields, "timeOut"),
                    readNumberField(fields, "timeIn")
                )
            }

            val seen = loadSeenIds(prefs)
            var dirty = false
            var fired = 0

            for ((docId, fields) in sortedEntries) {
                val status = readStringField(fields, "status")
                if (status != "unread") continue

                val dedupeKey = "ntf_$docId"
                if (seen.contains(dedupeKey)) continue

                val type = readStringField(fields, "type")
                val workerName = readStringField(fields, "workerName")
                val projectTitle = readStringField(fields, "projectTitle")
                val msg = readStringField(fields, "message").ifBlank { readStringField(fields, "body") }
                val itemName = readStringField(fields, "item")
                val costNum = readNumberField(fields, "cost")
                val costText = if (costNum > 0L) String.format(java.util.Locale.US, "%,d", costNum) else ""
                val distNum = readNumberField(fields, "inDist")
                val distText = if (distNum > 0L) distNum.toString() else ""

                val (title, body) = formatPersonalAlert(type, workerName, projectTitle, msg, itemName, costText, distText)

                if (fired < 3) {
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

    private fun checkContractorJobApplicants(
        context: Context,
        prefs: android.content.SharedPreferences,
        projectId: String,
        idToken: String,
        adminId: String
    ) {
        try {
            val docs = runFieldEqualQuery(projectId, idToken, "market_requests", "adminId", adminId, 30)
            if (docs.isEmpty()) return
            val seen = loadSeenIds(prefs)
            var dirty = false

            for ((docId, fields) in docs) {
                val fromAd = readBoolField(fields, "fromAd")
                val status = readStringField(fields, "status")
                val isRead = readBoolField(fields, "read")
                if (!fromAd || status != "accepted" || isRead) continue

                val dedupeKey = "app_$docId"
                if (seen.contains(dedupeKey)) continue

                val workerName = readStringField(fields, "workerName").ifBlank { "عامل" }
                postSystemNotification(
                    context,
                    "💼 متقدم جديد على إعلان العمل",
                    "العامل $workerName قدّم طلباً للعمل على إعلانك — افتح التطبيق للمراجعة."
                )
                seen.add(dedupeKey)
                dirty = true
                break
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
                // Stale/revoked refresh token — clear so fresh signUp succeeds cleanly below
                prefs.edit().remove(KEY_REFRESH_TOKEN).remove(KEY_ID_TOKEN).remove(KEY_TOKEN_EXPIRES_AT).apply()
            } catch (_: Exception) {
                prefs.edit().remove(KEY_REFRESH_TOKEN).remove(KEY_ID_TOKEN).remove(KEY_TOKEN_EXPIRES_AT).apply()
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

    internal fun getFirebaseRestCredentials(
        context: Context,
        fallbackProjectId: String = "",
        fallbackApiKey: String = ""
    ): Pair<String, String>? {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val projectId = prefs.getString(KEY_PROJECT_ID, "")?.trim().orEmpty().ifBlank { fallbackProjectId.trim() }
        val apiKey = prefs.getString(KEY_API_KEY, "")?.trim().orEmpty().ifBlank { fallbackApiKey.trim() }
        if (projectId.isEmpty() || apiKey.isEmpty()) return null
        if (prefs.getString(KEY_PROJECT_ID, "").isNullOrBlank() && projectId.isNotBlank()) {
            prefs.edit().putString(KEY_PROJECT_ID, projectId).putString(KEY_API_KEY, apiKey).apply()
        }
        val token = getOrRefreshAnonymousIdToken(prefs, apiKey) ?: return null
        return Pair(projectId, token)
    }

    internal fun postUrgentLocalNotification(context: Context, title: String, body: String) {
        postSystemNotification(context, title, body)
    }

    internal fun httpRequestJson(
        method: String,
        urlStr: String,
        jsonBody: String,
        bearerToken: String?
    ): Boolean {
        var conn: HttpURLConnection? = null
        return try {
            val effectiveMethod = if (method == "PATCH") "POST" else method
            conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
                requestMethod = effectiveMethod
                if (method == "PATCH") {
                    setRequestProperty("X-HTTP-Method-Override", "PATCH")
                }
                doOutput = true
                connectTimeout = 9000
                readTimeout = 9000
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                if (!bearerToken.isNullOrBlank()) {
                    setRequestProperty("Authorization", "Bearer $bearerToken")
                }
            }
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(jsonBody) }
            conn.responseCode in 200..299
        } catch (_: Exception) {
            false
        } finally {
            conn?.disconnect()
        }
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

    private fun readNumberField(fields: JSONObject, key: String): Long {
        val obj = fields.optJSONObject(key) ?: return 0L
        val intStr = obj.optString("integerValue", "")
        if (intStr.isNotBlank()) return intStr.toLongOrNull() ?: 0L
        if (obj.has("doubleValue")) return obj.optDouble("doubleValue", 0.0).toLong()
        val strVal = obj.optString("stringValue", "")
        if (strVal.isNotBlank()) return strVal.toLongOrNull() ?: 0L
        return 0L
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
