// Module-level AudioContext singleton — must be created/resumed within a user gesture.
// Call unlockAudio() synchronously on a button click to unlock autoplay for the tab.

let _ctx: AudioContext | null = null;

export function unlockAudio() {
  if (typeof window === 'undefined') return;
  try {
    if (!_ctx) _ctx = new AudioContext();
    if (_ctx.state === 'suspended') _ctx.resume();
  } catch {}
}

export function getAudioContext(): AudioContext | null {
  return _ctx;
}
