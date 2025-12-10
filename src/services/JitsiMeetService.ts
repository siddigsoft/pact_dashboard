export interface JitsiRoomConfig {
  roomName: string;
  displayName: string;
  email?: string;
  avatarURL?: string;
  subject?: string;
  isAudioOnly?: boolean;
}

export interface JitsiMeetApi {
  dispose: () => void;
  executeCommand: (command: string, ...args: any[]) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
}

type JitsiEventHandler = (data?: any) => void;

interface JitsiEventHandlers {
  onReadyToClose?: JitsiEventHandler;
  onVideoConferenceJoined?: JitsiEventHandler;
  onVideoConferenceLeft?: JitsiEventHandler;
  onParticipantJoined?: JitsiEventHandler;
  onParticipantLeft?: JitsiEventHandler;
  onAudioMuteStatusChanged?: JitsiEventHandler;
  onVideoMuteStatusChanged?: JitsiEventHandler;
  onEndpointTextMessageReceived?: JitsiEventHandler;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (domain: string, options: any) => JitsiMeetApi;
  }
}

class JitsiMeetService {
  private api: JitsiMeetApi | null = null;
  private domain: string = 'meet.jit.si';
  private scriptLoaded: boolean = false;
  private loadPromise: Promise<void> | null = null;

  async loadJitsiScript(): Promise<void> {
    if (this.scriptLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = new Promise((resolve, reject) => {
      if (typeof window.JitsiMeetExternalAPI !== 'undefined') {
        this.scriptLoaded = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://${this.domain}/external_api.js`;
      script.async = true;

      script.onload = () => {
        this.scriptLoaded = true;
        console.log('[Jitsi] External API loaded');
        resolve();
      };

      script.onerror = () => {
        console.error('[Jitsi] Failed to load external API');
        reject(new Error('Failed to load Jitsi Meet API'));
      };

      document.head.appendChild(script);
    });

    return this.loadPromise;
  }

  generateRoomName(userId1: string, userId2: string): string {
    const ids = [userId1, userId2].sort();
    const combined = `pact-${ids[0].substring(0, 8)}-${ids[1].substring(0, 8)}`;
    return combined.replace(/[^a-zA-Z0-9-]/g, '');
  }

  generateGroupRoomName(groupId: string): string {
    const sanitized = groupId.replace(/[^a-zA-Z0-9]/g, '');
    return `pact-group-${sanitized.substring(0, 16)}-${Date.now().toString(36)}`;
  }

  async startMeeting(
    containerId: string,
    config: JitsiRoomConfig,
    eventHandlers?: JitsiEventHandlers
  ): Promise<JitsiMeetApi> {
    await this.loadJitsiScript();

    if (this.api) {
      this.api.dispose();
      this.api = null;
    }

    const containerElement = document.getElementById(containerId);
    if (!containerElement) {
      throw new Error(`Container element #${containerId} not found`);
    }

    const options = {
      roomName: config.roomName,
      parentNode: containerElement,
      width: '100%',
      height: '100%',
      userInfo: {
        displayName: config.displayName,
        email: config.email || '',
        avatarURL: config.avatarURL || ''
      },
      configOverwrite: {
        prejoinPageEnabled: false,
        startWithAudioMuted: false,
        startWithVideoMuted: config.isAudioOnly === true,
        disableDeepLinking: true,
        enableClosePage: false,
        hideConferenceSubject: !config.subject,
        subject: config.subject || '',
        enableWelcomePage: false,
        toolbarButtons: [
          'microphone',
          'camera',
          'closedcaptions',
          'desktop',
          'fullscreen',
          'hangup',
          'chat',
          'settings',
          'raisehand',
          'videoquality',
          'tileview',
          'toggle-camera'
        ],
        disableThirdPartyRequests: true,
        constraints: {
          video: {
            height: { ideal: 720, max: 1080, min: 360 }
          }
        },
        p2p: {
          enabled: true,
          stunServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        },
        analytics: {
          disabled: true
        }
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        SHOW_PROMOTIONAL_CLOSE_PAGE: false,
        TOOLBAR_ALWAYS_VISIBLE: true,
        MOBILE_APP_PROMO: false,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        DISABLE_FOCUS_INDICATOR: true,
        DEFAULT_BACKGROUND: '#1a1a1a',
        DEFAULT_LOCAL_DISPLAY_NAME: config.displayName,
        GENERATE_ROOMNAMES_ON_WELCOME_PAGE: false,
        HIDE_INVITE_MORE_HEADER: true,
        RECENT_LIST_ENABLED: false
      }
    };

    this.api = new window.JitsiMeetExternalAPI(this.domain, options);

    if (eventHandlers) {
      if (eventHandlers.onReadyToClose) {
        this.api.on('readyToClose', eventHandlers.onReadyToClose);
      }
      if (eventHandlers.onVideoConferenceJoined) {
        this.api.on('videoConferenceJoined', eventHandlers.onVideoConferenceJoined);
      }
      if (eventHandlers.onVideoConferenceLeft) {
        this.api.on('videoConferenceLeft', eventHandlers.onVideoConferenceLeft);
      }
      if (eventHandlers.onParticipantJoined) {
        this.api.on('participantJoined', eventHandlers.onParticipantJoined);
      }
      if (eventHandlers.onParticipantLeft) {
        this.api.on('participantLeft', eventHandlers.onParticipantLeft);
      }
      if (eventHandlers.onAudioMuteStatusChanged) {
        this.api.on('audioMuteStatusChanged', eventHandlers.onAudioMuteStatusChanged);
      }
      if (eventHandlers.onVideoMuteStatusChanged) {
        this.api.on('videoMuteStatusChanged', eventHandlers.onVideoMuteStatusChanged);
      }
      if (eventHandlers.onEndpointTextMessageReceived) {
        this.api.on('endpointTextMessageReceived', eventHandlers.onEndpointTextMessageReceived);
      }
    }

    console.log('[Jitsi] Meeting started:', config.roomName);
    return this.api;
  }

  async joinExternalRoom(
    containerId: string,
    roomUrl: string,
    displayName: string,
    eventHandlers?: JitsiEventHandlers
  ): Promise<JitsiMeetApi | null> {
    const urlMatch = roomUrl.match(/^https?:\/\/([^\/]+)\/(.+)$/);
    if (!urlMatch) {
      console.error('[Jitsi] Invalid room URL:', roomUrl);
      return null;
    }

    const domain = urlMatch[1];
    const roomName = urlMatch[2];

    await this.loadJitsiScript();

    if (this.api) {
      this.api.dispose();
      this.api = null;
    }

    const containerElement = document.getElementById(containerId);
    if (!containerElement) {
      throw new Error(`Container element #${containerId} not found`);
    }

    const options = {
      roomName: roomName,
      parentNode: containerElement,
      width: '100%',
      height: '100%',
      userInfo: { displayName }
    };

    this.api = new window.JitsiMeetExternalAPI(domain, options);

    if (eventHandlers?.onReadyToClose) {
      this.api.on('readyToClose', eventHandlers.onReadyToClose);
    }
    if (eventHandlers?.onVideoConferenceJoined) {
      this.api.on('videoConferenceJoined', eventHandlers.onVideoConferenceJoined);
    }
    if (eventHandlers?.onVideoConferenceLeft) {
      this.api.on('videoConferenceLeft', eventHandlers.onVideoConferenceLeft);
    }

    return this.api;
  }

  toggleAudio(): void {
    this.api?.executeCommand('toggleAudio');
  }

  toggleVideo(): void {
    this.api?.executeCommand('toggleVideo');
  }

  hangup(): void {
    this.api?.executeCommand('hangup');
  }

  toggleShareScreen(): void {
    this.api?.executeCommand('toggleShareScreen');
  }

  toggleTileView(): void {
    this.api?.executeCommand('toggleTileView');
  }

  toggleChat(): void {
    this.api?.executeCommand('toggleChat');
  }

  setDisplayName(name: string): void {
    this.api?.executeCommand('displayName', name);
  }

  sendEndpointMessage(participantId: string, message: any): void {
    this.api?.executeCommand('sendEndpointTextMessage', participantId, JSON.stringify(message));
  }

  getMeetingUrl(roomName: string): string {
    return `https://${this.domain}/${roomName}`;
  }

  dispose(): void {
    if (this.api) {
      this.api.dispose();
      this.api = null;
      console.log('[Jitsi] Meeting disposed');
    }
  }

  isActive(): boolean {
    return this.api !== null;
  }
}

export const jitsiMeetService = new JitsiMeetService();
