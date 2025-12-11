import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, 
  MicOff, 
  Square, 
  Play, 
  Pause, 
  Trash2, 
  Send, 
  X,
  Volume2,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface AudioRecording {
  id: string;
  blob: Blob;
  url: string;
  duration: number;
  timestamp: Date;
}

interface MobileVoiceRecorderProps {
  onRecordingComplete?: (recording: AudioRecording) => void;
  onSend?: (recording: AudioRecording) => void;
  maxDuration?: number;
  showWaveform?: boolean;
  showTimer?: boolean;
  disabled?: boolean;
  className?: string;
}

export function MobileVoiceRecorder({
  onRecordingComplete,
  onSend,
  maxDuration = 300,
  showWaveform = true,
  showTimer = true,
  disabled = false,
  className,
}: MobileVoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recording, setRecording] = useState<AudioRecording | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();
  const timerRef = useRef<NodeJS.Timeout>();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = useCallback(async () => {
    if (disabled) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;

      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        
        const newRecording: AudioRecording = {
          id: Math.random().toString(36).slice(2),
          blob,
          url,
          duration,
          timestamp: new Date(),
        };

        setRecording(newRecording);
        onRecordingComplete?.(newRecording);

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
      setError(null);
      hapticPresets.buttonPress();

      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

      const updateWaveform = () => {
        if (!analyserRef.current || !isRecording) return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        const samples = 20;
        const step = Math.floor(dataArray.length / samples);
        const normalizedData = Array.from({ length: samples }, (_, i) => {
          return dataArray[i * step] / 255;
        });

        setWaveformData(normalizedData);
        animationFrameRef.current = requestAnimationFrame(updateWaveform);
      };

      if (showWaveform) {
        updateWaveform();
      }
    } catch (err) {
      console.error('Microphone error:', err);
      setError('Unable to access microphone. Please check permissions.');
      hapticPresets.error();
    }
  }, [disabled, duration, maxDuration, showWaveform, onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      hapticPresets.success();

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, [isRecording]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        timerRef.current = setInterval(() => {
          setDuration(prev => prev + 1);
        }, 1000);
      } else {
        mediaRecorderRef.current.pause();
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      }
      setIsPaused(!isPaused);
      hapticPresets.selection();
    }
  }, [isRecording, isPaused]);

  const discardRecording = useCallback(() => {
    hapticPresets.warning();
    if (recording?.url) {
      URL.revokeObjectURL(recording.url);
    }
    setRecording(null);
    setDuration(0);
    setWaveformData([]);
    setPlaybackProgress(0);
    setIsPlaying(false);
  }, [recording]);

  const togglePlayback = useCallback(() => {
    if (!recording || !audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
    hapticPresets.buttonPress();
  }, [recording, isPlaying]);

  const handleSend = useCallback(() => {
    if (recording) {
      hapticPresets.success();
      onSend?.(recording);
      discardRecording();
    }
  }, [recording, onSend, discardRecording]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (recording?.url) URL.revokeObjectURL(recording.url);
    };
  }, [recording]);

  useEffect(() => {
    if (recording?.url) {
      audioRef.current = new Audio(recording.url);
      
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current && recording.duration > 0) {
          setPlaybackProgress((audioRef.current.currentTime / recording.duration) * 100);
        }
      };

      audioRef.current.onended = () => {
        setIsPlaying(false);
        setPlaybackProgress(0);
      };
    }
  }, [recording]);

  return (
    <div className={cn("flex flex-col", className)} data-testid="voice-recorder">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-sm mb-3">
          <MicOff className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!isRecording && !recording && (
        <RecordButton onPress={startRecording} disabled={disabled} />
      )}

      {isRecording && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 p-4 rounded-2xl bg-black/5 dark:bg-white/5"
        >
          {showWaveform && (
            <Waveform data={waveformData} isActive={!isPaused} />
          )}

          {showTimer && (
            <div className="flex items-center gap-2">
              <motion.div
                className="w-3 h-3 rounded-full bg-destructive"
                animate={{ opacity: isPaused ? 1 : [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: isPaused ? 0 : Infinity }}
              />
              <span className="text-2xl font-mono font-bold text-black dark:text-white">
                {formatTime(duration)}
              </span>
              <span className="text-sm text-black/40 dark:text-white/40">
                / {formatTime(maxDuration)}
              </span>
            </div>
          )}

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={pauseRecording}
              className="w-12 h-12 rounded-full"
              data-testid="button-pause-recording"
            >
              {isPaused ? (
                <Mic className="h-6 w-6 text-black dark:text-white" />
              ) : (
                <Pause className="h-6 w-6 text-black dark:text-white" />
              )}
            </Button>

            <Button
              variant="default"
              size="icon"
              onClick={stopRecording}
              className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90"
              data-testid="button-stop-recording"
            >
              <Square className="h-6 w-6 text-white fill-white" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={discardRecording}
              className="w-12 h-12 rounded-full"
              data-testid="button-discard-recording"
            >
              <Trash2 className="h-6 w-6 text-black/60 dark:text-white/60" />
            </Button>
          </div>
        </motion.div>
      )}

      {recording && !isRecording && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 p-3 rounded-2xl bg-black/5 dark:bg-white/5"
          data-testid="recording-preview"
        >
          <Button
            variant="default"
            size="icon"
            onClick={togglePlayback}
            className="w-10 h-10 rounded-full bg-black dark:bg-white"
            data-testid="button-toggle-playback"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 text-white dark:text-black" />
            ) : (
              <Play className="h-5 w-5 text-white dark:text-black ml-0.5" />
            )}
          </Button>

          <div className="flex-1">
            <div className="h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <motion.div
                className="h-full bg-black dark:bg-white"
                style={{ width: `${playbackProgress}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-black/40 dark:text-white/40">
                {formatTime(Math.floor((playbackProgress / 100) * recording.duration))}
              </span>
              <span className="text-xs text-black/40 dark:text-white/40">
                {formatTime(recording.duration)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={discardRecording}
              className="rounded-full"
              data-testid="button-delete-recording"
            >
              <Trash2 className="h-4 w-4 text-black/60 dark:text-white/60" />
            </Button>

            {onSend && (
              <Button
                variant="default"
                size="icon"
                onClick={handleSend}
                className="rounded-full bg-black dark:bg-white"
                data-testid="button-send-recording"
              >
                <Send className="h-4 w-4 text-white dark:text-black" />
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

interface RecordButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

function RecordButton({ onPress, disabled }: RecordButtonProps) {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <motion.button
      className={cn(
        "relative w-16 h-16 rounded-full flex items-center justify-center",
        "bg-black dark:bg-white",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      whileTap={{ scale: 0.95 }}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onClick={onPress}
      disabled={disabled}
      data-testid="button-start-recording"
    >
      <motion.div
        className="absolute inset-0 rounded-full bg-black/20 dark:bg-white/20"
        animate={{ scale: isPressed ? 1.2 : 1, opacity: isPressed ? 0 : 1 }}
      />
      <Mic className="h-7 w-7 text-white dark:text-black relative z-10" />
    </motion.button>
  );
}

interface WaveformProps {
  data: number[];
  isActive: boolean;
  className?: string;
}

function Waveform({ data, isActive, className }: WaveformProps) {
  const defaultData = Array(20).fill(0.1);
  const displayData = data.length > 0 ? data : defaultData;

  return (
    <div 
      className={cn("flex items-center justify-center gap-0.5 h-12", className)}
      data-testid="waveform-display"
    >
      {displayData.map((value, index) => (
        <motion.div
          key={index}
          className="w-1 rounded-full bg-black dark:bg-white"
          animate={{
            height: isActive ? `${Math.max(value * 100, 10)}%` : '10%',
          }}
          transition={{
            duration: 0.1,
          }}
        />
      ))}
    </div>
  );
}

interface VoiceMessagePlayerProps {
  url: string;
  duration: number;
  className?: string;
}

export function VoiceMessagePlayer({
  url,
  duration,
  className,
}: VoiceMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(url);
    
    audioRef.current.ontimeupdate = () => {
      if (audioRef.current) {
        setProgress((audioRef.current.currentTime / duration) * 100);
      }
    };

    audioRef.current.onended = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    return () => {
      audioRef.current?.pause();
    };
  }, [url, duration]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
    hapticPresets.buttonPress();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-full bg-black/10 dark:bg-white/10",
        className
      )}
      data-testid="voice-message-player"
    >
      <button
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-black dark:bg-white flex items-center justify-center flex-shrink-0"
        data-testid="button-play-voice"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4 text-white dark:text-black" />
        ) : (
          <Play className="h-4 w-4 text-white dark:text-black ml-0.5" />
        )}
      </button>

      <div className="flex-1 h-1 rounded-full bg-black/20 dark:bg-white/20 overflow-hidden">
        <div
          className="h-full bg-black dark:bg-white transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <span className="text-xs font-mono text-black/60 dark:text-white/60 min-w-[32px]">
        {formatTime(isPlaying ? (progress / 100) * duration : duration)}
      </span>
    </div>
  );
}
