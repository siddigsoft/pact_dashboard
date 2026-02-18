// lib/services/call_history_service.dart

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import '../models/call_state.dart';

class CallHistoryService {
  static final CallHistoryService _instance = CallHistoryService._internal();
  factory CallHistoryService() => _instance;
  CallHistoryService._internal();

  static const String _historyBoxName = 'pact_call_history';
  static const int _maxLocalEntries = 100;

  final SupabaseClient _supabase = Supabase.instance.client;
  List<CallHistoryEntry> _history = [];

  final _historyController =
      StreamController<List<CallHistoryEntry>>.broadcast();
  Stream<List<CallHistoryEntry>> get historyStream => _historyController.stream;

  List<CallHistoryEntry> get history => List.unmodifiable(_history);

  Future<void> initialize() async {
    await _loadLocalHistory();
    await _syncWithServer();
  }

  Future<void> _loadLocalHistory() async {
    try {
      final box = await Hive.openBox(_historyBoxName);
      final cached = box.get('history');
      if (cached != null && cached is List) {
        _history = cached
            .map((item) {
              if (item is Map) {
                return CallHistoryEntry.fromJson(
                  Map<String, dynamic>.from(item),
                );
              }
              return null;
            })
            .whereType<CallHistoryEntry>()
            .toList();

        _history.sort((a, b) => b.startTime.compareTo(a.startTime));
        _historyController.add(_history);
        debugPrint('[CallHistory] Loaded ${_history.length} local entries');
      }
    } catch (e) {
      debugPrint('[CallHistory] Error loading local history: $e');
    }
  }

  Future<void> _saveLocalHistory() async {
    try {
      final box = await Hive.openBox(_historyBoxName);
      final trimmed = _history.take(_maxLocalEntries).toList();
      await box.put('history', trimmed.map((e) => e.toJson()).toList());
    } catch (e) {
      debugPrint('[CallHistory] Error saving local history: $e');
    }
  }

  Future<void> _syncWithServer() async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) return;

      final response = await _supabase
          .from('call_history')
          .select()
          .or('caller_id.eq.$userId,callee_id.eq.$userId')
          .order('created_at', ascending: false)
          .limit(50);

      for (final item in response) {
        final entry = _parseServerEntry(item, userId);
        if (entry != null && !_history.any((h) => h.callId == entry.callId)) {
          _history.add(entry);
        }
      }
      _history.sort((a, b) => b.startTime.compareTo(a.startTime));
      _historyController.add(_history);
      await _saveLocalHistory();
    } catch (e) {
      debugPrint('[CallHistory] Error syncing with server: $e');
    }
  }

  CallHistoryEntry? _parseServerEntry(
    Map<String, dynamic> data,
    String currentUserId,
  ) {
    try {
      final callerId = data['caller_id'] as String?;
      final isOutgoing = callerId == currentUserId;

      return CallHistoryEntry(
        id: data['id'] as String? ?? const Uuid().v4(),
        callId: data['call_id'] as String?,
        remoteUserId: isOutgoing
            ? (data['callee_id'] as String? ?? '')
            : (data['caller_id'] as String? ?? ''),
        remoteUserName: isOutgoing
            ? (data['callee_name'] as String? ?? 'Unknown')
            : (data['caller_name'] as String? ?? 'Unknown'),
        remoteUserAvatar: isOutgoing
            ? data['callee_avatar'] as String?
            : data['caller_avatar'] as String?,
        isOutgoing: isOutgoing,
        isVideoCall: data['is_video'] as bool? ?? false,
        endStatus: _parseStatus(data['status'] as String?),
        startTime: DateTime.parse(data['created_at'] as String),
        endTime: data['ended_at'] != null
            ? DateTime.parse(data['ended_at'] as String)
            : null,
        duration: data['duration_seconds'] != null
            ? Duration(seconds: data['duration_seconds'] as int)
            : null,
        notes: data['notes'] as String?,
        wasRecorded: data['was_recorded'] as bool? ?? false,
      );
    } catch (e) {
      debugPrint('[CallHistory] Error parsing server entry: $e');
      return null;
    }
  }

  CallStatus _parseStatus(String? status) {
    switch (status) {
      case 'connected':
        return CallStatus.connected;
      case 'ended':
        return CallStatus.ended;
      case 'missed':
        return CallStatus.unreachable;
      case 'rejected':
        return CallStatus.rejected;
      case 'busy':
        return CallStatus.busy;
      case 'failed':
        return CallStatus.failed;
      default:
        return CallStatus.ended;
    }
  }

  Future<void> addEntry(CallHistoryEntry entry) async {
    debugPrint('[JitsiCall] CallHistoryService addEntry() ENTER id=${entry.id} callId=${entry.callId} remote=${entry.remoteUserName} isOutgoing=${entry.isOutgoing} isVideo=${entry.isVideoCall} status=${entry.endStatus.name}');
    _history.insert(0, entry);
    _historyController.add(_history);
    await _saveLocalHistory();
    await _saveToServer(entry);
    debugPrint('[JitsiCall] CallHistoryService addEntry() DONE');
  }

  Future<void> _saveToServer(CallHistoryEntry entry) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      debugPrint('[JitsiCall] CallHistoryService _saveToServer() userId=$userId entry.id=${entry.id} call_id=${entry.callId}');
      if (userId == null) {
        debugPrint('[JitsiCall] CallHistoryService _saveToServer() SKIP no userId');
        return;
      }

      final payload = {
        'id': entry.id,
        'call_id': entry.callId,
        'caller_id': entry.isOutgoing ? userId : entry.remoteUserId,
        'callee_id': entry.isOutgoing ? entry.remoteUserId : userId,
        'caller_name': entry.isOutgoing ? null : entry.remoteUserName,
        'callee_name': entry.isOutgoing ? entry.remoteUserName : null,
        'is_video': entry.isVideoCall,
        'status': entry.endStatus.name,
        'duration_seconds': entry.duration?.inSeconds,
        'notes': entry.notes,
        'was_recorded': entry.wasRecorded,
      };
      debugPrint('[JitsiCall] CallHistoryService _saveToServer() inserting call_history: $payload');
      await _supabase.from('call_history').insert(payload);
      debugPrint('[JitsiCall] CallHistoryService _saveToServer() DONE');
    } catch (e, st) {
      debugPrint('[JitsiCall] CallHistoryService _saveToServer() ERROR: $e');
      debugPrint('[JitsiCall] CallHistoryService _saveToServer() stackTrace: $st');
    }
  }

  Future<void> updateNotes(String entryId, String notes) async {
    final index = _history.indexWhere((e) => e.id == entryId);
    if (index != -1) {
      final entry = _history[index];
      _history[index] = CallHistoryEntry(
        id: entry.id,
        callId: entry.callId,
        remoteUserId: entry.remoteUserId,
        remoteUserName: entry.remoteUserName,
        remoteUserAvatar: entry.remoteUserAvatar,
        isOutgoing: entry.isOutgoing,
        isVideoCall: entry.isVideoCall,
        endStatus: entry.endStatus,
        startTime: entry.startTime,
        endTime: entry.endTime,
        duration: entry.duration,
        notes: notes,
        wasRecorded: entry.wasRecorded,
      );
      _historyController.add(_history);
      await _saveLocalHistory();
    }
  }

  Future<void> deleteEntry(String entryId) async {
    _history.removeWhere((e) => e.id == entryId);
    _historyController.add(_history);
    await _saveLocalHistory();

    try {
      await _supabase.from('call_history').delete().eq('id', entryId);
    } catch (e) {
      debugPrint('[CallHistory] Error deleting from server: $e');
    }
  }

  Future<void> clearHistory() async {
    _history.clear();
    _historyController.add(_history);

    try {
      final box = await Hive.openBox(_historyBoxName);
      await box.clear();
    } catch (e) {
      debugPrint('[CallHistory] Error clearing local history: $e');
    }
  }

  List<CallHistoryEntry> getMissedCalls() {
    return _history.where((e) => e.isMissed).toList();
  }

  int get missedCallCount => getMissedCalls().length;

  void dispose() {
    _historyController.close();
  }
}
