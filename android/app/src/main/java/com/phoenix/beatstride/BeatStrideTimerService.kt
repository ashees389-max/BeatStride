package com.phoenix.beatstride

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Two ways this fires, both converging on the same fireWakeUp() below:
 *
 * 1. PRIMARY — a native Handler.postDelayed() timer running directly inside
 *    BeatStrideWakeLockPlugin (see scheduleRestEnd() there), in the same
 *    already-alive, wake-locked, foreground-serviced process the session
 *    already keeps running. This is what actually reaches JS reliably on
 *    devices (Vivo, confirmed via extensive live-device testing) that
 *    silently block AlarmManager from starting a fresh Service — since this
 *    path never asks the OS to start anything new, there's nothing for that
 *    restriction to block.
 *
 * 2. BACKUP — AlarmManager.setAlarmClock() (armed in scheduleRestEnd()) fires
 *    this Service the old way, in case the primary path's process is somehow
 *    not alive when the timer should fire (e.g. a genuine process kill, which
 *    a Handler timer can't survive but AlarmManager+Service can). Confirmed
 *    on this project's real device this path's own Service start is silently
 *    dropped by Vivo, but it costs nothing to keep as a safety net for other
 *    OEMs/devices where it might actually work.
 *
 * fireWakeUp() itself:
 *   1. Tells JS directly via evaluateJavascript(_nativeRestEnd) — this is the
 *      part that actually matters for correctness, and doesn't require the
 *      Activity to be visible (the WebView is kept resumed throughout an
 *      active session by handleOnPause() in BeatStrideWakeLockPlugin).
 *   2. Vibrates — unambiguous physical proof/haptic cue.
 *   3. Best-effort visual wake: SCREEN_BRIGHT_WAKE_LOCK, full-screen alarm
 *      notification, direct startActivity() attempt. These bring the app
 *      over the lock screen when the OS allows it, but (1) already made sure
 *      the session state itself is correct regardless of whether they work.
 */
class BeatStrideTimerService : Service() {

    companion object {
        private const val CHANNEL_ID = "bs_alarm"
        // Increments each alarm so Vivo fires the full-screen intent fresh
        // each time rather than treating it as an update to an existing one.
        private var notifCounter = 8890

        fun fireWakeUp(context: Context, setIdx: Int) {
            Log.d("BeatStrideTimerService", "fireWakeUp: setIdx=$setIdx")

            // Tell JS immediately — the one thing that actually has to work.
            // Routed through a helper on the plugin itself (rather than touching
            // plugin.bridge directly from here) since Capacitor's Bridge/webView
            // fields are only accessible from within a Plugin subclass — this
            // class isn't one. BeatStrideWakeLockPlugin.instance is set in its
            // load() for the lifetime of the app.
            BeatStrideWakeLockPlugin.instance?.evalNativeRestEnd(setIdx)

            // Vibrate — unambiguous physical proof + real haptic cue, can't be
            // silently dropped the way a log line or notification can.
            try {
                val vib: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
                } else {
                    @Suppress("DEPRECATION")
                    context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                }
                if (vib != null && vib.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vib.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 300, 150, 300, 150, 300), -1))
                    } else {
                        @Suppress("DEPRECATION")
                        vib.vibrate(longArrayOf(0, 300, 150, 300, 150, 300), -1)
                    }
                }
            } catch (e: Exception) {
                Log.w("BeatStrideTimerService", "vibrate failed: ${e.message}")
            }

            // Still stored for handleOnResume() as a defensive fallback — harmless
            // no-op if _nativeRestEnd above already advanced the session, since
            // that function itself guards on isResting.
            BeatStrideWakeLockPlugin.pendingRestEndSetIdx = setIdx

            // Best-effort visual wake — screen on, full-screen notification, direct
            // launch attempt. May or may not actually succeed depending on the OEM;
            // (1) above already made sure the app's state is correct either way.
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            val screenLock = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "BeatStride::ScreenWake"
            )
            screenLock.acquire(10_000L)

            showAlarmNotification(context, notifCounter++)

            try {
                val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or
                             Intent.FLAG_ACTIVITY_SINGLE_TOP or
                             Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                }
                if (launchIntent != null) context.startActivity(launchIntent)
            } catch (e: Exception) {
                Log.w("BeatStrideTimerService", "startActivity failed (expected on some devices): ${e.message}")
            }

            Handler(Looper.getMainLooper()).postDelayed({
                if (screenLock.isHeld) screenLock.release()
            }, 8_000)
        }

        private fun showAlarmNotification(context: Context, notifId: Int) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val ch = NotificationChannel(CHANNEL_ID, "BeatStride Alerts", NotificationManager.IMPORTANCE_HIGH)
                ch.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                nm.createNotificationChannel(ch)
            }

            val openIntent = PendingIntent.getActivity(
                context, 0,
                (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notif = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("BeatStride")
                .setContentText("Rest complete — next set starting")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setFullScreenIntent(openIntent, true)   // shows above lock screen
                .setAutoCancel(true)
                .build()

            nm.notify(notifId, notif)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val setIdx = intent?.getIntExtra("setIdx", -1) ?: -1
        Log.d("BeatStrideTimerService", "onStartCommand (AlarmManager backup path): setIdx=$setIdx")
        fireWakeUp(this, setIdx)
        Handler(Looper.getMainLooper()).postDelayed({ stopSelf(startId) }, 8_000)
        return START_NOT_STICKY
    }
}
