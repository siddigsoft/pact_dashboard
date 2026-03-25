
import { useState, useEffect } from 'react';

// Progressive loading hooks
export const useProgressiveLoading = (delay = 100) => {
  const [isLoaded, setIsLoaded] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, delay);
    
    return () => clearTimeout(timer);
  }, [delay]);
  
  return isLoaded;
};

// Enhanced animation variants for dashboard components
export const fadeInUpVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      duration: 0.4,
      ease: "easeOut" 
    }
  }
};

export const fadeInLeftVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { 
    opacity: 1, 
    x: 0, 
    transition: { 
      duration: 0.4,
      ease: "easeOut" 
    }
  }
};

export const fadeInRightVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { 
    opacity: 1, 
    x: 0, 
    transition: { 
      duration: 0.4,
      ease: "easeOut" 
    }
  }
};

export const scaleInVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { 
      duration: 0.3,
      ease: "easeOut" 
    }
  }
};

// Create staggered children animations
export const staggerContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    }
  }
};

// Helper to combine animation variants
export const combineAnimations = (...variants) => {
  return {
    hidden: Object.assign({}, ...variants.map(v => v.hidden)),
    visible: Object.assign({}, ...variants.map(v => v.visible)),
  };
};
