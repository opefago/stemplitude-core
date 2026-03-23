/**
 * Synthesised sound effects for the Lab Assistant Panel.
 * Uses the Web Audio API — no audio files required.
 *
 * All functions are fire-and-forget and silently no-op if the browser
 * does not support AudioContext or if the user has muted lab sounds.
 */

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!_ctx || _ctx.state === "closed") {
      _ctx = new AudioContext();
    }
    // Browsers suspend AudioContext until a user gesture — resume lazily.
    if (_ctx.state === "suspended") {
      void _ctx.resume();
    }
    return _ctx;
  } catch {
    return null;
  }
}

/** Play a single sine-wave tone with a smooth attack/release envelope. */
function playTone(
  frequency: number,
  startTime: number,
  duration: number,
  gain: number,
  ctx: AudioContext,
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, startTime);

  const attack = 0.008;
  const release = duration * 0.5;

  env.gain.setValueAtTime(0, startTime);
  env.gain.linearRampToValueAtTime(gain, startTime + attack);
  env.gain.setValueAtTime(gain, startTime + duration - release);
  env.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.connect(env);
  env.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

// ─── Public sound effects ────────────────────────────────────────────────────

/**
 * Soft two-note ascending chime — played when a student joins the session.
 * Notes: C5 (523 Hz) → E5 (659 Hz)
 */
export function playJoinSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(523, t, 0.18, 0.18, ctx);        // C5
  playTone(659, t + 0.14, 0.22, 0.15, ctx); // E5
}

/**
 * Three short urgent pulses — played when a student requests help.
 * Pitch: A5 (880 Hz)
 */
export function playHelpSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    playTone(880, t + i * 0.17, 0.12, 0.22, ctx);
  }
}

/**
 * Single soft ping — played when a chat message arrives from someone else.
 * Pitch: E5 (659 Hz), very brief.
 */
export function playChatSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(659, t, 0.14, 0.12, ctx);
}

/**
 * Exciting award fanfare — played for all students when recognition is given.
 *
 * • points_awarded : bright 4-note ascending arpeggio  (C5→E5→G5→C6)
 * • high_five      : snappy double-ping whoosh          (E5→A5)
 * • callout        : short triumphant fanfare            (G4→C5→E5→G5 with hold)
 */
export function playAwardSound(
  eventType: "points_awarded" | "high_five" | "callout",
): void {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;

  if (eventType === "points_awarded") {
    // Bright ascending coin arpeggio
    playTone(523,  t,        0.12, 0.20, ctx); // C5
    playTone(659,  t + 0.09, 0.12, 0.18, ctx); // E5
    playTone(784,  t + 0.18, 0.12, 0.18, ctx); // G5
    playTone(1047, t + 0.27, 0.22, 0.24, ctx); // C6
  } else if (eventType === "high_five") {
    // Quick punchy double ping
    playTone(659, t,        0.08, 0.22, ctx); // E5
    playTone(880, t + 0.07, 0.15, 0.24, ctx); // A5
  } else {
    // Triumphant callout fanfare
    playTone(392, t,        0.15, 0.18, ctx); // G4
    playTone(523, t + 0.13, 0.15, 0.18, ctx); // C5
    playTone(659, t + 0.26, 0.15, 0.18, ctx); // E5
    playTone(784, t + 0.39, 0.30, 0.22, ctx); // G5 (held)
  }
}
