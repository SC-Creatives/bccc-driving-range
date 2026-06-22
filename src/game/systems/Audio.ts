import { Howl, Howler } from 'howler';

/**
 * Audio — a procedural WebAudio SFX engine (synthesized, no asset files needed)
 * plus drop-in slots for a real ambient bed and announcer VO via Howler.
 *
 * SFX (blip/click/swing/thwack/bounce/chime/thud) are synthesized live, so they
 * work with zero assets. The country-club ambient loop and the deadpan announcer
 * VO need real audio files — drop them in public/assets/audio/ and they activate
 * automatically (probed on unlock; silently skipped if absent). All audio respects
 * the master Sound toggle and is autoplay-safe (created on first user gesture).
 */
const VO_SLUG: Record<string, string> = {
  'Shanked It': 'shanked',
  'Worm Burner': 'wormburner',
  'On the Short Grass': 'shortgrass',
  Respectable: 'respectable',
  'Now That’s Clubhouse Talk': 'clubhouse',
  'Absolute Cannon': 'cannon',
  'PURE — Flushed It': 'pure',
};

export class Audio {
  soundOn = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  private ambient: Howl | null = null;
  private vo = new Map<string, Howl>();
  private sfxClips = new Map<string, Howl>(); // crowd reactions (clap/cheer)
  private extrasProbed = false;
  private gestureHooked = false;

  private base = import.meta.env.BASE_URL;

  /** Create/resume the context on a user gesture. */
  unlock(): void {
    try {
      // iOS: route ALL web audio through the "playback" session so synthesized
      // SFX (Web Audio) aren't muted by the hardware ring/silent switch — the
      // reason intro <video> had sound but gameplay SFX didn't. (Safari 16.4+)
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
      if (!this.ctx) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.soundOn ? 1 : 0;
        this.master.connect(this.ctx.destination);
        // short noise buffer for thwack/whoosh
        const n = Math.floor(this.ctx.sampleRate * 0.5);
        this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      this.resumeCtx();
      this.hookGestures();
      this.probeExtras();
    } catch {
      /* no-op */
    }
  }

  /** Resume whenever NOT running. iOS uses a 'suspended' AND an 'interrupted'
   *  state — the latter happens after an <video>/media plays (our intro clips),
   *  and a 'suspended'-only check would leave SFX silent in gameplay. */
  private resumeCtx(): void {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
    // nudge Howler's separate context (ambient bed + VO) too
    const hctx = Howler.ctx as (AudioContext | undefined);
    if (hctx && hctx.state !== 'running') void hctx.resume();
  }

  /** Belt-and-suspenders: any later tap (and tab refocus) re-resumes the context,
   *  so iOS can't strand us muted after the intro video or a backgrounding. */
  private hookGestures(): void {
    if (this.gestureHooked) return;
    this.gestureHooked = true;
    const wake = (): void => this.resumeCtx();
    for (const ev of ['pointerdown', 'touchend', 'click'] as const) {
      window.addEventListener(ev, wake, { passive: true, capture: true });
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  }

  /** Force sound ON from a user gesture (e.g. the intro tap-to-start gate). */
  enable(): void {
    if (this.soundOn) return;
    this.soundOn = true;
    this.unlock();
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(1, this.ctx.currentTime, 0.02);
    Howler.mute(false);
    this.startAmbient();
  }

  toggle(): boolean {
    this.soundOn = !this.soundOn;
    if (this.soundOn) this.unlock();
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.soundOn ? 1 : 0, this.ctx.currentTime, 0.02);
    }
    Howler.mute(!this.soundOn);
    if (this.soundOn) {
      this.startAmbient();
      this.click();
    } else {
      this.ambient?.pause();
    }
    return this.soundOn;
  }

  // ---------------- synthesized SFX ----------------
  private t(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** One oscillator note with an exp decay; optional pitch sweep. */
  private osc(freq: number, dur: number, type: OscillatorType, vol: number, sweepTo?: number): void {
    if (!this.soundOn || !this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.t();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Filtered noise burst (for impact crack / whoosh / grass). */
  private burst(dur: number, filter: BiquadFilterType, freq: number, q: number, vol: number, sweepTo?: number): void {
    if (!this.soundOn || !this.ctx || !this.master || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = filter;
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = this.ctx.createGain();
    const t = this.t();
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  blip(): void {
    this.osc(440, 0.06, 'sine', 0.05);
  } // UI select
  click(): void {
    this.osc(620, 0.05, 'square', 0.04);
    this.osc(320, 0.04, 'square', 0.03);
  } // lock
  swing(): void {
    this.burst(0.34, 'bandpass', 600, 0.8, 0.05, 1700);
  } // club whoosh up
  thwack(power = 1): void {
    const v = 0.08 + 0.06 * power;
    this.burst(0.05, 'highpass', 1800, 0.5, v); // crack
    this.osc(150, 0.18, 'sine', v * 1.4, 60); // low thump
  }
  bounce(): void {
    this.burst(0.12, 'lowpass', 900, 1, 0.05, 300); // soft grass
  }
  chime(): void {
    // bright pin chime (300+)
    this.osc(1320, 0.5, 'sine', 0.06);
    this.osc(1980, 0.5, 'sine', 0.035);
    this.osc(2640, 0.4, 'sine', 0.02);
  }
  thud(): void {
    this.osc(180, 0.16, 'sine', 0.05, 110);
  }

  // ---------------- ambient + VO (drop-in files) ----------------
  private probeExtras(): void {
    if (this.extrasProbed) return;
    this.extrasProbed = true;
    // ambient bed
    void this.exists(`${this.base}assets/audio/ambient-loop.mp3`).then((ok) => {
      if (!ok) return;
      this.ambient = new Howl({ src: [`${this.base}assets/audio/ambient-loop.mp3`], loop: true, volume: 0.25 });
      if (this.soundOn) this.startAmbient();
    });
    // announcer VO clips
    for (const slug of new Set(Object.values(VO_SLUG))) {
      void this.exists(`${this.base}assets/audio/vo/${slug}.mp3`).then((ok) => {
        if (ok) this.vo.set(slug, new Howl({ src: [`${this.base}assets/audio/vo/${slug}.mp3`], volume: 0.55 }));
      });
    }
    // crowd reactions: polite golf clap (300+) and full cheer (340+)
    for (const s of ['clap', 'cheer'] as const) {
      void this.exists(`${this.base}assets/audio/sfx/${s}.mp3`).then((ok) => {
        if (ok) this.sfxClips.set(s, new Howl({ src: [`${this.base}assets/audio/sfx/${s}.mp3`], volume: s === 'clap' ? 0.6 : 0.75 }));
      });
    }
  }

  /** Polite gallery applause (drives at the membership threshold). */
  clap(): void {
    if (this.soundOn) this.sfxClips.get('clap')?.play();
  }

  /** Full crowd roar (the big bombs). */
  cheer(): void {
    if (this.soundOn) this.sfxClips.get('cheer')?.play();
  }

  private async exists(url: string): Promise<boolean> {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      return r.ok && (r.headers.get('content-type') ?? '').includes('audio');
    } catch {
      return false;
    }
  }

  private startAmbient(): void {
    if (this.ambient && !this.ambient.playing()) this.ambient.play();
  }

  /** Play the announcer line for a grade bucket, if its VO clip exists. */
  playVo(grade: string): void {
    if (!this.soundOn) return;
    const slug = VO_SLUG[grade];
    const clip = slug && this.vo.get(slug);
    if (clip) clip.play();
  }
}
