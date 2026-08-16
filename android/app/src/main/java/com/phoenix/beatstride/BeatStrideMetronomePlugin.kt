package com.phoenix.beatstride

import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.speech.tts.TextToSpeech.OnInitListener
import java.util.Locale
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * BeatStrideMetronomePlugin
 *
 * Two responsibilities:
 * 1. Timing-only native metronome — fires precise beat callbacks to JS.
 *    Audio is handled by Web Audio engine in JS (all 18 instruments work).
 * 2. Native Text-to-Speech — reliable voice announcements on Android WebView.
 *
 * JS API:
 *   BeatStrideMetronome.start({ bpm, beatsPerMeasure, subdivision })
 *   BeatStrideMetronome.stop()
 *   BeatStrideMetronome.setMuted({ muted })
 *   BeatStrideMetronome.setBPM({ bpm })
 *   BeatStrideMetronome.speak({ text, interrupt })
 *   BeatStrideMetronome.addListener('beat', callback)
 */
@CapacitorPlugin(name = "BeatStrideMetronome")
class BeatStrideMetronomePlugin : Plugin(), OnInitListener {

    // ── Metronome State ───────────────────────────────────────────────────
    private var isRunning       = false
    private var isMuted         = false
    private var bpm             = 120.0
    private var beatsPerMeasure = 4
    private var subdivision     = 1
    private var globalBeatIndex = 0L

    // ── Scheduling ────────────────────────────────────────────────────────
    private var schedulerThread:  HandlerThread? = null
    private var schedulerHandler: Handler? = null
    private var nextBeatTimeMs    = 0L

    // ── Text-to-Speech ────────────────────────────────────────────────────
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private val ttsPendingQueue = mutableListOf<Pair<String, Boolean>>()

    // ══════════════════════════════════════════════════════════════════════
    //  LIFECYCLE
    // ══════════════════════════════════════════════════════════════════════

    override fun load() {
        // Initialise TTS engine
        tts = TextToSpeech(context, this)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val result = tts?.setLanguage(Locale.ENGLISH)
            ttsReady = result != TextToSpeech.LANG_MISSING_DATA
                    && result != TextToSpeech.LANG_NOT_SUPPORTED
            // Speak any queued messages
            if (ttsReady) {
                ttsPendingQueue.forEach { (text, interrupt) ->
                    speakInternal(text, interrupt)
                }
                ttsPendingQueue.clear()
            }
        }
        android.util.Log.d("BeatStride", "TTS init status=$status ready=$ttsReady")
    }

    // ══════════════════════════════════════════════════════════════════════
    //  TEXT-TO-SPEECH METHOD
    // ══════════════════════════════════════════════════════════════════════

    @PluginMethod
    fun speak(call: PluginCall) {
        val text      = call.getString("text", "") ?: ""
        val interrupt = call.getBoolean("interrupt", true) ?: true

        if (text.isEmpty()) { call.resolve(); return }

        if (ttsReady) {
            speakInternal(text, interrupt)
        } else {
            // Queue it — TTS might still be initialising
            ttsPendingQueue.add(Pair(text, interrupt))
        }
        call.resolve()
    }

    private fun speakInternal(text: String, interrupt: Boolean) {
        val queueMode = if (interrupt) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
        tts?.speak(text, queueMode, null, "beatstride_${System.currentTimeMillis()}")
    }

    // ══════════════════════════════════════════════════════════════════════
    //  METRONOME METHODS
    // ══════════════════════════════════════════════════════════════════════

    @PluginMethod
    fun start(call: PluginCall) {
        if (isRunning) stopInternal()

        bpm             = call.getDouble("bpm", 120.0)!!
        beatsPerMeasure = call.getInt("beatsPerMeasure", 4)!!
        subdivision     = call.getInt("subdivision", 1)!!
        isMuted         = false
        globalBeatIndex = 0L
        isRunning       = true

        startScheduler()
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        stopInternal()
        call.resolve()
    }

    @PluginMethod
    fun setMuted(call: PluginCall) {
        isMuted = call.getBoolean("muted", false)!!
        call.resolve()
    }

    @PluginMethod
    fun setBPM(call: PluginCall) {
        bpm = call.getDouble("bpm", 120.0)!!
        call.resolve()
    }

    @PluginMethod
    fun isRunning(call: PluginCall) {
        val ret = JSObject()
        ret.put("running", isRunning)
        call.resolve(ret)
    }

    // ══════════════════════════════════════════════════════════════════════
    //  SCHEDULER
    // ══════════════════════════════════════════════════════════════════════

    private fun startScheduler() {
        schedulerThread = HandlerThread("BeatStrideMetronome").apply {
            priority = Thread.MAX_PRIORITY
            start()
        }
        schedulerHandler = Handler(schedulerThread!!.looper)
        nextBeatTimeMs = SystemClock.elapsedRealtime()
        scheduleNextBeat()
    }

    private fun scheduleNextBeat() {
        if (!isRunning) return

        val now     = SystemClock.elapsedRealtime()
        val delayMs = (nextBeatTimeMs - now).coerceAtLeast(0L)

        schedulerHandler?.postDelayed({
            if (!isRunning) return@postDelayed

            val beatIdx  = globalBeatIndex
            val isAccent = (beatIdx % (beatsPerMeasure * subdivision)) == 0L

            // Fire JS callback — JS handles audio via Web Audio engine
            if (!isMuted) {
                val event = JSObject()
                event.put("beatIndex", beatIdx)
                event.put("isAccent",  isAccent)
                event.put("bpm",       bpm)
                event.put("timestamp", System.currentTimeMillis())
                notifyListeners("beat", event)
            }

            globalBeatIndex++

            val intervalMs = (60_000.0 / (bpm * subdivision)).toLong()
            nextBeatTimeMs += intervalMs

            scheduleNextBeat()
        }, delayMs)
    }

    private fun stopInternal() {
        isRunning = false
        schedulerHandler?.removeCallbacksAndMessages(null)
        schedulerThread?.quitSafely()
        schedulerThread  = null
        schedulerHandler = null
        globalBeatIndex  = 0L
    }

    override fun handleOnDestroy() {
        stopInternal()
        tts?.stop()
        tts?.shutdown()
        tts = null
        super.handleOnDestroy()
    }
}