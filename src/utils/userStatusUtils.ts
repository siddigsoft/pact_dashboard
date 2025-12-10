import { isToday, parseISO, differenceInMinutes } from 'date-fns';
import { User } from '@/types/user';

export type UserStatusType = 'online' | 'same-day' | 'offline';

export interface UserStatusInfo {
  type: UserStatusType;
  color: string;
  badgeVariant: 'default' | 'secondary' | 'outline';
  label: string;
}

const ONLINE_THRESHOLD_MINUTES = 5;

export const getUserStatus = (user: User): UserStatusInfo => {
  const avail = (user.availability || '').toLowerCase();
  if (avail === 'offline') {
    return {
      type: 'offline',
      color: 'bg-gray-400 dark:bg-gray-600',
      badgeVariant: 'outline',
      label: 'Offline'
    };
  }

  if (avail === 'busy') {
    return {
      type: 'same-day',
      color: 'bg-orange-500',
      badgeVariant: 'secondary',
      label: 'Busy'
    };
  }

  if (avail === 'online') {
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
      const minutesAgo = differenceInMinutes(new Date(), lastSeenDate);
      
      const hasValidLocation = user.location?.latitude && user.location?.longitude;
      const isRecentlyActive = minutesAgo <= ONLINE_THRESHOLD_MINUTES;
      
      if (hasValidLocation && isRecentlyActive) {
        return {
          type: 'online',
          color: 'bg-green-500',
          badgeVariant: 'default',
          label: 'Online'
        };
      }
      
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
