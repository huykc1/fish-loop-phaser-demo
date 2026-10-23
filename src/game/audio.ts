/**
 * Âm thanh tổng hợp bằng WebAudio (không cần file, rất nhẹ).
 * Giai đoạn asset có thể thay bằng file .ogg/.mp3 qua cùng API play(name).
 */
type SfxName = 'tap' | 'release' | 'absorb' | 'complete' | 'win' | 'lose' | 'deny' | 'booster';

class Sfx {
  private ctx: AudioContext | null = null;
  enabled = true;

  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slide = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  play(name: SfxName) {
    switch (name) {
      case 'tap':
        return this.tone(520, 0.08, 'sine', 0.15, 0, 200);
      case 'release':
        return this.tone(380, 0.18, 'triangle', 0.15, 0, 400);
      case 'absorb':
        return this.tone(700 + Math.random() * 200, 0.1, 'sine', 0.12, 0, 300);
      case 'complete':
        [660, 830, 990].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.16, i * 0.07));
        return;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.18, i * 0.11));
        return;
      case 'lose':
        [400, 320, 240].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.08, i * 0.14));
        return;
      case 'deny':
        return this.tone(160, 0.15, 'square', 0.06);
      case 'booster':
        return this.tone(600, 0.25, 'sine', 0.15, 0, 900);
    }
  }
}

export const sfx = new Sfx();
