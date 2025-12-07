import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type CallSignal = {
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-request' | 'call-accepted' | 'call-rejected' | 'call-ended' | 'call-busy';
  from: string;
  to: string;
  fromName: string;
  fromAvatar?: string;
  payload?: any;
  timestamp: number;
};

export type CallEventHandler = {
  onIncomingCall: (callerId: string, callerName: string, callerAvatar?: string) => void;
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

  async initialize(userId: string, userName: string, userAvatar?: string, handlers?: CallEventHandler) {
    this.currentUserId = userId;
    this.currentUserName = userName;
    this.currentUserAvatar = userAvatar;
    if (handlers) {
      this.eventHandlers = handlers;
    }

    await this.setupSignalingChannel();
  }

  setEventHandlers(handlers: CallEventHandler) {
    this.eventHandlers = handlers;
  }

  private async setupSignalingChannel() {
    if (!this.currentUserId) return;

    if (this.signalingChannel) {
      await supabase.removeChannel(this.signalingChannel);
    }

    this.signalingChannel = supabase
      .channel(`calls:${this.currentUserId}`)
      .on('broadcast', { event: 'call-signal' }, async ({ payload }) => {
        const signal = payload as CallSignal;
        if (signal.to !== this.currentUserId) return;
        await this.handleSignal(signal);
      })
      .subscribe();
  }

  private async handleSignal(signal: CallSignal) {
    console.log('[WebRTC] Received signal:', signal.type, 'from:', signal.from);

    switch (signal.type) {
      case 'call-request':
        this.eventHandlers?.onIncomingCall(signal.from, signal.fromName, signal.fromAvatar);
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

  private async sendSignal(signal: Omit<CallSignal, 'from' | 'fromName' | 'fromAvatar' | 'timestamp'>) {
    if (!this.currentUserId) return;

    const targetChannel = supabase.channel(`calls:${signal.to}`);
    
    await targetChannel.subscribe();
    
    await targetChannel.send({
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

    await supabase.removeChannel(targetChannel);
  }

  async initiateCall(targetUserId: string): Promise<boolean> {
    if (!this.currentUserId) return false;

    this.isInitiator = true;
    this.targetUserId = targetUserId;

    try {
      await this.setupLocalStream();
      await this.createPeerConnection();

      await this.sendSignal({
        type: 'call-request',
        to: targetUserId,
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

  private async setupLocalStream() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch (error) {
      console.error('[WebRTC] Failed to get user media:', error);
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    }
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

  cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.targetUserId = null;
    this.isInitiator = false;
    this.pendingIceCandidates = [];
  }

  destroy() {
    this.cleanup();
    if (this.signalingChannel) {
      supabase.removeChannel(this.signalingChannel);
      this.signalingChannel = null;
    }
    this.currentUserId = null;
    this.eventHandlers = null;
  }
}

export const webRTCService = new WebRTCService();
export default webRTCService;
