import { isToday, parseISO } from 'date-fns';
import { User } from '@/types/user';

export type UserStatusType = 'online' | 'same-day' | 'offline';

export interface UserStatusInfo {
  type: UserStatusType;
  color: string;
  badgeVariant: 'default' | 'secondary' | 'outline';
  label: string;
}

export const getUserStatus = (user: User): UserStatusInfo => {
  const isOnlineNow = user.availability === 'online' || 
    (user.location?.isSharing && user.location?.latitude && user.location?.longitude);
  
  if (isOnlineNow) {
    return {
      type: 'online',
      color: 'bg-green-500',
      badgeVariant: 'default',
      label: 'Online'
    };
  }

  const lastSeenTime = user.location?.lastUpdated || user.lastActive;
  
  if (lastSeenTime) {
    try {
      const lastSeenDate = parseISO(lastSeenTime);
      if (isToday(lastSeenDate)) {
        return {
          type: 'same-day',
          color: 'bg-orange-500',
          badgeVariant: 'secondary',
          label: 'Active Today'
        };
      }
    } catch (error) {
      console.error('Error parsing last seen time:', error);
    }
  }

  return {
    type: 'offline',
    color: 'bg-gray-400 dark:bg-gray-600',
    badgeVariant: 'outline',
    label: 'Offline'
  };
};
