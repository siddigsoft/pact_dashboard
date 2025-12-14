import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut,
  Download,
  Share2,
  Trash2,
  MoreVertical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface Photo {
  id: string;
  url: string;
  thumbnail?: string;
  caption?: string;
  timestamp?: Date;
}

interface MobilePhotoGalleryProps {
  photos: Photo[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: (photo: Photo) => void;
  onShare?: (photo: Photo) => void;
  onDownload?: (photo: Photo) => void;
}

export function MobilePhotoGallery({
  photos,
  initialIndex = 0,
  isOpen,
  onClose,
  onDelete,
  onShare,
  onDownload,
}: MobilePhotoGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [showActions, setShowActions] = useState(false);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<number>(0);
  const hideControlsTimerRef = useRef<NodeJS.Timeout>();

  const currentPhoto = photos[currentIndex];

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const resetHideTimer = useCallback(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    setShowControls(true);
    hideControlsTimerRef.current = setTimeout(() => {
      if (scale === 1) {
        setShowControls(false);
      }
    }, 3000);
  }, [scale]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      hapticPresets.buttonPress();
      setScale(prev => prev === 1 ? 2 : 1);
    } else {
      setShowControls(prev => !prev);
    }
    lastTapRef.current = now;
    resetHideTimer();
  }, [resetHideTimer]);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    if (scale > 1) return;

    const threshold = 100;
    const velocity = 500;

    if (info.offset.x > threshold || info.velocity.x > velocity) {
      if (currentIndex > 0) {
        hapticPresets.swipe();
        setCurrentIndex(prev => prev - 1);
      }
    } else if (info.offset.x < -threshold || info.velocity.x < -velocity) {
      if (currentIndex < photos.length - 1) {
        hapticPresets.swipe();
        setCurrentIndex(prev => prev + 1);
      }
    }

    if (Math.abs(info.offset.y) > 150) {
      hapticPresets.buttonPress();
      onClose();
    }
  }, [scale, currentIndex, photos.length, onClose]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      hapticPresets.selection();
      setCurrentIndex(prev => prev - 1);
      setScale(1);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      hapticPresets.selection();
      setCurrentIndex(prev => prev + 1);
      setScale(1);
    }
  }, [currentIndex, photos.length]);

  const handleZoomIn = useCallback(() => {
    hapticPresets.selection();
    setScale(prev => Math.min(prev + 0.5, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    hapticPresets.selection();
    setScale(prev => Math.max(prev - 0.5, 1));
  }, []);

  const handleClose = useCallback(() => {
    hapticPresets.buttonPress();
    onClose();
  }, [onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={constraintsRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-black"
          onClick={handleTap}
          data-testid="mobile-photo-gallery"
        >
          <AnimatePresence>
            {showControls && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-0 left-0 right-0 z-10 safe-area-top"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClose}
                    className="text-white hover:bg-white/20"
                    data-testid="button-close-gallery"
                  >
                    <X className="h-6 w-6" />
                  </Button>

                  <span className="text-white text-sm font-medium">
                    {currentIndex + 1} / {photos.length}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowActions(!showActions);
                    }}
                    className="text-white hover:bg-white/20"
                    data-testid="button-more-actions"
                  >
                    <MoreVertical className="h-6 w-6" />
                  </Button>
                </div>

                <AnimatePresence>
                  {showActions && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-4 top-16 bg-white dark:bg-neutral-800 rounded-xl shadow-xl overflow-hidden"
                      onClick={e => e.stopPropagation()}
                    >
                      {onDownload && (
                        <button
                          onClick={() => {
                            hapticPresets.buttonPress();
                            onDownload(currentPhoto);
                            setShowActions(false);
                          }}
                          className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-black/5 dark:hover:bg-white/5"
                          data-testid="action-download"
                        >
                          <Download className="h-5 w-5 text-black dark:text-white" />
                          <span className="text-sm text-black dark:text-white">Download</span>
                        </button>
                      )}
                      {onShare && (
                        <button
                          onClick={() => {
                            hapticPresets.buttonPress();
                            onShare(currentPhoto);
                            setShowActions(false);
                          }}
                          className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-black/5 dark:hover:bg-white/5"
                          data-testid="action-share"
                        >
                          <Share2 className="h-5 w-5 text-black dark:text-white" />
                          <span className="text-sm text-black dark:text-white">Share</span>
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => {
                            hapticPresets.buttonPress();
                            onDelete(currentPhoto);
                            setShowActions(false);
                          }}
                          className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-black/5 dark:hover:bg-white/5"
                          data-testid="action-delete"
                        >
                          <Trash2 className="h-5 w-5 text-destructive" />
                          <span className="text-sm text-destructive">Delete</span>
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            drag={scale === 1 ? "x" : false}
            dragConstraints={constraintsRef}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
          >
            <motion.img
              key={currentPhoto.id}
              src={currentPhoto.url}
              alt={currentPhoto.caption || 'Photo'}
              className="max-w-full max-h-full object-contain"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              draggable={false}
            />
          </motion.div>

          <AnimatePresence>
            {showControls && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-0 left-0 right-0 z-10 safe-area-bottom"
                onClick={e => e.stopPropagation()}
              >
                {currentPhoto.caption && (
                  <div className="px-4 py-2 text-center">
                    <p className="text-white text-sm">{currentPhoto.caption}</p>
                    {currentPhoto.timestamp && (
                      <p className="text-white/60 text-xs mt-1">
                        {currentPhoto.timestamp.toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-center gap-4 p-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    className="text-white hover:bg-white/20 disabled:opacity-30"
                    data-testid="button-prev-photo"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleZoomOut}
                      disabled={scale <= 1}
                      className="text-white hover:bg-white/20 disabled:opacity-30"
                      data-testid="button-zoom-out"
                    >
                      <ZoomOut className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleZoomIn}
                      disabled={scale >= 3}
                      className="text-white hover:bg-white/20 disabled:opacity-30"
                      data-testid="button-zoom-in"
                    >
                      <ZoomIn className="h-5 w-5" />
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNext}
                    disabled={currentIndex === photos.length - 1}
                    className="text-white hover:bg-white/20 disabled:opacity-30"
                    data-testid="button-next-photo"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </div>

                <div className="flex justify-center gap-1.5 pb-4">
                  {photos.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        hapticPresets.selection();
                        setCurrentIndex(index);
                        setScale(1);
                      }}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all",
                        index === currentIndex 
                          ? "bg-white w-4" 
                          : "bg-white/40"
                      )}
                      data-testid={`dot-${index}`}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface PhotoGridProps {
  photos: Photo[];
  onPhotoClick: (index: number) => void;
  columns?: number;
  className?: string;
}

export function PhotoGrid({
  photos,
  onPhotoClick,
  columns = 3,
  className,
}: PhotoGridProps) {
  return (
    <div 
      className={cn(
        "grid gap-1",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-3",
        columns === 4 && "grid-cols-4",
        className
      )}
      data-testid="photo-grid"
    >
      {photos.map((photo, index) => (
        <button
          key={photo.id}
          onClick={() => {
            hapticPresets.buttonPress();
            onPhotoClick(index);
          }}
          className="aspect-square overflow-hidden bg-black/5 dark:bg-white/5 touch-manipulation active:opacity-80 transition-opacity"
          data-testid={`photo-${photo.id}`}
        >
          <img
            src={photo.thumbnail || photo.url}
            alt={photo.caption || `Photo ${index + 1}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );
}
