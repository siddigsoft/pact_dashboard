import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'notification_service.dart';

class RealtimeNotificationService {
  static final RealtimeNotificationService _instance = RealtimeNotificationService._internal();
  factory RealtimeNotificationService() => _instance;
  RealtimeNotificationService._internal();

  final SupabaseClient _supabase = Supabase.instance.client;
  RealtimeChannel? _chatChannel;
  RealtimeChannel? _mmpChannel;
  
  String? _currentUserId;
  bool _isInitialized = false;

  // Initialize real-time listeners
  Future<void> initialize() async {
    if (_isInitialized) return;

    _currentUserId = _supabase.auth.currentUser?.id;
    
    if (_currentUserId == null) {
      print('User not logged in, cannot initialize notifications');
      return;
    }

    await _setupChatListener();
    await _setupMMPFileListener();
    
    _isInitialized = true;
    print('Realtime notification service initialized');
  }

  // ==================== CHAT MESSAGE LISTENER ====================
  
  Future<void> _setupChatListener() async {
    try {
      // Subscribe to chat_messages table for new messages
      _chatChannel = _supabase
          .channel('chat_messages_notifications')
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: 'public',
            table: 'chat_messages',
            callback: (payload) async {
              await _handleNewChatMessage(payload);
            },
          )
          .subscribe();

      print('Chat message listener started');
    } catch (e) {
      print('Error setting up chat listener: $e');
    }
  }

  Future<void> _handleNewChatMessage(PostgresChangePayload payload) async {
    try {
      final newMessage = payload.newRecord;
      
      // Don't notify for own messages
      if (newMessage['sender_id'] == _currentUserId) {
        return;
      }

      // Get sender information
      final senderResponse = await _supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', newMessage['sender_id'])
          .single();

      final senderName = senderResponse['full_name'] ?? 
                        senderResponse['email'] ?? 
                        'Someone';

      final message = newMessage['content'] ?? 'Sent a message';
      final chatId = newMessage['chat_id'];

      // Show notification
      await NotificationService.showChatMessageNotification(
        senderName: senderName,
        message: message,
        chatId: chatId,
      );

      print('Chat notification sent for message from $senderName');
    } catch (e) {
      print('Error handling new chat message: $e');
    }
  }

  // ==================== MMP FILE LISTENER ====================
  
  Future<void> _setupMMPFileListener() async {
    try {
      // Subscribe to reports table for new MMP files
      _mmpChannel = _supabase
          .channel('mmp_files_notifications')
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: 'public',
            table: 'reports',
            callback: (payload) async {
              await _handleNewMMPFile(payload);
            },
          )
          .subscribe();

      print('MMP file listener started');
    } catch (e) {
      print('Error setting up MMP file listener: $e');
    }
  }

  Future<void> _handleNewMMPFile(PostgresChangePayload payload) async {
    try {
      final newFile = payload.newRecord;
      
      // Don't notify for own uploads
      if (newFile['user_id'] == _currentUserId) {
        return;
      }

      // Get uploader information
      final uploaderResponse = await _supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', newFile['user_id'])
          .single();

      final uploaderName = uploaderResponse['full_name'] ?? 
                          uploaderResponse['email'] ?? 
                          'Someone';

      final fileName = newFile['title'] ?? 'New MMP File';
      final fileId = newFile['id'];

      // Show notification
      await NotificationService.showMMPFileNotification(
        title: 'New MMP File Available',
        body: '$uploaderName uploaded: $fileName',
        fileId: fileId,
        fileName: fileName,
      );

      print('MMP file notification sent for $fileName');
    } catch (e) {
      print('Error handling new MMP file: $e');
    }
  }

  // ==================== UTILITY METHODS ====================
  
  // Stop all listeners
  void dispose() {
    _chatChannel?.unsubscribe();
    _mmpChannel?.unsubscribe();
    _chatChannel = null;
    _mmpChannel = null;
    _isInitialized = false;
    print('Realtime notification service disposed');
  }

  // Restart listeners (useful after re-login)
  Future<void> restart() async {
    dispose();
    await Future.delayed(const Duration(milliseconds: 500));
    await initialize();
  }

  // Check if listeners are active
  bool get isActive => _isInitialized;
}
