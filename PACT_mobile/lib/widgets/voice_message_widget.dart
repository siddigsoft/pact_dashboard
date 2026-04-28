import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:audioplayers/audioplayers.dart';
import '../services/voice_message_service.dart';
import '../theme/app_colors.dart';

/// Widget for displaying and playing voice messages
class VoiceMessageWidget extends StatefulWidget {
  final String filePath;
  final String fileName;
  final DateTime createdAt;
  final int duration;
  final bool isOutgoing;

  const VoiceMessageWidget({
    required this.filePath,
    required this.fileName,
    required this.createdAt,
    required this.duration,
    required this.isOutgoing,
  });

  @override
  State<VoiceMessageWidget> createState() => _VoiceMessageWidgetState();
}

class _VoiceMessageWidgetState extends State<VoiceMessageWidget> {
  bool _isPlaying = false;
  int _currentPosition = 0;

  @override
  void initState() {
    super.initState();
    VoiceMessageService.playerStateStream.listen((state) {
      if (mounted) {
        setState(() {
          _isPlaying = state == PlayerState.playing;
        });
      }
    });

    VoiceMessageService.positionStream.listen((position) {
      if (mounted) {
        setState(() {
          _currentPosition = position.inSeconds;
        });
      }
    });
  }

  Future<void> _togglePlayback() async {
    if (_isPlaying) {
      await VoiceMessageService.pausePlayback();
    } else {
      final success = await VoiceMessageService.playVoiceMessage(
        widget.filePath,
      );
      if (!success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to play voice message')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: widget.isOutgoing
            ? AppColors.primaryBlue.withOpacity(0.1)
            : Colors.grey.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: widget.isOutgoing
              ? AppColors.primaryBlue.withOpacity(0.3)
              : Colors.grey.withOpacity(0.3),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Play button
              GestureDetector(
                onTap: _togglePlayback,
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: widget.isOutgoing
                        ? AppColors.primaryBlue
                        : Colors.green,
                  ),
                  child: Icon(
                    _isPlaying ? Icons.pause : Icons.play_arrow,
                    color: Colors.white,
                    size: 20,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // Waveform placeholder and duration
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Simple progress bar
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: widget.duration > 0
                            ? _currentPosition / widget.duration
                            : 0,
                        minHeight: 4,
                        backgroundColor: Colors.grey.withOpacity(0.3),
                        valueColor: AlwaysStoppedAnimation(
                          widget.isOutgoing
                              ? AppColors.primaryBlue
                              : Colors.green,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    // Time labels
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          VoiceMessageService.formatDuration(_currentPosition),
                          style: const TextStyle(
                            fontSize: 11,
                            color: Colors.grey,
                          ),
                        ),
                        Text(
                          VoiceMessageService.formatDuration(widget.duration),
                          style: const TextStyle(
                            fontSize: 11,
                            color: Colors.grey,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Timestamp
          Text(
            DateFormat('MMM d, HH:mm').format(widget.createdAt),
            style: const TextStyle(fontSize: 10, color: Colors.grey),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    VoiceMessageService.stopPlayback();
    super.dispose();
  }
}
