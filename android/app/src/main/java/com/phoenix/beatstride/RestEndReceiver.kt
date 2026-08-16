package com.phoenix.beatstride

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

class RestEndReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val setIdx = intent.getIntExtra("setIdx", -1)
        val instanceState = if (BeatStrideWakeLockPlugin.instance != null) "OK" else "NULL"
        Log.d("RestEndReceiver", "onReceive: setIdx=$setIdx instance=$instanceState")

        // ── DIAGNOSTIC NOTIFICATION ────────────────────────────────────────
        // This fires purely from native code — no WebView, no JS involved.
        // If this notification appears at 2+ min: receiver fires, WebView is
        // the problem. If it never appears: Vivo is blocking the broadcast.
        showDiagNotification(context, setIdx, instanceState)

        if (setIdx < 0) return

        val plugin = BeatStrideWakeLockPlugin.instance ?: run {
            Log.w("RestEndReceiver", "instance null — cannot reach WebView")
            return
        }

        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val execWakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "BeatStride::RestEndExecution"
        )
        execWakeLock.acquire(20_000L)

        val js = "window._nativeRestEnd && window._nativeRestEnd($setIdx)"

        // Run on UI thread; give the WebView 300 ms after onResume() before
        // evaluating JS so it has time to fully un-pause.
        Handler(Looper.getMainLooper()).post {
            try {
                plugin.bridge.webView.onResume()
                plugin.bridge.webView.resumeTimers()

                Handler(Looper.getMainLooper()).postDelayed({
                    try {
                        // Primary: evaluateJavascript (async, callback confirms execution)
                        plugin.bridge.webView.evaluateJavascript(js) { result ->
                            Log.d("RestEndReceiver", "evaluateJavascript result=$result")
                            if (execWakeLock.isHeld) execWakeLock.release()
                        }
                        // Fallback: loadUrl (synchronous fire-and-forget, different code path)
                        plugin.bridge.webView.loadUrl("javascript:$js")
                    } catch (e: Exception) {
                        Log.e("RestEndReceiver", "JS eval failed: ${e.message}")
                        if (execWakeLock.isHeld) execWakeLock.release()
                    }
                }, 300)
            } catch (e: Exception) {
                Log.e("RestEndReceiver", "onResume failed: ${e.message}")
                if (execWakeLock.isHeld) execWakeLock.release()
            }
        }
    }

    private fun showDiagNotification(context: Context, setIdx: Int, instanceState: String) {
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm.createNotificationChannel(
                    NotificationChannel("bs_diag", "BeatStride Diagnostic", NotificationManager.IMPORTANCE_HIGH)
                )
            }
            val n = NotificationCompat.Builder(context, "bs_diag")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("BeatStride: rest alarm fired")
                .setContentText("set=$setIdx plugin=$instanceState")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .build()
            nm.notify(8888, n)
        } catch (e: Exception) {
            Log.e("RestEndReceiver", "diag notification failed: ${e.message}")
        }
    }
}
