import { supabase } from '@/integrations/supabase/client';

export type GoogleDrivePickedFile = {
  id: string;
  name: string;
  mimeType?: string;
};

declare global {
  interface Window {
    gapi?: {
      load: (api: string, opts: { callback: () => void }) => void;
    };
    google?: {
      picker: {
        Action: { PICKED: string; CANCEL: string };
        Feature: { MULTISELECT_ENABLED: string };
        ViewId: { DOCS: string };
        PickerBuilder: new () => GooglePickerBuilder;
        Response: { ACTION: string; DOCUMENTS: string };
        Document: { ID: string; NAME: string; MIME_TYPE: string };
      };
    };
  }
}

interface GooglePickerBuilder {
  addView: (viewId: string) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  setTitle: (title: string) => GooglePickerBuilder;
  enableFeature: (feature: string) => GooglePickerBuilder;
  setCallback: (cb: (data: Record<string, unknown>) => void) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
}

let pickerApiPromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

export async function loadGooglePickerApi(): Promise<void> {
  if (pickerApiPromise) return pickerApiPromise;
  pickerApiPromise = (async () => {
    await loadScript('https://apis.google.com/js/api.js');
    await new Promise<void>((resolve, reject) => {
      if (!window.gapi?.load) {
        reject(new Error('Google API client failed to load'));
        return;
      }
      window.gapi.load('picker', {
        callback: () => resolve(),
      });
    });
  })();
  return pickerApiPromise;
}

export async function fetchGoogleDriveAccessToken(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-oauth?action=token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    },
  );

  const result = await response.json() as { access_token?: string; error?: string };
  if (!response.ok || result.error || !result.access_token) {
    throw new Error(result.error || 'Failed to get Google Drive access token');
  }
  return result.access_token;
}

export async function openGoogleDrivePicker(options: {
  title?: string;
  onPicked: (files: GoogleDrivePickedFile[]) => void;
  onCancel?: () => void;
}): Promise<void> {
  const developerKey = import.meta.env.VITE_GOOGLE_API_KEY;
  const appId = import.meta.env.VITE_GOOGLE_APP_ID;
  if (!developerKey) {
    throw new Error('Google Picker is not configured. Set VITE_GOOGLE_API_KEY.');
  }

  await loadGooglePickerApi();
  const oauthToken = await fetchGoogleDriveAccessToken();
  const picker = window.google?.picker;
  if (!picker) throw new Error('Google Picker API is unavailable');

  const builder = new picker.PickerBuilder()
    .addView(picker.ViewId.DOCS)
    .setOAuthToken(oauthToken)
    .setDeveloperKey(developerKey)
    .setTitle(options.title ?? 'Select files from Google Drive')
    .enableFeature(picker.Feature.MULTISELECT_ENABLED)
    .setCallback((data) => {
      const action = data[picker.Response.ACTION] as string | undefined;
      if (action === picker.Action.CANCEL) {
        options.onCancel?.();
        return;
      }
      if (action !== picker.Action.PICKED) return;

      const docs = (data[picker.Response.DOCUMENTS] as Array<Record<string, string>> | undefined) ?? [];
      const files = docs
        .map((doc) => ({
          id: doc[picker.Document.ID],
          name: doc[picker.Document.NAME],
          mimeType: doc[picker.Document.MIME_TYPE],
        }))
        .filter((doc) => doc.id && doc.name);

      if (files.length > 0) options.onPicked(files);
    });

  if (appId) builder.setAppId(appId);

  builder.build().setVisible(true);
}