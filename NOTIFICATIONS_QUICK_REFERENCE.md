# WhatsApp Notifications - Quick Reference Card

## 🚀 Get Started in 30 Seconds

```typescript
// 1. Import the hook
import { useNotifications } from './context/NotificationContext';

// 2. Use in your component
export function MyComponent() {
  const { success, error, warning, info, task } = useNotifications();
  
  return (
    <button onClick={() => success('Done!', 'Operation completed')}>
      Click Me
    </button>
  );
}
```

## 📊 Notification Types

```typescript
success('Title', 'Description')    // ✅ Green - Success
error('Title', 'Description')      // ❌ Red - Error
warning('Title', 'Description')    // ⚠️ Orange - Warning
info('Title', 'Description')       // ℹ️ Blue - Info
task('Title', 'Description')       // 🔄 Purple - Task/Loading
```

## ⏱️ Custom Duration

```typescript
// Default: 3000ms (auto-dismiss)
success('Title', 'Description');

// Custom duration (5 seconds)
success('Title', 'Description', 5000);

// Or no auto-dismiss
success('Title', 'Description', Infinity);
```

## 📝 Common Patterns

### Save Data
```typescript
const { success, error } = useNotifications();

const handleSave = async () => {
  try {
    await save();
    success('Saved', 'Changes saved successfully');
  } catch (err) {
    error('Failed', 'Unable to save');
  }
};
```

### Delete Item
```typescript
const { warning, success, error } = useNotifications();

const handleDelete = async () => {
  warning('Deleting', 'Please wait...');
  try {
    await deleteItem();
    success('Deleted', 'Item removed');
  } catch (err) {
    error('Failed', 'Could not delete');
  }
};
```

### Load Data
```typescript
const { task, success, error } = useNotifications();

const handleLoad = async () => {
  task('Loading', 'Fetching data...');
  try {
    const data = await fetch();
    success('Loaded', 'Ready');
  } catch (err) {
    error('Error', 'Failed to load');
  }
};
```

### Form Validation
```typescript
const { error } = useNotifications();

const handleSubmit = (form) => {
  if (!form.email) {
    error('Validation', 'Email required');
    return;
  }
  // Continue...
};
```

## 🎨 Colors Reference

| Type | Color | Hex Code |
|------|-------|----------|
| Success | Green | #25D366 |
| Error | Red | #FF4B4B |
| Warning | Orange | #FFB81C |
| Info | Blue | #007AFF |
| Task | Purple | #5B21B6 |

## 🎬 Animations

| Type | Animation |
|------|-----------|
| Success | SlideDown + Pulse |
| Error | SlideDown + Shake |
| Warning | SlideDown + Bounce |
| Info | SlideDown + Pulse |
| Task | SlideDown + Spin |

## 📱 Mobile-Only

✅ Automatically shows on mobile app only
✅ Hidden on web browser
✅ No configuration needed
✅ Platform detection automatic

## 🔍 Debug Tips

```typescript
// Check if hook is available
const notifications = useNotifications();
console.log(notifications); // Should show { success, error, warning, info, task, ... }

// Test notification
notifications.success('Test', 'If you see this, it works!');
```

## 📂 File Locations

```
src/
├── context/NotificationContext.tsx       ← Hook & Provider
├── components/NotificationStack.tsx      ← Display component
├── hooks/useWhatsAppNotifications.ts    ← Logic
└── styles/whatsapp-notifications.css    ← Styling

App.tsx                                    ← Integrated
src/index.css                              ← Imports CSS
```

## ✅ Checklist Before Deploy

- [ ] Test success notification
- [ ] Test error notification  
- [ ] Test warning notification
- [ ] Test info notification
- [ ] Test task notification
- [ ] Test on actual mobile device
- [ ] Verify animations are smooth
- [ ] Check colors look correct
- [ ] Verify auto-dismiss works
- [ ] Build: `npm run build && npx cap sync`

## 🆘 Troubleshooting

**Not seeing notifications?**
→ Are you on mobile? System only shows on native app

**Import error?**
→ Path: `'./context/NotificationContext'` (not NotificationProvider)

**Wrong colors?**
→ Check `whatsapp-notifications.css` in `src/styles/`

**Animations stuttering?**
→ Check device performance, test different animations

## 📚 Full Documentation

- **Complete Guide**: `WHATSAPP_NOTIFICATIONS_USAGE.md`
- **Real Examples**: `src/components/NotificationExamples.tsx`
- **Status Report**: `NOTIFICATION_INTEGRATION_STATUS.md`
- **Mobile Guide**: `MOBILE_DEVELOPER_GUIDE.md`

---

**Ready to use! Start adding notifications to your components.**
