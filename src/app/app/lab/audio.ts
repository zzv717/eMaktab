// 🔊 Laboratoriya ovozlari — protsedural WebAudio (tashqi fayllarsiz!)
// Har bir amal uchun real ovoz: olish, qo'yish, quyish, aralashtirish, ulash, kalit, muvaffaqiyat, ogohlantirish.

export type SoundKind =
  | "click"
  | "pickup"
  | "place"
  | "pour"
  | "mix"
  | "connect"
  | "switch"
  | "success"
  | "warn"
  | "glass";

const VOL_KEY = "emaktab-lab-volume";

class LabAudio {
  private ctx: AudioContext | null = null;
  volume = 0.55;

  constructor() {
    if (typeof window !== "undefined") {
      const v = Number(localStorage.getItem(VOL_KEY));
      if (!Number.isNaN(v) && v >= 0 && v <= 1) this.volume = v;
    }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(VOL_KEY, String(this.volume));
    } catch {
      /* xotira yopiq — o'tib ketamiz */
    }
  }

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  play(kind: SoundKind) {
    const ctx = this.ensure();
    if (!ctx || this.volume <= 0) return;
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = this.volume * 0.5;
    master.connect(ctx.destination);

    const tone = (freq: number, to: number, dur: number, type: OscillatorType, delay = 0, gain = 0.5) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + delay + dur);
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(gain, t + delay + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      o.connect(g).connect(master);
      o.start(t + delay);
      o.stop(t + delay + dur + 0.05);
    };
    const noise = (dur: number, freq: number, q: number, delay = 0, gain = 0.4) => {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(master);
      src.start(t + delay);
    };

    switch (kind) {
      case "click":
        tone(880, 660, 0.06, "sine", 0, 0.35);
        break;
      case "pickup":
        tone(420, 640, 0.09, "sine", 0, 0.4);
        noise(0.05, 1200, 2, 0, 0.12);
        break;
      case "place":
        tone(620, 300, 0.1, "sine", 0, 0.42);
        noise(0.07, 700, 1.5, 0.01, 0.18);
        break;
      case "pour":
        noise(0.4, 950, 1.2, 0, 0.34);
        tone(300, 220, 0.36, "sine", 0.02, 0.12);
        break;
      case "mix":
        noise(0.22, 520, 2.2, 0, 0.26);
        tone(240, 300, 0.2, "triangle", 0, 0.16);
        break;
      case "connect":
        tone(220, 460, 0.07, "square", 0, 0.22);
        tone(330, 560, 0.07, "square", 0.08, 0.2);
        break;
      case "switch":
        tone(140, 90, 0.07, "square", 0, 0.3);
        noise(0.04, 2000, 3, 0, 0.14);
        break;
      case "success":
        tone(523, 523, 0.12, "triangle", 0, 0.34);
        tone(659, 659, 0.12, "triangle", 0.11, 0.34);
        tone(784, 784, 0.18, "triangle", 0.22, 0.36);
        break;
      case "warn":
        tone(240, 110, 0.32, "sawtooth", 0, 0.24);
        tone(240, 110, 0.32, "sawtooth", 0.36, 0.2);
        break;
      case "glass":
        tone(1750, 1300, 0.07, "sine", 0, 0.28);
        noise(0.05, 2600, 4, 0, 0.12);
        break;
    }
  }
}

export const labAudio = new LabAudio();
