
import { User } from '@/types';
import { Chat } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export const shouldBelongToStateGroup = (user: User, stateId: string): boolean => {
  return user.stateId === stateId || 
         (user.role === 'coordinator' || user.role === 'fom' || user.role === 'admin');
};

export const createStateGroup = (stateName: string, stateId: string, participantIds: string[]): Chat => {
  return {
    id: uuidv4(),
    name: `${stateName} Team Chat`,
    type: 'group',
    participants: participantIds,
    unreadCount: 0,
    messages: [],
    isGroup: true,
    isStateGroup: true,
    stateId: stateId,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};
