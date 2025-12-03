export interface FcmNotificationPayload {
  notification?: {
    title?: string;
    body?: string;
    icon?: string;
    image?: string;
    click_action?: string;
  };
  data?: Record<string, string> & {
    title?: string;
    body?: string;
    icon?: string;
    image?: string;
    url?: string;
    link?: string;
    type?: string;
    priority?: 'default' | 'urgent' | 'message';
    category?: string;
    silent?: string | 'true' | 'false';
  };
  from?: string;
  fcmMessageId?: string;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}
