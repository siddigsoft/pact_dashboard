export type UserSettings = {
  id?: string;
  user_id?: string;
  settings?: {
    theme?: 'light' | 'dark' | 'system';
    defaultPage?: string;
    language?: string;
    [key: string]: any;
  };
  last_updated?: string;
};

export type DataVisibilitySettings = {
  id?: string;
  user_id?: string;
  options?: {
    showSensitiveData?: boolean;
    shareLocationWithTeam?: boolean;
    displayPersonalMetrics?: boolean;
    [key: string]: any;
  };
  last_updated?: string;
};

export type DashboardSettings = {
  id?: string;
  user_id?: string;
  layout?: {
    [key: string]: any;
  };
  widget_order?: string[];
  last_updated?: string;
};
