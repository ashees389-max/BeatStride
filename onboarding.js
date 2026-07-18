/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  onboarding.js  —  MetOnboarding
 *  Interactive first-launch tour with spotlight + callout bubbles.
 *  Shows voice commands for each UI element the first time user opens the app.
 *
 *  USAGE — add to both metronome HTML files:
 *    <script src="onboarding.js"></script>
 *    then at end of script block: MetOnboarding.init("athletic");
 *                             or: MetOnboarding.init("music");
 * ═══════════════════════════════════════════════════════════════════════════
 */
const MetOnboarding = (function () {

  // ── Storage keys ────────────────────────────────────────────────────────
  const DONE_KEYS = {
    athletic : "met_tour_athletic_done",
    music    : "met_tour_music_done",
  };

  // ── Tour steps per app ───────────────────────────────────────────────────
  const STEPS = {
    athletic: [
      { targetId: "startBtn",     title: "Start your session",   body: "Tap or say",    cmd: '"Power Up"',       pos: "above" },
      { targetId: "bP5",          title: "Increase pace",        body: "Tap or say",    cmd: '"Faster"',         pos: "left"  },
      { targetId: "bM5",          title: "Decrease pace",        body: "Tap or say",    cmd: '"Pace Down"',      pos: "right" },
      { targetId: "skipBtn",      title: "Skip current set",     body: "Tap or say",    cmd: '"Skip Set"',       pos: "above" },
      { targetId: "summaryBtn",   title: "View session summary", body: "Tap or say",    cmd: '"Show Summary"',   pos: "above" },
      { targetId: "dashIconBtn",  title: "Your progress & data", body: "Tap or say",    cmd: '"Open Dashboard"', pos: "below" },
      { targetId: null,           title: "Voice Commands",       body: "Hold the 🎤 button below to speak a command. Say \"Hey Metro\" anytime in always-on mode.", cmd: null, pos: "center", isFinal: false },
      { targetId: "vcHelpBtn",    title: "See all commands",     body: "Tap this button anytime for the full command list.", cmd: null, pos: "left", isFinal: true },
    ],
    music: [
      { targetId: "playPauseBtn", title: "Start the metronome",  body: "Tap or say",    cmd: '"Start Metronome"',   pos: "above" },
      { targetId: "bpmPlus5",     title: "Increase BPM",         body: "Tap or say",    cmd: '"Faster"',            pos: "left"  },
      { targetId: "bpmMinus5",    title: "Decrease BPM",         body: "Tap or say",    cmd: '"Pace Down"',         pos: "right" },
      { targetId: "tapBtn",       title: "Tap tempo",            body: "Tap to the beat or say", cmd: '"Tap"',       pos: "above" },
      { targetId: "musicModeTrigger", title: "Change mode",      body: "Tap or say",    cmd: '"Show Modes"',        pos: "above" },
      { targetId: "instrumentTrigger", title: "Change instrument",body: "Tap or say",    cmd: '"Select Instrument Woodblock"', pos: "above" },
      { targetId: "dashIconBtn",  title: "Your progress & data", body: "Tap or say",    cmd: '"Open Dashboard"',    pos: "below" },
      { targetId: "vcHelpBtn",    title: "See all commands",     body: "Tap this button anytime for the full command list.", cmd: null, pos: "left", isFinal: true },
    ],
  };

  // ── State ────────────────────────────────────────────────────────────────
  let _app        = "athletic";
  let _stepIdx    = 0;
  let _overlay    = null;
  let _spotlight  = null;
  let _callout    = null;
  let _stepDots   = null;
  let _onComplete = null;

  // ── Public init ──────────────────────────────────────────────────────────
  function init(appName, opts = {}) {
    _app        = appName;
    _onComplete = opts.onComplete || null;

    // Only run if not already done — or forced replay
    if (!opts.forceReplay && localStorage.getItem(DONE_KEYS[appName])) return;

    // Wait for DOM + a short delay so the page finishes rendering
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => setTimeout(_boot, 600));
    } else {
      setTimeout(_boot, 600);
    }
  }

  function replay(appName) {
    _app = appName;
    localStorage.removeItem(DONE_KEYS[appName]);
    _boot();
  }

  // ── Build and inject the overlay DOM ────────────────────────────────────
  function _boot() {
    _stepIdx = 0;
    _buildDOM();
    _showStep(0);
  }

  function _buildDOM() {
    // Remove any existing overlay
    document.getElementById("metTourOverlay")?.remove();

    const style = document.createElement("style");
    style.id = "metTourStyle";
    style.textContent = `
      #metTourOverlay {
        position:fixed;inset:0;z-index:10000;pointer-events:none;
        font-family:'Segoe UI','Inter',system-ui,sans-serif;
      }
      #metTourDim {
        position:absolute;inset:0;
        background:rgba(0,0,0,0.72);pointer-events:all;
        transition:opacity 0.3s;
      }
      #metTourSpotlight {
        position:absolute;
        border-radius:16px;
        box-shadow:0 0 0 9999px rgba(0,0,0,0.72);
        pointer-events:none;
        transition:all 0.35s cubic-bezier(0.4,0,0.2,1);
        z-index:10001;
      }
      #metTourCallout {
        position:absolute;z-index:10002;pointer-events:all;
        background:linear-gradient(135deg,rgba(4,22,12,0.98),rgba(2,14,8,0.98));
        border:1px solid rgba(46,204,113,0.45);
        border-radius:18px;padding:16px 18px;
        max-width:240px;min-width:200px;
        box-shadow:0 8px 32px rgba(0,0,0,0.5),0 0 0 1px rgba(46,204,113,0.1);
        transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
      }
      .tour-step-num {
        font-size:9px;letter-spacing:1.5px;color:rgba(46,204,113,0.6);
        text-transform:uppercase;margin-bottom:6px;
      }
      .tour-title {
        font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;line-height:1.3;
      }
      .tour-body {
        font-size:11px;color:rgba(255,255,255,0.6);line-height:1.5;margin-bottom:4px;
      }
      .tour-cmd {
        display:inline-block;
        background:rgba(46,204,113,0.12);border:1px solid rgba(46,204,113,0.3);
        border-radius:8px;padding:4px 10px;
        font-size:11px;color:#2ecc71;font-family:monospace;
        margin:4px 0 10px;letter-spacing:0.3px;
      }
      .tour-btn-row {
        display:flex;gap:8px;align-items:center;margin-top:10px;
      }
      .tour-next-btn {
        flex:1;padding:9px;
        background:rgba(46,204,113,0.15);border:1px solid rgba(46,204,113,0.4);
        border-radius:10px;color:#2ecc71;font-size:11px;letter-spacing:1px;
        cursor:pointer;transition:background 0.2s;
        font-family:'Segoe UI',sans-serif;
      }
      .tour-next-btn:hover{background:rgba(46,204,113,0.28);}
      .tour-skip-btn {
        padding:9px 12px;
        background:transparent;border:1px solid rgba(255,255,255,0.1);
        border-radius:10px;color:rgba(255,255,255,0.35);font-size:10px;
        cursor:pointer;transition:background 0.2s;
        font-family:'Segoe UI',sans-serif;
      }
      .tour-skip-btn:hover{background:rgba(255,255,255,0.06);}
      .tour-dots {
        display:flex;gap:5px;align-items:center;margin-top:10px;justify-content:center;
      }
      .tour-dot {
        width:6px;height:6px;border-radius:50%;
        background:rgba(255,255,255,0.2);transition:background 0.2s;
      }
      .tour-dot.active{background:#2ecc71;}
      #metTourArrow {
        position:absolute;z-index:10002;pointer-events:none;
        width:16px;height:16px;
        background:rgba(4,22,12,0.98);
        border:1px solid rgba(46,204,113,0.45);
        transform:rotate(45deg);
        transition:all 0.3s;
      }
    `;
    document.head.appendChild(style);

    const overlay  = document.createElement("div"); overlay.id = "metTourOverlay";
    const dim      = document.createElement("div"); dim.id     = "metTourDim";
    const spotlight= document.createElement("div"); spotlight.id = "metTourSpotlight";
    const callout  = document.createElement("div"); callout.id   = "metTourCallout";
    const arrow    = document.createElement("div"); arrow.id     = "metTourArrow";

    overlay.appendChild(dim);
    overlay.appendChild(spotlight);
    overlay.appendChild(arrow);
    overlay.appendChild(callout);
    document.body.appendChild(overlay);

    _overlay   = overlay;
    _spotlight = spotlight;
    _callout   = callout;

    // Clicking the dim area skips (same as skip button)
    dim.addEventListener("click", _skip);
  }

  // ── Render a single step ─────────────────────────────────────────────────
  function _showStep(idx) {
    const steps = STEPS[_app];
    if (idx >= steps.length) { _finish(); return; }
    const step = steps[idx];
    _stepIdx   = idx;

    // ── Position spotlight ───────────────────────────────────────────────
    const target = step.targetId ? document.getElementById(step.targetId) : null;
    let   rect   = null;

    if (target) {
      rect = target.getBoundingClientRect();
      const pad = 10;
      _spotlight.style.cssText = `
        position:absolute;
        left:${rect.left - pad}px;
        top:${rect.top  - pad + window.scrollY}px;
        width:${rect.width  + pad*2}px;
        height:${rect.height + pad*2}px;
        border-radius:14px;
        box-shadow:0 0 0 9999px rgba(0,0,0,0.72),0 0 0 2px rgba(46,204,113,0.5);
        pointer-events:none;
        transition:all 0.35s cubic-bezier(0.4,0,0.2,1);
        z-index:10001;
      `;
      _spotlight.style.display = "block";
    } else {
      _spotlight.style.display = "none";
    }

    // ── Build callout HTML ───────────────────────────────────────────────
    const stepNum  = idx + 1;
    const total    = steps.length;
    const isLast   = step.isFinal || idx === total - 1;
    const dotsHTML = steps.map((_,i) =>
      `<div class="tour-dot ${i===idx?"active":""}"></div>`
    ).join("");

    _callout.innerHTML = `
      <div class="tour-step-num">Step ${stepNum} of ${total}</div>
      <div class="tour-title">${step.title}</div>
      <div class="tour-body">${step.body}</div>
      ${step.cmd ? `<div class="tour-cmd">${step.cmd}</div>` : ""}
      <div class="tour-btn-row">
        <button class="tour-next-btn" id="tourNextBtn">${isLast ? "✓ Got it!" : "Next →"}</button>
        ${!isLast ? `<button class="tour-skip-btn" id="tourSkipBtn">Skip tour</button>` : ""}
      </div>
      <div class="tour-dots">${dotsHTML}</div>
    `;

    // ── Position callout ─────────────────────────────────────────────────
    _positionCallout(step, rect);

    // ── Button events ────────────────────────────────────────────────────
    document.getElementById("tourNextBtn")?.addEventListener("click", () => _showStep(idx + 1));
    document.getElementById("tourSkipBtn")?.addEventListener("click", _skip);
  }

  function _positionCallout(step, rect) {
    // Wait for callout to render so we can measure it
    requestAnimationFrame(() => {
      const cw  = _callout.offsetWidth  || 220;
      const ch  = _callout.offsetHeight || 160;
      const vw  = window.innerWidth;
      const vh  = window.innerHeight;
      const pad = 16;
      let   left, top;

      if (!rect || step.pos === "center") {
        // Centre of screen
        left = (vw - cw) / 2;
        top  = (vh - ch) / 2;
      } else {
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2 + window.scrollY;
        switch (step.pos) {
          case "above":
            left = Math.max(pad, Math.min(vw - cw - pad, cx - cw/2));
            top  = cy - rect.height/2 - ch - 20;
            break;
          case "below":
            left = Math.max(pad, Math.min(vw - cw - pad, cx - cw/2));
            top  = cy + rect.height/2 + 20;
            break;
          case "left":
            left = Math.max(pad, rect.left - cw - 20);
            top  = Math.max(pad, Math.min(vh - ch - pad, cy - ch/2));
            break;
          case "right":
            left = Math.min(vw - cw - pad, rect.right + 20);
            top  = Math.max(pad, Math.min(vh - ch - pad, cy - ch/2));
            break;
          default:
            left = (vw - cw) / 2;
            top  = vh * 0.35;
        }
        top  = Math.max(pad, Math.min(vh - ch - pad, top));
        left = Math.max(pad, left);
      }

      _callout.style.left = left + "px";
      _callout.style.top  = top  + "px";

      // Hide arrow (simple approach — callout is clear enough)
      const arrow = document.getElementById("metTourArrow");
      if (arrow) arrow.style.display = "none";
    });
  }

  // ── Skip or finish ───────────────────────────────────────────────────────
  function _skip() {
    _finish();
  }

  function _finish() {
    localStorage.setItem(DONE_KEYS[_app], "1");
    // Fade out overlay
    if (_overlay) {
      _overlay.style.transition = "opacity 0.4s";
      _overlay.style.opacity    = "0";
      setTimeout(() => {
        _overlay?.remove();
        document.getElementById("metTourStyle")?.remove();
      }, 420);
    }
    if (_onComplete) _onComplete();
    console.log("[MetOnboarding] Tour complete for:", _app);
  }

  // ── Public API ───────────────────────────────────────────────────────────
  return { init, replay };

})();