import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';

/// Service for recording and managing voice messages
class VoiceMessageService {
  static final AudioRecorder _audioRecorder = AudioRecorder();
  static final AudioPlayer _audioPlayer = AudioPlayer();

  static Future<bool> get isRecording async =>
      await _audioRecorder.isRecording();
  static bool get isPlaying => _audioPlayer.state == PlayerState.playing;

  /// Start recording a voice message
  static Future<String?> startRecording() async {
    try {
      final hasPermission = await _audioRecorder.hasPermission();
      if (!hasPermission) {
        print('Microphone permission denied');
        return null;
      }

      // Check if already recording
      if (await isRecording) {
        return null;
      }

      // Get app documents directory for storing voice messages
      final appDir = await getApplicationDocumentsDirectory();
      final voiceDir = Directory('${appDir.path}/voice_messages');
      if (!await voiceDir.exists()) {
        await voiceDir.create(recursive: true);
      }

      // Generate unique file name
      final fileName = 'voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      final filePath = '${voiceDir.path}/$fileName';

      // Start recording
      await _audioRecorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 128000,
          sampleRate: 44100,
        ),
        path: filePath,
      );

      return filePath;
    } catch (e) {
      print('Error starting recording: $e');
      return null;
    }
  }

  /// Stop recording and return the file path
  static Future<VoiceMessage?> stopRecording() async {
    try {
      final path = await _audioRecorder.stop();
      if (path == null) return null;

      // Get file info
      final file = File(path);
      final fileSize = await file.length();
      final duration = await _getAudioDuration(path);

      return VoiceMessage(
        filePath: path,
        fileName: path.split('/').last,
        fileSize: fileSize,
        duration: duration,
        createdAt: DateTime.now(),
      );
    } catch (e) {
      print('Error stopping recording: $e');
      return null;
    }
  }

  /// Cancel recording
  static Future<void> cancelRecording() async {
    try {
      if (await isRecording) {
        await _audioRecorder.stop();
      }
    } catch (e) {
      print('Error canceling recording: $e');
    }
  }

  /// Play a voice message
  static Future<bool> playVoiceMessage(String filePath) async {
    try {
      if (isPlaying) {
        await _audioPlayer.stop();
      }

      await _audioPlayer.play(DeviceFileSource(filePath));
      return true;
    } catch (e) {
      print('Error playing voice message: $e');
      return false;
    }
  }

  /// Pause playback
  static Future<void> pausePlayback() async {
    try {
      await _audioPlayer.pause();
    } catch (e) {
      print('Error pausing playback: $e');
    }
  }

  /// Resume playback
  static Future<void> resumePlayback() async {
    try {
      await _audioPlayer.resume();
    } catch (e) {
      print('Error resuming playback: $e');
    }
  }

  /// Stop playback
  static Future<void> stopPlayback() async {
    try {
      await _audioPlayer.stop();
    } catch (e) {
      print('Error stopping playback: $e');
    }
  }

  /// Get total duration of audio file
  static Future<int> _getAudioDuration(String filePath) async {
    try {
      final duration = await _audioPlayer.getDuration();
      return duration?.inSeconds ?? 0;
    } catch (e) {
      print('Error getting audio duration: $e');
      return 0;
    }
  }

  /// Format duration for display (mm:ss)
  static String formatDuration(int seconds) {
    final minutes = seconds ~/ 60;
    final secs = seconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  /// Delete voice message file
  static Future<bool> deleteVoiceMessage(String filePath) async {
    try {
      final file = File(filePath);
      if (await file.exists()) {
        await file.delete();
        return true;
      }
      return false;
    } catch (e) {
      print('Error deleting voice message: $e');
      return false;
    }
  }

  /// Listen to playback position changes
  static Stream<Duration> get positionStream => _audioPlayer.onPositionChanged;

  /// Listen to player state changes
  static Stream<PlayerState> get playerStateStream =>
      _audioPlayer.onPlayerStateChanged;

  /// Dispose resources
  static Future<void> dispose() async {
    try {
      await _audioRecorder.dispose();
      await _audioPlayer.dispose();
    } catch (e) {
      print('Error disposing voice message resources: $e');
    }
  }
}

/// Data class for voice message
class VoiceMessage {
  final String filePath;
  final String fileName;
  final int fileSize;
  final int duration; // in seconds
  final DateTime createdAt;

  VoiceMessage({
    required this.filePath,
    required this.fileName,
    required this.fileSize,
    required this.duration,
    required this.createdAt,
  });

  /// Get human-readable file size
  String getFileSizeDisplay() {
    if (fileSize < 1024) return '$fileSize B';
    if (fileSize < 1024 * 1024) {
      return '${(fileSize / 1024).toStringAsFixed(1)} KB';
    }
    return '${(fileSize / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  /// Get duration display (mm:ss)
  String getDurationDisplay() {
    return VoiceMessageService.formatDuration(duration);
  }
}
