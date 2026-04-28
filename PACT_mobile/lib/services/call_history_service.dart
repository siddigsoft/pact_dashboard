// lib/services/call_history_service.dart

import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:http/http.dart' as http;
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
    try {
      await _loadLocalHistory();
      await _syncWithServer();
    } catch (e) {
      debugPrint('[CallHistory] Error in initialize: $e');
    }
  }

  Future<void> _loadLocalHistory() async {
    try {
      if (!Hive.isBoxOpen(_historyBoxName)) {
        await Hive.openBox(_historyBoxName);
      }
      final box = Hive.box(_historyBoxName);
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
      if (!Hive.isBoxOpen(_historyBoxName)) {
        await Hive.openBox(_historyBoxName);
      }
      final box = Hive.box(_historyBoxName);
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
          .eq('user_id', userId)
          .order('started_at', ascending: false)
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
      // call_history schema: user_id (owner), caller_id (other party), no callee_id
      final callerId = data['caller_id'] as String? ?? '';
      final startedAt = data['started_at'] ?? data['created_at'];
      if (startedAt == null) return null;

      return CallHistoryEntry(
        id: data['id'] as String? ?? const Uuid().v4(),
        callId: null,
        remoteUserId: callerId,
        remoteUserName: data['caller_name'] as String? ?? 'Unknown',
        remoteUserAvatar: data['caller_avatar'] as String?,
        isOutgoing: false,
        isVideoCall: (data['call_type'] as String?) == 'video',
        endStatus: _parseStatus(data['status'] as String?),
        startTime: DateTime.parse(startedAt as String),
        endTime: data['ended_at'] != null
            ? DateTime.parse(data['ended_at'] as String)
            : null,
        duration: data['duration_seconds'] != null
            ? Duration(seconds: data['duration_seconds'] as int)
            : null,
        notes: data['notes'] as String?,
        wasRecorded: false,
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

      // call_history schema: user_id, caller_id, caller_name, caller_avatar, call_type, status, started_at, ended_at, duration_seconds, notes (no callee_id)
      // caller_id represents who INITIATED the call:
      // - For incoming calls: caller_id = remote user (they called you)
      // - For outgoing calls: caller_id = current user (you called them)
      final isOutgoing = entry.isOutgoing;
      final payload = {
        'user_id': userId,
        'caller_id': isOutgoing ? userId : entry.remoteUserId,
        'receiver_id': isOutgoing ? entry.remoteUserId : userId,
        'caller_name': entry.remoteUserName,
        'receiver_name': entry
            .remoteUserName, // Always store remote user name for easy lookup
        'caller_avatar': entry.remoteUserAvatar,
        'call_type': entry.isVideoCall ? 'video' : 'audio',
        'status': entry.endStatus.name,
        'started_at': entry.startTime.toIso8601String(),
        'ended_at': entry.endTime?.toIso8601String(),
        'duration_seconds': entry.duration?.inSeconds,
        'notes': entry.notes,
      };
      debugPrint(
        '[JitsiCall] CallHistoryService _saveToServer() inserting call_history: $payload',
      );
      await _supabase.from('call_history').insert(payload);
      debugPrint('[JitsiCall] CallHistoryService _saveToServer() DONE');

      // Trigger push notification if this is a missed call
      if (entry.endStatus == CallStatus.unreachable ||
          entry.endStatus.name == 'missed') {
        await _triggerMissedCallNotification(
          callerUserId: userId,
          receiverUserId: entry.remoteUserId,
          receiverName: entry.remoteUserName,
          callId: entry.callId ?? '',
          reason: entry.endStatus.name,
        );
      }
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
      if (!Hive.isBoxOpen(_historyBoxName)) {
        await Hive.openBox(_historyBoxName);
      }
      final box = Hive.box(_historyBoxName);
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
      debugPrint(
        '[CallHistory] getCallHistory() userId=$userId, filterType=$filterType, limit=$limit',
      );

      if (userId.isEmpty) {
        debugPrint('[CallHistory] ERROR: userId is empty!');
        return [];
      }

      var query = _supabase.from('call_history').select().eq('user_id', userId);

      // First, get all calls for this user without filtering
      final response = await query
          .order('started_at', ascending: false)
          .limit(limit);

      List<Map<String, dynamic>> calls = List<Map<String, dynamic>>.from(
        response as List,
      );

      debugPrint('[CallHistory] Total calls fetched: ${calls.length}');
      if (calls.isNotEmpty) {
        debugPrint('[CallHistory] First call data: ${calls.first}');
      }

      // Apply client-side filtering based on call direction
      // Note: call_type field contains media type ('audio'/'video'), not direction
      // Direction is determined by comparing caller_id with user_id
      if (filterType != null && filterType.isNotEmpty && filterType != 'all') {
        if (filterType == 'incoming') {
          debugPrint(
            '[CallHistory] Filtering for incoming calls (caller_id != user_id)',
          );
          calls = calls.where((call) {
            final callerId = call['caller_id'];
            final isIncoming = callerId != userId;
            debugPrint(
              '[CallHistory] Call ${call['id']}: caller_id=$callerId, is_incoming=$isIncoming',
            );
            return isIncoming;
          }).toList();
        } else if (filterType == 'outgoing') {
          debugPrint(
            '[CallHistory] Filtering for outgoing calls (caller_id == user_id)',
          );
          calls = calls.where((call) {
            final callerId = call['caller_id'];
            final isOutgoing = callerId == userId;
            debugPrint(
              '[CallHistory] Call ${call['id']}: caller_id=$callerId, is_outgoing=$isOutgoing',
            );
            return isOutgoing;
          }).toList();
        } else if (filterType == 'missed') {
          debugPrint(
            '[CallHistory] Filtering for missed calls (status=missed)',
          );
          calls = calls.where((call) => call['status'] == 'missed').toList();
        }
      }

      debugPrint('[CallHistory] After filtering: ${calls.length} calls');
      return calls;
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
      debugPrint(
        '[CallHistory] searchCallHistory() userId=$userId, query=$query, remoteUserId=$remoteUserId',
      );

      if (userId.isEmpty) {
        debugPrint('[CallHistory] ERROR: userId is empty for search!');
        return [];
      }

      var q = _supabase.from('call_history').select().eq('user_id', userId);

      if (query != null && query.isNotEmpty) {
        q = q.ilike('caller_name', '%$query%');
        debugPrint('[CallHistory] Added caller_name search filter');
      }

      if (remoteUserId != null && remoteUserId.isNotEmpty) {
        q = q.eq('caller_id', remoteUserId);
        debugPrint('[CallHistory] Added caller_id filter');
      }

      final response = await q.order('started_at', ascending: false);
      debugPrint(
        '[CallHistory] Search found ${(response as List).length} calls',
      );
      return List<Map<String, dynamic>>.from(response as List);
    } catch (e) {
      debugPrint('[CallHistory] Error searching call history: $e');
      return [];
    }
  }

  /// Get notes for a specific call.
  /// Uses the `notes` column on the call_history table directly.
  Future<String> getCallNotes(String callId) async {
    try {
      final response = await _supabase
          .from('call_history')
          .select('notes')
          .eq('id', callId)
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

  /// Save notes for a specific call.
  /// Updates the `notes` column on the call_history table directly.
  Future<bool> saveCallNote({
    required String callId,
    required String notes,
  }) async {
    try {
      await _supabase
          .from('call_history')
          .update({'notes': notes})
          .eq('id', callId);
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
          .gte('started_at', startDate.toIso8601String())
          .lte('started_at', endDate.toIso8601String());

      final calls = List<Map<String, dynamic>>.from(response as List);

      int totalCalls = calls.length;
      int missedCalls = calls.where((c) => c['status'] == 'missed').length;
      int videoCalls = calls.where((c) => c['call_type'] == 'video').length;
      int audioOnlyCalls = calls.where((c) => c['call_type'] != 'video').length;

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

  /// Notify Edge Function of missed call for push notification
  Future<void> _triggerMissedCallNotification({
    required String callerUserId,
    required String receiverUserId,
    required String receiverName,
    required String callId,
    required String reason,
  }) async {
    try {
      final supabase = Supabase.instance.client;
      final session = supabase.auth.currentSession;
      if (session == null) {
        debugPrint('[CallHistory] No session - cannot trigger notification');
        return;
      }

      // Call the Edge Function with proper authentication
      final response = await http.post(
        Uri.parse(
          'https://abznugnirnlrqnnfkein.supabase.co/functions/v1/send-missed-call-notification',
        ),
        headers: {
          'Authorization': 'Bearer ${session.accessToken}',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'caller_user_id': callerUserId,
          'receiver_user_id': receiverUserId,
          'receiver_name': receiverName,
          'call_id': callId,
          'reason': reason,
        }),
      );

      if (response.statusCode == 200) {
        debugPrint('[CallHistory] Missed call notification triggered');
      } else {
        debugPrint(
          '[CallHistory] Failed to trigger notification: ${response.statusCode} ${response.body}',
        );
      }
    } catch (e) {
      debugPrint('[CallHistory] Error triggering missed call notification: $e');
    }
  }

  void dispose() {
    _historyController.close();
  }
}
