package com.example

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Lightweight, Play-Policy compliant Foreground Service that runs ONLY while a worker is
 * actively clocked into a site shift. Keeps hardware step & motion sensors alive when the
 * screen is locked or the worker switches apps, and shuts itself down cleanly on clock-out.
 */
class WorkerShiftMonitorService : Service() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var currentWorkerId: String = ""

    private val periodicRefreshRunnable = object : Runnable {
        override fun run() {
            if (!isRunning || currentWorkerId.isEmpty()) return
            try {
                WorkerStepTracker.ensureRegisteredIfTracking(applicationContext)
                WorkerStepTracker.flushHardwareSensor(applicationContext)
                WorkerStepTracker.flushPendingDiskWrite(applicationContext)
                AlOstaLocationManager.ensureShiftTrackingIfActive(applicationContext)
                WorkerGeofenceMonitor.checkLatestLocation(applicationContext)
                WorkerTelemetrySyncManager.syncIfDue(applicationContext, force = false)
                val manager = getSystemService(NotificationManager::class.java)
                manager?.notify(NOTIFICATION_ID, buildShiftNotification())
            } catch (_: Exception) {
            }
            mainHandler.postDelayed(this, REFRESH_INTERVAL_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        ensureNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START_SHIFT
        if (action == ACTION_STOP_SHIFT) {
            stopShiftService(clearPersistedConfigs = true)
            return START_NOT_STICKY
        }

        // Recover workerId from persisted shift storage when Android restarts a START_STICKY service with intent == null
        var workerId = intent?.getStringExtra(EXTRA_WORKER_ID).orEmpty().trim()
        if (workerId.isEmpty()) {
            workerId = WorkerStepTracker.restoreActiveShiftIfNeeded(applicationContext)
                .ifEmpty { WorkerTelemetrySyncManager.getActiveShiftWorkerId(applicationContext) }
        }
        if (workerId.isEmpty()) {
            stopShiftService(clearPersistedConfigs = false)
            return START_NOT_STICKY
        }

        currentWorkerId = workerId
        isRunning = true

        try {
            val notification = buildShiftNotification()
            val fgsType = resolveAllowedForegroundServiceType()
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, fgsType)
        } catch (_: Exception) {
            // If OEM restrictions block FGS launch from background, degrade gracefully without crashing
            isRunning = false
            stopSelf()
            return START_NOT_STICKY
        }

        WorkerStepTracker.ensureRegisteredIfTracking(applicationContext)
        WorkerStepTracker.flushHardwareSensor(applicationContext)
        AlOstaLocationManager.ensureShiftTrackingIfActive(applicationContext)
        WorkerGeofenceMonitor.checkLatestLocation(applicationContext)
        WorkerTelemetrySyncManager.syncIfDue(applicationContext, force = false)
        mainHandler.removeCallbacks(periodicRefreshRunnable)
        mainHandler.postDelayed(periodicRefreshRunnable, REFRESH_INTERVAL_MS)
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Worker swiped the app away from Recents during an active shift:
        // flush hardware steps immediately, sync to Firestore, and arm JobScheduler safety net.
        try {
            if (isRunning && currentWorkerId.isNotEmpty()) {
                WorkerStepTracker.flushHardwareSensor(applicationContext)
                WorkerStepTracker.flushPendingDiskWrite(applicationContext)
                WorkerTelemetrySyncManager.syncIfDue(applicationContext, force = true)
                AlOstaBackgroundNotifier.scheduleQuickRecheck(applicationContext)
            }
        } catch (_: Exception) {
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        // Android 15+ compliance: stop cleanly if a dataSync FGS ever reaches its system time limit
        stopShiftService(clearPersistedConfigs = false)
    }

    override fun onDestroy() {
        isRunning = false
        mainHandler.removeCallbacks(periodicRefreshRunnable)
        WorkerStepTracker.flushPendingDiskWrite(applicationContext)
        if (WorkerTelemetrySyncManager.hasActiveShiftForToday(applicationContext)) {
            AlOstaBackgroundNotifier.scheduleQuickRecheck(applicationContext)
        }
        super.onDestroy()
    }

    private fun stopShiftService(clearPersistedConfigs: Boolean = true) {
        isRunning = false
        currentWorkerId = ""
        mainHandler.removeCallbacks(periodicRefreshRunnable)
        WorkerStepTracker.flushPendingDiskWrite(applicationContext)
        if (clearPersistedConfigs) {
            WorkerTelemetrySyncManager.clearConfig(applicationContext)
            WorkerGeofenceMonitor.clearConfig(applicationContext)
        }
        AlOstaLocationManager.setShiftTracking(applicationContext, false)
        try {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {
        }
        stopSelf()
    }

    private fun resolveAllowedForegroundServiceType(): Int {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return 0
        }
        var combinedType = 0
        val hasActivityRecognition =
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION) ==
                PackageManager.PERMISSION_GRANTED
        if (hasActivityRecognition) {
            combinedType = combinedType or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
        }
        val hasFine =
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        val hasCoarse =
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        if (hasFine || hasCoarse) {
            combinedType = combinedType or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        }
        return if (combinedType != 0) combinedType else ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.shift_monitor_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.shift_monitor_channel_desc)
                setShowBadge(false)
                enableVibration(false)
                setSound(null, null)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun buildShiftNotification(): Notification {
        val summary = WorkerStepTracker.getLiveNotificationSummary(applicationContext, currentWorkerId)
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getActivity(this, 1002, openIntent, pendingFlags)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(getString(R.string.shift_monitor_title))
            .setContentText(summary)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pendingIntent)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "al_osta_shift_monitor"
        private const val NOTIFICATION_ID = 4102
        private const val REFRESH_INTERVAL_MS = 30_000L
        const val ACTION_START_SHIFT = "com.example.action.START_SHIFT_MONITOR"
        const val ACTION_STOP_SHIFT = "com.example.action.STOP_SHIFT_MONITOR"
        const val EXTRA_WORKER_ID = "extra_worker_id"

        @Volatile
        var isRunning: Boolean = false
            private set

        fun restoreIfShiftActive(context: Context) {
            val appCtx = context.applicationContext
            val workerId = WorkerStepTracker.restoreActiveShiftIfNeeded(appCtx)
                .ifEmpty { WorkerTelemetrySyncManager.getActiveShiftWorkerId(appCtx) }
            if (workerId.isNotEmpty() && !isRunning) {
                startForWorker(appCtx, workerId)
            }
        }

        fun startForWorker(context: Context, workerId: String) {
            val cleanId = workerId.trim()
            if (cleanId.isEmpty()) return
            try {
                val appCtx = context.applicationContext
                val intent = Intent(appCtx, WorkerShiftMonitorService::class.java).apply {
                    action = ACTION_START_SHIFT
                    putExtra(EXTRA_WORKER_ID, cleanId)
                }
                ContextCompat.startForegroundService(appCtx, intent)
            } catch (_: Exception) {
                // Fallback gracefully: sensors still remain active in-process while app is foreground
            }
        }

        fun stop(context: Context) {
            try {
                val appCtx = context.applicationContext
                if (!isRunning) return
                val intent = Intent(appCtx, WorkerShiftMonitorService::class.java).apply {
                    action = ACTION_STOP_SHIFT
                }
                appCtx.startService(intent)
            } catch (_: Exception) {
                isRunning = false
            }
        }
    }
}
