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
    debugPrint(
      '[JitsiCall] CallHistoryService addEntry() ENTER id=${entry.id} callId=${entry.callId} remote=${entry.remoteUserName} isOutgoing=${entry.isOutgoing} isVideo=${entry.isVideoCall} status=${entry.endStatus.name}',
    );
    _history.insert(0, entry);
    _historyController.add(_history);
    await _saveLocalHistory();
    await _saveToServer(entry);
    debugPrint('[JitsiCall] CallHistoryService addEntry() DONE');
  }

  Future<void> _saveToServer(CallHistoryEntry entry) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      debugPrint(
        '[JitsiCall] CallHistoryService _saveToServer() userId=$userId entry.id=${entry.id} call_id=${entry.callId}',
      );
      if (userId == null) {
        debugPrint(
          '[JitsiCall] CallHistoryService _saveToServer() SKIP no userId',
        );
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
      debugPrint(
        '[JitsiCall] CallHistoryService _saveToServer() inserting call_history: $payload',
      );
      await _supabase.from('call_history').insert(payload);
      debugPrint('[JitsiCall] CallHistoryService _saveToServer() DONE');
    } catch (e, st) {
      debugPrint('[JitsiCall] CallHistoryService _saveToServer() ERROR: $e');
      debugPrint(
        '[JitsiCall] CallHistoryService _saveToServer() stackTrace: $st',
      );
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

  /// Get call history for a specific user
  Future<List<Map<String, dynamic>>> getCallHistory({
    required String userId,
    int limit = 50,
    String? filterType,
  }) async {
    try {
      var query = _supabase.from('call_history').select().eq('user_id', userId);

      // Apply optional filter
      if (filterType != null && filterType.isNotEmpty && filterType != 'all') {
        if (filterType == 'missed') {
          query = query.eq('is_missed', true);
        }
      }

      final response = await query
          .order('created_at', ascending: false)
          .limit(limit);
      return List<Map<String, dynamic>>.from(response as List);
    } catch (e) {
      debugPrint('[CallHistory] Error fetching call history: $e');
      return [];
    }
  }

  /// Search call history by various criteria
  Future<List<Map<String, dynamic>>> searchCallHistory({
    required String userId,
    String? query,
    String? remoteUserId,
  }) async {
    try {
      var q = _supabase.from('call_history').select().eq('user_id', userId);

      if (query != null && query.isNotEmpty) {
        q = q.ilike('remote_user_name', '%$query%');
      }

      if (remoteUserId != null && remoteUserId.isNotEmpty) {
        q = q.eq('remote_user_id', remoteUserId);
      }

      final response = await q.order('created_at', ascending: false);
      return List<Map<String, dynamic>>.from(response as List);
    } catch (e) {
      debugPrint('[CallHistory] Error searching call history: $e');
      return [];
    }
  }

  /// Get notes for a specific call
  Future<String> getCallNotes(String callId) async {
    try {
      final response = await _supabase
          .from('call_notes')
          .select('notes')
          .eq('call_id', callId)
          .maybeSingle();

      if (response != null) {
        return response['notes'] as String? ?? '';
      }
      return '';
    } catch (e) {
      debugPrint('[CallHistory] Error fetching call notes: $e');
      return '';
    }
  }

  /// Save notes for a specific call
  Future<bool> saveCallNote({
    required String callId,
    required String notes,
  }) async {
    try {
      final existing = await _supabase
          .from('call_notes')
          .select()
          .eq('call_id', callId)
          .maybeSingle();

      if (existing != null) {
        await _supabase
            .from('call_notes')
            .update({'notes': notes})
            .eq('call_id', callId);
      } else {
        await _supabase.from('call_notes').insert({
          'call_id': callId,
          'notes': notes,
        });
      }
      return true;
    } catch (e) {
      debugPrint('[CallHistory] Error saving call notes: $e');
      return false;
    }
  }

  /// Get statistics for a date range
  Future<Map<String, dynamic>> getStatisticsForDateRange({
    required String userId,
    required DateTime startDate,
    required DateTime endDate,
  }) async {
    try {
      final response = await _supabase
          .from('call_history')
          .select()
          .eq('user_id', userId)
          .gte('created_at', startDate.toIso8601String())
          .lte('created_at', endDate.toIso8601String());

      final calls = List<Map<String, dynamic>>.from(response as List);

      int totalCalls = calls.length;
      int missedCalls = calls.where((c) => c['is_missed'] == true).length;
      int videoCalls = calls.where((c) => c['is_video_call'] == true).length;
      int audioOnlyCalls = calls
          .where((c) => c['is_video_call'] == false)
          .length;

      int totalDuration = 0;
      double totalQuality = 0.0;
      for (final call in calls) {
        if (call['duration_seconds'] is int) {
          totalDuration += call['duration_seconds'] as int;
        }
        if (call['quality_rating'] is int) {
          totalQuality += (call['quality_rating'] as int).toDouble();
        }
      }

      // Get unique days
      final uniqueDays = <String>{};
      for (final call in calls) {
        if (call['started_at'] != null) {
          final date = DateTime.parse(call['started_at']).toLocal();
          uniqueDays.add('${date.year}-${date.month}-${date.day}');
        }
      }

      return {
        'total_calls': totalCalls,
        'missed_calls': missedCalls,
        'video_calls': videoCalls,
        'audio_calls': audioOnlyCalls,
        'total_duration': totalDuration,
        'average_duration': totalCalls > 0
            ? (totalDuration / totalCalls).round()
            : 0,
        'average_quality': totalCalls > 0 ? totalQuality / totalCalls : 0.0,
        'daily_entries': uniqueDays.length,
      };
    } catch (e) {
      debugPrint('[CallHistory] Error getting statistics: $e');
      return {
        'total_calls': 0,
        'missed_calls': 0,
        'video_calls': 0,
        'audio_calls': 0,
        'total_duration': 0,
        'average_duration': 0,
        'average_quality': 0.0,
        'daily_entries': 0,
      };
    }
  }

  void dispose() {
    _historyController.close();
  }
}
