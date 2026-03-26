# Mobile Responsive Design - Developer Implementation Guide

## Quick Start for Components

### 1. Responsive Headings
```jsx
// Example: Dashboard page
<h1 className="text-heading-1">Dashboard</h1>
<h2 className="text-heading-2">Projects</h2>
<h3 className="text-heading-3">Active Items</h3>

// Or with Tailwind (with responsive sizing)
<h1 className="sm:text-2xl md:text-3xl lg:text-4xl">Title</h1>
```

### 2. Responsive Containers
```jsx
<div className="container-responsive section-responsive">
  {/* Content automatically centered and padded */}
  {children}
</div>
```

### 3. Responsive Grids
```jsx
// 3-column auto-fit grid
<div className="grid-responsive-3 gap-responsive">
  {items.map(item => (
    <div className="card-responsive" key={item.id}>
      {item.content}
    </div>
  ))}
</div>

// 2-column grid
<div className="grid-responsive-2">
  {/* Content */}
</div>
```

### 4. Responsive Lists/Flex
```jsx
// Stacks on mobile, flexes on tablet+
<div className="flex-responsive gap-responsive">
  <div className="flex-1">Left</div>
  <div className="flex-1">Right</div>
</div>
```

### 5. Responsive Text
```jsx
<p className="text-body">Regular body text</p>
<p className="text-body-sm">Smaller body text</p>
<small className="text-caption">Small caption text</small>
```

### 6. Touch-Friendly Buttons
```jsx
// Always 44px min height (Apple standard)
<button className="btn-touch bg-primary text-white">
  Click Me
</button>

// Or with more styling
<button className="btn-touch bg-primary text-white rounded-lg shadow-md">
  Action Button
</button>
```

### 7. Responsive Forms
```jsx
<div className="p-responsive">
  <input 
    type="text" 
    className="w-full min-h-touch px-responsive py-responsive"
    placeholder="Type something..."
  />
</div>
```

### 8. Responsive Images
```jsx
<img 
  src="/image.jpg"
  alt="Description"
  className="img-responsive rounded-lg"
/>
```

### 9. Responsive Cards
```jsx
<div className="card-responsive">
  <h3 className="text-heading-3 mb-responsive">Title</h3>
  <p className="text-body">Card content here</p>
</div>
```

### 10. Responsive Sections
```jsx
<section className="section-responsive">
  <h2 className="heading-responsive-2 mb-responsive">
    Section Title
  </h2>
  <div className="grid-responsive-3 gap-responsive">
    {/* Content grid */}
  </div>
</section>
```

---

## Tailwind Responsive Utilities

### Breakpoint Prefixes
```jsx
// Use Tailwind's responsive prefixes
<div className="px-4 sm:px-6 md:px-8 lg:px-10">
  Responsive padding
</div>

// Grid columns
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
  Items
</div>

// Flex direction
<div className="flex flex-col md:flex-row gap-4">
  Items
</div>
```

### Custom Screen Sizes
```jsx
// Use custom breakpoints
<div className="xs:text-sm sm:text-base md:text-lg">
  Text with custom sizes
</div>

// Touch vs pointer devices
<div className="touch:py-4 pointer:py-2">
  Device-specific padding
</div>

// Orientation
<div className="portrait:px-4 landscape:px-8">
  Orientation-specific padding
</div>
```

---

## Best Practices

### 1. Mobile-First Development
```jsx
// ❌ Wrong - Desktop first
<div className="hidden md:block">Desktop Only</div>

// ✅ Right - Mobile first
<div className="md:flex">Mobile responsive</div>
```

### 2. Use Clamp for Typography
```jsx
// ✅ Best - Smooth scaling
<h1 className="text-heading-1">Title</h1>

// ✅ Good - Tailwind responsive
<h1 className="text-2xl sm:text-3xl md:text-4xl">Title</h1>

// ❌ Avoid - Fixed sizes
<h1 className="text-2xl">Title</h1>
```

### 3. Respect Touch Targets
```jsx
// ✅ Touch-friendly (44px+)
<button className="btn-touch">Click</button>

// ⚠️ Too small
<button className="py-1 px-2">Click</button>

// ✅ Accessible minimum
<button className="py-3 px-4">Click</button>
```

### 4. Use Responsive Containers
```jsx
// ✅ Responsive padding
<div className="px-responsive">Content</div>

// ✅ Responsive gap
<div className="flex gap-responsive">Items</div>

// ❌ Fixed spacing
<div className="px-4">Content</div>
```

### 5. Optimize Images
```jsx
// ✅ Always responsive
<img src="..." alt="..." className="img-responsive" />

// ✅ With aspect ratio
<img 
  src="..." 
  alt="..."
  className="img-responsive w-full aspect-video-responsive"
/>

// ❌ Fixed dimensions
<img src="..." width="400" height="300" />
```

---

## Common Patterns

### 1. Dashboard with Cards
```jsx
export default function Dashboard() {
  return (
    <div className="container-responsive">
      <h1 className="text-heading-1 mb-responsive">Dashboard</h1>
      <div className="grid-responsive-3 gap-responsive">
        {dashboardCards.map(card => (
          <div className="card-responsive" key={card.id}>
            <h3 className="text-heading-3">{card.title}</h3>
            <p className="text-body">{card.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 2. Form Layout
```jsx
export default function FormPage() {
  return (
    <div className="container-responsive p-responsive">
      <h2 className="text-heading-2 mb-responsive">Create Item</h2>
      <form className="flex-col-responsive gap-responsive">
        <input 
          type="text"
          className="w-full min-h-touch px-responsive py-responsive border"
          placeholder="Name"
        />
        <textarea
          className="w-full min-h-touch px-responsive py-responsive border"
          placeholder="Description"
        />
        <button className="btn-touch bg-primary text-white">
          Submit
        </button>
      </form>
    </div>
  );
}
```

### 3. List Page
```jsx
export default function ListPage() {
  return (
    <div className="container-responsive">
      <h1 className="text-heading-1 mb-responsive">Items</h1>
      <div className="flex-col-responsive gap-responsive">
        {items.map(item => (
          <div className="card-responsive" key={item.id}>
            <div className="flex-responsive">
              <div className="flex-1">
                <h3 className="text-heading-3">{item.title}</h3>
                <p className="text-body-sm">{item.desc}</p>
              </div>
              <button className="btn-touch bg-accent text-white">
                Action
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 4. Navigation
```jsx
export default function Navigation() {
  return (
    <nav className="px-responsive py-responsive border-b">
      <div className="flex-responsive justify-between items-center">
        <h1 className="text-heading-2">App</h1>
        <div className="flex-responsive gap-responsive">
          <a className="btn-touch">Home</a>
          <a className="btn-touch">Settings</a>
        </div>
      </div>
    </nav>
  );
}
```

---

## Debugging Responsive Design

### 1. Check Platform
```javascript
// In browser console
document.body.getAttribute('data-platform')  // Should return 'mobile' or 'web'
document.body.classList.contains('mobile-app')  // Should be true on mobile
```

### 2. Test Different Sizes
```javascript
// Simulate viewport sizes
// DevTools > Device Toolbar (Cmd+Shift+M on Mac)
// Test: 320px, 375px, 768px, 1024px, 1366px
```

### 3. Check Safe Areas
```css
/* In DevTools - check computed safe-area-inset values */
/* Should show padding on notched devices */
```

### 4. Verify Fonts Loading
```javascript
// Check in DevTools > Application > Fonts
// Should see: Inter, Plus Jakarta Sans, Fira Code, Merriweather
```

---

## Performance Tips

### 1. Use CSS Variables
```jsx
// Faster than recalculating values
// All spacing scales use CSS variables from mobile-only-theme.css
```

### 2. GPU Acceleration
```jsx
// For animations/scrolling
<div className="gpu-accelerated">
  {/* Animated content */}
</div>
```

### 3. Lazy Load Images
```jsx
<img 
  src="..." 
  alt="..."
  className="img-responsive"
  loading="lazy"
/>
```

### 4. Avoid Layout Thrashing
```jsx
// ✅ Use clamp() - single layout calculation
<h1 className="text-heading-1">Title</h1>

// ❌ Multiple media queries - multiple calculations
<h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl">Title</h1>
```

---

## Component Checklist

Before shipping a component, ensure:

- [ ] Responsive on 320px (small phone)
- [ ] Responsive on 375px (regular phone)
- [ ] Responsive on 600px (tablet portrait)
- [ ] Responsive on 900px (tablet landscape)
- [ ] Touch targets minimum 44px
- [ ] Text readable without zooming
- [ ] Images scale properly
- [ ] Forms are accessible
- [ ] Safe area respected on notched devices
- [ ] Works in both portrait and landscape
- [ ] Performance tested (no layout thrashing)
- [ ] Colors have sufficient contrast

---

## Resources

- Responsive Design Guide: `src/styles/responsive-design-guide.md`
- Mobile Styles: `src/styles/mobile-only-theme.css`
- Mobile Utils: `src/styles/mobile.css`
- Config: `src/config/themeConfig.ts`
- Platform Detection: `src/utils/platformDetection.ts`

---

**Happy responsive coding! 🚀**
