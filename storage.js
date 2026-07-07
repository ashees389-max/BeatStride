/**
 * ═══════════════════════════════════════════════════════════════════
 *  storage.js  —  MetStorage
 *  Offline-first localStorage manager for the Metronome App
 *  Include via: <script src="storage.js"></script>
 *  Then use the global MetStorage object anywhere.
 * ═══════════════════════════════════════════════════════════════════
 */

const MetStorage = (function () {

  // ─────────────────────────────────────────────────────────────
  //  KEYS  (all localStorage keys in one place)
  // ─────────────────────────────────────────────────────────────
  const KEYS = {
    APP_VERSION        : "met_app_version",
    USER_NAME          : "met_user_name",
    DEFAULT_MODE       : "met_default_mode",       // null | "music" | "athletic"
    NOTIF_PERMISSION   : "met_notif_permission",   // "granted"|"denied"|"not-asked"
    ONBOARDING_DONE    : "met_onboarding_done",    // boolean

    SESSION_HISTORY    : "met_session_history",    // array (max 500)
    STREAKS            : "met_streaks",
    PERSONAL_BESTS     : "met_personal_bests",
    ACHIEVEMENTS       : "met_achievements",       // array of unlocked
    ALARMS             : "met_alarms",             // array
    SETTINGS           : "met_settings",
  };

  const CURRENT_VERSION = "1.0.0";
  const MAX_SESSIONS    = 500;

  // ─────────────────────────────────────────────────────────────
  //  ACHIEVEMENT DEFINITIONS
  // ─────────────────────────────────────────────────────────────
  const ACHIEVEMENT_DEFS = [
    // ── General ──
    { id:"first_session",       name:"First Step",           desc:"Complete your very first session.",              icon:"👟" },
    { id:"session_10min",       name:"10 Minute Warrior",    desc:"Complete a session of 10 minutes or more.",      icon:"⏱"  },
    { id:"session_20min",       name:"20 Minute Champion",   desc:"Complete a session of 20 minutes or more.",      icon:"🏅" },
    { id:"sessions_50",         name:"Half Century",         desc:"Complete 50 total sessions.",                    icon:"5️⃣0️⃣" },
    { id:"sessions_100",        name:"Century Club",         desc:"Complete 100 total sessions.",                   icon:"💯" },
    { id:"practice_10h",        name:"10 Hours Strong",      desc:"Accumulate 10 hours of total practice time.",    icon:"🕐" },
    { id:"practice_50h",        name:"50 Hours Master",      desc:"Accumulate 50 hours of total practice time.",    icon:"🔥" },

    // ── Streaks ──
    { id:"streak_3",            name:"3-Day Streak",         desc:"Practice 3 days in a row.",                     icon:"🌱" },
    { id:"streak_7",            name:"7-Day Streak",         desc:"Practice 7 days in a row.",                     icon:"⚡" },
    { id:"streak_30",           name:"30-Day Streak",        desc:"Practice 30 days in a row.",                    icon:"🌟" },
    { id:"streak_100",          name:"100-Day Legend",       desc:"Practice 100 days in a row.",                   icon:"🏆" },

    // ── Athletic ──
    { id:"cadence_160",         name:"Speed Demon 160",      desc:"Reach a cadence of 160 SPM.",                   icon:"💨" },
    { id:"cadence_180",         name:"Speed Demon 180",      desc:"Reach a cadence of 180 SPM.",                   icon:"🚀" },
    { id:"cadence_200",         name:"Speed Demon 200",      desc:"Reach a cadence of 200 SPM.",                   icon:"⚡" },
    { id:"sets_10",             name:"Set Master",           desc:"Complete 10 sets in a single session.",         icon:"💪" },
    { id:"sets_20",             name:"Set Legend",           desc:"Complete 20 sets in a single session.",         icon:"🦾" },
    { id:"all_athletic_modes",  name:"Athletic Explorer",    desc:"Use all 6 athletic modes at least once.",       icon:"🗺"  },
    { id:"flexible_10",         name:"Flexible Athlete",     desc:"Use Flexible Mode 10 times.",                   icon:"🔀" },
    { id:"rest_extension_5",    name:"Take A Breather",      desc:"Use the +10s rest extension 5 times.",          icon:"😮‍💨"},
    { id:"cadence_1min",        name:"Sustained Pace",       desc:"Hold a cadence for a full 1 minute set.",       icon:"⏳" },
    { id:"cadence_5min",        name:"Iron Pace",            desc:"Hold a cadence for a full 5 minute set.",       icon:"🦴" },

    // ── Music ──
    { id:"bpm_180_music",        name:"Presto!",              desc:"Reach 180 BPM in the music metronome.",              icon:"🎶" },
    { id:"bpm_220_music",        name:"Speed Demon",          desc:"Reach 220 BPM in the music metronome.",              icon:"⚡" },
    { id:"bpm_300_music",        name:"Machine Gun",          desc:"Reach 300 BPM in the music metronome.",              icon:"🔫" },
    { id:"all_music_modes",      name:"Music Explorer",       desc:"Use all 5 music modes at least once.",               icon:"🎼" },
    { id:"poly_first",           name:"Polyrhythm Pioneer",   desc:"Use Poly Rhythm mode for the first time.",           icon:"🥁" },
    { id:"fermata_first",        name:"Hold It!",             desc:"Complete a Loop with Fermata session.",              icon:"𝄐"  },
    { id:"ramp_complete",        name:"Ramp Runner",          desc:"Complete a full Practice Ramp from start to end.",   icon:"📈" },
    { id:"subdivision_triplets", name:"Triplet Thinker",      desc:"Practice with triplet subdivisions.",                icon:"3️⃣" },
    { id:"subdivision_16th",     name:"Sixteenth Warrior",    desc:"Practice with sixteenth note subdivisions.",         icon:"🎯" },
    { id:"accent_custom",        name:"Accent Architect",     desc:"Use a custom accent pattern.",                       icon:"🏗"  },
    { id:"instruments_1",        name:"First Click",          desc:"Play with any 1 instrument.",                        icon:"🥢" },
    { id:"instruments_3",        name:"Sound Curious",        desc:"Play with 3 different instruments.",                 icon:"🎵" },
    { id:"instruments_5",        name:"Tone Explorer",        desc:"Play with 5 different instruments.",                 icon:"🎸" },
    { id:"instruments_10",       name:"Sound Collector",      desc:"Play with 10 different instruments.",                icon:"🎹" },
    { id:"instruments_15",       name:"Sonic Adventurer",     desc:"Play with 15 different instruments.",                icon:"🎷" },
    { id:"instruments_18",       name:"Full Orchestra",       desc:"Play with all 18 instruments at least once.",        icon:"🎻" },
    { id:"instr_woodblock_1h",   name:"Woodblock Master",     desc:"Accumulate 1 hour with the Woodblock.",              icon:"🪵" },
    { id:"instr_cowbell_1h",     name:"More Cowbell",         desc:"Accumulate 1 hour with the Cowbell.",                icon:"🔔" },
    { id:"instr_bell_1h",        name:"Bell Ringer",          desc:"Accumulate 1 hour with the Bell.",                   icon:"🛎" },
    { id:"instr_drumkit_1h",     name:"Drummer Boy",          desc:"Accumulate 1 hour with the Drum Kit.",               icon:"🥁" },
  ];

  // ─────────────────────────────────────────────────────────────
  //  DEFAULT STRUCTURES
  // ─────────────────────────────────────────────────────────────
  function defaultStreaks() {
    return {
      current_streak_days          : 0,
      longest_streak_days          : 0,
      last_session_date            : null,
      total_sessions_all_time      : 0,
      total_practice_minutes       : 0,
      sessions_per_mode            : {},
      flexible_mode_uses           : 0,
      rest_extension_uses          : 0,
      instruments_used             : [],     // array of unique instrument IDs ever used
      instrument_time_sec          : {},     // { instrumentId: totalSeconds }
    };
  }

  function defaultPersonalBests() {
    return {
      longest_session_minutes      : 0,
      highest_cadence_ever         : 0,
      highest_cadence_1min         : 0,
      highest_cadence_5min         : 0,
      most_sets_single_session     : 0,
      fastest_ramp_peak            : 0,
      highest_bpm_music            : 0,
    };
  }

  function defaultSettings() {
    return {
      default_cadence_athletic     : 140,
      default_cadence_music        : 120,
      default_instrument           : "woodblock",
      default_subdivision          : 1,
      default_measure_count        : 4,
      flexible_mode_default        : false,
      volume_level                 : 0.7,
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  INTERNAL: read / write helpers
  // ─────────────────────────────────────────────────────────────
  function read(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("[MetStorage] read error for key:", key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      // Storage full or unavailable
      console.error("[MetStorage] write error for key:", key, e);
      return false;
    }
  }

  // Generate a simple unique ID
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  }

  // Today as "YYYY-MM-DD"
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" +
           String(d.getMonth() + 1).padStart(2, "0") + "-" +
           String(d.getDate()).padStart(2, "0");
  }

  // Days between two "YYYY-MM-DD" strings
  function daysBetween(dateStr1, dateStr2) {
    const d1 = new Date(dateStr1);
    const d2 = new Date(dateStr2);
    return Math.round(Math.abs((d2 - d1) / (1000 * 60 * 60 * 24)));
  }

  // ─────────────────────────────────────────────────────────────
  //  INIT  — call once on app start to set up defaults
  // ─────────────────────────────────────────────────────────────
  function init() {
    // App version
    if (!read(KEYS.APP_VERSION)) {
      write(KEYS.APP_VERSION, CURRENT_VERSION);
    }

    // Ensure all structures exist with defaults
    if (!read(KEYS.SESSION_HISTORY))  write(KEYS.SESSION_HISTORY,  []);
    if (!read(KEYS.STREAKS))          write(KEYS.STREAKS,          defaultStreaks());
    if (!read(KEYS.PERSONAL_BESTS))   write(KEYS.PERSONAL_BESTS,   defaultPersonalBests());
    if (!read(KEYS.ACHIEVEMENTS))     write(KEYS.ACHIEVEMENTS,     []);
    if (!read(KEYS.ALARMS))           write(KEYS.ALARMS,           []);
    if (!read(KEYS.SETTINGS))         write(KEYS.SETTINGS,         defaultSettings());
    if (!read(KEYS.NOTIF_PERMISSION)) write(KEYS.NOTIF_PERMISSION, "not-asked");
    if (!read(KEYS.ONBOARDING_DONE))  write(KEYS.ONBOARDING_DONE,  false);

    console.log("[MetStorage] Initialised. Version:", CURRENT_VERSION);
  }

  // ─────────────────────────────────────────────────────────────
  //  APP / USER
  // ─────────────────────────────────────────────────────────────
  function getUserName()           { return read(KEYS.USER_NAME, ""); }
  function setUserName(name)       { return write(KEYS.USER_NAME, name.trim()); }

  function getDefaultMode()        { return read(KEYS.DEFAULT_MODE, null); }
  function setDefaultMode(mode)    { return write(KEYS.DEFAULT_MODE, mode); } // "music"|"athletic"|null

  function isOnboardingDone()      { return read(KEYS.ONBOARDING_DONE, false); }
  function setOnboardingDone()     { return write(KEYS.ONBOARDING_DONE, true); }

  function getNotifPermission()    { return read(KEYS.NOTIF_PERMISSION, "not-asked"); }
  function setNotifPermission(val) { return write(KEYS.NOTIF_PERMISSION, val); }

  // ─────────────────────────────────────────────────────────────
  //  SETTINGS
  // ─────────────────────────────────────────────────────────────
  function getSettings() {
    return { ...defaultSettings(), ...read(KEYS.SETTINGS, {}) };
  }

  function updateSettings(partial) {
    const current = getSettings();
    const updated = { ...current, ...partial };
    return write(KEYS.SETTINGS, updated);
  }

  function getSetting(key) {
    return getSettings()[key];
  }

  // ─────────────────────────────────────────────────────────────
  //  SESSION HISTORY
  // ─────────────────────────────────────────────────────────────

  /**
   * Save a completed session.
   *
   * @param {object} data - Session data object. Shape:
   * {
   *   app_mode          : "music" | "athletic",
   *   sub_mode          : "regular" | "timedRun" | "fixedInterval" | etc.,
   *   total_duration_sec: number,
   *   total_active_sec  : number,
   *   total_rest_sec    : number,
   *   starting_cadence  : number,
   *   ending_cadence    : number,
   *   total_steps       : number,   // or total_beats for music
   *   sets_completed    : number,
   *   sets_skipped      : number,
   *   flexible_mode_used: boolean,
   *   user_notes        : string,
   *   sets_detail       : array,    // see structure above
   * }
   */
  function saveSession(data) {
    if (!data || !data.app_mode) {
      console.error("[MetStorage] saveSession: invalid data");
      return null;
    }

    const session = {
      session_id          : uid(),
      timestamp           : new Date().toISOString(),
      date                : todayStr(),
      app_mode            : data.app_mode,
      sub_mode            : data.sub_mode          || "regular",
      total_duration_sec  : data.total_duration_sec|| 0,
      total_active_sec    : data.total_active_sec  || 0,
      total_rest_sec      : data.total_rest_sec    || 0,
      starting_cadence    : data.starting_cadence  || 0,
      ending_cadence      : data.ending_cadence    || 0,
      total_steps         : data.total_steps       || 0,
      sets_completed      : data.sets_completed    || 0,
      sets_skipped        : data.sets_skipped      || 0,
      flexible_mode_used  : data.flexible_mode_used|| false,
      user_notes          : data.user_notes        || "",
      sets_detail         : data.sets_detail       || [],
    };

    // Add to history (newest first), cap at MAX_SESSIONS
    const history = read(KEYS.SESSION_HISTORY, []);
    history.unshift(session);
    if (history.length > MAX_SESSIONS) history.splice(MAX_SESSIONS);
    write(KEYS.SESSION_HISTORY, history);

    // Side effects: update everything derived from this session
    _updateStreaks(session);
    _updatePersonalBests(session);
    _checkAchievements(session);

    console.log("[MetStorage] Session saved:", session.session_id);
    return session.session_id;
  }

  /**
   * Add or update user notes on an existing session.
   */
  function updateSessionNotes(sessionId, notes) {
    const history = read(KEYS.SESSION_HISTORY, []);
    const idx = history.findIndex(s => s.session_id === sessionId);
    if (idx === -1) return false;
    history[idx].user_notes = notes;
    return write(KEYS.SESSION_HISTORY, history);
  }

  /**
   * Delete a session by ID.
   *
   * FIX: previously this only removed the session from history and left
   * STREAKS and PERSONAL_BESTS completely untouched. Both are stored,
   * incrementally-updated values that only ever move upward inside
   * saveSession() — so deleting a session that set a personal best, set
   * the longest streak, was the most-recent day of the current streak,
   * or contributed to total sessions/practice time/mode-usage counts
   * would leave all of those numbers stale and disconnected from what's
   * actually left in history.
   *
   * Fix: after removing the session, recalculateDerivedData() rebuilds
   * STREAKS and PERSONAL_BESTS from scratch by scanning whatever
   * remains in SESSION_HISTORY. saveSession() is NOT changed — it still
   * uses the original incremental _updateStreaks/_updatePersonalBests
   * exactly as before, since that path was not broken.
   */
  function deleteSession(sessionId) {
    const history = read(KEYS.SESSION_HISTORY, []);
    const filtered = history.filter(s => s.session_id !== sessionId);
    const ok = write(KEYS.SESSION_HISTORY, filtered);
    if (ok) recalculateDerivedData();
    return ok;
  }

  /**
   * Get full session history (newest first).
   */
  function getHistory() {
    return read(KEYS.SESSION_HISTORY, []);
  }

  /**
   * Get sessions filtered by mode, sub_mode, or date range.
   * @param {object} filters - { app_mode, sub_mode, from_date, to_date }
   */
  function getFilteredHistory(filters = {}) {
    let sessions = read(KEYS.SESSION_HISTORY, []);

    if (filters.app_mode) {
      sessions = sessions.filter(s => s.app_mode === filters.app_mode);
    }
    if (filters.sub_mode) {
      sessions = sessions.filter(s => s.sub_mode === filters.sub_mode);
    }
    if (filters.from_date) {
      sessions = sessions.filter(s => s.date >= filters.from_date);
    }
    if (filters.to_date) {
      sessions = sessions.filter(s => s.date <= filters.to_date);
    }
    return sessions;
  }

  /**
   * Get sessions from the last N days.
   */
  function getRecentSessions(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.getFullYear() + "-" +
                      String(cutoff.getMonth() + 1).padStart(2,"0") + "-" +
                      String(cutoff.getDate()).padStart(2,"0");
    return read(KEYS.SESSION_HISTORY, []).filter(s => s.date >= cutoffStr);
  }

  /**
   * Get a single session by ID.
   */
  function getSession(sessionId) {
    return read(KEYS.SESSION_HISTORY, []).find(s => s.session_id === sessionId) || null;
  }

  // ─────────────────────────────────────────────────────────────
  //  STREAKS  (internal update + public read)
  // ─────────────────────────────────────────────────────────────
  function _updateStreaks(session) {
    const s       = read(KEYS.STREAKS, defaultStreaks());
    const today   = todayStr();
    const lastDate= s.last_session_date;

    // Update session counts
    s.total_sessions_all_time++;
    s.total_practice_minutes += Math.round(session.total_duration_sec / 60);

    // Mode usage counter
    const modeKey = session.app_mode + "_" + session.sub_mode;
    s.sessions_per_mode[modeKey] = (s.sessions_per_mode[modeKey] || 0) + 1;

    // Flexible mode uses
    if (session.flexible_mode_used) s.flexible_mode_uses++;

    // Rest extension uses
    const restExts = (session.sets_detail || []).reduce((a, set) => a + (set.rest_extensions || 0), 0);
    s.rest_extension_uses += restExts;

    // Streak logic
    if (!lastDate) {
      // First ever session
      s.current_streak_days = 1;
    } else {
      const diff = daysBetween(lastDate, today);
      if (diff === 0) {
        // Same day — streak unchanged (already counted)
      } else if (diff === 1) {
        // Consecutive day — increment streak
        s.current_streak_days++;
      } else {
        // Gap of 2+ days — streak reset
        s.current_streak_days = 1;
      }
    }

    // Update longest streak
    if (s.current_streak_days > s.longest_streak_days) {
      s.longest_streak_days = s.current_streak_days;
    }

    s.last_session_date = today;
    write(KEYS.STREAKS, s);
  }

  function getStreaks() {
    return read(KEYS.STREAKS, defaultStreaks());
  }

  /**
   * Check if today's streak is still alive (user practiced today or yesterday).
   * Call this on app open to show correct streak status.
   */
  function isStreakAlive() {
    const s = read(KEYS.STREAKS, defaultStreaks());
    if (!s.last_session_date) return false;
    const diff = daysBetween(s.last_session_date, todayStr());
    return diff <= 1;
  }

  /**
   * Returns an object with active day dates for the last N days.
   * Used to draw the activity heatmap on the dashboard.
   * Returns: { "YYYY-MM-DD": sessionCount, ... }
   */
  function getActivityMap(days = 90) {
    const map  = {};
    const sessions = read(KEYS.SESSION_HISTORY, []);
    const cutoff   = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.getFullYear() + "-" +
                      String(cutoff.getMonth()+1).padStart(2,"0") + "-" +
                      String(cutoff.getDate()).padStart(2,"0");
    sessions.forEach(s => {
      if (s.date >= cutoffStr) {
        map[s.date] = (map[s.date] || 0) + 1;
      }
    });
    return map;
  }

  // ─────────────────────────────────────────────────────────────
  //  PERSONAL BESTS  (internal update + public read)
  // ─────────────────────────────────────────────────────────────
  function _updatePersonalBests(session) {
    const pb = read(KEYS.PERSONAL_BESTS, defaultPersonalBests());
    let changed = false;

    // Longest session
    const durMin = session.total_duration_sec / 60;
    if (durMin > pb.longest_session_minutes) {
      pb.longest_session_minutes = Math.round(durMin * 10) / 10;
      changed = true;
    }

    // Highest cadence ever (athletic)
    if (session.app_mode === "athletic") {
      const maxCad = Math.max(session.starting_cadence, session.ending_cadence);
      if (maxCad > pb.highest_cadence_ever) { pb.highest_cadence_ever = maxCad; changed = true; }

      // Cadence sustained over 1 min / 5 min — check set durations
      (session.sets_detail || []).forEach(set => {
        const phases = set.phases || [];
        phases.forEach(ph => {
          const durSec = ph.durationSec || ph.duration_sec || 0;
          if (durSec >= 60 && ph.cadence > pb.highest_cadence_1min) {
            pb.highest_cadence_1min = ph.cadence; changed = true;
          }
          if (durSec >= 300 && ph.cadence > pb.highest_cadence_5min) {
            pb.highest_cadence_5min = ph.cadence; changed = true;
          }
        });
        // Also check whole set if no sub-phases
        if (!phases.length) {
          const aSec = set.actual_active_sec || set.planned_dur || 0;
          if (aSec >= 60 && set.planned_cadence > pb.highest_cadence_1min) {
            pb.highest_cadence_1min = set.planned_cadence; changed = true;
          }
          if (aSec >= 300 && set.planned_cadence > pb.highest_cadence_5min) {
            pb.highest_cadence_5min = set.planned_cadence; changed = true;
          }
        }
      });

      // Most sets
      if (session.sets_completed > pb.most_sets_single_session) {
        pb.most_sets_single_session = session.sets_completed; changed = true;
      }

      // Fastest ramp peak (cadenceRamp mode)
      if (session.sub_mode === "cadenceRamp" && session.ending_cadence > pb.fastest_ramp_peak) {
        pb.fastest_ramp_peak = session.ending_cadence; changed = true;
      }
    }

    // Highest BPM (music)
    if (session.app_mode === "music") {
      const maxBPM = Math.max(session.starting_cadence, session.ending_cadence);
      if (maxBPM > pb.highest_bpm_music) { pb.highest_bpm_music = maxBPM; changed = true; }
    }

    if (changed) write(KEYS.PERSONAL_BESTS, pb);
  }

  function getPersonalBests() {
    return read(KEYS.PERSONAL_BESTS, defaultPersonalBests());
  }

  // ─────────────────────────────────────────────────────────────
  //  RECALCULATION  (used ONLY by deleteSession, see note above it)
  //
  //  Rebuilds STREAKS and PERSONAL_BESTS entirely from whatever is
  //  currently in SESSION_HISTORY. This is intentionally a separate
  //  code path from _updateStreaks/_updatePersonalBests — saveSession()
  //  is untouched and keeps using the original incremental functions,
  //  exactly as before deletion was ever a concern.
  // ─────────────────────────────────────────────────────────────
  function recalculateDerivedData() {
    const history = read(KEYS.SESSION_HISTORY, []);

    // ── Rebuild PERSONAL_BESTS from scratch ──
    // Same field-by-field logic as _updatePersonalBests, just looped
    // over the full remaining history instead of one new session.
    const pb = defaultPersonalBests();
    history.forEach(session => {
      const durMin = session.total_duration_sec / 60;
      if (durMin > pb.longest_session_minutes) {
        pb.longest_session_minutes = Math.round(durMin * 10) / 10;
      }
      if (session.app_mode === "athletic") {
        const maxCad = Math.max(session.starting_cadence, session.ending_cadence);
        if (maxCad > pb.highest_cadence_ever) pb.highest_cadence_ever = maxCad;

        (session.sets_detail || []).forEach(set => {
          const phases = set.phases || [];
          phases.forEach(ph => {
            const durSec = ph.durationSec || ph.duration_sec || 0;
            if (durSec >= 60 && ph.cadence > pb.highest_cadence_1min) {
              pb.highest_cadence_1min = ph.cadence;
            }
            if (durSec >= 300 && ph.cadence > pb.highest_cadence_5min) {
              pb.highest_cadence_5min = ph.cadence;
            }
          });
          if (!phases.length) {
            const aSec = set.actual_active_sec || set.planned_dur || 0;
            if (aSec >= 60 && set.planned_cadence > pb.highest_cadence_1min) {
              pb.highest_cadence_1min = set.planned_cadence;
            }
            if (aSec >= 300 && set.planned_cadence > pb.highest_cadence_5min) {
              pb.highest_cadence_5min = set.planned_cadence;
            }
          }
        });

        if (session.sets_completed > pb.most_sets_single_session) {
          pb.most_sets_single_session = session.sets_completed;
        }
        if (session.sub_mode === "cadenceRamp" && session.ending_cadence > pb.fastest_ramp_peak) {
          pb.fastest_ramp_peak = session.ending_cadence;
        }
      }
      if (session.app_mode === "music") {
        const maxBPM = Math.max(session.starting_cadence, session.ending_cadence);
        if (maxBPM > pb.highest_bpm_music) pb.highest_bpm_music = maxBPM;
      }
    });
    write(KEYS.PERSONAL_BESTS, pb);

    // ── Rebuild STREAKS from scratch ──
    // Preserve fields that aren't derivable from session content alone
    // (flexible_mode_uses, rest_extension_uses, instruments_used,
    // instrument_time_sec are cumulative counters of USAGE EVENTS, not
    // simple aggregates of stored session fields in every case — but
    // total_sessions_all_time, total_practice_minutes, sessions_per_mode,
    // current_streak_days and longest_streak_days ARE fully derivable
    // from history, so those are the ones rebuilt here.)
    const existing = read(KEYS.STREAKS, defaultStreaks());

    const sessionsPerMode = {};
    let totalMinutes = 0;
    history.forEach(s => {
      const modeKey = s.app_mode + "_" + s.sub_mode;
      sessionsPerMode[modeKey] = (sessionsPerMode[modeKey] || 0) + 1;
      totalMinutes += Math.round(s.total_duration_sec / 60);
    });

    // Unique sorted dates with at least one session, for streak math
    const uniqueDates = [...new Set(history.map(s => s.date))].sort();

    let longestStreak = uniqueDates.length > 0 ? 1 : 0;
    let runLength = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const diff = daysBetween(uniqueDates[i - 1], uniqueDates[i]);
      runLength = (diff === 1) ? runLength + 1 : 1;
      if (runLength > longestStreak) longestStreak = runLength;
    }

    let currentRun = uniqueDates.length > 0 ? 1 : 0;
    for (let i = uniqueDates.length - 1; i > 0; i--) {
      const diff = daysBetween(uniqueDates[i - 1], uniqueDates[i]);
      if (diff === 1) currentRun++;
      else break;
    }

    const lastDate = uniqueDates.length > 0 ? uniqueDates[uniqueDates.length - 1] : null;
    const aliveDiff = lastDate ? daysBetween(lastDate, todayStr()) : Infinity;
    const currentStreak = (lastDate && aliveDiff <= 1) ? currentRun : 0;

    const rebuiltStreaks = {
      ...existing,                              // keep flexible_mode_uses, rest_extension_uses, instruments_used, instrument_time_sec untouched
      total_sessions_all_time : history.length,
      total_practice_minutes  : totalMinutes,
      sessions_per_mode       : sessionsPerMode,
      current_streak_days     : currentStreak,
      longest_streak_days     : longestStreak,
      last_session_date       : lastDate,
    };
    write(KEYS.STREAKS, rebuiltStreaks);
  }

  // ─────────────────────────────────────────────────────────────
  //  ACHIEVEMENTS
  // ─────────────────────────────────────────────────────────────
  function _checkAchievements(session) {
    const unlocked  = read(KEYS.ACHIEVEMENTS, []);
    const unlockedIds = new Set(unlocked.map(a => a.id));
    const streaks   = read(KEYS.STREAKS, defaultStreaks());
    const pb        = read(KEYS.PERSONAL_BESTS, defaultPersonalBests());
    const history   = read(KEYS.SESSION_HISTORY, []);
    const newlyUnlocked = [];

    function unlock(id) {
      if (unlockedIds.has(id)) return;
      const def = ACHIEVEMENT_DEFS.find(a => a.id === id);
      if (!def) return;
      const entry = { ...def, unlocked_date: new Date().toISOString() };
      unlocked.push(entry);
      unlockedIds.add(id);
      newlyUnlocked.push(entry);
      console.log("[MetStorage] Achievement unlocked:", def.name);
    }

    // ── General ──
    if (history.length >= 1)                              unlock("first_session");
    if (session.total_duration_sec >= 600)                unlock("session_10min");
    if (session.total_duration_sec >= 1200)               unlock("session_20min");
    if (streaks.total_sessions_all_time >= 50)            unlock("sessions_50");
    if (streaks.total_sessions_all_time >= 100)           unlock("sessions_100");
    if (streaks.total_practice_minutes >= 600)            unlock("practice_10h");
    if (streaks.total_practice_minutes >= 3000)           unlock("practice_50h");

    // ── Streaks ──
    if (streaks.current_streak_days >= 3)                 unlock("streak_3");
    if (streaks.current_streak_days >= 7)                 unlock("streak_7");
    if (streaks.current_streak_days >= 30)                unlock("streak_30");
    if (streaks.current_streak_days >= 100)               unlock("streak_100");

    // ── Athletic ──
    if (session.app_mode === "athletic") {
      const maxCad = Math.max(session.starting_cadence, session.ending_cadence);
      if (maxCad >= 160)                                  unlock("cadence_160");
      if (maxCad >= 180)                                  unlock("cadence_180");
      if (maxCad >= 200)                                  unlock("cadence_200");
      if (session.sets_completed >= 10)                   unlock("sets_10");
      if (session.sets_completed >= 20)                   unlock("sets_20");
      if (session.flexible_mode_used)                     unlock("flexible_10"); // name is misleading but represents first flex use
      if (pb.highest_cadence_1min > 0)                    unlock("cadence_1min");
      if (pb.highest_cadence_5min > 0)                    unlock("cadence_5min");
      if (session.sub_mode === "polyRhythm" || session.sub_mode === "loopFermata") {
        // not athletic but just in case
      }

      // Check if all 6 athletic modes used
      const athleticModes = ["regular","timedRun","fixedInterval","customSemi","customFull","cadenceRamp"];
      const usedModes = new Set(
        history.filter(s => s.app_mode === "athletic").map(s => s.sub_mode)
      );
      if (athleticModes.every(m => usedModes.has(m)))     unlock("all_athletic_modes");

      // Flexible mode 10+ times total
      if (streaks.flexible_mode_uses >= 10)               unlock("flexible_10");

      // Rest extension 5+ times
      if (streaks.rest_extension_uses >= 5)               unlock("rest_extension_5");
    }

    // ── Music ──
    if (session.app_mode === "music") {
      const maxBPM = Math.max(session.starting_cadence, session.ending_cadence);
      if (maxBPM >= 180)  unlock("bpm_180_music");
      if (maxBPM >= 220)  unlock("bpm_220_music");
      if (maxBPM >= 300)  unlock("bpm_300_music");
      if (session.sub_mode === "polyRhythm")   unlock("poly_first");
      if (session.sub_mode === "loopFermata")  unlock("fermata_first");
      if (session.sub_mode === "practiceRamp" &&
          session.ending_cadence >= session.starting_cadence) unlock("ramp_complete");

      // Subdivision achievements
      if (session.subdivision >= 3)  unlock("subdivision_triplets");
      if (session.subdivision >= 4)  unlock("subdivision_16th");

      // Accent achievements
      if (session.accent_pattern === "custom") unlock("accent_custom");

      // ── Instrument tracking ──
      // Accumulate time per instrument
      if (!streaks.instrument_time_sec)  streaks.instrument_time_sec = {};
      if (!streaks.instruments_used)     streaks.instruments_used    = [];
      const instr = session.instrument || "woodblock";
      const dur   = session.total_active_sec || 0;
      streaks.instrument_time_sec[instr] = (streaks.instrument_time_sec[instr] || 0) + dur;
      if (!streaks.instruments_used.includes(instr)) {
        streaks.instruments_used.push(instr);
      }
      write(KEYS.STREAKS, streaks);

      // Unique instruments used
      const uniqueCount = streaks.instruments_used.length;
      if (uniqueCount >= 1)  unlock("instruments_1");
      if (uniqueCount >= 3)  unlock("instruments_3");
      if (uniqueCount >= 5)  unlock("instruments_5");
      if (uniqueCount >= 10) unlock("instruments_10");
      if (uniqueCount >= 15) unlock("instruments_15");
      if (uniqueCount >= 18) unlock("instruments_18");

      // Instrument time milestones (1 hour = 3600s)
      const instrTime = streaks.instrument_time_sec;
      if ((instrTime["woodblock"] || 0) >= 3600) unlock("instr_woodblock_1h");
      if ((instrTime["cowbell"]   || 0) >= 3600) unlock("instr_cowbell_1h");
      if ((instrTime["bell"]      || 0) >= 3600) unlock("instr_bell_1h");
      if ((instrTime["drumkit"]   || 0) >= 3600) unlock("instr_drumkit_1h");

      // All 5 music modes used
      const musicModes = ["regular","practiceRamp","countdownRamp","polyRhythm","loopFermata"];
      const usedMusic  = new Set(
        history.filter(s => s.app_mode === "music").map(s => s.sub_mode)
      );
      if (musicModes.every(m => usedMusic.has(m))) unlock("all_music_modes");
    }

    if (newlyUnlocked.length) {
      write(KEYS.ACHIEVEMENTS, unlocked);
    }

    // Return newly unlocked so UI can show a toast/notification
    return newlyUnlocked;
  }

  function getAchievements() {
    const unlocked    = read(KEYS.ACHIEVEMENTS, []);
    const unlockedIds = new Set(unlocked.map(a => a.id));
    return ACHIEVEMENT_DEFS.map(def => ({
      ...def,
      unlocked      : unlockedIds.has(def.id),
      unlocked_date : unlocked.find(a => a.id === def.id)?.unlocked_date || null,
    }));
  }

  function getUnlockedAchievements() {
    return read(KEYS.ACHIEVEMENTS, []);
  }

  function getAchievementProgress() {
    const total    = ACHIEVEMENT_DEFS.length;
    const unlocked = read(KEYS.ACHIEVEMENTS, []).length;
    return { total, unlocked, percent: Math.round((unlocked / total) * 100) };
  }

  // ─────────────────────────────────────────────────────────────
  //  ALARMS
  // ─────────────────────────────────────────────────────────────

  /**
   * Add a new alarm.
   * @param {object} data - {
   *   scheduled_datetime : "2025-06-01T07:30:00",  ISO string
   *   mode               : "music" | "athletic",
   *   sub_mode           : string,
   *   label              : string,
   *   repeat             : "once" | "daily" | "weekdays" | "weekends",
   * }
   */
  function addAlarm(data) {
    const alarms = read(KEYS.ALARMS, []);
    const alarm  = {
      alarm_id           : uid(),
      scheduled_datetime : data.scheduled_datetime,
      mode               : data.mode     || "athletic",
      sub_mode           : data.sub_mode || "regular",
      label              : data.label    || "Practice Session",
      repeat             : data.repeat   || "once",
      is_active          : true,
      created_at         : new Date().toISOString(),
    };
    alarms.push(alarm);
    write(KEYS.ALARMS, alarms);
    return alarm.alarm_id;
  }

  function getAlarms() {
    return read(KEYS.ALARMS, []);
  }

  function getActiveAlarms() {
    return read(KEYS.ALARMS, []).filter(a => a.is_active);
  }

  function getUpcomingAlarms() {
    const now = new Date().toISOString();
    return read(KEYS.ALARMS, []).filter(a => a.is_active && a.scheduled_datetime >= now);
  }

  function toggleAlarm(alarmId) {
    const alarms = read(KEYS.ALARMS, []);
    const idx    = alarms.findIndex(a => a.alarm_id === alarmId);
    if (idx === -1) return false;
    alarms[idx].is_active = !alarms[idx].is_active;
    return write(KEYS.ALARMS, alarms);
  }

  function deleteAlarm(alarmId) {
    const alarms = read(KEYS.ALARMS, []).filter(a => a.alarm_id !== alarmId);
    return write(KEYS.ALARMS, alarms);
  }

  function updateAlarm(alarmId, partial) {
    const alarms = read(KEYS.ALARMS, []);
    const idx    = alarms.findIndex(a => a.alarm_id === alarmId);
    if (idx === -1) return false;
    alarms[idx] = { ...alarms[idx], ...partial };
    return write(KEYS.ALARMS, alarms);
  }

  // ─────────────────────────────────────────────────────────────
  //  ANALYTICS HELPERS  (used by dashboard to build charts)
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns daily session duration for the last N days.
   * Used for the bar chart.
   * Returns array of { date, duration_min, session_count }
   */
  function getDailyDurations(days = 30) {
    const result = [];
    const sessions = read(KEYS.SESSION_HISTORY, []);
    for (let i = days - 1; i >= 0; i--) {
      const d    = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.getFullYear() + "-" +
                      String(d.getMonth()+1).padStart(2,"0") + "-" +
                      String(d.getDate()).padStart(2,"0");
      const daySessions = sessions.filter(s => s.date === dateStr);
      result.push({
        date          : dateStr,
        duration_min  : Math.round(daySessions.reduce((a, s) => a + s.total_duration_sec, 0) / 60),
        session_count : daySessions.length,
      });
    }
    return result;
  }

  /**
   * Returns average cadence per session for last N sessions.
   * Used for the cadence trend line chart.
   * Returns array of { date, avg_cadence, session_id }
   */
  function getCadenceTrend(limit = 30) {
    return read(KEYS.SESSION_HISTORY, [])
      .slice(0, limit)
      .reverse()
      .map(s => ({
        date        : s.date,
        avg_cadence : Math.round((s.starting_cadence + s.ending_cadence) / 2),
        session_id  : s.session_id,
        sub_mode    : s.sub_mode,
      }));
  }

  /**
   * Returns mode usage counts for the donut chart.
   * Returns array of { mode_key, count, label }
   */
  function getModeUsage() {
    const streaks  = read(KEYS.STREAKS, defaultStreaks());
    const modeMap  = streaks.sessions_per_mode || {};
    const modeLabels = {
      "athletic_regular"        : "Regular Run",
      "athletic_timedRun"       : "Timed Run",
      "athletic_fixedInterval"  : "Fixed Interval",
      "athletic_customSemi"     : "Custom Semi",
      "athletic_customFull"     : "Custom Full",
      "athletic_cadenceRamp"    : "Cadence Ramp",
      "music_regular"           : "Music Regular",
      "music_practiceRamp"      : "Practice Ramp",
      "music_countdownRamp"     : "Countdown Ramp",
      "music_polyRhythm"        : "Poly Rhythm",
      "music_loopFermata"       : "Loop Fermata",
      "music_timedRun"          : "Music Timed",
    };
    return Object.entries(modeMap).map(([key, count]) => ({
      mode_key : key,
      count    : count,
      label    : modeLabels[key] || key,
    })).sort((a, b) => b.count - a.count);
  }

  /**
   * Returns total steps per day for the last N days.
   * Returns array of { date, steps }
   */
  function getDailySteps(days = 30) {
    const result   = [];
    const sessions = read(KEYS.SESSION_HISTORY, []);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.getFullYear() + "-" +
                      String(d.getMonth()+1).padStart(2,"0") + "-" +
                      String(d.getDate()).padStart(2,"0");
      const steps = sessions
        .filter(s => s.date === dateStr && s.app_mode === "athletic")
        .reduce((a, s) => a + (s.total_steps || 0), 0);
      result.push({ date: dateStr, steps });
    }
    return result;
  }

  /**
   * Returns a quick overview summary object.
   * Used for the dashboard home card.
   */
  function getOverview() {
    const streaks  = read(KEYS.STREAKS, defaultStreaks());
    const pb       = read(KEYS.PERSONAL_BESTS, defaultPersonalBests());
    const history  = read(KEYS.SESSION_HISTORY, []);
    const achProg  = getAchievementProgress();
    const modeUsage= getModeUsage();

    const totalHours = Math.floor(streaks.total_practice_minutes / 60);
    const totalMins  = streaks.total_practice_minutes % 60;

    return {
      user_name            : getUserName(),
      current_streak       : isStreakAlive() ? streaks.current_streak_days : 0,
      longest_streak       : streaks.longest_streak_days,
      total_sessions       : streaks.total_sessions_all_time,
      total_practice_time  : `${totalHours}h ${totalMins}m`,
      total_practice_min   : streaks.total_practice_minutes,
      achievements_unlocked: achProg.unlocked,
      achievements_total   : achProg.total,
      achievements_percent : achProg.percent,
      most_used_mode       : modeUsage[0]?.label || "—",
      personal_bests       : pb,
      last_session         : history[0] || null,
      streak_alive         : isStreakAlive(),
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  EXPORT / IMPORT  (offline data backup)
  // ─────────────────────────────────────────────────────────────

  /**
   * Export all app data as a JSON string.
   * Triggers a file download in the browser.
   */
  function exportData() {
    const data = {
      exported_at    : new Date().toISOString(),
      app_version    : CURRENT_VERSION,
      user_name      : getUserName(),
      default_mode   : getDefaultMode(),
      settings       : getSettings(),
      session_history: getHistory(),
      streaks        : getStreaks(),
      personal_bests : getPersonalBests(),
      achievements   : getUnlockedAchievements(),
      alarms         : getAlarms(),
    };

    const json     = JSON.stringify(data, null, 2);
    const blob     = new Blob([json], { type: "application/json" });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement("a");
    const dateStr  = todayStr();
    a.href         = url;
    a.download     = `metronome_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("[MetStorage] Data exported.");
    return true;
  }

  /**
   * Import data from a JSON backup file.
   * Pass the File object from an <input type="file"> element.
   * Returns a Promise that resolves with { success, message }.
   *
   * Usage:
   *   fileInput.addEventListener("change", async (e) => {
   *     const result = await MetStorage.importData(e.target.files[0]);
   *     alert(result.message);
   *   });
   */
  function importData(file) {
    return new Promise((resolve) => {
      if (!file) {
        resolve({ success: false, message: "No file selected." });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);

          // Basic validation
          if (!data.app_version || !data.session_history) {
            resolve({ success: false, message: "Invalid backup file." });
            return;
          }

          // Restore all data
          if (data.user_name)       write(KEYS.USER_NAME,        data.user_name);
          if (data.default_mode !== undefined) write(KEYS.DEFAULT_MODE, data.default_mode);
          if (data.settings)        write(KEYS.SETTINGS,         data.settings);
          if (data.session_history) write(KEYS.SESSION_HISTORY,  data.session_history);
          if (data.streaks)         write(KEYS.STREAKS,          data.streaks);
          if (data.personal_bests)  write(KEYS.PERSONAL_BESTS,   data.personal_bests);
          if (data.achievements)    write(KEYS.ACHIEVEMENTS,     data.achievements);
          if (data.alarms)          write(KEYS.ALARMS,           data.alarms);

          const sessionCount = data.session_history?.length || 0;
          console.log("[MetStorage] Import successful. Sessions:", sessionCount);
          resolve({
            success : true,
            message : `Import successful! ${sessionCount} sessions restored.`,
          });
        } catch (err) {
          console.error("[MetStorage] Import error:", err);
          resolve({ success: false, message: "Failed to parse backup file." });
        }
      };
      reader.onerror = () => resolve({ success: false, message: "Could not read file." });
      reader.readAsText(file);
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  CLEAR DATA
  // ─────────────────────────────────────────────────────────────

  /**
   * Clear only session history (keep settings, achievements etc).
   */
  function clearHistory() {
    write(KEYS.SESSION_HISTORY, []);
    console.log("[MetStorage] History cleared.");
  }

  /**
   * Full factory reset — wipes everything.
   */
  function clearAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    init(); // re-initialise with defaults
    console.log("[MetStorage] All data cleared.");
  }

  /**
   * Get total localStorage usage in KB (approximate).
   */
  function getStorageUsageKB() {
    let total = 0;
    Object.values(KEYS).forEach(k => {
      const item = localStorage.getItem(k);
      if (item) total += item.length;
    });
    return Math.round(total / 1024 * 10) / 10;
  }

  // ─────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────────────────────
  return {
    // Init
    init,

    // App / User
    getUserName,
    setUserName,
    getDefaultMode,
    setDefaultMode,
    isOnboardingDone,
    setOnboardingDone,
    getNotifPermission,
    setNotifPermission,

    // Settings
    getSettings,
    updateSettings,
    getSetting,

    // Sessions
    saveSession,
    updateSessionNotes,
    deleteSession,
    getHistory,
    getFilteredHistory,
    getRecentSessions,
    getSession,

    // Streaks
    getStreaks,
    isStreakAlive,
    getActivityMap,

    // Personal Bests
    getPersonalBests,

    // Achievements
    getAchievements,
    getUnlockedAchievements,
    getAchievementProgress,

    // Alarms
    addAlarm,
    getAlarms,
    getActiveAlarms,
    getUpcomingAlarms,
    toggleAlarm,
    deleteAlarm,
    updateAlarm,

    // Analytics (for dashboard charts)
    getDailyDurations,
    getCadenceTrend,
    getModeUsage,
    getDailySteps,
    getOverview,

    // Export / Import
    exportData,
    importData,

    // Maintenance
    clearHistory,
    clearAll,
    getStorageUsageKB,

    // Expose definitions (for dashboard to render achievement list)
    ACHIEVEMENT_DEFS,
  };

})();

// Auto-initialise as soon as the script loads
MetStorage.init();