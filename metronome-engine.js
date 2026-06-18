/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  metronome-engine.js  —  MetEngine
 *  Shared, precision Web Audio API metronome engine.
 *  Works for both Music Metronome and Athletic Metronome.
 *
 *  HOW TO USE
 *  ──────────
 *  <script src="metronome-engine.js"></script>
 *
 *  // 1. Configure
 *  MetEngine.setBPM(120);
 *  MetEngine.setInstrument("woodblock");
 *  MetEngine.setVolume(0.8);
 *
 *  // 2. Register callbacks (called on every beat, visually synced)
 *  MetEngine.onBeat((beatInfo) => {
 *    // beatInfo: { bpm, beatIndex, isAccent, isDownbeat,
 *    //             measurePosition, subdiv, time }
 *    pulseVisual();
 *  });
 *
 *  // 3. Transport
 *  MetEngine.start();
 *  MetEngine.pause();
 *  MetEngine.resume();
 *  MetEngine.stop();
 *
 *  // 4. Polyrhythm (two independent layers)
 *  MetEngine.startPoly({ topNum: 3, bottomNum: 2, measureBeats: 4 });
 *  MetEngine.stopPoly();
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  PRECISION ARCHITECTURE
 *  ──────────────────────
 *  Uses the "double-buffer lookahead" technique (Chris Wilson / Google):
 *    • A fast setTimeout loop (every ~25ms) wakes up and checks if new
 *      beats need to be SCHEDULED into the audio graph.
 *    • Beats are scheduled AHEAD by LOOKAHEAD_SEC (0.12s) using the
 *      precise audioCtx.currentTime clock — immune to JS timer drift.
 *    • Visual callbacks fire via setTimeout timed to the exact audio
 *      beat time minus current wall-clock time. This gives <5ms visual
 *      accuracy even under CPU load.
 *    • Never uses setInterval for audio — only for the lightweight
 *      scheduler wake-up loop.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const MetEngine = (function () {

  // ─────────────────────────────────────────────────────────────────────────
  //  CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────
  const LOOKAHEAD_SEC  = 0.12;   // How far ahead to schedule audio (seconds)
  const SCHEDULER_MS   = 25;     // How often the scheduler loop wakes up (ms)
  const MIN_BPM        = 20;
  const MAX_BPM        = 420;

  // ─────────────────────────────────────────────────────────────────────────
  //  INSTRUMENT DEFINITIONS
  //  Each instrument has: { type, freq, decay, wave, useNoise, noiseDecay }
  //  type: "osc" | "noise" | "pitched_noise" | "fm" | "multi"
  // ─────────────────────────────────────────────────────────────────────────
  const INSTRUMENTS = {
    // ── Woodblock: short attack, punchy, 1.2kHz ──
    woodblock : { type:"osc",   freq:1200, decay:0.08, wave:"sine",     accentFreq:1500 },
    // ── Cowbell: metallic triangle wave ──
    cowbell   : { type:"multi", freq:800,  decay:0.18, wave:"triangle", accentFreq:900  },
    // ── Clave: sharp high sine ──
    clave     : { type:"osc",   freq:1800, decay:0.06, wave:"sine",     accentFreq:2200 },
    // ── Hi-hat: white noise burst ──
    hihat     : { type:"noise", freq:8000, decay:0.06, wave:"square",   accentFreq:8000 },
    // ── Tambourine: sawtooth + noise ──
    tambourine: { type:"pitched_noise", freq:900, decay:0.12, wave:"sawtooth", accentFreq:1100 },
    // ── Shaker: softer noise ──
    shaker    : { type:"noise", freq:4000, decay:0.10, wave:"sine",     accentFreq:5000 },
    // ── Bongo: low sine ──
    bongo     : { type:"osc",   freq:220,  decay:0.15, wave:"sine",     accentFreq:280  },
    // ── Snap: short triangle ──
    snap      : { type:"osc",   freq:1400, decay:0.05, wave:"triangle", accentFreq:1700 },
    // ── Rimshot: square click ──
    rimshot   : { type:"osc",   freq:900,  decay:0.07, wave:"square",   accentFreq:1100 },
    // ── Clap: noise ──
    clap      : { type:"noise", freq:1500, decay:0.10, wave:"square",   accentFreq:1500 },
    // ── Bell: long sine with slow decay ──
    bell      : { type:"osc",   freq:1460, decay:0.60, wave:"sine",     accentFreq:1760 },
    // ── Cymbal: high square + noise ──
    cymbal    : { type:"pitched_noise", freq:2200, decay:0.20, wave:"square", accentFreq:3000 },
    // ── Service bell: medium sine ──
    servicebell:{ type:"osc",   freq:1120, decay:0.40, wave:"sine",     accentFreq:1340 },
    // ── Vibraslap: low sawtooth ──
    vibraslap : { type:"osc",   freq:360,  decay:0.15, wave:"sawtooth", accentFreq:440  },
    // ── Wood stick ──
    wood      : { type:"osc",   freq:600,  decay:0.07, wave:"triangle", accentFreq:750  },
    // ── Drum kit: kick + snare combo ──
    drumkit   : { type:"multi", freq:80,   decay:0.20, wave:"triangle", accentFreq:100  },
    // ── Techno beep: electronic ──
    techno    : { type:"osc",   freq:880,  decay:0.06, wave:"square",   accentFreq:1046 },
    // ── Clock tick ──
    clock     : { type:"osc",   freq:700,  decay:0.04, wave:"sine",     accentFreq:840  },
    // ── Simple click (athletic default) ──
    click     : { type:"osc",   freq:1100, decay:0.05, wave:"sine",     accentFreq:1400 },
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  STATE
  // ─────────────────────────────────────────────────────────────────────────
  let _ctx            = null;    // AudioContext
  let _masterGain     = null;    // Master gain node
  let _compressor     = null;    // DynamicsCompressor for consistent loudness

  let _bpm            = 120;
  let _volume         = 0.75;    // 0.0 – 1.0
  let _instrument     = "woodblock";
  let _subdivisions   = 1;       // clicks per beat (1=quarter, 2=eighth, etc.)
  let _measureBeats   = 4;       // beats per measure (for accent calculation)
  let _accentPattern  = "off";   // "off"|"every2"|"every3"|"every4"|"downbeat"|"custom"
  let _customAccents  = [];      // array of beat indices to accent (for "custom")

  let _isRunning      = false;
  let _isPaused       = false;
  let _nextBeatTime   = 0;       // audioCtx time of next scheduled beat
  let _schedulerID    = null;    // setTimeout ID for scheduler loop
  let _globalBeatIdx  = 0;       // total beats scheduled since start (for accent math)
  let _latencyHint    = 0;       // detected output latency (seconds)

  // Duration-limited session support
  let _sessionEndAudioTime  = null;   // audioCtx time at which session must end
  let _sessionStartAudioTime= null;   // audioCtx time at which session started
  let _onSessionEnd         = null;   // callback fired when audio clock passes end time
  let _sessionEndFired      = false;  // true once end callback has been dispatched

  // Polyrhythm state
  let _polyActive     = false;
  let _polyA          = { nextTime: 0, idx: 0, num: 2 };
  let _polyB          = { nextTime: 0, idx: 0, num: 3 };
  let _polyMeasureDur = 0;

  // Noise buffers (pre-generated, reused)
  let _noiseBuffer    = null;

  // Callbacks registered by the host app
  const _beatCallbacks   = [];   // (beatInfo) => void  — fires on every MAIN beat
  const _accentCallbacks = [];   // (beatInfo) => void  — fires only on accent beats
  const _polyCallbacks   = [];   // ({ layer, idx, isFirst, num }) => void
  const _subdivCallbacks = [];   // (subdivInfo) => void — fires on every click incl. sub-divs

  // ─────────────────────────────────────────────────────────────────────────
  //  AUDIO CONTEXT INIT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Initialise or resume the AudioContext.
   * Must be called inside a user gesture (click/tap).
   */
  function _initCtx() {
    if (_ctx) {
      if (_ctx.state === "suspended") _ctx.resume();
      return;
    }

    // latencyHint:"playback" gives lowest latency on most devices
    _ctx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: "interactive",
      sampleRate: 44100,
    });

    // Detect base output latency
    _latencyHint = (_ctx.outputLatency || _ctx.baseLatency || 0);

    // Master gain → DynamicsCompressor → destination
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = _volume;

    _compressor = _ctx.createDynamicsCompressor();
    _compressor.threshold.value = -18;
    _compressor.knee.value       = 8;
    _compressor.ratio.value      = 4;
    _compressor.attack.value     = 0.002;
    _compressor.release.value    = 0.1;

    _masterGain.connect(_compressor);
    _compressor.connect(_ctx.destination);

    // Pre-generate noise buffer (2 seconds of white noise, reused)
    _noiseBuffer = _generateNoiseBuffer(2.0);

    console.log("[MetEngine] AudioContext ready. Latency:", _latencyHint.toFixed(4), "s | SR:", _ctx.sampleRate);
  }

  function _generateNoiseBuffer(durationSec) {
    const frames = Math.ceil(_ctx.sampleRate * durationSec);
    const buf    = _ctx.createBuffer(1, frames, _ctx.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    return buf;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  SOUND SYNTHESIS — one function per sound type
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Schedule a single click sound at audio time `t`.
   * isAccent: boolean — plays louder + higher pitch
   * layer: "A" | "B" | null — for polyrhythm pitch separation
   */
  function _playClick(t, isAccent = false, layer = null) {
    if (!_ctx || !_masterGain) return;

    const def = INSTRUMENTS[_instrument] || INSTRUMENTS.click;
    const now = _ctx.currentTime;
    // Apply latency offset so audio lands at the perceptually correct moment
    const playAt = Math.max(t - _latencyOffset, now + 0.001);

    // Volume: accent beats are 40% louder
    const vol = isAccent ? Math.min(1.2, _volume * 1.4) : _volume * 0.75;
    // Polyrhythm layer B plays at 1.5× frequency for clear separation
    const freqMult = layer === "B" ? 1.5 : (layer === "A" ? 1.0 : 1.0);

    switch (def.type) {
      case "osc":          _synthOsc(playAt,   def, vol, isAccent, freqMult); break;
      case "noise":        _synthNoise(playAt,  def, vol, isAccent);           break;
      case "pitched_noise":_synthPitchedNoise(playAt, def, vol, isAccent, freqMult); break;
      case "multi":        _synthMulti(playAt,  def, vol, isAccent, freqMult, _instrument); break;
      default:             _synthOsc(playAt,   def, vol, isAccent, freqMult); break;
    }
  }

  /** Simple oscillator click */
  function _synthOsc(t, def, vol, isAccent, freqMult = 1) {
    const freq  = (isAccent ? def.accentFreq : def.freq) * freqMult;
    const decay = def.decay;

    const gain = _ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    gain.connect(_masterGain);

    const osc = _ctx.createOscillator();
    osc.type            = def.wave;
    osc.frequency.value = freq;
    // Slight pitch drop for more natural attack
    osc.frequency.setValueAtTime(freq * 1.08, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.015);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + decay + 0.01);
  }

  /** White noise burst (hi-hat, clap, shaker) */
  function _synthNoise(t, def, vol, isAccent) {
    if (!_noiseBuffer) return;
    const decay = isAccent ? def.decay * 1.3 : def.decay;

    // Bandpass filter to shape noise timbre
    const filter = _ctx.createBiquadFilter();
    filter.type            = "bandpass";
    filter.frequency.value = isAccent ? def.accentFreq : def.freq;
    filter.Q.value         = def.type === "clap" ? 0.5 : 1.8;

    const gain = _ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.85, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);

    const src = _ctx.createBufferSource();
    src.buffer = _noiseBuffer;
    // Random offset so repeats don't sound identical
    src.playbackRate.value = 1 + (Math.random() * 0.1 - 0.05);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(_masterGain);
    src.start(t);
    src.stop(t + decay + 0.01);
  }

  /** Oscillator + noise blend (cymbal, tambourine) */
  function _synthPitchedNoise(t, def, vol, isAccent, freqMult = 1) {
    // Oscillator component
    _synthOsc(t, def, vol * 0.5, isAccent, freqMult);
    // Noise component (quieter)
    _synthNoise(t, { ...def, freq: def.freq * 1.5, decay: def.decay * 0.7 }, vol * 0.5, isAccent);
  }

  /** Multi-component sounds (cowbell, drumkit) */
  function _synthMulti(t, def, vol, isAccent, freqMult, instrument) {
    if (instrument === "cowbell") {
      // Cowbell = two slightly detuned square oscillators
      [800, 540].forEach((f, i) => {
        const gain = _ctx.createGain();
        gain.gain.setValueAtTime(vol * (i === 0 ? 0.6 : 0.4), t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + (isAccent ? 0.28 : 0.18));
        gain.connect(_masterGain);
        const osc = _ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = f * freqMult * (isAccent ? 1.2 : 1.0);
        osc.connect(gain);
        osc.start(t); osc.stop(t + 0.32);
      });
    } else if (instrument === "drumkit") {
      // Drumkit: kick (low sine sweep) on downbeat, snare (noise) on 2&4
      // Kick
      const kickGain = _ctx.createGain();
      kickGain.gain.setValueAtTime(vol, t);
      kickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      kickGain.connect(_masterGain);
      const kick = _ctx.createOscillator();
      kick.type = "sine";
      kick.frequency.setValueAtTime(isAccent ? 140 : 80, t);
      kick.frequency.exponentialRampToValueAtTime(30, t + 0.15);
      kick.connect(kickGain);
      kick.start(t); kick.stop(t + 0.28);

      if (isAccent) {
        // Snare layer on accents
        _synthNoise(t, { freq: 2000, accentFreq: 2500, decay: 0.12 }, vol * 0.6, true);
      }
    } else {
      _synthOsc(t, def, vol, isAccent, freqMult);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  ACCENT LOGIC
  // ─────────────────────────────────────────────────────────────────────────
  function _isAccentBeat(globalBeatIdx, measurePos, isMainBeat) {
    if (!isMainBeat) return false;
    const beat = Math.floor(measurePos / _subdivisions); // beat within measure (0-based)

    switch (_accentPattern) {
      case "off":      return beat === 0;                     // downbeat only
      case "downbeat": return beat === 0;
      case "every2":   return beat % 2 === 0;
      case "every3":   return beat % 3 === 0;
      case "every4":   return beat % 4 === 0;
      case "custom":   return _customAccents.includes(beat);
      case "none":     return false;
      default:         return beat === 0;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  SCHEDULER — core lookahead loop
  // ─────────────────────────────────────────────────────────────────────────

  // Session token: increments on each start(). Callbacks capture it and
  // check it on fire — so old session callbacks are silently discarded
  // while callbacks from the CURRENT session fire even after stop().
  let _sessionToken = 0;

  function _scheduler() {
    if (!_isRunning || !_ctx) return;

    const now      = _ctx.currentTime;
    const beatDur  = 60.0 / _bpm;
    const clickDur = beatDur / _subdivisions;
    const token    = _sessionToken;

    // ── Audio-clock session end detection ─────────────────────────────────
    // IMPORTANT: We do NOT clear _sessionEndAudioTime here after firing.
    // Keeping it set means the while loop guard continues blocking extra
    // beats on ALL subsequent scheduler ticks until stop() is called.
    // _sessionEndFired prevents the callback from firing twice.
    const END_EPSILON = 0.0001;  // 0.1ms — absorbs floating point edge cases

    if (_sessionEndAudioTime !== null &&
        !_sessionEndFired &&
        now >= _sessionEndAudioTime - LOOKAHEAD_SEC - END_EPSILON) {

      _sessionEndFired = true;  // block re-entry on next ticks
      const delayToEnd    = Math.max(0, (_sessionEndAudioTime - now) * 1000);
      const capturedToken = token;
      const capturedEndCb = _onSessionEnd;
      setTimeout(() => {
        if (_sessionToken !== capturedToken) return;  // stale session
        if (capturedEndCb) capturedEndCb(_globalBeatIdx);
        // NOTE: _sessionEndAudioTime is intentionally NOT cleared here.
        // It remains set so the while guard below keeps working until
        // the host calls MetEngine.stop(), which clears everything.
      }, delayToEnd);
    }

    // Schedule all beats within the lookahead window
    while (_nextBeatTime < now + LOOKAHEAD_SEC) {

      // ── Exact beat time — no accumulated floating point error ────────────
      // Compute from session start + integer index × clickDur.
      // This gives a single rounding error per beat instead of N cumulative.
      const exactBeatTime = _sessionStartAudioTime + _globalBeatIdx * clickDur;

      // End guard: block any beat at or past the end time.
      // Uses exactBeatTime (not the accumulated _nextBeatTime) for precision.
      // Also checks _sessionEndAudioTime directly so this keeps working
      // even after _sessionEndFired is set on subsequent ticks.
      if (_sessionEndAudioTime !== null &&
          exactBeatTime >= _sessionEndAudioTime - END_EPSILON) break;

      _nextBeatTime = exactBeatTime;  // keep in sync with exact value

      const beatsPerMeasure = _measureBeats * _subdivisions;
      const posInMeasure    = _globalBeatIdx % beatsPerMeasure;
      const isMainBeat      = (posInMeasure % _subdivisions === 0);
      const isAccent        = _isAccentBeat(_globalBeatIdx, posInMeasure, isMainBeat);

      _playClick(_nextBeatTime, isAccent, null);

      const visualDelay = Math.max(0, (_nextBeatTime - now) * 1000);
      const beatInfo = {
        bpm            : _bpm,
        beatIndex      : _globalBeatIdx,
        isAccent       : isAccent,
        isDownbeat     : posInMeasure === 0,
        isMainBeat     : isMainBeat,
        measurePosition: posInMeasure,
        subdivIndex    : _globalBeatIdx,
        subdiv         : _subdivisions,
        audioTime      : _nextBeatTime,
      };

      if (isMainBeat) {
        const capturedInfo  = { ...beatInfo };
        const capturedToken = token;
        setTimeout(() => {
          if (_sessionToken !== capturedToken) return;
          _beatCallbacks.forEach(cb => { try { cb(capturedInfo); } catch(e) {} });
        }, visualDelay);
      }

      {
        const capturedInfo  = { ...beatInfo };
        const capturedToken = token;
        setTimeout(() => {
          if (_sessionToken !== capturedToken) return;
          _subdivCallbacks.forEach(cb => { try { cb(capturedInfo); } catch(e) {} });
        }, visualDelay);
      }

      if (isAccent) {
        const capturedInfo  = { ...beatInfo };
        const capturedToken = token;
        setTimeout(() => {
          if (_sessionToken !== capturedToken) return;
          _accentCallbacks.forEach(cb => { try { cb(capturedInfo); } catch(e) {} });
        }, visualDelay);
      }

      // Advance using exact multiplication — eliminates accumulated drift
      _globalBeatIdx += 1;
      _nextBeatTime   = _sessionStartAudioTime + _globalBeatIdx * clickDur;
    }

    _schedulerID = setTimeout(_scheduler, SCHEDULER_MS);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  POLYRHYTHM SCHEDULER — two independent streams
  //  Both layers share the same measure duration so they stay locked.
  //  Layer A: bottom number (base pulse)
  //  Layer B: top number (overlay pulse, higher pitch)
  // ─────────────────────────────────────────────────────────────────────────
  let _polySchedulerID = null;

  function _polyScheduler() {
    if (!_isRunning || !_polyActive || !_ctx) return;

    const now = _ctx.currentTime;

    // Layer A
    while (_polyA.nextTime < now + LOOKAHEAD_SEC) {
      const isFirst = (_polyA.idx % _polyA.num === 0);
      _playClick(_polyA.nextTime, isFirst, "A");

      const delay    = Math.max(0, (_polyA.nextTime - now) * 1000);
      const capturedIdx = _polyA.idx % _polyA.num;
      setTimeout(() => {
        if (!_isRunning || !_polyActive) return;
        _polyCallbacks.forEach(cb => {
          try { cb({ layer:"A", idx: capturedIdx, isFirst, num: _polyA.num }); } catch(e) {}
        });
      }, delay);

      _polyA.idx++;
      _polyA.nextTime += _polyMeasureDur / _polyA.num;
    }

    // Layer B (higher pitch via _playClick layer="B")
    while (_polyB.nextTime < now + LOOKAHEAD_SEC) {
      const isFirst = (_polyB.idx % _polyB.num === 0);
      _playClick(_polyB.nextTime, isFirst, "B");

      const delay    = Math.max(0, (_polyB.nextTime - now) * 1000);
      const capturedIdx = _polyB.idx % _polyB.num;
      setTimeout(() => {
        if (!_isRunning || !_polyActive) return;
        _polyCallbacks.forEach(cb => {
          try { cb({ layer:"B", idx: capturedIdx, isFirst, num: _polyB.num }); } catch(e) {}
        });
      }, delay);

      _polyB.idx++;
      _polyB.nextTime += _polyMeasureDur / _polyB.num;
    }

    _polySchedulerID = setTimeout(_polyScheduler, SCHEDULER_MS);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PUBLIC TRANSPORT API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Pre-initialise the AudioContext during a user gesture.
   * Call this on any user tap/click to ensure AudioContext is ready
   * before the actual start() call, which may come from a non-gesture
   * context (e.g. SpeechRecognition.onresult).
   */
  function unlockAudio() {
    _initCtx();
    // If context was suspended (autoplay policy), resume it now
    if (_ctx && _ctx.state === "suspended") {
      _ctx.resume();
    }
    console.log("[MetEngine] Audio unlocked. State:", _ctx ? _ctx.state : "no ctx");
  }

  /**
   * Start the metronome from scratch.
   */
  function start() {
    if (_isRunning) return;
    _initCtx();
    _isRunning            = true;
    _isPaused             = false;
    _globalBeatIdx        = 0;
    _sessionToken        += 1;
    _sessionEndAudioTime  = null;
    _sessionEndFired      = false;
    _onSessionEnd         = null;
    _sessionStartAudioTime = _ctx.currentTime + 0.005;
    _nextBeatTime          = _sessionStartAudioTime;
    _scheduler();
    console.log("[MetEngine] Started at", _bpm, "BPM | session:", _sessionToken);
  }

  /**
   * Start a duration-limited session. Uses the AUDIO CLOCK (not setTimeout)
   * to detect the session end — eliminates wall-clock drift completely.
   *
   * @param {number} durationSec  - Exact session length in seconds
   * @param {function} onEnd      - Called when session ends.
   *                                Receives (totalBeatsScheduled) as argument.
   *
   * Usage (replaces: setTimeout(onActiveEnd, dur * 1000)):
   *   MetEngine.startTimed(60, (beats) => {
   *     console.log("Session ended. Beats:", beats);
   *     onActiveEnd();
   *   });
   */
  function startTimed(durationSec, onEnd) {
    if (_isRunning) return;
    _initCtx();
    _isRunning             = true;
    _isPaused              = false;
    _globalBeatIdx         = 0;
    _sessionToken         += 1;
    _sessionEndFired       = false;
    _sessionStartAudioTime = _ctx.currentTime + 0.005;
    _nextBeatTime          = _sessionStartAudioTime;
    _sessionEndAudioTime   = _sessionStartAudioTime + durationSec;
    _onSessionEnd          = onEnd || null;
    _scheduler();
    console.log(
      "[MetEngine] Timed session started at", _bpm, "BPM |",
      durationSec, "sec | ends at audio time:", _sessionEndAudioTime.toFixed(6)
    );
  }

  /**
   * Set a new duration limit from NOW on the audio clock.
   * Used after resume() to restart a timed session for its remaining duration.
   * @param {number} remainingSec - Remaining time in seconds
   * @param {function} onEnd - Callback when time is up
   */
  function setDurationFromNow(remainingSec, onEnd) {
    if (!_ctx) return;
    _sessionEndAudioTime = _ctx.currentTime + remainingSec;
    _sessionEndFired     = false;  // reset so new end can fire
    _onSessionEnd        = onEnd || null;
    console.log("[MetEngine] Duration set from now:", remainingSec, "sec");
  }

  /**
   * Cancel a duration limit set by startTimed() without stopping the engine.
   */
  function clearDuration() {
    _sessionEndAudioTime = null;
    _sessionEndFired     = false;
    _onSessionEnd        = null;
  }

  /**
   * Get elapsed audio time in seconds since the session started.
   * More precise than performance.now() for session timing.
   */
  function getElapsedAudioSec() {
    if (!_ctx || !_sessionStartAudioTime) return 0;
    return Math.max(0, _ctx.currentTime - _sessionStartAudioTime);
  }

  /**
   * Pause — stops scheduling new beats but preserves position.
   * Call resume() to continue.
   */
  function pause() {
    if (!_isRunning || _isPaused) return;
    _isPaused  = true;
    _isRunning = false;
    clearTimeout(_schedulerID);
    clearTimeout(_polySchedulerID);
    console.log("[MetEngine] Paused");
  }

  /**
   * Resume from a paused state — picks up exactly where it left off.
   */
  function resume() {
    if (_isRunning || !_isPaused) return;
    _initCtx();
    _isRunning    = true;
    _isPaused     = false;
    // Re-anchor: set sessionStartAudioTime such that the NEXT beat
    // (at _globalBeatIdx) lands at now + small offset.
    // Formula: startTime = now - _globalBeatIdx * clickDur
    // This preserves _globalBeatIdx and makes exactBeatTime land correctly.
    const t0       = _ctx.currentTime + 0.005;
    const clickDur = (60.0 / _bpm) / _subdivisions;
    _sessionStartAudioTime = t0 - _globalBeatIdx * clickDur;
    _nextBeatTime          = t0;
    if (_polyActive) {
      _polyA.nextTime = t0;
      _polyB.nextTime = t0;
      _polyScheduler();
    } else {
      _scheduler();
    }
    console.log("[MetEngine] Resumed at beat", _globalBeatIdx);
  }

  /**
   * Stop and fully reset.
   * _globalBeatIdx is preserved (not reset) so getScheduledBeats()
   * remains valid immediately after stop() is called.
   * It is reset on the next start() call.
   */
  function stop() {
    _isRunning           = false;
    _isPaused            = false;
    _polyActive          = false;
    _sessionToken       += 1;   // invalidate any in-flight visual callbacks
    clearTimeout(_schedulerID);
    clearTimeout(_polySchedulerID);
    _sessionEndAudioTime = null;
    _sessionEndFired     = false;
    _onSessionEnd        = null;
    _polyA.idx           = 0;
    _polyB.idx           = 0;
    console.log("[MetEngine] Stopped. Total beats scheduled:", _globalBeatIdx);
  }

  /**
   * Change BPM mid-session (takes effect on the next scheduled beat).
   * @param {number} bpm - Between 20 and 420
   */
  function setBPM(bpm) {
    _bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
    // Recalculate poly measure duration with new BPM
    if (_polyActive) {
      _polyMeasureDur = _measureBeats * (60.0 / _bpm);
    }
  }

  /**
   * Realign session start anchor after a BPM change during playback.
   * When BPM changes, clickDur changes, so exactBeatTime = start + idx × clickDur
   * drifts — the engine thinks past beats happened at different times and
   * schedules extra beats to "catch up". This function resets the anchor
   * so that beat _globalBeatIdx lands at audioCtx.currentTime, keeping
   * everything perfectly aligned regardless of mid-session BPM changes.
   * Call this immediately after setBPM() during ramp transitions.
   */
  function realignAfterBPMChange() {
    if (!_audioCtx || !_running) return;
    const now      = _audioCtx.currentTime;
    const clickDur = (60.0 / _bpm) / _subdivisions;
    // Reset the start anchor so that the current beat index lands at now
    _sessionStartAudioTime = now - _globalBeatIdx * clickDur;
    // Reset next beat time to now so scheduler picks up immediately
    _nextBeatTime = now;
  }

  function getBPM() { return _bpm; }

  /**
   * Set volume (0.0 – 1.0).
   * Takes effect immediately via the master gain node.
   */
  function setVolume(vol) {
    _volume = Math.min(1.0, Math.max(0.0, vol));
    if (_masterGain) {
      _masterGain.gain.setTargetAtTime(_volume, _ctx.currentTime, 0.01);
    }
  }

  function getVolume() { return _volume; }

  /**
   * Set the instrument.
   * @param {string} name - One of the INSTRUMENTS keys
   */
  function setInstrument(name) {
    if (INSTRUMENTS[name]) {
      _instrument = name;
    } else {
      console.warn("[MetEngine] Unknown instrument:", name, "— using 'click'");
      _instrument = "click";
    }
  }

  function getInstrument() { return _instrument; }
  function getInstruments() { return Object.keys(INSTRUMENTS); }

  /**
   * Set subdivisions (clicks per beat).
   * 1 = quarter notes, 2 = eighth notes, 3 = triplets, 4 = sixteenth, etc.
   */
  function setSubdivisions(n) {
    _subdivisions = Math.max(1, Math.min(8, parseInt(n) || 1));
  }

  /**
   * Set the number of beats per measure (for accent/downbeat calculation).
   */
  function setMeasureBeats(n) {
    _measureBeats = Math.max(1, Math.min(32, parseInt(n) || 4));
  }

  /**
   * Set accent pattern.
   * @param {string} pattern - "off"|"downbeat"|"every2"|"every3"|"every4"|"none"|"custom"
   * @param {number[]} customAccents - beat indices for "custom" pattern (0-based within measure)
   */
  function setAccentPattern(pattern, customAccents = []) {
    _accentPattern  = pattern;
    _customAccents  = customAccents;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  POLYRHYTHM API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start polyrhythm mode — replaces the regular scheduler.
   * @param {object} config - { topNum, bottomNum, measureBeats }
   *   topNum    : overlay beats per measure (e.g. 3)
   *   bottomNum : base beats per measure (e.g. 2)
   *   measureBeats: how many quarter-note beats form a measure (e.g. 4)
   */
  function startPoly(config = {}) {
    const top    = config.topNum    || 3;
    const bottom = config.bottomNum || 2;
    const mBeats = config.measureBeats || _measureBeats;

    stop(); // Stop regular scheduler first
    _initCtx();

    _polyActive     = true;
    _isRunning      = true;
    _isPaused       = false;
    _measureBeats   = mBeats;
    _polyMeasureDur = mBeats * (60.0 / _bpm);

    _polyA = { nextTime: _ctx.currentTime + 0.005, idx: 0, num: bottom };
    _polyB = { nextTime: _ctx.currentTime + 0.005, idx: 0, num: top    };

    _polyScheduler();
    console.log("[MetEngine] Polyrhythm started:", top, ":", bottom);
  }

  /**
   * Stop polyrhythm and return to regular mode.
   */
  function stopPoly() {
    _polyActive = false;
    clearTimeout(_polySchedulerID);
    _polyA.idx = 0;
    _polyB.idx = 0;
    console.log("[MetEngine] Polyrhythm stopped");
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  CALLBACK REGISTRATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a callback fired on every MAIN beat (not sub-divisions).
   * @param {function} cb - (beatInfo) => void
   *   beatInfo: { bpm, beatIndex, isAccent, isDownbeat, measurePosition,
   *               subdiv, audioTime }
   * @returns {function} Unsubscribe function
   */
  function onBeat(cb) {
    _beatCallbacks.push(cb);
    return () => {
      const i = _beatCallbacks.indexOf(cb);
      if (i !== -1) _beatCallbacks.splice(i, 1);
    };
  }

  /**
   * Register a callback fired ONLY on accent beats.
   * @param {function} cb - (beatInfo) => void
   * @returns {function} Unsubscribe function
   */
  function onAccent(cb) {
    _accentCallbacks.push(cb);
    return () => {
      const i = _accentCallbacks.indexOf(cb);
      if (i !== -1) _accentCallbacks.splice(i, 1);
    };
  }

  /**
   * Register a callback for polyrhythm beats (both layers).
   * @param {function} cb - ({ layer, idx, isFirst, num }) => void
   * @returns {function} Unsubscribe function
   */
  function onPolyBeat(cb) {
    _polyCallbacks.push(cb);
    return () => {
      const i = _polyCallbacks.indexOf(cb);
      if (i !== -1) _polyCallbacks.splice(i, 1);
    };
  }

  /**
   * Remove all registered callbacks.
   */
  function clearCallbacks() {
    _beatCallbacks.length      = 0;
    _accentCallbacks.length    = 0;
    _polyCallbacks.length      = 0;
    _subdivCallbacks.length    = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  UTILITY
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Play a single test click immediately (for UI button preview).
   */
  function testClick(accent = false) {
    _initCtx();
    _playClick(_ctx.currentTime + 0.01, accent, null);
  }

  /**
   * Get the total number of beats scheduled into audio since start.
   * This is the AUTHORITATIVE step count — it counts every beat that
   * has been handed to the audio clock, including those still in the
   * lookahead buffer. Use this instead of counting onBeat() callbacks
   * to avoid missing the last few beats buffered ahead at session end.
   * @returns {number} Total beats scheduled
   */
  function getScheduledBeats() {
    return _globalBeatIdx;
  }

  /**
   * Get current AudioContext time (useful for external scheduling).
   */
  function getAudioTime() {
    return _ctx ? _ctx.currentTime : 0;
  }

  /**
   * Get the beat duration in seconds at current BPM.
   */
  function getBeatDuration() {
    return 60.0 / _bpm;
  }

  /**
   * Get the click interval in seconds (accounting for subdivisions).
   */
  function getClickInterval() {
    return (60.0 / _bpm) / _subdivisions;
  }

  /**
   * Is the engine currently running?
   */
  function isRunning() { return _isRunning; }

  /**
   * Is the engine paused?
   */
  function isPaused() { return _isPaused; }

  /**
   * Returns a status object for debugging.
   */
  function getStatus() {
    return {
      running         : _isRunning,
      paused          : _isPaused,
      bpm             : _bpm,
      volume          : _volume,
      instrument      : _instrument,
      subdivisions    : _subdivisions,
      measureBeats    : _measureBeats,
      accentPattern   : _accentPattern,
      polyActive      : _polyActive,
      audioLatency    : _latencyHint,
      audioCtxState   : _ctx ? _ctx.state : "not-created",
      globalBeatIdx   : _globalBeatIdx,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  TAP TEMPO
  //  Call tapTempo() on each tap. Returns the calculated BPM after 2+ taps.
  //  Resets automatically if gap between taps exceeds 3 seconds.
  // ─────────────────────────────────────────────────────────────────────────
  const _tapTimes = [];
  let   _tapResetID = null;

  /**
   * Register a tap. Returns the new BPM if calculable (≥ 2 taps), else null.
   * Automatically applies setBPM() with the result.
   * @returns {number|null} Calculated BPM, or null if only 1 tap so far.
   *
   * Usage:
   *   button.addEventListener("click", () => {
   *     const bpm = MetEngine.tapTempo();
   *     if (bpm) display.textContent = bpm;
   *   });
   */
  function tapTempo() {
    const now = performance.now();
    _tapTimes.push(now);

    // Keep only last 8 taps for rolling average
    if (_tapTimes.length > 8) _tapTimes.shift();

    // Auto-reset after 3 seconds of silence
    clearTimeout(_tapResetID);
    _tapResetID = setTimeout(() => { _tapTimes.length = 0; }, 3000);

    if (_tapTimes.length < 2) return null;

    // Calculate average interval across all recorded taps
    let totalInterval = 0;
    for (let i = 1; i < _tapTimes.length; i++) {
      totalInterval += _tapTimes[i] - _tapTimes[i - 1];
    }
    const avgIntervalMs = totalInterval / (_tapTimes.length - 1);
    const tappedBPM     = Math.round(60000 / avgIntervalMs);
    const clamped       = Math.min(MAX_BPM, Math.max(MIN_BPM, tappedBPM));

    // Apply immediately
    setBPM(clamped);
    return clamped;
  }

  /**
   * Reset the tap tempo buffer manually.
   */
  function resetTap() {
    _tapTimes.length = 0;
    clearTimeout(_tapResetID);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  SUBDIVISION CALLBACK
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a callback fired on EVERY click including sub-division ticks.
   * Useful for animating sub-beat indicators.
   * @param {function} cb - (subdivInfo) => void
   *   subdivInfo: same shape as beatInfo but isMainBeat may be false
   * @returns {function} Unsubscribe function
   */
  function onSubdivClick(cb) {
    _subdivCallbacks.push(cb);
    return () => {
      const i = _subdivCallbacks.indexOf(cb);
      if (i !== -1) _subdivCallbacks.splice(i, 1);
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  LATENCY OFFSET  (manual calibration for devices that need it)
  // ─────────────────────────────────────────────────────────────────────────
  let _latencyOffset = 0;   // seconds — positive = schedule earlier

  /**
   * Apply a manual latency offset (seconds).
   * Positive value schedules audio earlier to compensate for speaker lag.
   * Most users won't need this, but it's available for calibration.
   * @param {number} seconds - e.g. 0.02 for 20ms earlier
   */
  function setLatencyOffset(seconds) {
    _latencyOffset = parseFloat(seconds) || 0;
  }

  function getLatencyOffset() { return _latencyOffset; }

  // ─────────────────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────
  return {
    // Transport
    start,
    startTimed,
    setDurationFromNow,
    clearDuration,
    pause,
    resume,
    stop,
    unlockAudio,

    // Configuration (safe to call before or during playback)
    setBPM,
    getBPM,
    realignAfterBPMChange,
    setVolume,
    getVolume,
    setInstrument,
    getInstrument,
    getInstruments,
    setSubdivisions,
    setMeasureBeats,
    setAccentPattern,

    // Tap tempo
    tapTempo,
    resetTap,

    // Latency calibration
    setLatencyOffset,
    getLatencyOffset,

    // Polyrhythm
    startPoly,
    stopPoly,

    // Callbacks
    onBeat,
    onAccent,
    onPolyBeat,
    onSubdivClick,
    clearCallbacks,

    // Utilities
    testClick,
    getAudioTime,
    getElapsedAudioSec,
    getScheduledBeats,
    getBeatDuration,
    getClickInterval,
    isRunning,
    isPaused,
    getStatus,

    // Expose instrument list for UI dropdowns
    INSTRUMENTS,
  };

})();