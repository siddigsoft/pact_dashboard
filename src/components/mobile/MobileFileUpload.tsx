import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, 
  File, 
  Image, 
  FileText, 
  Film, 
  Music, 
  Archive, 
  X, 
  Check, 
  AlertCircle,
  Camera,
  FolderOpen,
  Cloud,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

interface MobileFileUploadProps {
  onUpload?: (files: File[]) => Promise<void>;
  onRemove?: (fileId: string) => void;
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  multiple?: boolean;
  showCamera?: boolean;
  showGallery?: boolean;
  showFiles?: boolean;
  disabled?: boolean;
  className?: string;
}

export function MobileFileUpload({
  onUpload,
  onRemove,
  accept = '*/*',
  maxSize = 10 * 1024 * 1024,
  maxFiles = 10,
  multiple = true,
  showCamera = true,
  showGallery = true,
  showFiles = true,
  disabled = false,
  className,
}: MobileFileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return Image;
    if (type.startsWith('video/')) return Film;
    if (type.startsWith('audio/')) return Music;
    if (type.includes('pdf') || type.includes('document')) return FileText;
    if (type.includes('zip') || type.includes('archive')) return Archive;
    return File;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const validateFile = (file: File): string | null => {
    if (file.size > maxSize) {
      return `File too large. Maximum size is ${formatFileSize(maxSize)}`;
    }
    if (files.length >= maxFiles) {
      return `Maximum ${maxFiles} files allowed`;
    }
    return null;
  };

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || disabled) return;

    const newFiles: UploadedFile[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const error = validateFile(file);

      const uploadedFile: UploadedFile = {
        id: Math.random().toString(36).slice(2),
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: error ? 'error' : 'pending',
        error: error || undefined,
      };

      newFiles.push(uploadedFile);
    }

    setFiles(prev => [...prev, ...newFiles]);
    hapticPresets.success();

    const validFiles = newFiles.filter(f => f.status !== 'error');
    if (validFiles.length > 0 && onUpload) {
      const originalFiles = Array.from(fileList).filter((_, i) => newFiles[i].status !== 'error');
      
      for (let i = 0; i < validFiles.length; i++) {
        const fileId = validFiles[i].id;
        
        setFiles(prev => prev.map(f => 
          f.id === fileId ? { ...f, status: 'uploading' as const } : f
        ));

        const progressInterval = setInterval(() => {
          setFiles(prev => prev.map(f => {
            if (f.id === fileId && f.progress < 90) {
              return { ...f, progress: f.progress + 10 };
            }
            return f;
          }));
        }, 200);

        try {
          await onUpload([originalFiles[i]]);
          clearInterval(progressInterval);
          
          setFiles(prev => prev.map(f => 
            f.id === fileId ? { ...f, status: 'success' as const, progress: 100 } : f
          ));
        } catch (error) {
          clearInterval(progressInterval);
          setFiles(prev => prev.map(f => 
            f.id === fileId ? { 
              ...f, 
              status: 'error' as const, 
              error: error instanceof Error ? error.message : 'Upload failed' 
            } : f
          ));
        }
      }
    }
  }, [disabled, files.length, maxFiles, maxSize, onUpload]);

  const handleRemove = useCallback((fileId: string) => {
    hapticPresets.buttonPress();
    setFiles(prev => prev.filter(f => f.id !== fileId));
    onRemove?.(fileId);
  }, [onRemove]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className={cn("flex flex-col gap-4", className)} data-testid="file-upload">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        data-testid="input-file"
      />

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        data-testid="input-camera"
      />

      <motion.div
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-6 transition-colors",
          isDragging 
            ? "border-black dark:border-white bg-black/5 dark:bg-white/5" 
            : "border-black/20 dark:border-white/20",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        whileTap={disabled ? {} : { scale: 0.98 }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-4">
            <Upload className="h-8 w-8 text-black/40 dark:text-white/40" />
          </div>

          <p className="text-sm font-medium text-black dark:text-white mb-1">
            Drop files here or tap to upload
          </p>
          <p className="text-xs text-black/40 dark:text-white/40 mb-4">
            Maximum file size: {formatFileSize(maxSize)}
          </p>

          <Button
            variant="default"
            size="sm"
            onClick={() => {
              hapticPresets.buttonPress();
              setShowSourcePicker(true);
            }}
            disabled={disabled || files.length >= maxFiles}
            className="rounded-full bg-black dark:bg-white text-white dark:text-black"
            data-testid="button-choose-file"
          >
            Choose File
          </Button>
        </div>
      </motion.div>

      {files.length > 0 && (
        <div className="space-y-2" data-testid="file-list">
          {files.map((file) => (
            <FileItem
              key={file.id}
              file={file}
              icon={getFileIcon(file.type)}
              onRemove={() => handleRemove(file.id)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showSourcePicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end"
            onClick={() => setShowSourcePicker(false)}
            data-testid="source-picker"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full bg-white dark:bg-neutral-900 rounded-t-3xl p-4 pb-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-4">
                <div className="w-10 h-1 rounded-full bg-black/20 dark:bg-white/20" />
              </div>

              <h3 className="text-lg font-semibold text-black dark:text-white text-center mb-4">
                Choose Source
              </h3>

              <div className="grid grid-cols-3 gap-4">
                {showCamera && (
                  <button
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-black/5 dark:bg-white/5 active:bg-black/10 dark:active:bg-white/10"
                    onClick={() => {
                      hapticPresets.buttonPress();
                      cameraInputRef.current?.click();
                      setShowSourcePicker(false);
                    }}
                    data-testid="button-source-camera"
                  >
                    <Camera className="h-8 w-8 text-black dark:text-white" />
                    <span className="text-xs font-medium text-black dark:text-white">Camera</span>
                  </button>
                )}

                {showGallery && (
                  <button
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-black/5 dark:bg-white/5 active:bg-black/10 dark:active:bg-white/10"
                    onClick={() => {
                      hapticPresets.buttonPress();
                      inputRef.current?.click();
                      setShowSourcePicker(false);
                    }}
                    data-testid="button-source-gallery"
                  >
                    <Image className="h-8 w-8 text-black dark:text-white" />
                    <span className="text-xs font-medium text-black dark:text-white">Gallery</span>
                  </button>
                )}

                {showFiles && (
                  <button
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-black/5 dark:bg-white/5 active:bg-black/10 dark:active:bg-white/10"
                    onClick={() => {
                      hapticPresets.buttonPress();
                      inputRef.current?.click();
                      setShowSourcePicker(false);
                    }}
                    data-testid="button-source-files"
                  >
                    <FolderOpen className="h-8 w-8 text-black dark:text-white" />
                    <span className="text-xs font-medium text-black dark:text-white">Files</span>
                  </button>
                )}
              </div>

              <Button
                variant="ghost"
                size="lg"
                onClick={() => setShowSourcePicker(false)}
                className="w-full mt-4 rounded-full"
                data-testid="button-cancel-source"
              >
                Cancel
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FileItemProps {
  file: UploadedFile;
  icon: React.ComponentType<{ className?: string }>;
  onRemove: () => void;
}

function FileItem({ file, icon: Icon, onRemove }: FileItemProps) {
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl",
        file.status === 'error' 
          ? "bg-destructive/10" 
          : "bg-black/5 dark:bg-white/5"
      )}
      data-testid={`file-item-${file.id}`}
    >
      <div className={cn(
        "w-10 h-10 rounded-lg flex items-center justify-center",
        file.status === 'error' 
          ? "bg-destructive/20" 
          : "bg-black/10 dark:bg-white/10"
      )}>
        {file.status === 'uploading' ? (
          <Loader2 className="h-5 w-5 text-black dark:text-white animate-spin" />
        ) : file.status === 'success' ? (
          <Check className="h-5 w-5 text-black dark:text-white" />
        ) : file.status === 'error' ? (
          <AlertCircle className="h-5 w-5 text-destructive" />
        ) : (
          <Icon className="h-5 w-5 text-black dark:text-white" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-black dark:text-white truncate">
          {file.name}
        </p>
        {file.status === 'error' ? (
          <p className="text-xs text-destructive">{file.error}</p>
        ) : (
          <p className="text-xs text-black/60 dark:text-white/60">
            {formatSize(file.size)}
            {file.status === 'uploading' && ` • ${file.progress}%`}
          </p>
        )}

        {file.status === 'uploading' && (
          <div className="mt-1 h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <motion.div
              className="h-full bg-black dark:bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${file.progress}%` }}
            />
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="flex-shrink-0"
        data-testid={`button-remove-file-${file.id}`}
      >
        <X className="h-4 w-4 text-black/60 dark:text-white/60" />
      </Button>
    </motion.div>
  );
}

interface CompactFileUploadProps {
  label?: string;
  accept?: string;
  onChange?: (file: File) => void;
  value?: string;
  disabled?: boolean;
  className?: string;
}

export function CompactFileUpload({
  label = 'Upload File',
  accept = '*/*',
  onChange,
  value,
  disabled = false,
  className,
}: CompactFileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            hapticPresets.buttonPress();
            onChange?.(file);
          }
        }}
        className="hidden"
      />

      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="rounded-full"
        data-testid="button-compact-upload"
      >
        <Upload className="h-4 w-4 mr-2" />
        {value ? 'Change File' : label}
      </Button>

      {value && (
        <p className="text-xs text-black/60 dark:text-white/60 truncate px-2">
          {value}
        </p>
      )}
    </div>
  );
}
