let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (!audioCtx) {
    const AudioCtxConstructor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxConstructor) audioCtx = new AudioCtxConstructor();
  }
  return audioCtx;
}

/**
 * A short 880 Hz beep for a new website order or booking. Browsers keep audio suspended until the
 * page has had a click, so the first alert after a fresh load may stay silent; errors are ignored.
 */
export function playAlertBeep(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(1, ctx.currentTime + 0.15);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // Ignore audio errors
  }
}
