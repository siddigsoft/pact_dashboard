import 'dart:collection';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart' show ValueNotifier, debugPrint, kIsWeb;
import 'package:path_provider/path_provider.dart';

class DebugLogEntry {
  final DateTime ts;
  final String tag;
  final String message;

  DebugLogEntry({
    required this.ts,
    required this.tag,
    required this.message,
  });

  @override
  String toString() {
    final iso = ts.toIso8601String();
    return '[$iso][$tag] $message';
  }

  Map<String, dynamic> toJson() => {
    'ts': ts.toIso8601String(),
    'tag': tag,
    'message': message,
  };

  factory DebugLogEntry.fromJson(Map<String, dynamic> json) => DebugLogEntry(
    ts: DateTime.parse(json['ts'] as String),
    tag: json['tag'] as String,
    message: json['message'] as String,
  );
}

/// In-app debug log buffer to diagnose background calling / FCM delivery.
///
/// Logs are persisted to a file so that entries written by the FCM background
/// isolate survive and can be viewed from the main isolate's debug screen.
class DebugLogService {
  static final DebugLogService _instance = DebugLogService._internal();
  factory DebugLogService() => _instance;
  DebugLogService._internal();

  static const int _maxEntries = 800;
  static const String _fileName = 'debug_logs.jsonl';

  final ListQueue<DebugLogEntry> _entries = ListQueue();
  final ValueNotifier<int> revision = ValueNotifier<int>(0);

  bool _loaded = false;
  String? _filePath;

  /// Get the log file path (cached after first call).
  Future<String> _getFilePath() async {
    if (_filePath != null) return _filePath!;
    final dir = await getApplicationDocumentsDirectory();
    _filePath = '${dir.path}/$_fileName';
    return _filePath!;
  }

  /// Load persisted logs from disk (call once from main isolate on startup).
  Future<void> loadFromDisk() async {
    if (_loaded || kIsWeb) return;
    _loaded = true;
    try {
      final path = await _getFilePath();
      final file = File(path);
      if (!await file.exists()) return;
      final lines = await file.readAsLines();
      for (final line in lines) {
        if (line.trim().isEmpty) continue;
        try {
          final json = jsonDecode(line) as Map<String, dynamic>;
          _entries.add(DebugLogEntry.fromJson(json));
        } catch (_) {
          // Skip malformed lines
        }
      }
      while (_entries.length > _maxEntries) {
        _entries.removeFirst();
      }
      revision.value++;
    } catch (e) {
      debugPrint('[DebugLogService] loadFromDisk error: $e');
    }
  }

  List<DebugLogEntry> snapshot() => List<DebugLogEntry>.unmodifiable(_entries);

  void clear() {
    _entries.clear();
    revision.value++;
    // Clear the file too
    _clearFile();
  }

  Future<void> _clearFile() async {
    if (kIsWeb) return;
    try {
      final path = await _getFilePath();
      final file = File(path);
      if (await file.exists()) {
        await file.writeAsString('');
      }
    } catch (_) {}
  }

  void log(String tag, String message) {
    final entry = DebugLogEntry(ts: DateTime.now(), tag: tag, message: message);
    _entries.add(entry);
    while (_entries.length > _maxEntries) {
      _entries.removeFirst();
    }
    revision.value++;
    // Persist to file (fire-and-forget so it works from background isolate too)
    if (!kIsWeb) _appendToFile(entry);
  }

  Future<void> _appendToFile(DebugLogEntry entry) async {
    try {
      final path = await _getFilePath();
      final file = File(path);
      await file.writeAsString(
        '${jsonEncode(entry.toJson())}\n',
        mode: FileMode.append,
        flush: true,
      );
    } catch (_) {
      // Best-effort; don't crash the app for diagnostics
    }
  }
}

void debugLog(String tag, String message, {bool alsoPrint = true}) {
  DebugLogService().log(tag, message);
  if (alsoPrint) {
    debugPrint('[$tag] $message');
  }
}
