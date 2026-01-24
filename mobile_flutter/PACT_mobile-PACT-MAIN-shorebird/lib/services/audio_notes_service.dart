// lib/services/audio_notes_service.dart

import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

enum AudioNoteStatus {
  pending,
  synced,
  failed,
}

class AudioNote {
  final String id;
  final String title;
  final String? siteVisitId;
  final String? siteId;
  final String filePath;
  final String? remoteUrl;
  final Duration duration;
  final DateTime createdAt;
  final double? latitude;
  final double? longitude;
  final AudioNoteStatus status;
  final String? transcription;

  AudioNote({
    required this.id,
    required this.title,
    this.siteVisitId,
    this.siteId,
    required this.filePath,
    this.remoteUrl,
    required this.duration,
    required this.createdAt,
    this.latitude,
    this.longitude,
    this.status = AudioNoteStatus.pending,
    this.transcription,
  });

  factory AudioNote.fromJson(Map<String, dynamic> json) {
    return AudioNote(
      id: json['id'] ?? '',
      title: json['title'] ?? '',
      siteVisitId: json['site_visit_id'],
      siteId: json['site_id'],
      filePath: json['file_path'] ?? '',
      remoteUrl: json['remote_url'],
      duration: Duration(milliseconds: json['duration_ms'] ?? 0),
      createdAt: DateTime.tryParse(json['created_at'] ?? '') ?? DateTime.now(),
      latitude: json['latitude']?.toDouble(),
      longitude: json['longitude']?.toDouble(),
      status: AudioNoteStatus.values[json['status'] ?? 0],
      transcription: json['transcription'],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'site_visit_id': siteVisitId,
    'site_id': siteId,
    'file_path': filePath,
    'remote_url': remoteUrl,
    'duration_ms': duration.inMilliseconds,
    'created_at': createdAt.toIso8601String(),
    'latitude': latitude,
    'longitude': longitude,
    'status': status.index,
    'transcription': transcription,
  };

  AudioNote copyWith({
    String? remoteUrl,
    AudioNoteStatus? status,
    String? transcription,
  }) {
    return AudioNote(
      id: id,
      title: title,
      siteVisitId: siteVisitId,
      siteId: siteId,
      filePath: filePath,
      remoteUrl: remoteUrl ?? this.remoteUrl,
      duration: duration,
      createdAt: createdAt,
      latitude: latitude,
      longitude: longitude,
      status: status ?? this.status,
      transcription: transcription ?? this.transcription,
    );
  }

  String get durationText {
    final minutes = duration.inMinutes;
    final seconds = duration.inSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
}

class AudioNotesService {
  static final AudioNotesService _instance = AudioNotesService._internal();
  factory AudioNotesService() => _instance;
  AudioNotesService._internal();

  static const String _cacheBoxName = 'audio_notes';
  static const String _notesKey = 'notes';

  final _supabase = Supabase.instance.client;
  final _recorder = AudioRecorder();
  final _player = AudioPlayer();

  final _recordingController = StreamController<bool>.broadcast();
  Stream<bool> get isRecordingStream => _recordingController.stream;

  final _durationController = StreamController<Duration>.broadcast();
  Stream<Duration> get recordingDurationStream => _durationController.stream;

  final _playbackController = StreamController<Duration>.broadcast();
  Stream<Duration> get playbackPositionStream => _playbackController.stream;

  List<AudioNote> _notes = [];
  bool _isRecording = false;
  DateTime? _recordingStart;
  Timer? _durationTimer;
  String? _currentRecordingPath;
  String? _currentlyPlayingId;
  bool _isInitialized = false;

  List<AudioNote> get notes => _notes;
  bool get isRecording => _isRecording;
  String? get currentlyPlayingId => _currentlyPlayingId;

  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      if (!Hive.isBoxOpen(_cacheBoxName)) {
        await Hive.openBox(_cacheBoxName);
      }

      await _loadNotes();
      
      _player.onPositionChanged.listen((position) {
        _playbackController.add(position);
      });

      _player.onPlayerComplete.listen((_) {
        _currentlyPlayingId = null;
      });

      _isInitialized = true;
      debugPrint('[AudioNotesService] Initialized with ${_notes.length} notes');
    } catch (e) {
      debugPrint('[AudioNotesService] Error initializing: $e');
    }
  }

  Future<void> _loadNotes() async {
    try {
      final box = Hive.box(_cacheBoxName);
      final notesJson = box.get(_notesKey) as List?;
      
      if (notesJson != null) {
        _notes = notesJson
            .map((json) => AudioNote.fromJson(Map<String, dynamic>.from(json)))
            .toList();
      }
    } catch (e) {
      debugPrint('[AudioNotesService] Error loading notes: $e');
    }
  }

  Future<void> _saveNotes() async {
    try {
      final box = Hive.box(_cacheBoxName);
      final jsonList = _notes.map((n) => n.toJson()).toList();
      await box.put(_notesKey, jsonList);
    } catch (e) {
      debugPrint('[AudioNotesService] Error saving notes: $e');
    }
  }

  Future<bool> startRecording({
    String? siteVisitId,
    String? siteId,
    double? latitude,
    double? longitude,
  }) async {
    try {
      final hasPermission = await _recorder.hasPermission();
      if (!hasPermission) {
        debugPrint('[AudioNotesService] No recording permission');
        return false;
      }

      final directory = await getApplicationDocumentsDirectory();
      final fileName = 'audio_${DateTime.now().millisecondsSinceEpoch}.m4a';
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
      _recordingStart = DateTime.now();
      _recordingController.add(true);

      _durationTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (_recordingStart != null) {
          final duration = DateTime.now().difference(_recordingStart!);
          _durationController.add(duration);
        }
      });

      debugPrint('[AudioNotesService] Recording started: $_currentRecordingPath');
      return true;
    } catch (e) {
      debugPrint('[AudioNotesService] Error starting recording: $e');
      return false;
    }
  }

  Future<AudioNote?> stopRecording({
    String? title,
    String? siteVisitId,
    String? siteId,
    double? latitude,
    double? longitude,
  }) async {
    try {
      if (!_isRecording || _currentRecordingPath == null) {
        return null;
      }

      await _recorder.stop();
      
      _durationTimer?.cancel();
      _durationTimer = null;

      final duration = _recordingStart != null 
          ? DateTime.now().difference(_recordingStart!)
          : Duration.zero;

      final note = AudioNote(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        title: title ?? 'Audio Note ${_notes.length + 1}',
        siteVisitId: siteVisitId,
        siteId: siteId,
        filePath: _currentRecordingPath!,
        duration: duration,
        createdAt: DateTime.now(),
        latitude: latitude,
        longitude: longitude,
      );

      _notes.insert(0, note);
      await _saveNotes();

      _isRecording = false;
      _recordingStart = null;
      _currentRecordingPath = null;
      _recordingController.add(false);

      debugPrint('[AudioNotesService] Recording saved: ${note.id}');
      return note;
    } catch (e) {
      debugPrint('[AudioNotesService] Error stopping recording: $e');
      _isRecording = false;
      _recordingController.add(false);
      return null;
    }
  }

  Future<void> cancelRecording() async {
    try {
      if (_isRecording) {
        await _recorder.stop();
        
        if (_currentRecordingPath != null) {
          final file = File(_currentRecordingPath!);
          if (await file.exists()) {
            await file.delete();
          }
        }
      }

      _durationTimer?.cancel();
      _isRecording = false;
      _recordingStart = null;
      _currentRecordingPath = null;
      _recordingController.add(false);
      
      debugPrint('[AudioNotesService] Recording cancelled');
    } catch (e) {
      debugPrint('[AudioNotesService] Error cancelling recording: $e');
    }
  }

  Future<void> playNote(String noteId) async {
    try {
      final note = _notes.firstWhere((n) => n.id == noteId);
      
      if (_currentlyPlayingId != null) {
        await stopPlayback();
      }

      final file = File(note.filePath);
      if (await file.exists()) {
        await _player.play(DeviceFileSource(note.filePath));
        _currentlyPlayingId = noteId;
      } else if (note.remoteUrl != null) {
        await _player.play(UrlSource(note.remoteUrl!));
        _currentlyPlayingId = noteId;
      }
      
      debugPrint('[AudioNotesService] Playing note: $noteId');
    } catch (e) {
      debugPrint('[AudioNotesService] Error playing note: $e');
    }
  }

  Future<void> pausePlayback() async {
    await _player.pause();
  }

  Future<void> resumePlayback() async {
    await _player.resume();
  }

  Future<void> stopPlayback() async {
    await _player.stop();
    _currentlyPlayingId = null;
  }

  Future<void> seekTo(Duration position) async {
    await _player.seek(position);
  }

  Future<void> deleteNote(String noteId) async {
    try {
      final note = _notes.firstWhere((n) => n.id == noteId);
      
      final file = File(note.filePath);
      if (await file.exists()) {
        await file.delete();
      }

      _notes.removeWhere((n) => n.id == noteId);
      await _saveNotes();

      debugPrint('[AudioNotesService] Note deleted: $noteId');
    } catch (e) {
      debugPrint('[AudioNotesService] Error deleting note: $e');
    }
  }

  Future<void> syncNotes() async {
    final pendingNotes = _notes.where((n) => n.status == AudioNoteStatus.pending).toList();
    
    for (final note in pendingNotes) {
      try {
        final file = File(note.filePath);
        if (!await file.exists()) continue;

        final bytes = await file.readAsBytes();
        final fileName = 'audio/${note.id}.m4a';
        
        await _supabase.storage.from('audio-notes').uploadBinary(
          fileName,
          bytes,
          fileOptions: const FileOptions(contentType: 'audio/m4a'),
        );

        final remoteUrl = _supabase.storage.from('audio-notes').getPublicUrl(fileName);

        final index = _notes.indexWhere((n) => n.id == note.id);
        if (index != -1) {
          _notes[index] = note.copyWith(
            remoteUrl: remoteUrl,
            status: AudioNoteStatus.synced,
          );
        }

        debugPrint('[AudioNotesService] Note synced: ${note.id}');
      } catch (e) {
        debugPrint('[AudioNotesService] Error syncing note ${note.id}: $e');
        final index = _notes.indexWhere((n) => n.id == note.id);
        if (index != -1) {
          _notes[index] = note.copyWith(status: AudioNoteStatus.failed);
        }
      }
    }

    await _saveNotes();
  }

  List<AudioNote> getNotesForSiteVisit(String siteVisitId) {
    return _notes.where((n) => n.siteVisitId == siteVisitId).toList();
  }

  List<AudioNote> getNotesForSite(String siteId) {
    return _notes.where((n) => n.siteId == siteId).toList();
  }

  int get pendingCount => _notes.where((n) => n.status == AudioNoteStatus.pending).length;

  void dispose() {
    _durationTimer?.cancel();
    _recordingController.close();
    _durationController.close();
    _playbackController.close();
    _recorder.dispose();
    _player.dispose();
  }
}
