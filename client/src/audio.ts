import { MAP_MUSIC } from './map-music';

type MusicState = 'idle' | 'starting' | 'playing' | 'failed';

function readPreference(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function savePreference(key: string, enabled: boolean) {
  try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { /* Current controls still work without storage. */ }
}

/** Game audio begins after a player gesture. Map music and synthesized cues are independent. */
export class GameAudio {
  private context?: AudioContext;
  private media?: HTMLAudioElement;
  private mapId?: string;
  private unlocked = false;
  private disposed = false;
  private attempt = 0;
  private musicState: MusicState = 'idle';
  enabled: boolean;
  private music: boolean;
  onMusicChange?: () => void;

  constructor() {
    this.enabled = readPreference('mojing.sound') !== 'off';
    const savedMusic = readPreference('mojing.music');
    this.music = savedMusic === null ? this.enabled : savedMusic !== 'off';
    if (savedMusic === null) savePreference('mojing.music', this.music);
    document.addEventListener('visibilitychange', this.visibilityChanged);
  }

  get musicEnabled() { return this.music; }

  get musicStatus() {
    const track = this.track;
    if (!this.music) return '地图音乐已关闭';
    if (!track) return '当前地图暂无原版音乐';
    if (!this.unlocked) return '点击游戏后播放地图音乐';
    if (document.visibilityState === 'hidden') return `后台暂停 · ${track.name}`;
    if (this.musicState === 'failed') return '地图音乐播放失败，点击游戏重试';
    if (this.musicState === 'playing') return `正在播放 · ${track.name}`;
    return `正在加载 · ${track.name}`;
  }

  private get track() {
    return this.mapId && Object.hasOwn(MAP_MUSIC, this.mapId) ? MAP_MUSIC[this.mapId] : undefined;
  }

  unlock() {
    if (this.disposed) return;
    const before = this.musicStatus;
    this.unlocked = true;
    if (this.musicState === 'failed' && document.visibilityState !== 'hidden') this.musicState = 'idle';
    this.startMusic();
    if (this.musicStatus !== before) this.onMusicChange?.();
    if (this.enabled) {
      try {
        this.context ??= new AudioContext();
        if (this.context.state !== 'running') void this.context.resume().catch(() => {});
      } catch { /* Optional sound support must not interrupt a game action. */ }
    }
  }

  toggle() {
    if (this.disposed) return;
    this.enabled = !this.enabled;
    savePreference('mojing.sound', this.enabled);
    if (this.enabled) this.unlock();
  }

  toggleMusic() {
    if (this.disposed) return;
    this.music = !this.music;
    savePreference('mojing.music', this.music);
    if (this.music) this.startMusic();
    else this.releaseMusic();
    this.onMusicChange?.();
  }

  setMap(mapId?: string) {
    if (this.disposed || this.mapId === mapId) return;
    this.releaseMusic();
    this.mapId = mapId;
    this.startMusic();
    this.onMusicChange?.();
  }

  private visibilityChanged = () => {
    if (document.visibilityState === 'hidden') {
      if (this.media) {
        this.attempt++;
        this.musicState = 'idle';
        this.media.pause();
      }
    } else this.startMusic();
    this.onMusicChange?.();
  };

  private startMusic() {
    if (this.musicState !== 'idle' || !this.music || !this.unlocked || document.visibilityState === 'hidden') return;
    const track = this.track;
    if (!track) return;
    const attempt = ++this.attempt;
    this.musicState = 'starting';
    try {
      if (!this.media) {
        const media = this.media = new Audio();
        media.loop = true;
        media.volume = .25;
        media.preload = 'none';
        media.addEventListener('error', this.mediaError);
        media.src = track.url;
      }
      const media = this.media;
      void media.play().then(() => {
        if (this.attempt !== attempt) {
          if (this.media !== media || document.visibilityState === 'hidden') media.pause();
          return;
        }
        this.musicState = 'playing';
        this.onMusicChange?.();
      }, () => {
        if (this.attempt === attempt) this.failMusic();
      });
    } catch {
      this.failMusic();
    }
  }

  private mediaError = (event: Event) => {
    if (event.currentTarget === this.media) this.failMusic();
  };

  private failMusic() {
    this.releaseMusic();
    this.musicState = 'failed';
    this.onMusicChange?.();
  }

  private releaseMusic() {
    this.attempt++;
    this.musicState = 'idle';
    const media = this.media;
    this.media = undefined;
    if (!media) return;
    media.removeEventListener('error', this.mediaError);
    media.pause();
    media.removeAttribute('src');
    media.load();
  }

  play(kind: 'hit' | 'heal' | 'level' | 'click' | 'error') {
    const context = this.context;
    if (!this.enabled || !context || context.state !== 'running') return;
    const notes = kind === 'level' ? [523, 659, 784, 1047] : kind === 'heal' ? [660, 880] : kind === 'hit' ? [150, 80] : kind === 'error' ? [160, 120] : [520];
    notes.forEach((frequency, index) => {
      const start = context.currentTime + index * .07;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === 'hit' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(.035, start);
      gain.gain.exponentialRampToValueAtTime(.001, start + .18);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(start); oscillator.stop(start + .2);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.releaseMusic();
    this.mapId = undefined;
    void this.context?.close().catch(() => {});
    this.context = undefined;
    this.onMusicChange = undefined;
  }
}
