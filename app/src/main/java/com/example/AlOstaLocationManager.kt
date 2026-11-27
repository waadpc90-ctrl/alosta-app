package com.example

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min

object AlOstaLocationManager {
    private val mainHandler by lazy { Handler(Looper.getMainLooper()) }

    @Volatile
    private var continuousShiftTracking = false
    @Volatile
    private var isShiftListening = false
    @Volatile
    private var isOneShotListening = false
    @Volatile
    private var lastFreshLocation: Location? = null

    private var shiftListener: LocationListener? = null
    private var oneShotListener: LocationListener? = null
    private var singleShotStopRunnable: Runnable? = null

    // High-precision multi-sample lock state (used when setting/updating a project site pin)
    @Volatile
    private var precisionLockActive = false
    @Volatile
    private var precisionLockStartMs = 0L
    private val precisionSamples = mutableListOf<LocationSample>()
    private var precisionStopRunnable: Runnable? = null

    internal data class LocationSample(
        val lat: Double,
        val lng: Double,
        val accuracy: Float,
        val timeMs: Long,
        val isGps: Boolean
    )

    internal data class StabilizedFix(
        val lat: Double,
        val lng: Double,
        val accuracy: Float,
        val sampleCount: Int,
        val gpsSampleCount: Int,
        val spreadMeters: Int,
        val locked: Boolean,
        val timestamp: Long
    )

    private fun hasLocationPermission(ctx: Context): Boolean {
        val fine = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    internal fun isValidLocation(loc: Location?): Boolean {
        if (loc == null) return false
        if (!loc.latitude.isFinite() || !loc.longitude.isFinite()) return false
        if (loc.latitude == 0.0 && loc.longitude == 0.0) return false
        if (loc.latitude < -90.0 || loc.latitude > 90.0 || loc.longitude < -180.0 || loc.longitude > 180.0) return false
        if (loc.accuracy <= 0f || loc.accuracy > 5000f) return false
        return true
    }

    /**
     * Quality-ranked location comparator (prevents coarse NETWORK/PASSIVE cell-tower jumps
     * from overwriting an accurate GPS_PROVIDER fix).
     */
    internal fun isBetterLocation(candidate: Location, current: Location?): Boolean {
        if (!isValidLocation(candidate)) return false
        if (current == null || !isValidLocation(current)) return true

        val timeDelta = candidate.time - current.time
        val isSignificantlyNewer = timeDelta > 45_000L
        val isSignificantlyOlder = timeDelta < -45_000L
        val isNewer = timeDelta > 0L

        val candidateIsGps = candidate.provider == LocationManager.GPS_PROVIDER
        val currentIsGps = current.provider == LocationManager.GPS_PROVIDER

        // If candidate is significantly newer (>45s), accept unless it's a wild coarse cell-tower jump (>180m)
        if (isSignificantlyNewer) {
            if (!candidateIsGps && currentIsGps && timeDelta < 120_000L && candidate.accuracy > max(180f, current.accuracy * 4f)) {
                return false
            }
            return true
        }
        if (isSignificantlyOlder) return false

        // Always accept a newer, accurate GPS fix (<=65m): moving workers naturally fluctuate from 6m to 25-50m
        if (candidateIsGps && isNewer && candidate.accuracy <= 65f) {
            return true
        }

        // Accept a newer Wi-Fi/Network fix with solid accuracy (<=65m) once current GPS is >=20s old
        if (!candidateIsGps && currentIsGps) {
            if (isNewer && timeDelta >= 20_000L && candidate.accuracy <= 65f) {
                return true
            }
            if (candidate.accuracy > max(35f, current.accuracy * 1.4f)) {
                return false
            }
        }

        // Strongly prefer a valid GPS fix over a network fix within the window
        if (candidateIsGps && !currentIsGps && candidate.accuracy <= 65f) {
            return true
        }

        val accDelta = candidate.accuracy - current.accuracy
        val isMoreAccurate = accDelta < 0f
        val isSignificantlyLessAccurate = accDelta > 40f

        if (isMoreAccurate) return true
        if (isNewer && !isSignificantlyLessAccurate && accDelta <= 25f) return true
        return false
    }

    internal fun computeStabilizedCentroid(samples: List<LocationSample>): StabilizedFix? {
        val valid = samples.filter {
            it.lat.isFinite() && it.lng.isFinite() && !(it.lat == 0.0 && it.lng == 0.0) && it.accuracy > 0f && it.accuracy <= 1000f
        }
        if (valid.isEmpty()) return null

        val gpsAccurate = valid.filter { it.isGps && it.accuracy <= 45f }
        val poolByProvider = if (gpsAccurate.size >= 2) gpsAccurate else {
            val anyGps = valid.filter { it.isGps && it.accuracy <= 100f }
            if (anyGps.isNotEmpty()) anyGps else valid
        }

        val bestAcc = poolByProvider.minOf { it.accuracy }
        val accCeiling = max(30f, bestAcc * 2.4f)
        val filteredByAcc = poolByProvider.filter { it.accuracy <= accCeiling }.ifEmpty { poolByProvider }

        // Spatial outlier rejection around median coordinate when >= 3 samples exist
        val cluster = if (filteredByAcc.size >= 3) {
            val sortedLats = filteredByAcc.map { it.lat }.sorted()
            val sortedLngs = filteredByAcc.map { it.lng }.sorted()
            val medLat = sortedLats[sortedLats.size / 2]
            val medLng = sortedLngs[sortedLngs.size / 2]
            val dists = filteredByAcc.map { WorkerGeofenceMonitor.calcDistanceMeters(it.lat, it.lng, medLat, medLng) }
            val sortedDists = dists.sorted()
            val medDist = sortedDists[sortedDists.size / 2]
            val maxAllowedDist = max(25, (medDist * 2.5).toInt())
            filteredByAcc.filterIndexed { idx, _ -> dists[idx] <= maxAllowedDist }.ifEmpty { filteredByAcc }
        } else {
            filteredByAcc
        }

        // Inverse-variance weighted centroid (weight = 1 / acc^2)
        var sumW = 0.0
        var sumLat = 0.0
        var sumLng = 0.0
        var latestTs = 0L
        for (s in cluster) {
            val sigma = max(3.0, s.accuracy.toDouble())
            val w = 1.0 / (sigma * sigma)
            sumW += w
            sumLat += s.lat * w
            sumLng += s.lng * w
            if (s.timeMs > latestTs) latestTs = s.timeMs
        }
        val avgLat = sumLat / sumW
        val avgLng = sumLng / sumW

        val spreadMeters = cluster.maxOf { WorkerGeofenceMonitor.calcDistanceMeters(it.lat, it.lng, avgLat, avgLng) }
        val minAcc = cluster.minOf { it.accuracy }
        val gpsCount = cluster.count { it.isGps }
        val effectiveAcc = min(minAcc, max(3f, minAcc * (if (cluster.size >= 3) 0.85f else 1f)))
        val isLocked = (cluster.size >= 3 && effectiveAcc <= 22f && spreadMeters <= 22) ||
            (gpsCount >= 2 && effectiveAcc <= 12f && spreadMeters <= 12)

        return StabilizedFix(
            lat = avgLat,
            lng = avgLng,
            accuracy = effectiveAcc,
            sampleCount = cluster.size,
            gpsSampleCount = gpsCount,
            spreadMeters = spreadMeters,
            locked = isLocked,
            timestamp = if (latestTs > 0L) latestTs else System.currentTimeMillis()
        )
    }

    @SuppressLint("MissingPermission")
    @Synchronized
    fun setShiftTracking(context: Context, enabled: Boolean) {
        continuousShiftTracking = enabled
        val appCtx = context.applicationContext
        if (enabled) {
            startShiftListener(appCtx)
        } else {
            stopShiftListener(appCtx)
        }
    }

    @Synchronized
    fun ensureShiftTrackingIfActive(context: Context) {
        val appCtx = context.applicationContext
        if (continuousShiftTracking || WorkerGeofenceMonitor.isShiftGeofenceActive(appCtx)) {
            continuousShiftTracking = true
            if (!isShiftListening) {
                startShiftListener(appCtx)
            }
        }
    }

    @SuppressLint("MissingPermission")
    @Synchronized
    private fun startShiftListener(appCtx: Context) {
        if (!hasLocationPermission(appCtx) || isShiftListening) return
        val lm = appCtx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return
        val listener = LocationListener { loc ->
            handleIncomingLocation(appCtx, loc, fromShift = true)
        }
        shiftListener = listener
        isShiftListening = true
        mainHandler.post {
            try {
                if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10_000L, 5f, listener, Looper.getMainLooper())
                }
                if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15_000L, 12f, listener, Looper.getMainLooper())
                }
            } catch (_: Exception) {
                isShiftListening = false
            }
        }
    }

    @Synchronized
    private fun stopShiftListener(appCtx: Context) {
        val listener = shiftListener ?: run {
            isShiftListening = false
            return
        }
        val lm = appCtx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        mainHandler.post {
            try {
                lm?.removeUpdates(listener)
            } catch (_: Exception) {
            }
        }
        shiftListener = null
        isShiftListening = false
    }

    @SuppressLint("MissingPermission")
    @Synchronized
    fun startPrecisionSiteLock(context: Context) {
        val appCtx = context.applicationContext
        if (!hasLocationPermission(appCtx)) return
        stopPrecisionSiteLock(appCtx)
        precisionSamples.clear()
        precisionLockStartMs = System.currentTimeMillis()
        precisionLockActive = true

        val lm = appCtx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return
        val listener = LocationListener { loc ->
            handleIncomingLocation(appCtx, loc, fromShift = false)
        }
        oneShotListener = listener
        isOneShotListening = true
        mainHandler.post {
            try {
                if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, listener, Looper.getMainLooper())
                }
                if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2000L, 0f, listener, Looper.getMainLooper())
                }
            } catch (_: Exception) {
                isOneShotListening = false
            }
        }

        val stopTask = Runnable {
            stopPrecisionSiteLock(appCtx)
        }
        precisionStopRunnable = stopTask
        mainHandler.postDelayed(stopTask, 18_000L)
    }

    @Synchronized
    fun stopPrecisionSiteLock(context: Context) {
        precisionLockActive = false
        precisionStopRunnable?.let { mainHandler.removeCallbacks(it) }
        precisionStopRunnable = null
        singleShotStopRunnable?.let { mainHandler.removeCallbacks(it) }
        singleShotStopRunnable = null
        val listener = oneShotListener ?: run {
            isOneShotListening = false
            return
        }
        val lm = context.applicationContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        mainHandler.post {
            try {
                lm?.removeUpdates(listener)
            } catch (_: Exception) {
            }
        }
        oneShotListener = null
        isOneShotListening = false
    }

    @Synchronized
    fun getPrecisionSiteLockJson(context: Context): String {
        val fix = computeStabilizedCentroid(precisionSamples.toList())
        val elapsedMs = if (precisionLockStartMs > 0L) (System.currentTimeMillis() - precisionLockStartMs) else 0L
        val obj = JSONObject()
        obj.put("active", precisionLockActive)
        obj.put("elapsedMs", elapsedMs)
        obj.put("rawSamples", precisionSamples.size)
        if (fix != null) {
            obj.put("hasFix", true)
            obj.put("lat", fix.lat)
            obj.put("lng", fix.lng)
            obj.put("accuracy", fix.accuracy.toDouble())
            obj.put("acc", fix.accuracy.toDouble())
            obj.put("sampleCount", fix.sampleCount)
            obj.put("gpsSampleCount", fix.gpsSampleCount)
            obj.put("spreadMeters", fix.spreadMeters)
            obj.put("locked", fix.locked)
            obj.put("timestamp", fix.timestamp)
            obj.put("time", fix.timestamp)
        } else {
            obj.put("hasFix", false)
            obj.put("locked", false)
        }
        return obj.toString()
    }

    @SuppressLint("MissingPermission")
    @Synchronized
    fun requestOneShotFreshFix(context: Context) {
        val appCtx = context.applicationContext
        if (!hasLocationPermission(appCtx)) return
        if (isOneShotListening || precisionLockActive) return
        val lm = appCtx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return
        val listener = LocationListener { loc ->
            handleIncomingLocation(appCtx, loc, fromShift = false)
        }
        oneShotListener = listener
        isOneShotListening = true
        mainHandler.post {
            try {
                if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1500L, 1f, listener, Looper.getMainLooper())
                }
                if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2500L, 1f, listener, Looper.getMainLooper())
                }
            } catch (_: Exception) {
                isOneShotListening = false
            }
        }
        singleShotStopRunnable?.let { mainHandler.removeCallbacks(it) }
        val stopTask = Runnable {
            if (!precisionLockActive) {
                stopPrecisionSiteLock(appCtx)
            }
        }
        singleShotStopRunnable = stopTask
        mainHandler.postDelayed(stopTask, 12_000L)
    }

    @Synchronized
    private fun handleIncomingLocation(appCtx: Context, loc: Location, fromShift: Boolean) {
        if (!isValidLocation(loc)) return
        if (isBetterLocation(loc, lastFreshLocation)) {
            lastFreshLocation = loc
        }
        if (precisionLockActive) {
            val isFreshForLock = loc.time == 0L || loc.time >= (precisionLockStartMs - 5_000L)
            if (isFreshForLock) {
                val sample = LocationSample(
                    lat = loc.latitude,
                    lng = loc.longitude,
                    accuracy = loc.accuracy,
                    timeMs = if (loc.time > 0L) loc.time else System.currentTimeMillis(),
                    isGps = loc.provider == LocationManager.GPS_PROVIDER
                )
                precisionSamples.add(sample)
                if (precisionSamples.size > 24) {
                    precisionSamples.removeAt(0)
                }
            }
        }
        if (fromShift || continuousShiftTracking || WorkerGeofenceMonitor.isShiftGeofenceActive(appCtx)) {
            val bestForGeofence = lastFreshLocation ?: loc
            WorkerGeofenceMonitor.onLocationUpdate(appCtx, bestForGeofence)
        }
    }

    @Synchronized
    fun pauseIfIdle(context: Context) {
        val appCtx = context.applicationContext
        stopPrecisionSiteLock(appCtx)
        if (!continuousShiftTracking && !WorkerGeofenceMonitor.isShiftGeofenceActive(appCtx)) {
            stopShiftListener(appCtx)
        }
    }

    @Synchronized
    fun stopTracking(context: Context) {
        val appCtx = context.applicationContext
        continuousShiftTracking = false
        stopPrecisionSiteLock(appCtx)
        stopShiftListener(appCtx)
    }

    @SuppressLint("MissingPermission")
    fun getLatestFreshLocation(context: Context): Location? {
        val appCtx = context.applicationContext
        if (!hasLocationPermission(appCtx)) return null
        return try {
            val lm = appCtx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return lastFreshLocation
            var best: Location? = lastFreshLocation
            val providers = listOf(
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER
            )
            for (provider in providers) {
                try {
                    if (lm.isProviderEnabled(provider)) {
                        val loc = lm.getLastKnownLocation(provider)
                        if (loc != null && isBetterLocation(loc, best)) {
                            best = loc
                        }
                    }
                } catch (_: Exception) {
                }
            }
            best
        } catch (_: Exception) {
            lastFreshLocation
        }
    }

    @SuppressLint("MissingPermission")
    fun getBestLocationJson(context: Context): String {
        val appCtx = context.applicationContext
        if (!hasLocationPermission(appCtx)) return ""
        return try {
            val bestLocation = getLatestFreshLocation(appCtx)
            val now = System.currentTimeMillis()
            if (bestLocation == null || (now - bestLocation.time) > 20_000L || bestLocation.accuracy > 50f) {
                requestOneShotFreshFix(appCtx)
            }
            if (bestLocation != null) {
                val ageMs = max(0L, now - bestLocation.time)
                val obj = JSONObject()
                obj.put("lat", bestLocation.latitude)
                obj.put("lng", bestLocation.longitude)
                obj.put("accuracy", bestLocation.accuracy.toDouble())
                obj.put("acc", bestLocation.accuracy.toDouble())
                obj.put("timestamp", bestLocation.time)
                obj.put("time", bestLocation.time)
                obj.put("ageMs", ageMs)
                obj.put("provider", bestLocation.provider ?: "")
                obj.toString()
            } else {
                ""
            }
        } catch (_: Exception) {
            ""
        }
    }
}
