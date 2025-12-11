import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  Send,
  X,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface VoiceNote {
  id: string;
  audioUrl: string;
  duration: number;
  timestamp: Date;
  senderId?: string;
  senderName?: string;
}

interface VoiceRecorderProps {
  onRecordComplete: (audioBlob: Blob, duration: number) => void;
  onCancel?: () => void;
  maxDuration?: number;
  className?: string;
}

export function VoiceRecorder({
  onRecordComplete,
  onCancel,
  maxDuration = 60,
  className,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onRecordComplete(audioBlob, duration);
      };

      mediaRecorder.start();
      setIsRecording(true);
      hapticPresets.success();

      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev >= maxDuration - 1) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

      const updateLevel = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average / 255);
        }
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

    } catch (err) {
      setError('Microphone access denied');
      hapticPresets.error();
    }
  }, [duration, maxDuration, onRecordComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      setIsRecording(false);
      hapticPresets.buttonPress();
    }
  }, [isRecording]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      chunksRef.current = [];
      setIsRecording(false);
      setDuration(0);
      hapticPresets.warning();
      onCancel?.();
    }
  }, [isRecording, onCancel]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className={cn("flex items-center gap-3 p-4 bg-destructive/10 rounded-xl", className)}>
        <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
        <p className="text-sm text-destructive">{error}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setError(null)}
          className="ml-auto"
          data-testid="button-dismiss-error"
        >
          Dismiss
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)} data-testid="voice-recorder">
      {isRecording ? (
        <>
          <div className="flex-1 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="w-3 h-3 rounded-full bg-destructive"
              />
              <span className="text-sm font-medium text-black dark:text-white">
                {formatDuration(duration)}
              </span>
            </div>

            <div className="flex-1 h-8 flex items-center gap-0.5">
              {Array.from({ length: 20 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="flex-1 bg-black dark:bg-white rounded-full"
                  animate={{
                    height: Math.random() * audioLevel * 24 + 4,
                  }}
                  transition={{ duration: 0.1 }}
                />
              ))}
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={cancelRecording}
            className="rounded-full text-destructive min-w-[44px] min-h-[44px]"
            data-testid="button-cancel-recording"
            aria-label="Cancel recording"
          >
            <X className="w-5 h-5" />
          </Button>

          <Button
            size="icon"
            onClick={stopRecording}
            className="rounded-full bg-black dark:bg-white text-white dark:text-black min-w-[44px] min-h-[44px]"
            data-testid="button-stop-recording"
            aria-label="Stop recording"
          >
            <Square className="w-4 h-4" />
          </Button>
        </>
      ) : (
        <Button
          size="icon"
          onClick={startRecording}
          className="rounded-full bg-black dark:bg-white text-white dark:text-black min-w-[44px] min-h-[44px]"
          data-testid="button-start-recording"
          aria-label="Start recording"
        >
          <Mic className="w-5 h-5" />
        </Button>
      )}
    </div>
  );
}

interface VoiceNotePlayerProps {
  audioUrl: string;
  duration: number;
  senderName?: string;
  timestamp?: Date;
  isOwn?: boolean;
  onDelete?: () => void;
  className?: string;
}

export function VoiceNotePlayer({
  audioUrl,
  duration,
  senderName,
  timestamp,
  isOwn = false,
  onDelete,
  className,
}: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress((audio.currentTime / audio.duration) * 100);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setProgress(0);
    };

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    hapticPresets.buttonPress();
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-2xl min-w-[200px] max-w-[280px]",
        isOwn 
          ? "bg-black dark:bg-white" 
          : "bg-black/5 dark:bg-white/10",
        className
      )}
      data-testid="voice-note-player"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlay}
        className={cn(
          "rounded-full flex-shrink-0 min-w-[44px] min-h-[44px]",
          isOwn 
            ? "text-white dark:text-black" 
            : "text-black dark:text-white"
        )}
        data-testid="button-play-voice"
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5" />
        ) : (
          <Play className="w-5 h-5 ml-0.5" />
        )}
      </Button>

      <div className="flex-1 min-w-0">
        <div className="h-1 bg-black/20 dark:bg-white/20 rounded-full overflow-hidden mb-1">
          <motion.div
            className={cn(
              "h-full rounded-full",
              isOwn ? "bg-white dark:bg-black" : "bg-black dark:bg-white"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className={cn(
            "text-[10px]",
            isOwn ? "text-white/60 dark:text-black/60" : "text-black/60 dark:text-white/60"
          )}>
            {formatTime(isPlaying ? currentTime : duration)}
          </span>
          {timestamp && (
            <span className={cn(
              "text-[10px]",
              isOwn ? "text-white/60 dark:text-black/60" : "text-black/60 dark:text-white/60"
            )}>
              {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            hapticPresets.warning();
            onDelete();
          }}
          className={cn(
            "rounded-full flex-shrink-0 min-w-[44px] min-h-[44px]",
            isOwn ? "text-white/60 dark:text-black/60" : "text-black/60 dark:text-white/60"
          )}
          data-testid="button-delete-voice"
          aria-label="Delete voice note"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

interface VoiceNotePreviewProps {
  audioBlob: Blob;
  duration: number;
  onSend: () => void;
  onCancel: () => void;
  onDelete: () => void;
  className?: string;
}

export function VoiceNotePreview({
  audioBlob,
  duration,
  onSend,
  onCancel,
  onDelete,
  className,
}: VoiceNotePreviewProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioBlob]);

  if (!audioUrl) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={cn(
        "flex items-center gap-3 p-3 bg-black/5 dark:bg-white/5 rounded-2xl",
        className
      )}
      data-testid="voice-note-preview"
    >
      <VoiceNotePlayer
        audioUrl={audioUrl}
        duration={duration}
        isOwn={false}
        className="flex-1 bg-transparent p-0"
      />

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            hapticPresets.warning();
            onDelete();
          }}
          className="rounded-full text-destructive"
          data-testid="button-delete-preview"
          aria-label="Delete"
        >
          <Trash2 className="w-5 h-5" />
        </Button>

        <Button
          size="icon"
          onClick={() => {
            hapticPresets.success();
            onSend();
          }}
          className="rounded-full bg-black dark:bg-white text-white dark:text-black"
          data-testid="button-send-voice"
          aria-label="Send voice note"
        >
          <Send className="w-5 h-5" />
        </Button>
      </div>
    </motion.div>
  );
}

interface PushToTalkButtonProps {
  onRecordComplete: (audioBlob: Blob, duration: number) => void;
  maxDuration?: number;
  className?: string;
}

export function PushToTalkButton({
  onRecordComplete,
  maxDuration = 30,
  className,
}: PushToTalkButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        if (finalDuration > 0) {
          onRecordComplete(audioBlob, finalDuration);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      hapticPresets.notification();

      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev >= maxDuration - 1) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      hapticPresets.error();
    }
  }, [maxDuration, onRecordComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      setIsRecording(false);
      setDuration(0);
      hapticPresets.success();
    }
  }, [isRecording]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <motion.button
      onTouchStart={startRecording}
      onTouchEnd={stopRecording}
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onMouseLeave={stopRecording}
      whileTap={{ scale: 1.1 }}
      className={cn(
        "relative w-20 h-20 rounded-full flex items-center justify-center",
        "transition-colors",
        isRecording 
          ? "bg-destructive" 
          : "bg-black dark:bg-white",
        className
      )}
      data-testid="button-push-to-talk"
      aria-label={isRecording ? `Recording ${duration} seconds` : "Hold to talk"}
    >
      <Mic className={cn(
        "w-8 h-8",
        isRecording ? "text-white" : "text-white dark:text-black"
      )} />

      {isRecording && (
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-destructive"
          animate={{ scale: [1, 1.3], opacity: [1, 0] }}
          transition={{ repeat: Infinity, duration: 1 }}
        />
      )}

      {isRecording && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="text-xs font-medium text-black dark:text-white">
            {duration}s / {maxDuration}s
          </span>
        </div>
      )}
    </motion.button>
  );
}

export type { VoiceNote };
