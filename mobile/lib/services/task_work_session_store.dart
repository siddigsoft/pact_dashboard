import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Persists per-task work timer (mirrors web localStorage session).
class TaskWorkSessionStore {
  static String _key(String taskId, String userId) =>
      'task_work_session::$taskId::$userId';

  final String taskId;
  final String userId;

  int accumulatedSec = 0;
  int? startedAtMs;
  bool isRunning = false;

  TaskWorkSessionStore({required this.taskId, required this.userId});

  int get elapsedSec {
    var total = accumulatedSec;
    if (startedAtMs != null) {
      total += ((DateTime.now().millisecondsSinceEpoch - startedAtMs!) / 1000)
          .floor();
    }
    return total;
  }

  double get elapsedHours => (elapsedSec / 3600 * 100).round() / 100;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key(taskId, userId));
    if (raw == null) return;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      accumulatedSec = (m['accumulatedSec'] as num?)?.toInt() ?? 0;
      startedAtMs = (m['startedAt'] as num?)?.toInt();
      isRunning = startedAtMs != null;
    } catch (_) {}
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _key(taskId, userId),
      jsonEncode({
        'accumulatedSec': accumulatedSec,
        'startedAt': startedAtMs,
      }),
    );
  }

  Future<void> start() async {
    if (isRunning) return;
    startedAtMs = DateTime.now().millisecondsSinceEpoch;
    isRunning = true;
    await _save();
  }

  Future<void> pause() async {
    if (!isRunning) return;
    accumulatedSec = elapsedSec;
    startedAtMs = null;
    isRunning = false;
    await _save();
  }

  Future<void> reset() async {
    accumulatedSec = 0;
    startedAtMs = null;
    isRunning = false;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key(taskId, userId));
  }
}
