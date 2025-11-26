import { MapPin, Camera, Bell, HardDrive, X, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PermissionType } from '@/hooks/use-mobile-permissions';

interface PermissionPromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permissionType: PermissionType | null;
  onAllow: () => void;
  onDeny: () => void;
  title?: string;
  description?: string;
}

const permissionConfig = {
  location: {
    icon: MapPin,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    defaultTitle: 'Location Access',
    defaultDescription: 'PACT needs your location to track field visits and share your position with your team for effective coordination.',
    benefits: [
      'Track site visit locations accurately',
      'Share real-time position with coordinators',
      'Get directions to assigned sites',
    ],
  },
  camera: {
    icon: Camera,
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
    defaultTitle: 'Camera Access',
    defaultDescription: 'PACT needs camera access to capture site photos and document field conditions during visits.',
    benefits: [
      'Capture site visit photos',
      'Document field conditions',
      'Verify visit completion',
    ],
  },
  notifications: {
    icon: Bell,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    defaultTitle: 'Push Notifications',
    defaultDescription: 'Stay informed about new assignments, approval updates, and important team messages.',
    benefits: [
      'Receive assignment alerts',
      'Get approval notifications',
      'Stay updated on team messages',
    ],
  },
  storage: {
    icon: HardDrive,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    defaultTitle: 'Storage Access',
    defaultDescription: 'PACT needs storage access to save data offline and work in areas with limited connectivity.',
    benefits: [
      'Work offline when needed',
      'Cache site data locally',
      'Sync when connection returns',
    ],
  },
};

export function PermissionPromptModal({
  open,
  onOpenChange,
  permissionType,
  onAllow,
  onDeny,
  title,
  description,
}: PermissionPromptModalProps) {
  if (!permissionType) return null;

  const config = permissionConfig[permissionType];
  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md mx-4 rounded-xl">
        <DialogHeader className="text-center pb-2">
          <div className="mx-auto mb-4">
            <div className={`p-4 rounded-full ${config.iconBg} inline-block`}>
              <Icon className={`h-8 w-8 ${config.iconColor}`} />
            </div>
          </div>
          <DialogTitle className="text-xl font-semibold">
            {title || config.defaultTitle}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-2">
            {description || config.defaultDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <p className="text-sm font-medium text-muted-foreground">This enables:</p>
          <ul className="space-y-2">
            {config.benefits.map((benefit, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <Shield className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={onAllow}
            className="w-full min-h-[44px]"
            data-testid="button-allow-permission"
          >
            Allow Access
          </Button>
          <Button
            variant="ghost"
            onClick={onDeny}
            className="w-full min-h-[44px] text-muted-foreground"
            data-testid="button-deny-permission"
          >
            Not Now
          </Button>
        </DialogFooter>

        <p className="text-xs text-center text-muted-foreground pt-2">
          You can change this later in Settings
        </p>
      </DialogContent>
    </Dialog>
  );
}
