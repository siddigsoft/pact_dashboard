import { useEffect, useRef, useCallback } from 'react';

type SoundType = 'ringback' | 'ringtone' | 'connected' | 'ended';

class CallSoundManager {
  private audioContext: AudioContext | null = null;
  private ringInterval: NodeJS.Timeout | null = null;
  private isPlaying = false;

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  private playTone(frequency: number, duration: number, volume: number = 0.3, type: OscillatorType = 'sine'): void {
    try {
      const ctx = this.getAudioContext();
      
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = type;
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration + 0.05);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  }

  private playDualTone(freq1: number, freq2: number, duration: number, volume: number = 0.15): void {
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
      gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      
      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + duration + 0.05);
      osc2.stop(ctx.currentTime + duration + 0.05);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  }

  playRingback(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    
    const playRingbackSequence = () => {
      if (!this.isPlaying) return;
      this.playDualTone(440, 480, 1.0, 0.12);
    };
    
    playRingbackSequence();
    this.ringInterval = setInterval(playRingbackSequence, 4000);
  }

  playRingtone(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    
    const playRingtoneSequence = () => {
      if (!this.isPlaying) return;
      
      const melody = [
        { freq: 880, delay: 0 },
        { freq: 988, delay: 100 },
        { freq: 880, delay: 200 },
        { freq: 784, delay: 350 },
        { freq: 880, delay: 500 },
        { freq: 988, delay: 600 },
      ];
      
      melody.forEach(({ freq, delay }) => {
        setTimeout(() => {
          if (this.isPlaying) {
            this.playTone(freq, 0.08, 0.2, 'sine');
          }
        }, delay);
      });
    };
    
    playRingtoneSequence();
    this.ringInterval = setInterval(playRingtoneSequence, 1200);
  }

  playConnected(): void {
    this.stop();
    this.playTone(523, 0.08, 0.15);
    setTimeout(() => this.playTone(659, 0.08, 0.15), 100);
    setTimeout(() => this.playTone(784, 0.12, 0.18), 200);
  }

  playEnded(): void {
    this.stop();
    this.playDualTone(480, 620, 0.5, 0.1);
  }

  stop(): void {
    this.isPlaying = false;
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }

  play(type: SoundType): void {
    switch (type) {
      case 'ringback':
        this.playRingback();
        break;
      case 'ringtone':
        this.playRingtone();
        break;
      case 'connected':
        this.playConnected();
        break;
      case 'ended':
        this.playEnded();
        break;
    }
  }
}

const soundManager = new CallSoundManager();

export function useCallSounds(callStatus: string) {
  const previousStatus = useRef<string>('idle');

  useEffect(() => {
    if (callStatus === previousStatus.current) return;
    
    const prevStatus = previousStatus.current;
    previousStatus.current = callStatus;

    switch (callStatus) {
      case 'outgoing':
        soundManager.play('ringback');
        break;
      case 'incoming':
        soundManager.play('ringtone');
        break;
      case 'connected':
        soundManager.play('connected');
        break;
      case 'ended':
      case 'idle':
        if (prevStatus === 'connected') {
          soundManager.play('ended');
        } else {
          soundManager.stop();
        }
        break;
      default:
        soundManager.stop();
    }

    return () => {
      soundManager.stop();
    };
  }, [callStatus]);

  const stopSounds = useCallback(() => {
    soundManager.stop();
  }, []);

  return { stopSounds };
}

export default useCallSounds;
