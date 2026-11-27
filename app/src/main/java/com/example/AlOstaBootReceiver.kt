package com.example

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restores background notification jobs and any active shift monitor after device reboot
 * or app update (essential on Huawei/Honor/Xiaomi/Samsung devices that drop persisted jobs).
 */
class AlOstaBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        val ctx = context?.applicationContext ?: return
        val action = intent?.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == "com.htc.intent.action.QUICKBOOT_POWERON"
        ) {
            try {
                if (!ctx.packageName.contains("dashboard", ignoreCase = true)) {
                    AlOstaBackgroundNotifier.schedulePeriodicCheck(ctx, forceReschedule = true)
                    AlOstaBackgroundNotifier.scheduleQuickRecheck(ctx, resetChain = true)
                    WorkerShiftMonitorService.restoreIfShiftActive(ctx)
                }
            } catch (_: Exception) {
            }
        }
    }
}
