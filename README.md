# BeatStride — Metronome & Cadence Trainer

**BEAT YOUR RHYTHM · STRIDE YOUR PACE**

BeatStride is a dual-mode Android app combining a professional music metronome with an athletic cadence trainer — built for musicians and runners who want precision without paying for premium apps.

Built with [Capacitor](https://capacitorjs.com/), vanilla JavaScript, and a native Kotlin plugin for sample-accurate timing.

---

## ✨ Features

### 🎵 Music Metronome
- 5 practice modes: Regular, Practice Ramp, Countdown Ramp, Poly Rhythm, Loop with Fermata
- 18 instrument sounds, synthesized in real time via Web Audio API (zero audio file assets)
- Subdivisions (quarter/eighth/triplet/sixteenth notes), accent patterns, tap tempo
- Sample-accurate beat counter driven by the AudioContext clock

### 🏃 Athletic Metronome
- 6 training modes: Regular, Timed Run, Fixed Interval, Custom Semi, Custom Full, Cadence Ramp
- Interval training with automatic rest periods and set transitions
- Cadence ramp-up/ramp-down for progressive speed training
- Native Kotlin plugin (`BeatStrideMetronomePlugin.kt`) for phantom-beat-free Loop Fermata timing

### 📊 Dashboard
- Session history, streaks, activity heatmap, mode usage breakdown
- Achievement badges, personal bests, and a personal reflections journal

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| UI | HTML / CSS / vanilla JavaScript |
| Audio engine | Web Audio API (synthesized, no audio files) |
| Native bridge | Capacitor |
| Native timing | Kotlin (HandlerThread + SystemClock) |
| Storage | localStorage (on-device, no backend) |

---

## 📦 Project Structure

```
├── index.html                       # Mode selector landing page
├── athleticMetronome.html           # Athletic metronome UI + logic
├── musicMetronome.html              # Music metronome UI + logic
├── metronomeItem.html               # Mode picker (orbital card UI)
├── dashboard.html                   # Analytics, history, achievements
├── metronome-engine.js              # Core Web Audio scheduling engine
├── storage.js                       # localStorage data layer
├── onboarding.js                    # First-run tour
├── BeatStrideMetronomePlugin.kt     # Native Android timing plugin
└── MainActivity.java                # Capacitor entry point
```

---

## 🚀 Building Locally

```bash
npm install
npx cap sync android
```

Open the `android/` folder in Android Studio and run on a device or emulator.

---

## 📱 Download

Coming soon to Google Play.

---

## 📄 License

All rights reserved — © Phoenix Studio, 2026.