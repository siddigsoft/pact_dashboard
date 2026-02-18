import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:permission_handler/permission_handler.dart';

class VoiceRecordingService {
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _audioPlayer = AudioPlayer();

  bool _isRecording = false;
  bool _isPlaying = false;
  String? _currentRecordingPath;
  Duration _recordingDuration = Duration.zero;
  Duration _playbackPosition = Duration.zero;
  Duration _playbackDuration = Duration.zero;
  Timer? _durationTimer;

  final StreamController<VoiceRecordingState> _stateController =
      StreamController<VoiceRecordingState>.broadcast();

  Stream<VoiceRecordingState> get stateStream => _stateController.stream;
  bool get isRecording => _isRecording;
  bool get isPlaying => _isPlaying;
  String? get currentRecordingPath => _currentRecordingPath;
  Duration get recordingDuration => _recordingDuration;

  VoiceRecordingService() {
    _audioPlayer.onPositionChanged.listen((position) {
      _playbackPosition = position;
      _emitState();
    });

    _audioPlayer.onDurationChanged.listen((duration) {
      _playbackDuration = duration;
      _emitState();
    });

    _audioPlayer.onPlayerComplete.listen((_) {
      _isPlaying = false;
      _playbackPosition = Duration.zero;
      _emitState();
    });
  }

  Future<bool> requestPermission() async {
    final status = await Permission.microphone.request();
    return status.isGranted;
  }

  Future<bool> startRecording() async {
    try {
      if (!await requestPermission()) {
        debugPrint('[VoiceRecording] Microphone permission denied');
        return false;
      }

      if (!await _recorder.hasPermission()) {
        debugPrint('[VoiceRecording] Recorder permission denied');
        return false;
      }

      final directory = await getApplicationDocumentsDirectory();
      final fileName = 'voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      _currentRecordingPath = '${directory.path}/$fileName';

      await _recorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 128000,
          sampleRate: 44100,
        ),
        path: _currentRecordingPath!,
      );

      _isRecording = true;
      _recordingDuration = Duration.zero;

      _durationTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        _recordingDuration += const Duration(seconds: 1);
        _emitState();
      });

      _emitState();
      return true;
    } catch (e) {
      debugPrint('[VoiceRecording] Error starting recording: $e');
      return false;
    }
  }

  Future<String?> stopRecording() async {
    try {
      _durationTimer?.cancel();

      final path = await _recorder.stop();
      _isRecording = false;
      _emitState();

      return path ?? _currentRecordingPath;
    } catch (e) {
      debugPrint('[VoiceRecording] Error stopping recording: $e');
      _isRecording = false;
      return null;
    }
  }

  Future<void> cancelRecording() async {
    try {
      _durationTimer?.cancel();
      await _recorder.stop();

      if (_currentRecordingPath != null) {
        final file = File(_currentRecordingPath!);
        if (await file.exists()) {
          await file.delete();
        }
      }

      _isRecording = false;
      _currentRecordingPath = null;
      _recordingDuration = Duration.zero;
      _emitState();
    } catch (e) {
      debugPrint('[VoiceRecording] Error canceling recording: $e');
    }
  }

  Future<void> playRecording(String path) async {
    try {
      if (_isPlaying) {
        await _audioPlayer.stop();
      }

      await _audioPlayer.play(DeviceFileSource(path));
      _isPlaying = true;
      _emitState();
    } catch (e) {
      debugPrint('[VoiceRecording] Error playing recording: $e');
    }
  }

  Future<void> pausePlayback() async {
    try {
      await _audioPlayer.pause();
      _isPlaying = false;
      _emitState();
    } catch (e) {
      debugPrint('[VoiceRecording] Error pausing playback: $e');
    }
  }

  Future<void> resumePlayback() async {
    try {
      await _audioPlayer.resume();
      _isPlaying = true;
      _emitState();
    } catch (e) {
      debugPrint('[VoiceRecording] Error resuming playback: $e');
    }
  }

  Future<void> stopPlayback() async {
    try {
      await _audioPlayer.stop();
      _isPlaying = false;
      _playbackPosition = Duration.zero;
      _emitState();
    } catch (e) {
      debugPrint('[VoiceRecording] Error stopping playback: $e');
    }
  }

  Future<void> seekTo(Duration position) async {
    try {
      await _audioPlayer.seek(position);
    } catch (e) {
      debugPrint('[VoiceRecording] Error seeking: $e');
    }
  }

  void _emitState() {
    _stateController.add(
      VoiceRecordingState(
        isRecording: _isRecording,
        isPlaying: _isPlaying,
        recordingDuration: _recordingDuration,
        playbackPosition: _playbackPosition,
        playbackDuration: _playbackDuration,
        currentPath: _currentRecordingPath,
      ),
    );
  }

  String formatDuration(Duration duration) {
    final minutes = duration.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = duration.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  Future<int> getFileSizeBytes(String path) async {
    try {
      final file = File(path);
      if (await file.exists()) {
        return await file.length();
      }
    } catch (e) {
      debugPrint('[VoiceRecording] Error getting file size: $e');
    }
    return 0;
  }

  void dispose() {
    _durationTimer?.cancel();
    _recorder.dispose();
    _audioPlayer.dispose();
    _stateController.close();
  }
}

class VoiceRecordingState {
  final bool isRecording;
  final bool isPlaying;
  final Duration recordingDuration;
  final Duration playbackPosition;
  final Duration playbackDuration;
  final String? currentPath;

  VoiceRecordingState({
    required this.isRecording,
    required this.isPlaying,
    required this.recordingDuration,
    required this.playbackPosition,
    required this.playbackDuration,
    this.currentPath,
  });
}
