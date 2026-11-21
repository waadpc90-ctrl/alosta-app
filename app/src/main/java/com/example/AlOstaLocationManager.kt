package com.example

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat

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
