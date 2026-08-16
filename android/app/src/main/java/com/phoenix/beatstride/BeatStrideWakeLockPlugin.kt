package com.phoenix.beatstride

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "BeatStrideWakeLock")
class BeatStrideWakeLockPlugin : Plugin() {

    companion object {
        var instance: BeatStrideWakeLockPlugin? = null

        // Set by BeatStrideTimerService when the rest-end alarm fires.
        // Consumed in handleOnResume() so JS is evaluated only after the
        // Activity has gone through its full resume lifecycle (WebView guaranteed live).
        var pendingRestEndSetIdx: Int = -1

        private const val REST_ALARM_REQUEST_CODE = 7291
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var pendingRestIntent: PendingIntent? = null

    // Primary rest-end trigger — see BeatStrideTimerService's file header for the
    // full rationale. Runs directly in this already-alive, wake-locked process
    // instead of asking the OS to start anything new, which is the specific step
    // real-device testing found silently blocked on this project's Vivo unit
    // despite every relevant permission being correctly granted.
    private val restHandler = Handler(Looper.getMainLooper())
    private var pendingRestRunnable: Runnable? = null

    // ── Lifecycle ─────────────────────────────────────────────────────────

    override fun load() {
        instance = this
    }

    /**
     * Called by Capacitor when the Activity resumes — AFTER WebView.onResume()
     * has already been called by the bridge. By the time this fires, the WebView
     * is fully live and evaluateJavascript() is guaranteed to execute immediately.
     *
     * If pendingRestEndSetIdx was set by BeatStrideTimerService (alarm fired):
     *   1. Make the Activity visible above the lock screen (alarm-clock pattern).
     *   2. Evaluate _nativeRestEnd(idx) — starts the next set with full beats.
     */
    override fun handleOnResume() {
        val idx = pendingRestEndSetIdx
        if (idx < 0) return
        pendingRestEndSetIdx = -1

        Log.d("BeatStrideWakeLock", "handleOnResume: firing _nativeRestEnd($idx)")

        // Show the Activity above the lock screen so the user sees the next set
        // start without needing to unlock — the same behaviour as alarm clocks.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            activity.setShowWhenLocked(true)
            activity.setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            activity.window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }

        evalNativeRestEnd(idx)
    }

    /**
     * Injects window._nativeRestEnd(idx) directly into the WebView. Public (not a
     * @PluginMethod — this is Kotlin-to-Kotlin, not JS-callable) so
     * BeatStrideTimerService.fireWakeUp() can call it too: Capacitor's
     * Bridge/webView fields are only accessible from within a Plugin subclass,
     * so this wrapper is how code outside this class reaches them.
     * Safe to call from any thread — posts onto the WebView's own thread.
     * Doesn't require the Activity to be visible/resumed: handleOnPause() above
     * keeps the WebView's timers running throughout an active session
     * specifically so this keeps working even with the screen off.
     */
    fun evalNativeRestEnd(idx: Int) {
        bridge.webView.post {
            bridge.webView.evaluateJavascript(
                "window._nativeRestEnd && window._nativeRestEnd($idx)"
            ) { result -> Log.d("BeatStrideWakeLock", "_nativeRestEnd result: $result") }
        }
    }

    /**
     * When Capacitor pauses the Activity (screen turns off), immediately
     * re-enable the WebView so JS timers keep firing during an active session.
     */
    override fun handleOnPause() {
        if (wakeLock?.isHeld == true) {
            Log.d("BeatStrideWakeLock", "handleOnPause: re-enabling WebView for active session")
            bridge.webView.onResume()
            bridge.webView.resumeTimers()
        }
    }

    override fun handleOnStop() {
        if (wakeLock?.isHeld == true) {
            bridge.webView.onResume()
            bridge.webView.resumeTimers()
        }
    }

    /** Retreats the app to the background after beats start — Option A flash UX. */
    @PluginMethod
    fun moveToBackground(call: PluginCall) {
        activity.moveTaskToBack(true)
        call.resolve()
    }

    override fun handleOnDestroy() {
        releaseWakeLockInternal()
        cancelPendingRest()
        instance = null
    }

    // ── Wake lock ─────────────────────────────────────────────────────────

    @PluginMethod
    fun acquire(call: PluginCall) {
        if (wakeLock?.isHeld != true) {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BeatStride::SessionWakeLock")
                .also { it.acquire(); wakeLock = it }
            Log.d("BeatStrideWakeLock", "WakeLock acquired")
        }
        call.resolve()
    }

    @PluginMethod
    fun release(call: PluginCall) {
        releaseWakeLockInternal()
        call.resolve()
    }

    private fun releaseWakeLockInternal() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }

    // ── Battery optimisation exemption ────────────────────────────────────

    @PluginMethod
    fun isIgnoringBatteryOptimizations(call: PluginCall) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val ret = JSObject()
        ret.put("ignored", pm.isIgnoringBatteryOptimizations(context.packageName))
        call.resolve(ret)
    }

    @PluginMethod
    fun requestIgnoreBatteryOptimizations(call: PluginCall) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(context.packageName)) {
            context.startActivity(
                Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    .apply { data = Uri.parse("package:${context.packageName}"); addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            )
        }
        call.resolve()
    }

    @PluginMethod
    fun openAutoStartSettings(call: PluginCall) {
        tryOpenVivoAutoStart() || tryOpenGenericBatterySettings()
        call.resolve()
    }

    private fun tryOpenVivoAutoStart(): Boolean = try {
        context.startActivity(Intent().apply {
            component = android.content.ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.PurviewTabActivity")
            putExtra("tabId", "1"); addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }); true
    } catch (e: Exception) { false }

    private fun tryOpenGenericBatterySettings(): Boolean = try {
        context.startActivity(Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            .apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }); true
    } catch (e: Exception) { false }

    // ── Exact-alarm permission (required for scheduleRestEnd's setAlarmClock) ─────
    // Mirrors the isIgnoringBatteryOptimizations/requestIgnoreBatteryOptimizations
    // pair above exactly: isExactAlarmAllowed() always reads LIVE OS state (never
    // cached/stored on the JS side), so requestExactAlarmPermission() should only
    // ever be called by the host page when that live check says it's actually
    // missing — same as the battery-optimization flow already does. That avoids
    // the earlier bug where the permission prompt fired on every single session
    // regardless of whether it had already been granted.
    // Below API 31 this permission doesn't exist / isn't needed, so both methods
    // report "allowed" unconditionally on older devices.

    @PluginMethod
    fun isExactAlarmAllowed(call: PluginCall) {
        val ret = JSObject()
        val allowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.canScheduleExactAlarms()
        } else true
        ret.put("allowed", allowed)
        call.resolve(ret)
    }

    @PluginMethod
    fun requestExactAlarmPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            if (!am.canScheduleExactAlarms()) {
                context.startActivity(
                    Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                        .apply { data = Uri.parse("package:${context.packageName}"); addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
                )
            }
        }
        call.resolve()
    }

    // ── AlarmManager rest-end timer ───────────────────────────────────────

    @PluginMethod
    fun scheduleRestEnd(call: PluginCall) {
        val delayMs = (call.getDouble("delayMs", 0.0) ?: 0.0).toLong()
        val setIdx  = call.getInt("setIdx", 0) ?: 0

        Log.d("BeatStrideWakeLock", "scheduleRestEnd: delayMs=$delayMs setIdx=$setIdx")

        if (delayMs < 1000L) { call.resolve(); return }

        cancelPendingRest()

        // ── PRIMARY: native Handler timer, running directly in this process ──
        // See this class's restHandler field comment and BeatStrideTimerService's
        // file header for the full rationale. Uses the same (deliberately
        // early-by-a-few-seconds) delayMs as the AlarmManager backup below —
        // fireWakeUp() → evalNativeRestEnd() → JS's _nativeRestEnd() already
        // knows how to wait out the last couple of seconds itself, so no
        // separate timing math is needed here.
        val runnable = Runnable {
            Log.d("BeatStrideWakeLock", "native Handler timer fired: setIdx=$setIdx")
            BeatStrideTimerService.fireWakeUp(context, setIdx)
        }
        pendingRestRunnable = runnable
        restHandler.postDelayed(runnable, delayMs)

        // ── BACKUP: AlarmManager.setAlarmClock() ──────────────────────────────
        // Kept in case this process is ever not alive when the timer should fire
        // (a genuine process kill — something a Handler can't survive but this
        // can). fireWakeUp() is idempotent enough in practice: JS's
        // _nativeRestEnd() guards on isResting, so if the primary path above
        // already fired, a redundant call here is a harmless no-op.
        val serviceIntent = Intent(context, BeatStrideTimerService::class.java).apply {
            putExtra("setIdx", setIdx)
        }
        val pi = PendingIntent.getService(
            context, REST_ALARM_REQUEST_CODE, serviceIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        pendingRestIntent = pi

        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
        val showIntent = PendingIntent.getActivity(
            context, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        // ── Exact-alarm permission guard ────────────────────────────────────
        // setAlarmClock() is an exact alarm. On Android 12+ (API 31+) this requires
        // SCHEDULE_EXACT_ALARM — a "special access" permission that is NEVER auto-granted
        // just by declaring it in the manifest; the user must enable it in Settings.
        // Previously this was neither declared nor guarded, so setAlarmClock() threw an
        // uncaught SecurityException on Capacitor's background plugin thread — which crashes
        // the whole app process (not just this call) — the instant the first set's rest began.
        // Guarding it here means a user who hasn't granted the permission degrades gracefully
        // to the JS-only setInterval rest-timer fallback (see beginRest() in
        // athleticMetronome.html) instead of the app crashing outright.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
            Log.w("BeatStrideWakeLock", "SCHEDULE_EXACT_ALARM not granted — skipping native alarm, JS fallback will drive rest-end")
            call.resolve()
            return
        }

        try {
            am.setAlarmClock(AlarmManager.AlarmClockInfo(System.currentTimeMillis() + delayMs, showIntent), pi)
            Log.d("BeatStrideWakeLock", "Alarm scheduled: ${delayMs}ms")
        } catch (e: SecurityException) {
            // Belt-and-suspenders: covers the narrow race where permission is revoked
            // between the canScheduleExactAlarms() check above and this call.
            Log.w("BeatStrideWakeLock", "setAlarmClock denied at call time: ${e.message} — JS fallback will drive rest-end")
        }
        call.resolve()
    }

    @PluginMethod
    fun cancelScheduledRestEnd(call: PluginCall) {
        cancelPendingRest()
        call.resolve()
    }

    private fun cancelPendingRest() {
        pendingRestRunnable?.let { restHandler.removeCallbacks(it) }
        pendingRestRunnable = null
        pendingRestIntent?.let {
            (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(it)
        }
        pendingRestIntent = null
    }
}
