// lib/widgets/audio_note_recorder.dart

import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/audio_notes_service.dart';
import '../theme/app_colors.dart';

class AudioNoteRecorder extends StatefulWidget {
  final String? siteVisitId;
  final String? siteId;
  final double? latitude;
  final double? longitude;
  final bool isArabic;
  final Function(AudioNote)? onRecorded;

  const AudioNoteRecorder({
    super.key,
    this.siteVisitId,
    this.siteId,
    this.latitude,
    this.longitude,
    this.isArabic = false,
    this.onRecorded,
  });

  @override
  State<AudioNoteRecorder> createState() => _AudioNoteRecorderState();
}

class _AudioNoteRecorderState extends State<AudioNoteRecorder>
    with SingleTickerProviderStateMixin {
  final _audioService = AudioNotesService();
  late AnimationController _pulseController;
  
  Duration _recordingDuration = Duration.zero;
  StreamSubscription? _durationSubscription;
  StreamSubscription? _recordingSubscription;
  bool _isRecording = false;

  @override
  void initState() {
    super.initState();
    _audioService.initialize();
    
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );

    _recordingSubscription = _audioService.isRecordingStream.listen((isRecording) {
      setState(() => _isRecording = isRecording);
      if (isRecording) {
        _pulseController.repeat(reverse: true);
      } else {
        _pulseController.stop();
      }
    });

    _durationSubscription = _audioService.recordingDurationStream.listen((duration) {
      setState(() => _recordingDuration = duration);
    });
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _durationSubscription?.cancel();
    _recordingSubscription?.cancel();
    super.dispose();
  }

  Future<void> _toggleRecording() async {
    if (_isRecording) {
      final note = await _audioService.stopRecording(
        siteVisitId: widget.siteVisitId,
        siteId: widget.siteId,
        latitude: widget.latitude,
        longitude: widget.longitude,
      );
      if (note != null) {
        widget.onRecorded?.call(note);
        _showSaveDialog(note);
      }
    } else {
      await _audioService.startRecording(
        siteVisitId: widget.siteVisitId,
        siteId: widget.siteId,
        latitude: widget.latitude,
        longitude: widget.longitude,
      );
    }
  }

  void _showSaveDialog(AudioNote note) {
    final titleController = TextEditingController(text: note.title);
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.mic, color: AppColors.primaryOrange),
            const SizedBox(width: 8),
            Text(
              widget.isArabic ? 'ملاحظة صوتية محفوظة' : 'Audio Note Saved',
              style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: titleController,
              decoration: InputDecoration(
                labelText: widget.isArabic ? 'العنوان' : 'Title',
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.timer, size: 16, color: Colors.grey),
                  const SizedBox(width: 8),
                  Text(
                    note.durationText,
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      color: Colors.grey.shade700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              _audioService.deleteNote(note.id);
              Navigator.pop(context);
            },
            child: Text(
              widget.isArabic ? 'حذف' : 'Delete',
              style: const TextStyle(color: Colors.red),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryBlue,
            ),
            child: Text(widget.isArabic ? 'حفظ' : 'Save'),
          ),
        ],
      ),
    );
  }

  String _formatDuration(Duration duration) {
    final minutes = duration.inMinutes;
    final seconds = duration.inSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: widget.isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(
                  Icons.mic,
                  color: _isRecording ? Colors.red : AppColors.primaryBlue,
                ),
                const SizedBox(width: 8),
                Text(
                  widget.isArabic ? 'ملاحظة صوتية' : 'Audio Note',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          const SizedBox(height: 20),
          AnimatedBuilder(
            animation: _pulseController,
            builder: (context, child) {
              return GestureDetector(
                onTap: _toggleRecording,
                child: Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _isRecording ? Colors.red : AppColors.primaryBlue,
                    boxShadow: [
                      BoxShadow(
                        color: (_isRecording ? Colors.red : AppColors.primaryBlue)
                            .withOpacity(0.3 + (_pulseController.value * 0.2)),
                        blurRadius: 10 + (_pulseController.value * 10),
                        spreadRadius: _isRecording ? 5 : 0,
                      ),
                    ],
                  ),
                  child: Icon(
                    _isRecording ? Icons.stop : Icons.mic,
                    color: Colors.white,
                    size: 36,
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 16),
          if (_isRecording) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.red.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.red,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _formatDuration(_recordingDuration),
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: Colors.red,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: () => _audioService.cancelRecording(),
              icon: const Icon(Icons.close, color: Colors.grey),
              label: Text(
                widget.isArabic ? 'إلغاء' : 'Cancel',
                style: const TextStyle(color: Colors.grey),
              ),
            ),
            ] else
              Text(
                widget.isArabic 
                    ? 'اضغط للتسجيل' 
                    : 'Tap to record',
                style: GoogleFonts.poppins(
                  color: Colors.grey.shade500,
                  fontSize: 13,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class AudioNotePlayer extends StatefulWidget {
  final AudioNote note;
  final bool isArabic;
  final VoidCallback? onDelete;

  const AudioNotePlayer({
    super.key,
    required this.note,
    this.isArabic = false,
    this.onDelete,
  });

  @override
  State<AudioNotePlayer> createState() => _AudioNotePlayerState();
}

class _AudioNotePlayerState extends State<AudioNotePlayer> {
  final _audioService = AudioNotesService();
  Duration _position = Duration.zero;
  bool _isPlaying = false;
  StreamSubscription? _positionSubscription;

  @override
  void initState() {
    super.initState();
    _positionSubscription = _audioService.playbackPositionStream.listen((pos) {
      if (_audioService.currentlyPlayingId == widget.note.id) {
        setState(() {
          _position = pos;
          _isPlaying = true;
        });
      } else {
        setState(() => _isPlaying = false);
      }
    });
  }

  @override
  void dispose() {
    _positionSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final progress = widget.note.duration.inSeconds > 0
        ? _position.inSeconds / widget.note.duration.inSeconds
        : 0.0;

    return Directionality(
      textDirection: widget.isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.grey.shade50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade200),
        ),
        child: Row(
          children: [
            GestureDetector(
              onTap: () {
                if (_isPlaying) {
                  _audioService.pausePlayback();
                } else {
                  _audioService.playNote(widget.note.id);
                }
              },
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.primaryBlue,
              ),
              child: Icon(
                _isPlaying ? Icons.pause : Icons.play_arrow,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.note.title,
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w500,
                    fontSize: 14,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                LinearProgressIndicator(
                  value: progress.clamp(0.0, 1.0),
                  backgroundColor: Colors.grey.shade200,
                  valueColor: AlwaysStoppedAnimation<Color>(AppColors.primaryBlue),
                ),
                const SizedBox(height: 2),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _formatDuration(_position),
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: Colors.grey,
                      ),
                    ),
                    Text(
                      widget.note.durationText,
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: Colors.grey,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
            if (widget.onDelete != null)
              IconButton(
                icon: const Icon(Icons.delete, color: Colors.red, size: 20),
                onPressed: widget.onDelete,
              ),
          ],
        ),
      ),
    );
  }

  String _formatDuration(Duration duration) {
    final minutes = duration.inMinutes;
    final seconds = duration.inSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
}
