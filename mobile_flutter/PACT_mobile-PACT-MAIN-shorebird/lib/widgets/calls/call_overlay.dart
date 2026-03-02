import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/call_provider.dart';
import '../../services/webrtc_call_service.dart';
import '../../screens/calls/incoming_call_screen.dart';
import '../../screens/calls/active_call_screen.dart';

class CallOverlay extends ConsumerWidget {
  final Widget child;

  const CallOverlay({super.key, required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final callState = ref.watch(callStateProvider);

    ref.listen<CallStateData>(callStateProvider, (previous, next) {
      if (previous?.callState != CallState.incoming &&
          next.callState == CallState.incoming) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => IncomingCallScreen(
              callerId: next.incomingCallerId ?? '',
              callerName: next.incomingCallerName ?? 'Unknown',
              callerAvatar: next.incomingCallerAvatar,
              isVideoCall: !next.isAudioOnly,
            ),
            fullscreenDialog: true,
          ),
        );
      }
    });

    return Stack(
      children: [
        child,

        if (callState.callState == CallState.connected ||
            callState.callState == CallState.connecting)
          Positioned(
            top: MediaQuery.of(context).padding.top,
            left: 0,
            right: 0,
            child: GestureDetector(
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ActiveCallScreen(
                      participantId: callState.remoteParticipant?.id ?? '',
                      participantName:
                          callState.remoteParticipant?.name ?? 'Unknown',
                      participantAvatar: callState.remoteParticipant?.avatar,
                      isVideoCall: !callState.isAudioOnly,
                    ),
                    fullscreenDialog: true,
                  ),
                );
              },
              child: Container(
                margin: const EdgeInsets.all(8),
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: Colors.green,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.2),
                      blurRadius: 8,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.phone_in_talk,
                      color: Colors.white,
                      size: 20,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            callState.remoteParticipant?.name ?? 'Active Call',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                          Text(
                            callState.callState == CallState.connecting
                                ? 'Connecting...'
                                : 'Tap to return',
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: const BoxDecoration(
                        color: Colors.red,
                        shape: BoxShape.circle,
                      ),
                      child: InkWell(
                        onTap: () {
                          ref.read(callStateProvider.notifier).endCall();
                        },
                        child: const Icon(
                          Icons.call_end,
                          color: Colors.white,
                          size: 16,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}
