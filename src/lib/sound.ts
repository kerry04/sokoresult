// Lightweight Web Audio synth for celebration sounds. No assets to download.
// Honors a global enabled flag set from the auth context.

let _enabled = true;
let _ctx: AudioContext | null = null;

export function setSoundEnabled(v: boolean) {
  _enabled = v;
}

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    try {
      const Ctor = (window.AudioContext ?? (window as any).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (!Ctor) return null;
      _ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return _ctx;
}

function reducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function tone(freq: number, start: number, dur: number, gain = 0.15, type: OscillatorType = "sine") {
  const ac = ctx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  g.gain.setValueAtTime(0, ac.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ac.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.05);
}

export function playChaChing() {
  if (!_enabled || reducedMotion()) return;
  // Quick two-note chime
  tone(1320, 0, 0.18, 0.18, "triangle");
  tone(1760, 0.08, 0.22, 0.16, "triangle");
  tone(2640, 0.18, 0.25, 0.1, "sine");
}

export function playLevelUp() {
  if (!_enabled || reducedMotion()) return;
  // Ascending arpeggio
  tone(523, 0, 0.12, 0.18, "square");
  tone(659, 0.1, 0.12, 0.18, "square");
  tone(784, 0.2, 0.12, 0.18, "square");
  tone(1046, 0.3, 0.32, 0.2, "triangle");
}

export function playWhoosh() {
  if (!_enabled || reducedMotion()) return;
  tone(220, 0, 0.18, 0.08, "sawtooth");
}

/** Softer cash-out chime — used on successful SELL. */
export function playCashOut() {
  if (!_enabled || reducedMotion()) return;
  tone(880, 0, 0.16, 0.14, "sine");
  tone(660, 0.1, 0.22, 0.12, "sine");
}

/** Slot-machine jackpot — used when a held position resolves in the user's favor. */
export function playJackpot() {
  if (!_enabled || reducedMotion()) return;
  // Rapid ascending arpeggio
  tone(523, 0.0, 0.09, 0.16, "square");
  tone(659, 0.07, 0.09, 0.16, "square");
  tone(784, 0.14, 0.09, 0.16, "square");
  tone(1046, 0.21, 0.09, 0.16, "square");
  tone(1318, 0.28, 0.09, 0.16, "square");
  // Bright top chime
  tone(1760, 0.36, 0.4, 0.18, "triangle");
  tone(2640, 0.42, 0.45, 0.12, "sine");
  // Bell tail
  tone(1320, 0.55, 0.5, 0.1, "triangle");
}
