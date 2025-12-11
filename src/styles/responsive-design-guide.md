/* Mobile Responsive Design System - Complete Reference */
/* This file documents all responsive utilities available */

/* ==================== RESPONSIVE TYPOGRAPHY ==================== */
/* Use these classes for responsive text sizing across all devices */

.text-heading-1        /* Largest: clamp(1.5rem, 5vw, 2.5rem) */
.text-heading-2        /* Large: clamp(1.25rem, 4vw, 2rem) */
.text-heading-3        /* Medium: clamp(1rem, 3.5vw, 1.5rem) */
.text-heading-4        /* Small: clamp(0.95rem, 3vw, 1.25rem) */
.text-body            /* Body text: clamp(0.95rem, 2.5vw, 1.1rem) */
.text-body-sm         /* Small body: clamp(0.9rem, 2.5vw, 1rem) */
.text-caption         /* Caption: clamp(0.75rem, 2vw, 0.875rem) */

/* ==================== RESPONSIVE SPACING ==================== */
/* Dynamic spacing that scales with viewport */

.space-xs through .space-2xl    /* Responsive gap utilities */
.px-xs through .px-xl           /* Responsive horizontal padding */
.py-xs through .py-xl           /* Responsive vertical padding */
.p-responsive                   /* All-sides responsive padding */
.px-responsive                  /* Left/right responsive padding */
.py-responsive                  /* Top/bottom responsive padding */
.gap-responsive                 /* Dynamic gap for flex/grid */

/* ==================== RESPONSIVE LAYOUTS ==================== */
/* Pre-configured layout systems */

.grid-responsive-2        /* 2-column grid with responsive items */
.grid-responsive-3        /* 3-column grid with responsive items */
.grid-responsive-4        /* 4-column grid with responsive items */
.flex-responsive         /* Flex that stacks on mobile */
.container-responsive    /* Full-width container with padding */
.section-responsive      /* Centered section with max-width */

/* ==================== RESPONSIVE COMPONENTS ==================== */
/* Ready-to-use responsive elements */

.card-responsive         /* Responsive card with padding and border */
.btn-touch              /* Touch-friendly button (min 44px) */
.img-responsive         /* Responsive images */
.heading-responsive-1   /* Responsive H1 */
.heading-responsive-2   /* Responsive H2 */
.heading-responsive-3   /* Responsive H3 */
.text-responsive        /* Responsive body text */
.text-responsive-sm     /* Responsive small text */

/* ==================== ASPECT RATIOS ==================== */
.aspect-video-responsive    /* 16:9 aspect ratio */
.aspect-square-responsive   /* 1:1 aspect ratio */

/* ==================== TAILWIND RESPONSIVE PREFIXES ==================== */
/* Use these with any Tailwind utility for breakpoint-specific styling */

/* Breakpoints */
xs:     /* 320px - Extra small phones */
sm:     /* 640px - Small phones */
md:     /* 768px - Tablets */
lg:     /* 1024px - Large tablets */
xl:     /* 1280px - Desktops */
2xl:    /* 1536px - Large desktops */

/* Special breakpoints */
touch:  /* Devices with touch support */
pointer: /* Devices with pointer/mouse */
landscape: /* Landscape orientation */
portrait:  /* Portrait orientation */

/* Examples:
   md:flex-row       - Stack on mobile, flex row on tablets
   lg:grid-cols-3    - 1 column mobile, 3 columns on large screens
   landscape:px-8    - Extra padding in landscape mode
*/

/* ==================== MEDIA QUERIES USED ==================== */

/* Base (mobile-first) - 320px+ */
/* Tablet - 600px+ */
/* Large tablet - 900px+ */
/* Landscape orientation specific adjustments */

/* ==================== USAGE EXAMPLES ==================== */

/*
  Responsive Grid:
  <div class="grid-responsive-3">
    <div class="card-responsive">...</div>
    <div class="card-responsive">...</div>
    <div class="card-responsive">...</div>
  </div>

  Responsive Heading:
  <h1 class="heading-responsive-1">Welcome</h1>

  Responsive Text:
  <p class="text-responsive">Description text that scales</p>

  Touch Button:
  <button class="btn-touch bg-primary text-white">Action</button>

  Responsive Flex:
  <div class="flex-responsive gap-responsive">
    <div class="flex-1">Item 1</div>
    <div class="flex-1">Item 2</div>
  </div>

  Responsive Container:
  <div class="container-responsive">
    <div class="section-responsive">
      Main content
    </div>
  </div>
*/

/* ==================== CLAMP FUNCTION USAGE ==================== */

/* clamp(MIN, PREFERRED, MAX) */
/* Example: font-size: clamp(1rem, 2.5vw, 1.5rem); */
/* - Minimum size: 1rem (16px on small phones) */
/* - Preferred: scales with 2.5% of viewport width */
/* - Maximum: 1.5rem (24px on large screens) */

/* ==================== KEY FEATURES ==================== */

✓ Mobile-first design
✓ Automatic scaling based on viewport
✓ Touch targets minimum 44px
✓ Safe area support for notched devices
✓ Landscape orientation adjustments
✓ Smooth scaling without breakpoints
✓ Optimized for all screen sizes (320px - 2560px)
✓ Performance optimized (GPU acceleration)
✓ Accessibility compliant
✓ iOS and Android specific optimizations
