import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Camera, 
  Image, 
  Trash2, 
  X, 
  ZoomIn, 
  ZoomOut,
  RotateCw,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface MobileAvatarEditorProps {
  currentImage?: string;
  name?: string;
  onSave: (imageData: string | null) => void;
  onCancel?: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function MobileAvatarEditor({
  currentImage,
  name = '',
  onSave,
  onCancel,
  size = 'lg',
  className,
}: MobileAvatarEditorProps) {
  const [image, setImage] = useState<string | null>(currentImage || null);
  const [isEditing, setIsEditing] = useState(false);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sizeClasses = {
    sm: 'h-16 w-16',
    md: 'h-24 w-24',
    lg: 'h-32 w-32',
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      hapticPresets.success();
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
        setIsEditing(true);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleTakePhoto = useCallback(() => {
    hapticPresets.buttonPress();
    if (fileInputRef.current) {
      fileInputRef.current.accept = 'image/*';
      fileInputRef.current.capture = 'environment';
      fileInputRef.current.click();
    }
  }, []);

  const handleChoosePhoto = useCallback(() => {
    hapticPresets.buttonPress();
    if (fileInputRef.current) {
      fileInputRef.current.accept = 'image/*';
      fileInputRef.current.removeAttribute('capture');
      fileInputRef.current.click();
    }
  }, []);

  const handleRemove = useCallback(() => {
    hapticPresets.warning();
    setImage(null);
    setIsEditing(false);
    onSave(null);
  }, [onSave]);

  const handleSave = useCallback(() => {
    hapticPresets.success();
    onSave(image);
    setIsEditing(false);
  }, [image, onSave]);

  const handleCancel = useCallback(() => {
    hapticPresets.buttonPress();
    setIsEditing(false);
    setScale(1);
    setRotation(0);
    onCancel?.();
  }, [onCancel]);

  const handleZoomIn = useCallback(() => {
    hapticPresets.selection();
    setScale(prev => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    hapticPresets.selection();
    setScale(prev => Math.max(prev - 0.25, 0.5));
  }, []);

  const handleRotate = useCallback(() => {
    hapticPresets.selection();
    setRotation(prev => (prev + 90) % 360);
  }, []);

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-avatar-file"
      />

      <div className="relative">
        <Avatar className={cn(sizeClasses[size], "border-4 border-white dark:border-neutral-800 shadow-lg")}>
          <AvatarImage src={image || undefined} alt={name} />
          <AvatarFallback className="bg-black/5 dark:bg-white/5 text-black dark:text-white text-2xl font-bold">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>

        <button
          onClick={() => setIsEditing(true)}
          className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center shadow-lg touch-manipulation active:scale-95"
          data-testid="button-edit-avatar"
        >
          <Camera className="h-5 w-5 text-white dark:text-black" />
        </button>
      </div>

      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black"
            data-testid="avatar-editor-modal"
          >
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between p-4 safe-area-top">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCancel}
                  className="text-white hover:bg-white/20"
                  data-testid="button-cancel-edit"
                >
                  <X className="h-6 w-6" />
                </Button>
                <span className="text-white font-medium">Edit Photo</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSave}
                  className="text-white hover:bg-white/20"
                  data-testid="button-save-avatar"
                >
                  <Check className="h-6 w-6" />
                </Button>
              </div>

              <div className="flex-1 flex items-center justify-center overflow-hidden">
                {image ? (
                  <div className="relative w-64 h-64">
                    <div className="absolute inset-0 rounded-full border-2 border-white/30 overflow-hidden">
                      <motion.img
                        src={image}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        style={{
                          scale,
                          rotate: rotation,
                        }}
                        drag
                        dragConstraints={{ left: -50, right: 50, top: -50, bottom: 50 }}
                        dragElastic={0.1}
                      />
                    </div>
                    <div className="absolute inset-0 rounded-full border-4 border-white pointer-events-none" />
                  </div>
                ) : (
                  <div className="w-64 h-64 rounded-full bg-white/10 flex items-center justify-center">
                    <Camera className="h-16 w-16 text-white/40" />
                  </div>
                )}
              </div>

              <div className="p-4 space-y-4 safe-area-bottom">
                {image && (
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleZoomOut}
                      className="text-white hover:bg-white/20"
                      data-testid="button-zoom-out"
                    >
                      <ZoomOut className="h-5 w-5" />
                    </Button>
                    <div className="w-32 h-1 bg-white/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-white rounded-full transition-all"
                        style={{ width: `${((scale - 0.5) / 2.5) * 100}%` }}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleZoomIn}
                      className="text-white hover:bg-white/20"
                      data-testid="button-zoom-in"
                    >
                      <ZoomIn className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRotate}
                      className="text-white hover:bg-white/20"
                      data-testid="button-rotate"
                    >
                      <RotateCw className="h-5 w-5" />
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <Button
                    variant="outline"
                    onClick={handleTakePhoto}
                    className="h-12 rounded-xl border-white/20 text-white hover:bg-white/10"
                    data-testid="button-take-photo"
                  >
                    <Camera className="h-5 w-5 mr-2" />
                    Camera
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleChoosePhoto}
                    className="h-12 rounded-xl border-white/20 text-white hover:bg-white/10"
                    data-testid="button-choose-photo"
                  >
                    <Image className="h-5 w-5 mr-2" />
                    Gallery
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRemove}
                    className="h-12 rounded-xl border-destructive/50 text-destructive hover:bg-destructive/10"
                    data-testid="button-remove-photo"
                  >
                    <Trash2 className="h-5 w-5 mr-2" />
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface AvatarWithBadgeProps {
  src?: string;
  name?: string;
  badge?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  online?: boolean;
  className?: string;
}

export function AvatarWithBadge({
  src,
  name = '',
  badge,
  size = 'md',
  online,
  className,
}: AvatarWithBadgeProps) {
  const sizeClasses = {
    sm: 'h-10 w-10',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };

  const badgeSizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={cn("relative inline-block", className)}>
      <Avatar className={sizeClasses[size]}>
        <AvatarImage src={src} alt={name} />
        <AvatarFallback className="bg-black/5 dark:bg-white/5 text-black dark:text-white font-medium">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>

      {online !== undefined && (
        <span 
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-2 border-white dark:border-neutral-900",
            badgeSizeClasses[size],
            online ? "bg-black dark:bg-white" : "bg-black/30 dark:bg-white/30"
          )}
        />
      )}

      {badge && (
        <span className="absolute -top-1 -right-1">
          {badge}
        </span>
      )}
    </div>
  );
}

interface AvatarGroupProps {
  avatars: Array<{ src?: string; name: string }>;
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function AvatarGroup({
  avatars,
  max = 4,
  size = 'sm',
  className,
}: AvatarGroupProps) {
  const visibleAvatars = avatars.slice(0, max);
  const remainingCount = avatars.length - max;

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={cn("flex -space-x-2", className)} data-testid="avatar-group">
      {visibleAvatars.map((avatar, index) => (
        <Avatar 
          key={index} 
          className={cn(
            sizeClasses[size],
            "border-2 border-white dark:border-neutral-900"
          )}
        >
          <AvatarImage src={avatar.src} alt={avatar.name} />
          <AvatarFallback className="bg-black/10 dark:bg-white/10 text-black dark:text-white font-medium">
            {getInitials(avatar.name)}
          </AvatarFallback>
        </Avatar>
      ))}

      {remainingCount > 0 && (
        <div 
          className={cn(
            sizeClasses[size],
            "rounded-full border-2 border-white dark:border-neutral-900 bg-black dark:bg-white text-white dark:text-black font-medium flex items-center justify-center"
          )}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}
