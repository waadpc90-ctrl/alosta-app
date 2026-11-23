package com.example

import android.content.Context
import android.location.Location
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.Executors
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Native shift geofence monitor that keeps verifying the worker's GPS position even when
 * the phone screen is locked or the WebView is frozen in the background.
 *
 * Anti-glitch design:
 * - Ignores poor-accuracy cell-tower jumps (>90m) unless the outer margin is unambiguously breached.
 * - Requires 2 consecutive out-of-bounds readings (separated by >= 6s) OR a single high-confidence
 *   reading (accuracy <= 35m and effectiveDist > radius + 80m) before notifying the contractor.
 * - Marks alert as sent ONLY AFTER Firestore confirms HTTP 2xx; transient Wi-Fi->4G drops while
 *   leaving a work site are automatically retried on the next GPS tick.
 * - Shares deduplication state with the WebView JS layer so the contractor receives exactly one
 *   guaranteed alert per departure episode (and resets if the worker returns inside for >= 2 min).
 */
object WorkerGeofenceMonitor {

    private const val PREFS_NAME = "alosta_geofence_prefs"
    private const val KEY_ACTIVE = "active"
    private const val KEY_ATTENDANCE_ID = "attendance_id"
    private const val KEY_WORKER_ID = "worker_id"
    private const val KEY_WORKER_NAME = "worker_name"
    private const val KEY_ADMIN_ID = "admin_id"
    private const val KEY_PROJECT_ID = "project_id"
    private const val KEY_PROJECT_TITLE = "project_title"
    private const val KEY_SITE_LAT = "site_lat"
    private const val KEY_SITE_LNG = "site_lng"
    private const val KEY_RADIUS_M = "radius_m"
    private const val KEY_TIME_IN = "time_in"
    private const val KEY_DATE = "date"
    private const val KEY_FB_PROJECT_ID = "fb_project_id"
    private const val KEY_FB_API_KEY = "fb_api_key"
    private const val KEY_LAST_SENT_ATT_ID = "last_sent_att_id"
    private const val KEY_LAST_SENT_AT = "last_sent_at"

    private const val EPISODE_COOLDOWN_MS = 15L * 60L * 1000L // 15 min minimum gap per departure episode
    private const val REENTRY_RESET_MS = 2L * 60L * 1000L // Returning inside site for 2 min resets latch
    private const val CONSECUTIVE_MIN_GAP_MS = 5_000L

    private val networkExecutor = Executors.newSingleThreadExecutor()

    @Volatile
    private var consecutiveOutCount = 0
    @Volatile
    private var firstOutTimestampMs = 0L
    @Volatile
    private var lastOutSampleTimestampMs = 0L
    @Volatile
    private var insideSinceMs = 0L
    @Volatile
    private var alertInFlight = false

    data class GeofenceConfig(
        val active: Boolean,
        val attendanceId: String,
        val workerId: String,
        val workerName: String,
        val adminId: String,
        val projectId: String,
        val projectTitle: String,
        val siteLat: Double,
        val siteLng: Double,
        val radiusMeters: Int,
        val timeIn: Long,
        val date: String,
        val fbProjectId: String,
        val fbApiKey: String
    )

    internal data class GeofenceEvaluation(
        val ignoredLowAccuracy: Boolean,
        val rawDistMeters: Int,
        val effectiveDistMeters: Int,
        val inBounds: Boolean,
        val confirmedDeparture: Boolean
    )

    internal fun calcDistanceMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Int {
        if (!lat1.isFinite() || !lng1.isFinite() || !lat2.isFinite() || !lng2.isFinite()) {
            return Int.MAX_VALUE
        }
        val r = 6371e3
        val p1 = Math.toRadians(lat1)
        val p2 = Math.toRadians(lat2)
        val dp = Math.toRadians(lat2 - lat1)
        val dl = Math.toRadians(lng2 - lng1)
        val sinDp = sin(dp / 2.0)
        val sinDl = sin(dl / 2.0)
        val a = sinDp * sinDp + cos(p1) * cos(p2) * sinDl * sinDl
        val c = 2.0 * atan2(sqrt(a), sqrt(max(0.0, 1.0 - a)))
        return (r * c).roundToInt()
    }

    internal fun calcEffectiveDistanceMeters(rawDistMeters: Int, accuracyMeters: Float): Int {
        if (rawDistMeters == Int.MAX_VALUE) return Int.MAX_VALUE
        val accMargin = min(max(accuracyMeters.toDouble(), 0.0), 45.0)
        return max(0, (rawDistMeters - accMargin).roundToInt())
    }

    internal fun evaluateReading(
        rawDistMeters: Int,
        accuracyMeters: Float,
        radiusMeters: Int,
        priorOutCount: Int,
        hasTimeGap: Boolean
    ): GeofenceEvaluation {
        val effDist = calcEffectiveDistanceMeters(rawDistMeters, accuracyMeters)
        val acc = max(0f, accuracyMeters)
        // Reject very coarse cell-tower glitches (>90m) unless undeniably far outside even with full accuracy margin
        if (acc > 90f && (rawDistMeters - acc) <= (radiusMeters + 120)) {
            return GeofenceEvaluation(
                ignoredLowAccuracy = true,
                rawDistMeters = rawDistMeters,
                effectiveDistMeters = effDist,
                inBounds = true,
                confirmedDeparture = false
            )
        }
        val inBounds = effDist <= radiusMeters
        if (inBounds) {
            return GeofenceEvaluation(
                ignoredLowAccuracy = false,
                rawDistMeters = rawDistMeters,
                effectiveDistMeters = effDist,
                inBounds = true,
                confirmedDeparture = false
            )
        }
        val highConfidenceFarExit = acc <= 35f && effDist > (radiusMeters + 80)
        val confirmed = highConfidenceFarExit || (priorOutCount >= 1 && hasTimeGap)
        return GeofenceEvaluation(
            ignoredLowAccuracy = false,
            rawDistMeters = rawDistMeters,
            effectiveDistMeters = effDist,
            inBounds = false,
            confirmedDeparture = confirmed
        )
    }

    @Synchronized
    fun configureFromJson(context: Context, jsonStr: String?) {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (jsonStr.isNullOrBlank()) {
            clearConfig(context)
            return
        }
        try {
            val obj = JSONObject(jsonStr)
            val active = obj.optBoolean("active", false)
            if (!active) {
                clearConfig(context)
                return
            }
            val siteLat = obj.optDouble("siteLat", Double.NaN)
            val siteLng = obj.optDouble("siteLng", Double.NaN)
            val adminId = obj.optString("adminId", "").trim()
            val workerId = obj.optString("workerId", "").trim()
            val attendanceId = obj.optString("attendanceId", "").trim()
            if (!siteLat.isFinite() || !siteLng.isFinite() || adminId.isEmpty() || workerId.isEmpty() || attendanceId.isEmpty()) {
                clearConfig(context)
                return
            }
            val prevAttId = prefs.getString(KEY_ATTENDANCE_ID, "")
            if (prevAttId != attendanceId) {
                consecutiveOutCount = 0
                firstOutTimestampMs = 0L
                lastOutSampleTimestampMs = 0L
                insideSinceMs = 0L
            }
            prefs.edit()
                .putBoolean(KEY_ACTIVE, true)
                .putString(KEY_ATTENDANCE_ID, attendanceId)
                .putString(KEY_WORKER_ID, workerId)
                .putString(KEY_WORKER_NAME, obj.optString("workerName", "").trim())
                .putString(KEY_ADMIN_ID, adminId)
                .putString(KEY_PROJECT_ID, obj.optString("projectId", "").trim())
                .putString(KEY_PROJECT_TITLE, obj.optString("projectTitle", "").trim())
                .putString(KEY_SITE_LAT, siteLat.toString())
                .putString(KEY_SITE_LNG, siteLng.toString())
                .putInt(KEY_RADIUS_M, max(50, obj.optInt("radiusMeters", 150)))
                .putLong(KEY_TIME_IN, obj.optLong("timeIn", System.currentTimeMillis()))
                .putString(KEY_DATE, obj.optString("date", "").trim())
                .putString(KEY_FB_PROJECT_ID, obj.optString("fbProjectId", "").trim())
                .putString(KEY_FB_API_KEY, obj.optString("fbApiKey", "").trim())
                .apply()

            AlOstaLocationManager.setShiftTracking(context.applicationContext, true)
        } catch (_: Exception) {
        }
    }

    @Synchronized
    fun clearConfig(context: Context) {
        consecutiveOutCount = 0
        firstOutTimestampMs = 0L
        lastOutSampleTimestampMs = 0L
        insideSinceMs = 0L
        alertInFlight = false
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putBoolean(KEY_ACTIVE, false).apply()
    }

    fun isShiftGeofenceActive(context: Context): Boolean {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_ACTIVE, false)
    }

    private fun loadConfig(context: Context): GeofenceConfig? {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ACTIVE, false)) return null
        val lat = prefs.getString(KEY_SITE_LAT, null)?.toDoubleOrNull() ?: return null
        val lng = prefs.getString(KEY_SITE_LNG, null)?.toDoubleOrNull() ?: return null
        val attId = prefs.getString(KEY_ATTENDANCE_ID, "").orEmpty()
        val workerId = prefs.getString(KEY_WORKER_ID, "").orEmpty()
        val adminId = prefs.getString(KEY_ADMIN_ID, "").orEmpty()
        if (attId.isEmpty() || workerId.isEmpty() || adminId.isEmpty()) return null
        return GeofenceConfig(
            active = true,
            attendanceId = attId,
            workerId = workerId,
            workerName = prefs.getString(KEY_WORKER_NAME, "").orEmpty(),
            adminId = adminId,
            projectId = prefs.getString(KEY_PROJECT_ID, "").orEmpty(),
            projectTitle = prefs.getString(KEY_PROJECT_TITLE, "").orEmpty(),
            siteLat = lat,
            siteLng = lng,
            radiusMeters = max(50, prefs.getInt(KEY_RADIUS_M, 150)),
            timeIn = prefs.getLong(KEY_TIME_IN, System.currentTimeMillis()),
            date = prefs.getString(KEY_DATE, "").orEmpty(),
            fbProjectId = prefs.getString(KEY_FB_PROJECT_ID, "").orEmpty(),
            fbApiKey = prefs.getString(KEY_FB_API_KEY, "").orEmpty()
        )
    }

    @Synchronized
    fun markAlertSentFromJs(context: Context, attendanceId: String) {
        if (attendanceId.isBlank()) return
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_LAST_SENT_ATT_ID, attendanceId.trim())
            .putLong(KEY_LAST_SENT_AT, System.currentTimeMillis())
            .apply()
    }

    @Synchronized
    fun wasAlertRecentlySent(context: Context, attendanceId: String): Boolean {
        if (attendanceId.isBlank()) return false
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastId = prefs.getString(KEY_LAST_SENT_ATT_ID, "") ?: ""
        val lastAt = prefs.getLong(KEY_LAST_SENT_AT, 0L)
        return lastId == attendanceId.trim() && (System.currentTimeMillis() - lastAt) < EPISODE_COOLDOWN_MS
    }

    fun checkLatestLocation(context: Context) {
        val appCtx = context.applicationContext
        if (!isShiftGeofenceActive(appCtx)) return
        val loc = AlOstaLocationManager.getLatestFreshLocation(appCtx) ?: return
        onLocationUpdate(appCtx, loc)
    }

    fun onLocationUpdate(context: Context, loc: Location) {
        val appCtx = context.applicationContext
        val cfg = loadConfig(appCtx) ?: return
        val nowMs = System.currentTimeMillis()

        // Ignore stale fixes older than 90s
        if (loc.time > 0L && (nowMs - loc.time) > 90_000L) return

        val rawDist = calcDistanceMeters(loc.latitude, loc.longitude, cfg.siteLat, cfg.siteLng)
        val hasTimeGap = firstOutTimestampMs > 0L && (nowMs - lastOutSampleTimestampMs) >= CONSECUTIVE_MIN_GAP_MS
        val eval = evaluateReading(
            rawDistMeters = rawDist,
            accuracyMeters = loc.accuracy,
            radiusMeters = cfg.radiusMeters,
            priorOutCount = consecutiveOutCount,
            hasTimeGap = hasTimeGap
        )

        if (eval.ignoredLowAccuracy) return

        if (eval.inBounds) {
            consecutiveOutCount = 0
            firstOutTimestampMs = 0L
            lastOutSampleTimestampMs = 0L
            WorkerStepTracker.setInSiteBounds(true)
            if (insideSinceMs == 0L) {
                insideSinceMs = nowMs
            } else if ((nowMs - insideSinceMs) >= REENTRY_RESET_MS) {
                // Worker genuinely returned to the site for >= 2 minutes; allow re-alerting if they leave again later
                val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                if (prefs.getString(KEY_LAST_SENT_ATT_ID, "") == cfg.attendanceId) {
                    prefs.edit().remove(KEY_LAST_SENT_ATT_ID).remove(KEY_LAST_SENT_AT).apply()
                }
            }
            return
        }

        insideSinceMs = 0L
        if (consecutiveOutCount == 0) {
            firstOutTimestampMs = nowMs
            lastOutSampleTimestampMs = nowMs
            consecutiveOutCount = 1
        } else if ((nowMs - lastOutSampleTimestampMs) >= CONSECUTIVE_MIN_GAP_MS) {
            lastOutSampleTimestampMs = nowMs
            consecutiveOutCount += 1
        }

        // Pause step accumulation if confirmed far outside site geofence (> radius + 50m)
        if (eval.effectiveDistMeters > (cfg.radiusMeters + 50)) {
            WorkerStepTracker.setInSiteBounds(false)
        }

        if (!eval.confirmedDeparture) return
        if (alertInFlight || wasAlertRecentlySent(appCtx, cfg.attendanceId)) return

        alertInFlight = true
        val lat = loc.latitude
        val lng = loc.longitude
        val acc = loc.accuracy.roundToInt()

        networkExecutor.execute {
            try {
                val delivered = dispatchLeftSiteAlertToFirestore(appCtx, cfg, lat, lng, acc, eval.rawDistMeters)
                if (delivered) {
                    markAlertSentFromJs(appCtx, cfg.attendanceId)
                    val siteLabel = cfg.projectTitle.ifBlank { "موقع العمل" }
                    AlOstaBackgroundNotifier.postUrgentLocalNotification(
                        appCtx,
                        "⚠️ تنبيه: ابتعدت عن موقع العمل!",
                        "أنت الآن على بعد ${eval.rawDistMeters} متر عن \"$siteLabel\". تم إشعار المقاول."
                    )
                }
            } catch (_: Exception) {
            } finally {
                alertInFlight = false
            }
        }
    }

    private fun dispatchLeftSiteAlertToFirestore(
        context: Context,
        cfg: GeofenceConfig,
        lat: Double,
        lng: Double,
        acc: Int,
        rawDistMeters: Int
    ): Boolean {
        val creds = AlOstaBackgroundNotifier.getFirebaseRestCredentials(
            context = context,
            fallbackProjectId = cfg.fbProjectId,
            fallbackApiKey = cfg.fbApiKey
        ) ?: return false
        val (projectId, idToken) = creds
        val nowMs = System.currentTimeMillis()
        val revTs = max(0L, 9999999999999L - nowMs).toString().padStart(13, '0')
        val rand = (100000..999999).random().toString(36)
        val docId = "0_${revTs}_n$rand"

        val locFields = JSONObject().put(
            "mapValue",
            JSONObject().put(
                "fields",
                JSONObject()
                    .put("lat", JSONObject().put("doubleValue", lat))
                    .put("lng", JSONObject().put("doubleValue", lng))
                    .put("acc", JSONObject().put("integerValue", acc.toString()))
            )
        )

        val notifFields = JSONObject()
            .put("date", JSONObject().put("stringValue", cfg.date))
            .put("workerId", JSONObject().put("stringValue", cfg.workerId))
            .put("workerName", JSONObject().put("stringValue", cfg.workerName.ifBlank { "أحد العمال" }))
            .put("adminId", JSONObject().put("stringValue", cfg.adminId))
            .put("adminInboxKey", JSONObject().put("stringValue", "${cfg.adminId}__unread"))
            .put("projectId", JSONObject().put("stringValue", cfg.projectId))
            .put("projectTitle", JSONObject().put("stringValue", cfg.projectTitle))
            .put("timeIn", JSONObject().put("integerValue", cfg.timeIn.toString()))
            .put("timeOut", JSONObject().put("integerValue", nowMs.toString()))
            .put("createdAt", JSONObject().put("integerValue", nowMs.toString()))
            .put("inLoc", locFields)
            .put("outLoc", locFields)
            .put("inStatus", JSONObject().put("stringValue", "invalid"))
            .put("inDist", JSONObject().put("integerValue", rawDistMeters.toString()))
            .put("type", JSONObject().put("stringValue", "left_site"))
            .put("status", JSONObject().put("stringValue", "unread"))
            .put("source", JSONObject().put("stringValue", "native_geofence"))

        val notifBody = JSONObject().put("fields", notifFields).toString()
        val encodedDocId = URLEncoder.encode(docId, "UTF-8")
        val notifUrl =
            "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/notifications?documentId=$encodedDocId"

        val created = AlOstaBackgroundNotifier.httpRequestJson("POST", notifUrl, notifBody, idToken)
        if (!created) return false

        // Best-effort patch on attendance document so contractor sees exact exit distance & timestamp
        try {
            val encodedAttId = URLEncoder.encode(cfg.attendanceId, "UTF-8")
            val attUrl =
                "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/attendance/$encodedAttId" +
                    "?updateMask.fieldPaths=outLoc&updateMask.fieldPaths=outDist&updateMask.fieldPaths=outStatus&updateMask.fieldPaths=leftSiteAt"
            val attBody = JSONObject().put(
                "fields",
                JSONObject()
                    .put("outLoc", locFields)
                    .put("outDist", JSONObject().put("integerValue", rawDistMeters.toString()))
                    .put("outStatus", JSONObject().put("stringValue", "invalid"))
                    .put("leftSiteAt", JSONObject().put("integerValue", nowMs.toString()))
            ).toString()
            AlOstaBackgroundNotifier.httpRequestJson("PATCH", attUrl, attBody, idToken)
        } catch (_: Exception) {
        }

        // Best-effort patch on worker telemetry so contractor Live Radar immediately marks worker out of bounds
        try {
            val encodedWorkerId = URLEncoder.encode(cfg.workerId, "UTF-8")
            val telUrl =
                "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/worker_telemetry/$encodedWorkerId" +
                    "?updateMask.fieldPaths=liveInBounds&updateMask.fieldPaths=liveSiteDist&updateMask.fieldPaths=lastHeartbeatAt"
            val telBody = JSONObject().put(
                "fields",
                JSONObject()
                    .put("liveInBounds", JSONObject().put("booleanValue", false))
                    .put("liveSiteDist", JSONObject().put("integerValue", rawDistMeters.toString()))
                    .put("lastHeartbeatAt", JSONObject().put("integerValue", nowMs.toString()))
            ).toString()
            AlOstaBackgroundNotifier.httpRequestJson("PATCH", telUrl, telBody, idToken)
        } catch (_: Exception) {
        }

        return true
    }
}
