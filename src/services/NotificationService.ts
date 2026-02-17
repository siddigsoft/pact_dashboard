import { toast } from '@/components/ui/sonner';

type NotifyOptions = {
  title?: string;
  message?: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  showToast?: boolean;
  /** sonner toast options passthrough */
  options?: Record<string, unknown>;
};

export const NotificationService = {
  send({ title, message, type = 'info', showToast = true, options }: NotifyOptions) {
    if (!showToast) return;

    const text = title || message || '';

    try {
      switch (type) {
        case 'success':
          // title as main text, message as description
          toast.success(text, { description: message, ...(options as any) });
          break;
        case 'error':
          toast.error(text, { description: message, ...(options as any) });
          break;
        case 'warning':
          toast('⚠️ ' + text, { description: message, ...(options as any) });
          break;
        default:
          toast(text, { description: message, ...(options as any) });
      }
    } catch (e) {
      // Fallback to console logging if toast fails (e.g., during non-browser transforms)
      // This keeps the module safe to import in server-like environments.
      // eslint-disable-next-line no-console
      console.log('[NotificationService] ', type, title, message, e);
    }
  },
};

export default NotificationService;
