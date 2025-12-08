import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type CallSignal = {
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-request' | 'call-accepted' | 'call-rejected' | 'call-ended' | 'call-busy';
  from: string;
  to: string;
  fromName: string;
  fromAvatar?: string;
  callId: string;
  callToken: string;
  payload?: any;
  timestamp: number;
};

export type CallEventHandler = {
  onIncomingCall: (callerId: string, callerName: string, callerAvatar?: string, callId?: string) => void;
  onCallAccepted: () => void;
  onCallRejected: () => void;
  onCallEnded: () => void;
  onCallBusy: () => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
};

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

const generateSecureToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

const generateCallId = (): string => {
  return `call_${Date.now()}_${generateSecureToken().substring(0, 16)}`;
};

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private signalingChannel: RealtimeChannel | null = null;
  private currentUserId: string | null = null;
  private currentUserName: string = '';
  private currentUserAvatar: string | undefined;
  private eventHandlers: CallEventHandler | null = null;
  private pendingIceCandidates: RTCIceCandidate[] = [];
  private isInitiator: boolean = false;
  private targetUserId: string | null = null;
  
  private currentCallId: string | null = null;
  private currentCallToken: string | null = null;
  private callChannels: Map<string, RealtimeChannel> = new Map();
  
  private callPresenceChannel: RealtimeChannel | null = null;
  private userPresenceChannel: RealtimeChannel | null = null;

  async initialize(userId: string, userName: string, userAvatar?: string, handlers?: CallEventHandler) {
    this.currentUserId = userId;
    this.currentUserName = userName;
    this.currentUserAvatar = userAvatar;
    if (handlers) {
      this.eventHandlers = handlers;
    }

    await this.setupSignalingChannel();
    await this.setupUserPresence();
  }

  private async setupUserPresence() {
    if (!this.currentUserId) return;

    if (this.userPresenceChannel) {
      await supabase.removeChannel(this.userPresenceChannel);
    }

    this.userPresenceChannel = supabase
      .channel('user-call-presence')
      .on('presence', { event: 'sync' }, () => {
        // Presence sync handled
      })
      .on('presence', { event: 'leave' }, async ({ leftPresences }) => {
        // If peer left during active call, end it
        if (this.currentCallId && this.targetUserId) {
          const peerLeft = leftPresences.some((p: any) => p.userId === this.targetUserId);
          if (peerLeft) {
            this.eventHandlers?.onCallEnded();
            this.cleanup();
          }
        }
      });

    await this.userPresenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await this.userPresenceChannel?.track({
          userId: this.currentUserId,
          online: true,
          inCall: false,
          callId: null,
          callToken: null,
        });
      }
    });
  }

  private async updateUserPresence(inCall: boolean, callId: string | null = null) {
    if (!this.userPresenceChannel || !this.currentUserId) return;
    
    await this.userPresenceChannel.track({
      userId: this.currentUserId,
      online: true,
      inCall,
      callId,
      callToken: null,
    });
  }

  private async updateUserPresenceWithToken(inCall: boolean, callId: string | null, callToken: string | null) {
    if (!this.userPresenceChannel || !this.currentUserId) return;
    
    await this.userPresenceChannel.track({
      userId: this.currentUserId,
      online: true,
      inCall,
      callId,
      callToken,
    });
  }

  private async checkUserBusy(userId: string): Promise<boolean> {
    if (!this.userPresenceChannel) return false;
    
    const presenceState = this.userPresenceChannel.presenceState();
    for (const key in presenceState) {
      const presences = presenceState[key] as any[];
      for (const p of presences) {
        if (p.userId === userId && p.inCall) {
          return true;
        }
      }
    }
    return false;
  }

  setEventHandlers(handlers: CallEventHandler) {
    this.eventHandlers = handlers;
  }

  private async setupSignalingChannel() {
    if (!this.currentUserId) return;

    if (this.signalingChannel) {
      await supabase.removeChannel(this.signalingChannel);
    }

    // Use a predictable channel name that senders can construct
    const channelName = `calls:user:${this.currentUserId}`;
    
    this.signalingChannel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'call-signal' }, async ({ payload }) => {
        const signal = payload as CallSignal;
        
        if (signal.to !== this.currentUserId) return;
        
        const isAuthorized = await this.validateSignal(signal);
        if (!isAuthorized) {
          console.warn('[WebRTC] Unauthorized signal rejected:', signal.type);
          return;
        }
        
        await this.handleSignal(signal);
      })
      .subscribe();
  }

  private async validateSignal(signal: CallSignal): Promise<boolean> {
    if (signal.type === 'call-request') {
      // Verify caller is not spoofing by checking their presence
      const callerInCall = await this.verifyUserInCall(signal.from, signal.callId, signal.callToken);
      if (!callerInCall) {
        console.warn('[WebRTC] Call request from user not in presence:', signal.from);
        return false;
      }
      return true;
    }

    if (!signal.callId || !signal.callToken) {
      console.warn('[WebRTC] Missing callId or callToken');
      return false;
    }

    // Verify signal matches our current call
    if (this.currentCallId && signal.callId === this.currentCallId) {
      // Verify sender is in presence with matching call data
      const senderVerified = await this.verifyUserInCall(signal.from, signal.callId, signal.callToken);
      if (senderVerified) {
        return true;
      }
      
      // Also accept if token matches what we have (for our own initiated call)
      if (signal.callToken === this.currentCallToken) {
        return true;
      }
    }

    console.warn('[WebRTC] Token validation failed for call:', signal.callId);
    return false;
  }

  private async verifyUserInCall(userId: string, callId: string, callToken: string): Promise<boolean> {
    if (!this.userPresenceChannel) return false;
    
    const presenceState = this.userPresenceChannel.presenceState();
    for (const key in presenceState) {
      const presences = presenceState[key] as any[];
      for (const p of presences) {
        if (p.userId === userId && p.inCall && p.callId === callId && p.callToken === callToken) {
          return true;
        }
      }
    }
    return false;
  }

  private async handleSignal(signal: CallSignal) {
    console.log('[WebRTC] Received signal:', signal.type, 'from:', signal.from, 'callId:', signal.callId);

    switch (signal.type) {
      case 'call-request':
        if (this.currentCallId) {
          await this.sendBusySignal(signal.from, signal.callId, signal.callToken);
          return;
        }
        this.currentCallId = signal.callId;
        this.currentCallToken = signal.callToken;
        // Update presence to mark as receiving call (pending state)
        await this.updateUserPresenceWithToken(true, signal.callId, signal.callToken);
        this.eventHandlers?.onIncomingCall(signal.from, signal.fromName, signal.fromAvatar, signal.callId);
        break;

      case 'call-accepted':
        this.eventHandlers?.onCallAccepted();
        if (this.isInitiator) {
          await this.createOffer();
        }
        break;

      case 'call-rejected':
        this.eventHandlers?.onCallRejected();
        this.cleanup();
        break;

      case 'call-ended':
        this.eventHandlers?.onCallEnded();
        this.cleanup();
        break;

      case 'call-busy':
        this.eventHandlers?.onCallBusy();
        this.cleanup();
        break;

      case 'offer':
        await this.handleOffer(signal.payload, signal.from);
        break;

      case 'answer':
        await this.handleAnswer(signal.payload);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(signal.payload);
        break;
    }
  }

  private async sendBusySignal(to: string, callId: string, callToken: string) {
    await this.sendSignalToUser(to, {
      type: 'call-busy',
      to,
      callId,
      callToken,
    });
  }

  private async sendSignalToUser(
    targetUserId: string, 
    signal: Omit<CallSignal, 'from' | 'fromName' | 'fromAvatar' | 'timestamp'>
  ) {
    if (!this.currentUserId) return;

    // Use the same predictable channel format as the receiver listens on
    const channelName = `calls:user:${targetUserId}`;
    
    let channel = this.callChannels.get(channelName);
    if (!channel) {
      channel = supabase.channel(channelName);
      await channel.subscribe();
      this.callChannels.set(channelName, channel);
    }
    
    await channel.send({
      type: 'broadcast',
      event: 'call-signal',
      payload: {
        ...signal,
        from: this.currentUserId,
        fromName: this.currentUserName,
        fromAvatar: this.currentUserAvatar,
        timestamp: Date.now(),
      } as CallSignal,
    });
  }

  private async sendSignal(signal: Omit<CallSignal, 'from' | 'fromName' | 'fromAvatar' | 'timestamp' | 'callId' | 'callToken'>) {
    if (!this.currentUserId || !this.currentCallId || !this.currentCallToken) return;

    await this.sendSignalToUser(signal.to, {
      ...signal,
      callId: this.currentCallId,
      callToken: this.currentCallToken,
    });
  }

  async initiateCall(targetUserId: string): Promise<boolean> {
    if (!this.currentUserId) return false;

    if (this.currentCallId) {
      console.warn('[WebRTC] Already in a call');
      return false;
    }

    // Check if target user is already in a call via presence
    const targetBusy = await this.checkUserBusy(targetUserId);
    if (targetBusy) {
      console.log('[WebRTC] Target user is busy');
      this.eventHandlers?.onCallBusy();
      return false;
    }

    this.currentCallId = generateCallId();
    this.currentCallToken = generateSecureToken();
    this.isInitiator = true;
    this.targetUserId = targetUserId;

    // Update our presence to show we're in a call with token for verification
    await this.updateUserPresenceWithToken(true, this.currentCallId, this.currentCallToken);

    try {
      await this.setupLocalStream();
      await this.createPeerConnection();

      await this.sendSignalToUser(targetUserId, {
        type: 'call-request',
        to: targetUserId,
        callId: this.currentCallId,
        callToken: this.currentCallToken,
      });

      return true;
    } catch (error) {
      console.error('[WebRTC] Failed to initiate call:', error);
      this.cleanup();
      return false;
    }
  }

  async acceptCall(callerId: string) {
    this.isInitiator = false;
    this.targetUserId = callerId;

    try {
      await this.setupLocalStream();
      await this.createPeerConnection();

      // Update presence to show we're in the call with our own token
      const responseToken = generateSecureToken();
      await this.updateUserPresenceWithToken(true, this.currentCallId, responseToken);

      await this.sendSignal({
        type: 'call-accepted',
        to: callerId,
      });
    } catch (error) {
      console.error('[WebRTC] Failed to accept call:', error);
      this.cleanup();
    }
  }

  async rejectCall(callerId: string) {
    await this.sendSignal({
      type: 'call-rejected',
      to: callerId,
    });
    this.cleanup();
  }

  async endCall() {
    if (this.targetUserId) {
      await this.sendSignal({
        type: 'call-ended',
        to: this.targetUserId,
      });
    }
    this.cleanup();
  }

  private videoEnabled: boolean = false;

  private async setupLocalStream(enableVideo: boolean = false) {
    this.videoEnabled = enableVideo;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: enableVideo ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
      });
    } catch (error) {
      console.error('[WebRTC] Failed to get user media with video:', error);
      // Fallback to audio only if video fails
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        this.videoEnabled = false;
      } catch (audioError) {
        console.error('[WebRTC] Failed to get audio:', audioError);
        throw audioError;
      }
    }
  }

  async toggleVideo(): Promise<boolean> {
    if (!this.localStream || !this.peerConnection) return false;

    const videoTracks = this.localStream.getVideoTracks();
    
    if (videoTracks.length > 0) {
      // Turn off video
      videoTracks.forEach(track => {
        track.stop();
        this.localStream?.removeTrack(track);
        const sender = this.peerConnection?.getSenders().find(s => s.track === track);
        if (sender) {
          this.peerConnection?.removeTrack(sender);
        }
      });
      this.videoEnabled = false;
      return false;
    } else {
      // Turn on video
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack) {
          this.localStream?.addTrack(videoTrack);
          this.peerConnection?.addTrack(videoTrack, this.localStream!);
          this.videoEnabled = true;
          return true;
        }
      } catch (error) {
        console.error('[WebRTC] Failed to enable video:', error);
      }
      return false;
    }
  }

  isVideoEnabled(): boolean {
    return this.videoEnabled;
  }

  private async createPeerConnection() {
    this.peerConnection = new RTCPeerConnection(ICE_SERVERS);

    this.remoteStream = new MediaStream();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    this.peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        this.remoteStream?.addTrack(track);
      });
      if (this.remoteStream) {
        this.eventHandlers?.onRemoteStream(this.remoteStream);
      }
    };

    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate && this.targetUserId) {
        await this.sendSignal({
          type: 'ice-candidate',
          to: this.targetUserId,
          payload: event.candidate.toJSON(),
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      if (state) {
        this.eventHandlers?.onConnectionStateChange(state);
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          this.eventHandlers?.onCallEnded();
        }
      }
    };

    for (const candidate of this.pendingIceCandidates) {
      await this.peerConnection.addIceCandidate(candidate);
    }
    this.pendingIceCandidates = [];
  }

  private async createOffer() {
    if (!this.peerConnection || !this.targetUserId) return;

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    await this.sendSignal({
      type: 'offer',
      to: this.targetUserId,
      payload: offer,
    });
  }

  private async handleOffer(offer: RTCSessionDescriptionInit, callerId: string) {
    if (!this.peerConnection) {
      await this.setupLocalStream();
      await this.createPeerConnection();
    }

    this.targetUserId = callerId;

    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    await this.sendSignal({
      type: 'answer',
      to: callerId,
      payload: answer,
    });
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.peerConnection) {
      this.pendingIceCandidates.push(new RTCIceCandidate(candidate));
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('[WebRTC] Failed to add ICE candidate:', error);
    }
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled;
    }
    return false;
  }

  isMuted(): boolean {
    if (!this.localStream) return true;
    const audioTrack = this.localStream.getAudioTracks()[0];
    return audioTrack ? !audioTrack.enabled : true;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getCurrentCallId(): string | null {
    return this.currentCallId;
  }

  isInCall(): boolean {
    return this.currentCallId !== null;
  }

  cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    for (const channel of this.callChannels.values()) {
      supabase.removeChannel(channel);
    }
    this.callChannels.clear();

    // Update presence to show we're no longer in a call
    this.updateUserPresence(false, null);

    this.remoteStream = null;
    this.targetUserId = null;
    this.isInitiator = false;
    this.pendingIceCandidates = [];
    this.currentCallId = null;
    this.currentCallToken = null;
  }

  destroy() {
    this.cleanup();
    if (this.signalingChannel) {
      supabase.removeChannel(this.signalingChannel);
      this.signalingChannel = null;
    }
    if (this.userPresenceChannel) {
      supabase.removeChannel(this.userPresenceChannel);
      this.userPresenceChannel = null;
    }
    this.currentUserId = null;
    this.eventHandlers = null;
  }
}

export const webRTCService = new WebRTCService();
export default webRTCService;
