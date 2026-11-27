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
    private const val KEY_QUICK_CHAIN_STEP = "quick_chain_step"

    private const val JOB_ID = 4901
    private const val JOB_ID_QUICK = 4902
    private const val PERIODIC_INTERVAL_MS = 15L * 60L * 1000L // 15 minutes (Android JobScheduler min)
    private const val QUICK_FIRST_MIN_LATENCY_MS = 30L * 1000L // 30s after app goes background
    private const val QUICK_FIRST_MAX_LATENCY_MS = 75L * 1000L // Within 75s
    private const val QUICK_CHAIN_MIN_LATENCY_MS = 180L * 1000L // Follow-up checks every 3 min
    private const val QUICK_CHAIN_MAX_LATENCY_MS = 240L * 1000L // Within 4 min
    private const val MAX_QUICK_CHAIN_STEPS = 10 // Covers first ~30 min rapidly before 15-min periodic takes over
    private const val GLOBAL_CHECK_COOLDOWN_MS = 60L * 60L * 1000L // Check OTA + announcements once per hour
    private const val FRESH_NOTIF_MAX_AGE_MS = 48L * 60L * 60L * 1000L // Never flood ancient (>48h) docs
    private const val MAX_SEEN_IDS = 180
    internal const val CHANNEL_ID = "al_osta_alerts_v2"

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
        val prevRole = prefs.getString(KEY_ROLE, "guest")?.trim().orEmpty()
        val prevUserId = prefs.getString(KEY_USER_ID, "")?.trim().orEmpty()
        val cleanRole = role.trim().ifBlank { prevRole.ifBlank { "guest" } }
        val cleanUserId = userId.trim()
        val profileChanged = (prevRole != cleanRole || prevUserId != cleanUserId)

        val editor = prefs.edit()
        if (role.isNotBlank()) editor.putString(KEY_ROLE, cleanRole)
        editor.putString(KEY_USER_ID, cleanUserId)
        if (appVersion.isNotBlank()) editor.putString(KEY_APP_VERSION, appVersion.trim())
        if (projectId.isNotBlank()) editor.putString(KEY_PROJECT_ID, projectId.trim())
        if (apiKey.isNotBlank()) editor.putString(KEY_API_KEY, apiKey.trim())
        editor.apply()
        schedulePeriodicCheck(context, forceReschedule = profileChanged)
    }

    fun clearUserSession(context: Context) {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_ROLE, "guest")
            .remove(KEY_USER_ID)
            .putInt(KEY_QUICK_CHAIN_STEP, 0)
            .apply()
    }

    @Synchronized
    fun markNotificationSeen(context: Context, dedupeKey: String?) {
        val clean = dedupeKey?.trim().orEmpty()
        if (clean.isEmpty()) return
        try {
            val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val seen = loadSeenIds(prefs)
            if (!seen.contains(clean)) {
                seen.add(clean)
                saveSeenIds(prefs, seen)
            }
        } catch (_: Exception) {
        }
    }

    fun isBatteryOptimizationIgnored(context: Context): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val pm = context.applicationContext.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
                pm?.isIgnoringBatteryOptimizations(context.packageName) ?: true
            } else {
                true
            }
        } catch (_: Exception) {
            true
        }
    }

    fun openBatteryOptimizationSettings(context: Context) {
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            } else {
                Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = android.net.Uri.fromParts("package", context.packageName, null)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            }
            context.startActivity(intent)
        } catch (_: Exception) {
            try {
                val fallback = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = android.net.Uri.fromParts("package", context.packageName, null)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(fallback)
            } catch (_: Exception) {
            }
        }
    }

    fun schedulePeriodicCheck(context: Context, forceReschedule: Boolean = false) {
        if (context.packageName.contains("dashboard", ignoreCase = true)) return
        try {
            val appCtx = context.applicationContext
            val scheduler = appCtx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
            val existing = scheduler.allPendingJobs.any { it.id == JOB_ID }
            if (existing && !forceReschedule) return

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
     * Smart fast-window background checks (30s after leaving app, then chained every 3 min up to 5 times)
     * so urgent worker/contractor alerts arrive within seconds-to-minutes instead of waiting 15+ min in Doze.
     */
    fun scheduleQuickRecheck(context: Context, resetChain: Boolean = true) {
        if (context.packageName.contains("dashboard", ignoreCase = true)) return
        try {
            val appCtx = context.applicationContext
            val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val role = prefs.getString(KEY_ROLE, "guest")?.trim().orEmpty()
            val userId = prefs.getString(KEY_USER_ID, "")?.trim().orEmpty()
            val hasActiveShift = WorkerTelemetrySyncManager.hasActiveShiftForToday(appCtx)
            if (!hasActiveShift && (userId.isEmpty() || (role != "contractor" && role != "worker"))) return

            val nextStep = if (resetChain) 0 else (prefs.getInt(KEY_QUICK_CHAIN_STEP, 0) + 1)
            if (nextStep > MAX_QUICK_CHAIN_STEPS) return
            prefs.edit().putInt(KEY_QUICK_CHAIN_STEP, nextStep).apply()

            val minLatency = if (nextStep == 0) QUICK_FIRST_MIN_LATENCY_MS else QUICK_CHAIN_MIN_LATENCY_MS
            val maxLatency = if (nextStep == 0) QUICK_FIRST_MAX_LATENCY_MS else QUICK_CHAIN_MAX_LATENCY_MS

            val scheduler = appCtx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
            val component = ComponentName(appCtx, AlOstaBackgroundNotifierService::class.java)
            val builder = JobInfo.Builder(JOB_ID_QUICK, component)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setMinimumLatency(minLatency)
                .setOverrideDeadline(maxLatency)
                .setBackoffCriteria(30_000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
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

    internal fun formatWorkerDecisionAlert(
        status: String,
        type: String,
        projectTitle: String,
        itemName: String = ""
    ): Pair<String, String> {
        val approved = status.equals("approved", ignoreCase = true)
        val normType = type.lowercase()
        val projSuffix = if (projectTitle.isNotBlank()) " — $projectTitle" else ""
        return when {
            normType == "worker_material" && approved -> Pair(
                "✅ تمت الموافقة على فاتورة المواد",
                buildString {
                    append("اعتمد المقاول طلب المواد")
                    if (itemName.isNotBlank()) append(": $itemName")
                    append(projSuffix)
                }
            )
            normType == "worker_material" && !approved -> Pair(
                "❌ تم رفض فاتورة المواد",
                buildString {
                    append("رفض المقاول طلب المواد")
                    if (itemName.isNotBlank()) append(": $itemName")
                    append(projSuffix)
                }
            )
            approved -> Pair(
                "✅ تم اعتماد حضورك في الموقع",
                "وافق المقاول على طلب تسجيل حضورك اليوم$projSuffix"
            )
            else -> Pair(
                "❌ تم رفض طلب تسجيل الحضور",
                "رفض المقاول طلب تسجيل الحضور$projSuffix — راجع التطبيق للتفاصيل."
            )
        }
    }

    /**
     * Returns `true` when background poll completed cleanly (no retry needed),
     * or `false` when a transient network/auth error occurred so JobScheduler retries automatically.
     */
    internal fun runBackgroundPoll(context: Context, isQuickJob: Boolean = false): Boolean {
        if (context.packageName.contains("dashboard", ignoreCase = true)) return true
        if (MainActivity.isAppInForeground) return true

        // Layer-2 background shift telemetry resilience: runs even if POST_NOTIFICATIONS is denied
        try {
            WorkerTelemetrySyncManager.runBackgroundRecoveryTick(context)
        } catch (_: Exception) {
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return true
        }

        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val projectId = prefs.getString(KEY_PROJECT_ID, "")?.trim().orEmpty()
        val apiKey = prefs.getString(KEY_API_KEY, "")?.trim().orEmpty()
        if (projectId.isEmpty() || apiKey.isEmpty()) return true

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

        // 2) Check Personal Notifications & Market Requests (every poll when signed in)
        var allNetworkOk = true
        if (userId.isNotEmpty() && (role == "contractor" || role == "worker")) {
            val idToken = getOrRefreshAnonymousIdToken(prefs, apiKey)
            if (idToken == null) {
                allNetworkOk = false
            } else {
                val personalOk = checkPersonalNotifications(context, prefs, projectId, idToken, role, userId, nowMs)
                if (!personalOk) allNetworkOk = false
                if (role == "worker") {
                    checkWorkerMarketInvites(context, prefs, projectId, idToken, userId)
                } else if (role == "contractor") {
                    checkContractorJobApplicants(context, prefs, projectId, idToken, userId)
                }
            }
        }

        // Chain follow-up quick rechecks while user remains in background (30s -> 3m -> 6m -> 9m -> 12m -> 15m)
        if (isQuickJob && allNetworkOk && !MainActivity.isAppInForeground) {
            scheduleQuickRecheck(context, resetChain = false)
        }
        return allNetworkOk
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
    ): Pair<Boolean, List<Pair<String, JSONObject>>> {
        val result = mutableListOf<Pair<String, JSONObject>>()
        return try {
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
            val resp = httpPostJson(url, queryBody.toString(), idToken) ?: return Pair(false, result)
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
            Pair(true, result)
        } catch (_: Exception) {
            Pair(false, result)
        }
    }

    private fun checkPersonalNotifications(
        context: Context,
        prefs: android.content.SharedPreferences,
        projectId: String,
        idToken: String,
        role: String,
        userId: String,
        nowMs: Long
    ): Boolean {
        return try {
            val mergedDocs = LinkedHashMap<String, JSONObject>()
            var networkOk = false
            if (role == "contractor") {
                // Primary zero-index unread inbox (never truncated by historical approved/read notifications!)
                val (inboxOk, inboxDocs) = runFieldEqualQuery(
                    projectId, idToken, "notifications", "adminInboxKey", "${userId}__unread", 30
                )
                if (inboxOk) networkOk = true
                for ((docId, fields) in inboxDocs) {
                    mergedDocs[docId] = fields
                }
                // Backward-compatible fallback for workers running older APKs (generous limit=60)
                val (legacyOk, legacyDocs) = runFieldEqualQuery(
                    projectId, idToken, "notifications", "adminId", userId, 60
                )
                if (legacyOk) networkOk = true
                for ((docId, fields) in legacyDocs) {
                    if (!mergedDocs.containsKey(docId)) {
                        mergedDocs[docId] = fields
                    }
                }
            } else {
                val (workerOk, workerDocs) = runFieldEqualQuery(
                    projectId, idToken, "notifications", "workerId", userId, 40
                )
                networkOk = workerOk
                for ((docId, fields) in workerDocs) {
                    mergedDocs[docId] = fields
                }
            }

            if (!networkOk) return false
            if (mergedDocs.isEmpty()) return true

            // Sort newest first so latest events always surface first
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
            val freshnessCutoff = nowMs - FRESH_NOTIF_MAX_AGE_MS

            for ((docId, fields) in sortedEntries) {
                val status = readStringField(fields, "status")
                val docTs = maxOf(
                    readNumberField(fields, "createdAt"),
                    readNumberField(fields, "timeOut"),
                    readNumberField(fields, "timeIn")
                )

                if (role == "contractor") {
                    if (status != "unread") continue
                    val dedupeKey = "ntf_$docId"
                    if (seen.contains(dedupeKey)) continue
                    // Skip very old historical unread items (>48h) so reinstalls never flood old alerts
                    if (docTs in 1 until freshnessCutoff) {
                        seen.add(dedupeKey)
                        dirty = true
                        continue
                    }

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
                } else {
                    // For workers: `status == unread` are the worker's OWN outgoing requests to the contractor!
                    // Only notify the worker when the contractor approves or rejects their request.
                    if (status != "approved" && status != "rejected") continue
                    val dedupeKey = "ntf_w_${docId}_$status"
                    if (seen.contains(dedupeKey)) continue
                    if (docTs in 1 until freshnessCutoff) {
                        seen.add(dedupeKey)
                        dirty = true
                        continue
                    }

                    val type = readStringField(fields, "type")
                    val projectTitle = readStringField(fields, "projectTitle")
                    val itemName = readStringField(fields, "item")
                    val (title, body) = formatWorkerDecisionAlert(status, type, projectTitle, itemName)
                    if (fired < 3) {
                        postSystemNotification(context, title, body)
                        fired++
                    }
                    seen.add(dedupeKey)
                    dirty = true
                }
            }

            if (dirty) saveSeenIds(prefs, seen)
            true
        } catch (_: Exception) {
            false
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
            val (ok, docs) = runFieldEqualQuery(projectId, idToken, "market_requests", "adminId", adminId, 30)
            if (!ok || docs.isEmpty()) return
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
                    enableLights(true)
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
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
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
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
        val isQuick = params?.jobId == 4902
        executor.execute {
            var completedOk = true
            try {
                completedOk = AlOstaBackgroundNotifier.runBackgroundPoll(applicationContext, isQuickJob = isQuick)
            } catch (_: Exception) {
                completedOk = false
            } finally {
                // Request automatic JobScheduler backoff retry when transient network drops occur
                jobFinished(params, !completedOk)
            }
        }
        return true
    }

    override fun onStopJob(params: JobParameters?): Boolean {
        return true
    }
}
