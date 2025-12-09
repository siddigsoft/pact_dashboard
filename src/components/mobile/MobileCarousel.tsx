import { useState, useRef, useCallback, useEffect, Children, cloneElement, isValidElement } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface MobileCarouselProps {
  children: React.ReactNode;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  showIndicators?: boolean;
  showArrows?: boolean;
  loop?: boolean;
  className?: string;
}

export function MobileCarousel({
  children,
  autoPlay = false,
  autoPlayInterval = 5000,
  showIndicators = true,
  showArrows = false,
  loop = true,
  className,
}: MobileCarouselProps) {
  const childArray = Children.toArray(children);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const autoPlayRef = useRef<NodeJS.Timeout>();

  const goTo = useCallback((index: number) => {
    hapticPresets.selection();
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  }, [currentIndex]);

  const goToPrevious = useCallback(() => {
    hapticPresets.selection();
    setDirection(-1);
    setCurrentIndex(prev => {
      if (prev === 0) {
        return loop ? childArray.length - 1 : 0;
      }
      return prev - 1;
    });
  }, [loop, childArray.length]);

  const goToNext = useCallback(() => {
    hapticPresets.selection();
    setDirection(1);
    setCurrentIndex(prev => {
      if (prev === childArray.length - 1) {
        return loop ? 0 : prev;
      }
      return prev + 1;
    });
  }, [loop, childArray.length]);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    const threshold = 50;
    const velocity = 300;

    if (info.offset.x > threshold || info.velocity.x > velocity) {
      goToPrevious();
    } else if (info.offset.x < -threshold || info.velocity.x < -velocity) {
      goToNext();
    }
  }, [goToPrevious, goToNext]);

  useEffect(() => {
    if (autoPlay) {
      autoPlayRef.current = setInterval(goToNext, autoPlayInterval);
      return () => {
        if (autoPlayRef.current) {
          clearInterval(autoPlayRef.current);
        }
      };
    }
  }, [autoPlay, autoPlayInterval, goToNext]);

  const pauseAutoPlay = useCallback(() => {
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
    }
  }, []);

  const resumeAutoPlay = useCallback(() => {
    if (autoPlay) {
      autoPlayRef.current = setInterval(goToNext, autoPlayInterval);
    }
  }, [autoPlay, autoPlayInterval, goToNext]);

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? '100%' : '-100%',
      opacity: 0,
    }),
  };

  return (
    <div 
      ref={constraintsRef}
      className={cn("relative overflow-hidden", className)}
      onMouseEnter={pauseAutoPlay}
      onMouseLeave={resumeAutoPlay}
      onTouchStart={pauseAutoPlay}
      onTouchEnd={resumeAutoPlay}
      data-testid="mobile-carousel"
    >
      <AnimatePresence custom={direction} mode="wait">
        <motion.div
          key={currentIndex}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          drag="x"
          dragConstraints={constraintsRef}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          className="w-full"
        >
          {childArray[currentIndex]}
        </motion.div>
      </AnimatePresence>

      {showArrows && (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPrevious}
            disabled={!loop && currentIndex === 0}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-black/80 backdrop-blur-sm rounded-full shadow-lg hover:bg-white dark:hover:bg-black disabled:opacity-50"
            data-testid="carousel-prev"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNext}
            disabled={!loop && currentIndex === childArray.length - 1}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-black/80 backdrop-blur-sm rounded-full shadow-lg hover:bg-white dark:hover:bg-black disabled:opacity-50"
            data-testid="carousel-next"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </>
      )}

      {showIndicators && childArray.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {childArray.map((_, index) => (
            <button
              key={index}
              onClick={() => goTo(index)}
              className={cn(
                "h-2 rounded-full transition-all touch-manipulation",
                index === currentIndex 
                  ? "w-6 bg-white" 
                  : "w-2 bg-white/50"
              )}
              aria-label={`Go to slide ${index + 1}`}
              data-testid={`indicator-${index}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CarouselSlideProps {
  children: React.ReactNode;
  className?: string;
}

export function CarouselSlide({ children, className }: CarouselSlideProps) {
  return (
    <div className={cn("w-full", className)} data-testid="carousel-slide">
      {children}
    </div>
  );
}

interface ImageCarouselProps {
  images: Array<{
    src: string;
    alt?: string;
    caption?: string;
  }>;
  aspectRatio?: 'square' | 'video' | 'wide';
  className?: string;
}

export function ImageCarousel({ 
  images, 
  aspectRatio = 'video',
  className 
}: ImageCarouselProps) {
  const aspectClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    wide: 'aspect-[21/9]',
  };

  return (
    <MobileCarousel className={className} showArrows>
      {images.map((image, index) => (
        <CarouselSlide key={index}>
          <div className={cn("relative w-full", aspectClasses[aspectRatio])}>
            <img
              src={image.src}
              alt={image.alt || `Image ${index + 1}`}
              className="absolute inset-0 w-full h-full object-cover rounded-xl"
              loading={index === 0 ? 'eager' : 'lazy'}
            />
            {image.caption && (
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-white text-sm">{image.caption}</p>
              </div>
            )}
          </div>
        </CarouselSlide>
      ))}
    </MobileCarousel>
  );
}

interface CardCarouselProps {
  children: React.ReactNode;
  visibleCards?: number;
  gap?: number;
  className?: string;
}

export function CardCarousel({
  children,
  visibleCards = 1.2,
  gap = 16,
  className,
}: CardCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    const ref = scrollRef.current;
    ref?.addEventListener('scroll', checkScroll);
    return () => ref?.removeEventListener('scroll', checkScroll);
  }, [checkScroll]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (scrollRef.current) {
      hapticPresets.selection();
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  }, []);

  const childArray = Children.toArray(children);
  const cardWidth = `calc((100% - ${gap * (visibleCards - 1)}px) / ${visibleCards})`;

  return (
    <div className={cn("relative", className)} data-testid="card-carousel">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory -mx-4 px-4"
        style={{ gap }}
      >
        {childArray.map((child, index) => (
          <div
            key={index}
            className="flex-shrink-0 snap-start"
            style={{ width: cardWidth }}
          >
            {isValidElement(child) ? cloneElement(child as React.ReactElement) : child}
          </div>
        ))}
      </div>

      {canScrollLeft && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-black/90 backdrop-blur-sm rounded-full shadow-lg z-10"
          data-testid="scroll-left"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      )}

      {canScrollRight && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-black/90 backdrop-blur-sm rounded-full shadow-lg z-10"
          data-testid="scroll-right"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
