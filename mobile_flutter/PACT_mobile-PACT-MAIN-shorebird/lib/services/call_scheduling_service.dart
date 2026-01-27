import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest.dart' as tz_data;

class ScheduledCall {
  final String id;
  final String schedulerId;
  final String schedulerName;
  final String participantId;
  final String participantName;
  final DateTime scheduledAt;
  final int durationMinutes;
  final String? title;
  final String? notes;
  final String status; // 'pending', 'confirmed', 'cancelled', 'completed'
  final bool isVideoCall;
  final DateTime createdAt;

  ScheduledCall({
    required this.id,
    required this.schedulerId,
    required this.schedulerName,
    required this.participantId,
    required this.participantName,
    required this.scheduledAt,
    this.durationMinutes = 30,
    this.title,
    this.notes,
    this.status = 'pending',
    this.isVideoCall = false,
    required this.createdAt,
  });

  factory ScheduledCall.fromJson(Map<String, dynamic> json) {
    return ScheduledCall(
      id: json['id']?.toString() ?? '',
      schedulerId: json['scheduler_id']?.toString() ?? '',
      schedulerName: json['scheduler_name']?.toString() ?? 
                     json['scheduler']?['full_name']?.toString() ?? '',
      participantId: json['participant_id']?.toString() ?? '',
      participantName: json['participant_name']?.toString() ?? 
                       json['participant']?['full_name']?.toString() ?? '',
      scheduledAt: DateTime.tryParse(json['scheduled_at']?.toString() ?? '') ?? DateTime.now(),
      durationMinutes: json['duration_minutes'] as int? ?? 30,
      title: json['title']?.toString(),
      notes: json['notes']?.toString(),
      status: json['status']?.toString() ?? 'pending',
      isVideoCall: json['is_video_call'] as bool? ?? false,
      createdAt: DateTime.tryParse(json['created_at']?.toString() ?? '') ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'scheduler_id': schedulerId,
      'participant_id': participantId,
      'scheduled_at': scheduledAt.toIso8601String(),
      'duration_minutes': durationMinutes,
      'title': title,
      'notes': notes,
      'status': status,
      'is_video_call': isVideoCall,
    };
  }

  bool get isPast => scheduledAt.isBefore(DateTime.now());
  bool get isUpcoming => scheduledAt.isAfter(DateTime.now()) && status == 'confirmed';
}

class CallSchedulingService {
  final SupabaseClient _supabase = Supabase.instance.client;
  final FlutterLocalNotificationsPlugin _notifications = FlutterLocalNotificationsPlugin();
  
  String? get _currentUserId => _supabase.auth.currentUser?.id;

  Future<void> initialize() async {
    tz_data.initializeTimeZones();
    
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    
    await _notifications.initialize(
      const InitializationSettings(android: androidSettings, iOS: iosSettings),
    );
  }

  // ==================== SCHEDULING ====================

  Future<ScheduledCall?> scheduleCall({
    required String participantId,
    required DateTime scheduledAt,
    int durationMinutes = 30,
    String? title,
    String? notes,
    bool isVideoCall = false,
  }) async {
    try {
      final response = await _supabase.from('scheduled_calls').insert({
        'scheduler_id': _currentUserId,
        'participant_id': participantId,
        'scheduled_at': scheduledAt.toIso8601String(),
        'duration_minutes': durationMinutes,
        'title': title,
        'notes': notes,
        'is_video_call': isVideoCall,
        'status': 'pending',
      }).select('*, scheduler:scheduler_id(full_name), participant:participant_id(full_name)').single();

      final scheduledCall = ScheduledCall.fromJson(response);

      // Schedule reminder notification
      await _scheduleReminder(scheduledCall);

      // Notify the participant
      await _notifyParticipant(scheduledCall);

      return scheduledCall;
    } catch (e) {
      debugPrint('[CallScheduling] Error scheduling call: $e');
      return null;
    }
  }

  Future<List<ScheduledCall>> getMyScheduledCalls({bool upcomingOnly = true}) async {
    try {
      var query = _supabase
          .from('scheduled_calls')
          .select('*, scheduler:scheduler_id(full_name), participant:participant_id(full_name)')
          .or('scheduler_id.eq.$_currentUserId,participant_id.eq.$_currentUserId');

      if (upcomingOnly) {
        query = query
            .gte('scheduled_at', DateTime.now().toIso8601String())
            .inFilter('status', ['pending', 'confirmed']);
      }

      final response = await query.order('scheduled_at', ascending: true);

      return (response as List)
          .map((c) => ScheduledCall.fromJson(c))
          .toList();
    } catch (e) {
      debugPrint('[CallScheduling] Error getting scheduled calls: $e');
      return [];
    }
  }

  Future<bool> confirmCall(String callId) async {
    try {
      await _supabase.from('scheduled_calls').update({
        'status': 'confirmed',
      }).eq('id', callId);

      // Update reminder notification
      final response = await _supabase
          .from('scheduled_calls')
          .select('*, scheduler:scheduler_id(full_name), participant:participant_id(full_name)')
          .eq('id', callId)
          .single();
      
      await _scheduleReminder(ScheduledCall.fromJson(response));
      return true;
    } catch (e) {
      debugPrint('[CallScheduling] Error confirming call: $e');
      return false;
    }
  }

  Future<bool> cancelCall(String callId, {String? reason}) async {
    try {
      await _supabase.from('scheduled_calls').update({
        'status': 'cancelled',
        'cancel_reason': reason,
      }).eq('id', callId);

      // Cancel reminder notification
      await _notifications.cancel(callId.hashCode);
      return true;
    } catch (e) {
      debugPrint('[CallScheduling] Error cancelling call: $e');
      return false;
    }
  }

  Future<bool> rescheduleCall(String callId, DateTime newTime) async {
    try {
      await _supabase.from('scheduled_calls').update({
        'scheduled_at': newTime.toIso8601String(),
        'status': 'pending',
      }).eq('id', callId);

      // Update reminder
      final response = await _supabase
          .from('scheduled_calls')
          .select('*, scheduler:scheduler_id(full_name), participant:participant_id(full_name)')
          .eq('id', callId)
          .single();
      
      await _scheduleReminder(ScheduledCall.fromJson(response));
      return true;
    } catch (e) {
      debugPrint('[CallScheduling] Error rescheduling call: $e');
      return false;
    }
  }

  Future<bool> markCallCompleted(String callId, {int? actualDuration}) async {
    try {
      await _supabase.from('scheduled_calls').update({
        'status': 'completed',
        'actual_duration': actualDuration,
      }).eq('id', callId);
      return true;
    } catch (e) {
      debugPrint('[CallScheduling] Error marking call completed: $e');
      return false;
    }
  }

  // ==================== REMINDERS ====================

  Future<void> _scheduleReminder(ScheduledCall call) async {
    try {
      // Schedule 15 minutes before
      final reminderTime = call.scheduledAt.subtract(const Duration(minutes: 15));
      if (reminderTime.isBefore(DateTime.now())) return;

      final tzReminderTime = tz.TZDateTime.from(reminderTime, tz.local);
      final otherPerson = call.schedulerId == _currentUserId 
          ? call.participantName 
          : call.schedulerName;
      final callType = call.isVideoCall ? 'Video call' : 'Call';

      await _notifications.zonedSchedule(
        call.id.hashCode,
        '$callType in 15 minutes',
        'Scheduled ${call.title ?? callType} with $otherPerson',
        tzReminderTime,
        NotificationDetails(
          android: AndroidNotificationDetails(
            'scheduled_calls',
            'Scheduled Calls',
            channelDescription: 'Reminders for scheduled calls',
            importance: Importance.high,
            priority: Priority.high,
          ),
          iOS: const DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
          ),
        ),
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
        uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
      );
    } catch (e) {
      debugPrint('[CallScheduling] Error scheduling reminder: $e');
    }
  }

  Future<void> _notifyParticipant(ScheduledCall call) async {
    try {
      // Send push notification via database insert (trigger will send FCM)
      await _supabase.from('notifications').insert({
        'user_id': call.participantId,
        'type': 'scheduled_call',
        'title': call.isVideoCall ? 'Video Call Invitation' : 'Call Invitation',
        'message': '${call.schedulerName} scheduled a ${call.isVideoCall ? 'video call' : 'call'} with you for ${_formatDateTime(call.scheduledAt)}',
        'data': {
          'call_id': call.id,
          'scheduled_at': call.scheduledAt.toIso8601String(),
        },
      });
    } catch (e) {
      debugPrint('[CallScheduling] Error notifying participant: $e');
    }
  }

  String _formatDateTime(DateTime dt) {
    final now = DateTime.now();
    final isToday = dt.day == now.day && dt.month == now.month && dt.year == now.year;
    final isTomorrow = dt.day == now.day + 1 && dt.month == now.month && dt.year == now.year;

    final time = '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    
    if (isToday) return 'today at $time';
    if (isTomorrow) return 'tomorrow at $time';
    return '${dt.day}/${dt.month}/${dt.year} at $time';
  }

  // ==================== AVAILABILITY ====================

  Future<List<DateTime>> getAvailableSlots(String userId, DateTime date) async {
    try {
      // Get user's scheduled calls for the date
      final startOfDay = DateTime(date.year, date.month, date.day);
      final endOfDay = startOfDay.add(const Duration(days: 1));

      final response = await _supabase
          .from('scheduled_calls')
          .select('scheduled_at, duration_minutes')
          .eq('participant_id', userId)
          .gte('scheduled_at', startOfDay.toIso8601String())
          .lt('scheduled_at', endOfDay.toIso8601String())
          .inFilter('status', ['pending', 'confirmed']);

      final busySlots = (response as List).map((c) {
        final start = DateTime.parse(c['scheduled_at']);
        final end = start.add(Duration(minutes: c['duration_minutes'] as int? ?? 30));
        return {'start': start, 'end': end};
      }).toList();

      // Generate available 30-minute slots from 8am to 6pm
      final availableSlots = <DateTime>[];
      var slot = DateTime(date.year, date.month, date.day, 8, 0);
      final endTime = DateTime(date.year, date.month, date.day, 18, 0);

      while (slot.isBefore(endTime)) {
        final slotEnd = slot.add(const Duration(minutes: 30));
        final isAvailable = !busySlots.any((busy) =>
            slot.isBefore(busy['end']!) && slotEnd.isAfter(busy['start']!));

        if (isAvailable && slot.isAfter(DateTime.now())) {
          availableSlots.add(slot);
        }
        slot = slotEnd;
      }

      return availableSlots;
    } catch (e) {
      debugPrint('[CallScheduling] Error getting available slots: $e');
      return [];
    }
  }

  // ==================== CALL TRANSFER ====================

  Future<bool> transferCall({
    required String callId,
    required String toUserId,
    String? reason,
  }) async {
    try {
      // Log the transfer
      await _supabase.from('call_transfers').insert({
        'call_id': callId,
        'from_user_id': _currentUserId,
        'to_user_id': toUserId,
        'reason': reason,
      });

      // Notify the transfer recipient
      await _supabase.from('notifications').insert({
        'user_id': toUserId,
        'type': 'call_transfer',
        'title': 'Call Transfer',
        'message': 'You have been transferred a call',
        'data': {'call_id': callId},
      });

      return true;
    } catch (e) {
      debugPrint('[CallScheduling] Error transferring call: $e');
      return false;
    }
  }

  // ==================== VOICEMAIL ====================

  Future<bool> leaveVoicemail({
    required String forUserId,
    required String audioUrl,
    int durationSeconds = 0,
    String? transcription,
  }) async {
    try {
      await _supabase.from('voicemails').insert({
        'from_user_id': _currentUserId,
        'to_user_id': forUserId,
        'audio_url': audioUrl,
        'duration_seconds': durationSeconds,
        'transcription': transcription,
        'is_read': false,
      });

      // Notify recipient
      await _supabase.from('notifications').insert({
        'user_id': forUserId,
        'type': 'voicemail',
        'title': 'New Voicemail',
        'message': 'You have a new voicemail message',
      });

      return true;
    } catch (e) {
      debugPrint('[CallScheduling] Error leaving voicemail: $e');
      return false;
    }
  }

  Future<List<Map<String, dynamic>>> getVoicemails() async {
    try {
      final response = await _supabase
          .from('voicemails')
          .select('*, from_user:from_user_id(full_name, avatar_url)')
          .eq('to_user_id', _currentUserId ?? '')
          .order('created_at', ascending: false);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[CallScheduling] Error getting voicemails: $e');
      return [];
    }
  }

  Future<bool> markVoicemailRead(String voicemailId) async {
    try {
      await _supabase.from('voicemails').update({
        'is_read': true,
        'read_at': DateTime.now().toIso8601String(),
      }).eq('id', voicemailId);
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<bool> deleteVoicemail(String voicemailId) async {
    try {
      await _supabase.from('voicemails').delete().eq('id', voicemailId);
      return true;
    } catch (e) {
      return false;
    }
  }
}
