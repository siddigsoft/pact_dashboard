import { useEffect, useRef, useCallback } from 'react';

type SoundType = 'ringback' | 'ringtone' | 'connected' | 'ended';

class CallSoundManager {
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private ringInterval: NodeJS.Timeout | null = null;
  private isPlaying = false;

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  private playTone(frequency: number, duration: number, volume: number = 0.3): void {
    const ctx = this.getAudioContext();
    
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gainNode.gain.value = volume;
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  }

  playRingback(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    
    const playRingbackSequence = () => {
      this.playTone(440, 0.4, 0.2);
      setTimeout(() => {
        if (this.isPlaying) {
          this.playTone(440, 0.4, 0.2);
        }
      }, 500);
    };
    
    playRingbackSequence();
    this.ringInterval = setInterval(playRingbackSequence, 3000);
  }

  playRingtone(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    
    const playRingtoneSequence = () => {
      const frequencies = [784, 659, 784, 659];
      frequencies.forEach((freq, i) => {
        setTimeout(() => {
          if (this.isPlaying) {
            this.playTone(freq, 0.15, 0.25);
          }
        }, i * 200);
      });
    };
    
    playRingtoneSequence();
    this.ringInterval = setInterval(playRingtoneSequence, 1500);
  }

  playConnected(): void {
    this.stop();
    this.playTone(523, 0.1, 0.15);
    setTimeout(() => this.playTone(659, 0.1, 0.15), 120);
    setTimeout(() => this.playTone(784, 0.15, 0.15), 240);
  }

  playEnded(): void {
    this.stop();
    this.playTone(392, 0.15, 0.15);
    setTimeout(() => this.playTone(330, 0.15, 0.15), 180);
    setTimeout(() => this.playTone(262, 0.2, 0.15), 360);
  }

  stop(): void {
    this.isPlaying = false;
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    if (this.oscillator) {
      try {
        this.oscillator.stop();
      } catch (e) {}
      this.oscillator = null;
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
      if (callStatus === 'idle' || callStatus === 'ended') {
        soundManager.stop();
      }
    };
  }, [callStatus]);

  const stopSounds = useCallback(() => {
    soundManager.stop();
  }, []);

  return { stopSounds };
}

export default useCallSounds;
