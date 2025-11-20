
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  roles?: string[];
  hubId?: string;
  stateId?: string;
  localityId?: string;
  avatar?: string;
  username?: string;
  fullName?: string;
  phone?: string;
  employeeId?: string;
  isApproved?: boolean;
  settings?: {
    language?: string;
    theme?: string;
    notificationPreferences?: {
      email: boolean;
      push: boolean;
      sms: boolean;
    };
  };
  location?: {
    latitude?: number;
    longitude?: number;
    lastUpdated?: string;
    isSharing?: boolean;
  };
  lastActive: string;
  availability: 'online' | 'offline' | 'busy';
  performance?: {
    rating: number;
    totalCompletedTasks: number;
    onTimeCompletion: number;
  };
  password?: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  contentType: 'text' | 'image' | 'file' | 'location' | 'audio';
  timestamp: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  attachments?: { url: string; type: string; name: string; size?: number }[];
  metadata?: any;
  readBy: string[];
  read: boolean;
}

export interface Chat {
  id: string;
  name: string;
  type: 'private' | 'group' | 'support';
  participants: string[];
  unreadCount: number;
  messages: string[];
  isGroup: boolean;
  isStateGroup?: boolean;
  stateId?: string;
  status: 'active' | 'archived';
  lastMessage?: ChatMessage;
  pinnedMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SiteVisit {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'assigned' | 'in-progress' | 'completed' | 'verified' | 'cancelled';
  mmpId?: string;
  mmpName?: string;
  assignedTo?: string;
  assignedBy?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  scheduledDate?: string;
  completedDate?: string;
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  urgency: 'low' | 'medium' | 'high' | 'critical';
  rating?: number;
  rating_notes?: string;
  payment?: {
    amount: number;
    status: 'pending' | 'approved' | 'paid' | 'rejected';
    approvedBy?: string;
    approvedAt?: string;
    notes?: string;
  };
  entries?: SiteEntry[];
  comments?: SiteComment[];
  attachments?: Attachment[];
  supervisorNotes?: string;
  siteDetails?: {
    permitNumber?: string;
    permitVerified?: boolean;
    permitVerifiedBy?: string;
    permitVerifiedAt?: string;
    contactPerson?: string;
    contactPhone?: string;
    siteType?: string;
  };
}

export interface SiteEntry {
  id: string;
  siteVisitId: string;
  title: string;
  description?: string;
  status: 'pending' | 'completed';
  createdAt: string;
  updatedAt: string;
  data?: any;
  attachments?: Attachment[];
  notes?: string;
}

export interface SiteComment {
  id: string;
  siteVisitId: string;
  userId: string;
  text: string;
  createdAt: string;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  type: 'image' | 'document' | 'video' | 'audio';
  url: string;
  filename: string;
  size?: number;
  uploadedAt: string;
  uploadedBy: string;
}
