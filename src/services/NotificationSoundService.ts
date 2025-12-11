type SoundType = 
  | 'ringtone' 
  | 'ringback' 
  | 'call-connected' 
  | 'call-ended'
  | 'message' 
  | 'notification' 
  | 'success' 
  | 'error' 
  | 'warning'
  | 'sos';

interface SoundSettings {
  enabled: boolean;
  volume: number;
}

class NotificationSoundService {
  private audioContext: AudioContext | null = null;
  private activeIntervals: Map<string, NodeJS.Timeout> = new Map();
  private settings: SoundSettings = {
    enabled: true,
    volume: 0.5
  };
  private isUnlocked: boolean = false;
  private unlockAttempted: boolean = false;

  constructor() {
    this.loadSettings();
    this.setupMobileUnlock();
  }

  private loadSettings(): void {
    try {
      const stored = localStorage.getItem('pact_sound_settings');
      if (stored) {
        this.settings = { ...this.settings, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('[Sound] Failed to load settings:', e);
    }
  }

  private setupMobileUnlock(): void {
    if (typeof window === 'undefined') return;

    const unlockAudio = () => {
      if (this.isUnlocked) return;
      
      try {
        const ctx = this.getAudioContext();
        
        if (ctx.state === 'suspended') {
          ctx.resume().then(() => {
            this.isUnlocked = true;
            console.log('[Sound] AudioContext unlocked for mobile');
          }).catch(e => {
            console.warn('[Sound] Failed to unlock AudioContext:', e);
          });
        } else {
          this.isUnlocked = true;
        }

        // Play a silent buffer to fully unlock on iOS
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch (e) {
        console.warn('[Sound] Mobile unlock failed:', e);
      }
    };

    // Listen for first user interaction to unlock audio
    const events = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
    
    const handleInteraction = () => {
      if (!this.unlockAttempted) {
        this.unlockAttempted = true;
        unlockAudio();
        // Remove listeners after first successful unlock attempt
        events.forEach(event => {
          document.removeEventListener(event, handleInteraction, true);
        });
      }
    };

    events.forEach(event => {
      document.addEventListener(event, handleInteraction, true);
    });
  }

  updateSettings(settings: Partial<SoundSettings>): void {
    this.settings = { ...this.settings, ...settings };
    try {
      localStorage.setItem('pact_sound_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('[Sound] Failed to save settings:', e);
    }
  }

  getSettings(): SoundSettings {
    return { ...this.settings };
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  private playTone(frequency: number, duration: number, volume?: number, type: OscillatorType = 'sine'): void {
    if (!this.settings.enabled) return;
    
    const effectiveVolume = (volume ?? 0.3) * this.settings.volume;
    
    try {
      const ctx = this.getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = type;
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(effectiveVolume, ctx.currentTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration + 0.05);
    } catch (e) {
      console.warn('[Sound] Playback failed:', e);
    }
  }

  private playDualTone(freq1: number, freq2: number, duration: number, volume?: number): void {
    if (!this.settings.enabled) return;
    
    const effectiveVolume = (volume ?? 0.15) * this.settings.volume;
    
    try {
      const ctx = this.getAudioContext();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc1.frequency.value = freq1;
      osc2.frequency.value = freq2;
      osc1.type = 'sine';
      osc2.type = 'sine';
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(effectiveVolume, ctx.currentTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      
      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + duration + 0.05);
      osc2.stop(ctx.currentTime + duration + 0.05);
    } catch (e) {
      console.warn('[Sound] Playback failed:', e);
    }
  }

  private playChord(frequencies: number[], duration: number, volume?: number): void {
    if (!this.settings.enabled) return;
    
    const effectiveVolume = (volume ?? 0.1) * this.settings.volume;
    
    try {
      const ctx = this.getAudioContext();
      const gainNode = ctx.createGain();
      gainNode.connect(ctx.destination);
      
      const oscillators = frequencies.map(freq => {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        osc.type = 'sine';
        osc.connect(gainNode);
        return osc;
      });
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(effectiveVolume, ctx.currentTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      
      oscillators.forEach(osc => {
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration + 0.05);
      });
    } catch (e) {
      console.warn('[Sound] Playback failed:', e);
    }
  }

  playRingtone(): void {
    if (!this.settings.enabled) return;
    
    this.stop('ringtone');
    
    const playSequence = () => {
      const melody = [
        { freq: 880, delay: 0 },
        { freq: 988, delay: 100 },
        { freq: 1047, delay: 200 },
        { freq: 988, delay: 350 },
        { freq: 880, delay: 500 },
        { freq: 784, delay: 650 },
        { freq: 880, delay: 800 },
      ];
      
      melody.forEach(({ freq, delay }) => {
        setTimeout(() => {
          if (this.activeIntervals.has('ringtone')) {
            this.playTone(freq, 0.1, 0.25, 'sine');
          }
        }, delay);
      });
    };
    
    playSequence();
    const interval = setInterval(playSequence, 1500);
    this.activeIntervals.set('ringtone', interval);
  }

  playRingback(): void {
    if (!this.settings.enabled) return;
    
    this.stop('ringback');
    
    const playSequence = () => {
      this.playDualTone(440, 480, 1.0, 0.12);
    };
    
    playSequence();
    const interval = setInterval(playSequence, 4000);
    this.activeIntervals.set('ringback', interval);
  }

  playCallConnected(): void {
    if (!this.settings.enabled) return;
    
    this.stopAll();
    this.playTone(523, 0.08, 0.2);
    setTimeout(() => this.playTone(659, 0.08, 0.2), 100);
    setTimeout(() => this.playTone(784, 0.15, 0.25), 200);
  }

  playCallEnded(): void {
    if (!this.settings.enabled) return;
    
    this.stopAll();
    this.playDualTone(480, 620, 0.5, 0.1);
  }

  playMessage(): void {
    if (!this.settings.enabled) return;
    
    this.playTone(880, 0.08, 0.2);
    setTimeout(() => this.playTone(1175, 0.12, 0.25), 100);
  }

  playNotification(): void {
    if (!this.settings.enabled) return;
    
    this.playChord([523, 659, 784], 0.2, 0.15);
  }

  playSuccess(): void {
    if (!this.settings.enabled) return;
    
    this.playTone(523, 0.1, 0.15);
    setTimeout(() => this.playTone(659, 0.1, 0.15), 100);
    setTimeout(() => this.playTone(784, 0.15, 0.2), 200);
  }

  playError(): void {
    if (!this.settings.enabled) return;
    
    this.playDualTone(200, 250, 0.3, 0.2);
  }

  playWarning(): void {
    if (!this.settings.enabled) return;
    
    this.playTone(440, 0.15, 0.2);
    setTimeout(() => this.playTone(440, 0.15, 0.2), 200);
  }

  playSOS(): void {
    if (!this.settings.enabled) return;
    
    this.stop('sos');
    
    const playSequence = () => {
      const pattern = [
        { freq: 880, delay: 0, duration: 0.1 },
        { freq: 880, delay: 150, duration: 0.1 },
        { freq: 880, delay: 300, duration: 0.1 },
        { freq: 660, delay: 500, duration: 0.3 },
        { freq: 660, delay: 850, duration: 0.3 },
        { freq: 660, delay: 1200, duration: 0.3 },
        { freq: 880, delay: 1600, duration: 0.1 },
        { freq: 880, delay: 1750, duration: 0.1 },
        { freq: 880, delay: 1900, duration: 0.1 },
      ];
      
      pattern.forEach(({ freq, delay, duration }) => {
        setTimeout(() => {
          if (this.activeIntervals.has('sos')) {
            this.playTone(freq, duration, 0.3, 'square');
          }
        }, delay);
      });
    };
    
    playSequence();
    const interval = setInterval(playSequence, 2500);
    this.activeIntervals.set('sos', interval);
  }

  play(type: SoundType): void {
    switch (type) {
      case 'ringtone':
        this.playRingtone();
        break;
      case 'ringback':
        this.playRingback();
        break;
      case 'call-connected':
        this.playCallConnected();
        break;
      case 'call-ended':
        this.playCallEnded();
        break;
      case 'message':
        this.playMessage();
        break;
      case 'notification':
        this.playNotification();
        break;
      case 'success':
        this.playSuccess();
        break;
      case 'error':
        this.playError();
        break;
      case 'warning':
        this.playWarning();
        break;
      case 'sos':
        this.playSOS();
        break;
    }
  }

  stop(key?: string): void {
    if (key) {
      const interval = this.activeIntervals.get(key);
      if (interval) {
        clearInterval(interval);
        this.activeIntervals.delete(key);
      }
    }
  }

  stopAll(): void {
    this.activeIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.activeIntervals.clear();
  }
}

export const notificationSoundService = new NotificationSoundService();
export default notificationSoundService;
