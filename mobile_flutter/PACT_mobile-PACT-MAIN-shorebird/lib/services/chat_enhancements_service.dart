import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:html/parser.dart' as html_parser;
import '../models/message_reaction.dart';
import '../models/typing_indicator.dart';
import '../models/link_preview.dart';

class ChatEnhancementsService {
  final SupabaseClient _supabase = Supabase.instance.client;
  static const String _linkPreviewCacheBox = 'link_preview_cache';

  final Map<String, List<TypingIndicator>> _typingUsers = {};
  final StreamController<Map<String, List<TypingIndicator>>> _typingController =
      StreamController.broadcast();

  Timer? _typingCleanupTimer;
  RealtimeChannel? _typingChannel;

  Stream<Map<String, List<TypingIndicator>>> get typingStream =>
      _typingController.stream;

  String? get _currentUserId => _supabase.auth.currentUser?.id;

  // ==================== MESSAGE REACTIONS ====================

  Future<List<MessageReaction>> getMessageReactions(String messageId) async {
    try {
      final response = await _supabase
          .from('message_reactions')
          .select('*, profiles:user_id(full_name, username, email)')
          .eq('message_id', messageId)
          .order('created_at', ascending: true);

      return (response as List)
          .map((r) => MessageReaction.fromJson(r))
          .toList();
    } catch (e) {
      debugPrint('[ChatEnhancements] Error getting reactions: $e');
      return [];
    }
  }

  Future<Map<String, List<MessageReaction>>> getBatchMessageReactions(
    List<String> messageIds,
  ) async {
    if (messageIds.isEmpty) return {};

    try {
      final response = await _supabase
          .from('message_reactions')
          .select('*, profiles:user_id(full_name, username, email)')
          .inFilter('message_id', messageIds)
          .order('created_at', ascending: true);

      final Map<String, List<MessageReaction>> result = {};
      for (final r in response as List) {
        final reaction = MessageReaction.fromJson(r);
        result.putIfAbsent(reaction.messageId, () => []).add(reaction);
      }
      return result;
    } catch (e) {
      debugPrint('[ChatEnhancements] Error getting batch reactions: $e');
      return {};
    }
  }

  Future<bool> addReaction(String messageId, String emoji) async {
    if (_currentUserId == null) return false;

    try {
      // Check if reaction already exists
      final existing = await _supabase
          .from('message_reactions')
          .select('id')
          .eq('message_id', messageId)
          .eq('user_id', _currentUserId!)
          .eq('emoji', emoji)
          .maybeSingle();

      if (existing != null) {
        // Remove existing reaction (toggle behavior)
        await _supabase
            .from('message_reactions')
            .delete()
            .eq('id', existing['id']);
        return true;
      }

      // Add new reaction
      await _supabase.from('message_reactions').insert({
        'message_id': messageId,
        'user_id': _currentUserId,
        'emoji': emoji,
      });
      return true;
    } catch (e) {
      debugPrint('[ChatEnhancements] Error adding reaction: $e');
      return false;
    }
  }

  Future<bool> removeReaction(String reactionId) async {
    try {
      await _supabase.from('message_reactions').delete().eq('id', reactionId);
      return true;
    } catch (e) {
      debugPrint('[ChatEnhancements] Error removing reaction: $e');
      return false;
    }
  }

  List<ReactionSummary> summarizeReactions(List<MessageReaction> reactions) {
    final Map<String, List<MessageReaction>> grouped = {};
    for (final reaction in reactions) {
      grouped.putIfAbsent(reaction.emoji, () => []).add(reaction);
    }

    return grouped.entries.map((entry) {
      return ReactionSummary(
        emoji: entry.key,
        count: entry.value.length,
        userNames: entry.value.map((r) => r.userName).toList(),
        currentUserReacted: entry.value.any((r) => r.userId == _currentUserId),
      );
    }).toList();
  }

  // ==================== TYPING INDICATORS ====================

  void subscribeToTyping(String chatId) {
    _typingChannel?.unsubscribe();

    _typingChannel = _supabase
        .channel('typing:$chatId')
        .onBroadcast(
          event: 'typing',
          callback: (payload) {
            final indicator = TypingIndicator.fromJson(payload);
            if (indicator.userId == _currentUserId) return;

            _typingUsers.putIfAbsent(chatId, () => []);
            _typingUsers[chatId]!.removeWhere(
              (t) => t.userId == indicator.userId,
            );
            _typingUsers[chatId]!.add(indicator);
            _typingController.add(_typingUsers);
          },
        )
        .subscribe();

    // Cleanup old typing indicators every 2 seconds
    _typingCleanupTimer?.cancel();
    _typingCleanupTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      bool changed = false;
      for (final chatId in _typingUsers.keys) {
        final before = _typingUsers[chatId]!.length;
        _typingUsers[chatId]!.removeWhere((t) => !t.isStillTyping);
        if (_typingUsers[chatId]!.length != before) changed = true;
      }
      if (changed) _typingController.add(_typingUsers);
    });
  }

  Future<void> sendTypingIndicator(String chatId, String userName) async {
    try {
      await _supabase
          .channel('typing:$chatId')
          .sendBroadcastMessage(
            event: 'typing',
            payload: {
              'chat_id': chatId,
              'user_id': _currentUserId,
              'user_name': userName,
              'timestamp': DateTime.now().toIso8601String(),
            },
          );
    } catch (e) {
      debugPrint('[ChatEnhancements] Error sending typing indicator: $e');
    }
  }

  void unsubscribeFromTyping() {
    _typingChannel?.unsubscribe();
    _typingCleanupTimer?.cancel();
  }

  // ==================== MESSAGE REPLIES ====================

  Future<bool> sendReplyMessage({
    required String chatId,
    required String content,
    required String replyToMessageId,
    required String replyToContent,
    required String replyToSenderId,
  }) async {
    if (_currentUserId == null) return false;

    try {
      await _supabase.from('chat_messages').insert({
        'chat_id': chatId,
        'sender_id': _currentUserId,
        'content': content,
        'content_type': 'text',
        'status': 'sent',
        'metadata': {
          'reply_to': {
            'message_id': replyToMessageId,
            'content': replyToContent.length > 100
                ? '${replyToContent.substring(0, 100)}...'
                : replyToContent,
            'sender_id': replyToSenderId,
          },
        },
      });
      return true;
    } catch (e) {
      debugPrint('[ChatEnhancements] Error sending reply: $e');
      return false;
    }
  }

  // ==================== MESSAGE FORWARDING ====================

  Future<bool> forwardMessage({
    required String targetChatId,
    required String originalContent,
    required String originalSenderId,
    required String contentType,
    Map<String, dynamic>? attachments,
  }) async {
    if (_currentUserId == null) return false;

    try {
      await _supabase.from('chat_messages').insert({
        'chat_id': targetChatId,
        'sender_id': _currentUserId,
        'content': originalContent,
        'content_type': contentType,
        'attachments': attachments,
        'status': 'sent',
        'metadata': {'forwarded': true, 'original_sender_id': originalSenderId},
      });
      return true;
    } catch (e) {
      debugPrint('[ChatEnhancements] Error forwarding message: $e');
      return false;
    }
  }

  // ==================== MESSAGE EDITING ====================

  Future<bool> editMessage(String messageId, String newContent) async {
    if (_currentUserId == null) return false;

    try {
      // Verify ownership
      final message = await _supabase
          .from('chat_messages')
          .select('sender_id')
          .eq('id', messageId)
          .single();

      if (message['sender_id'] != _currentUserId) {
        debugPrint('[ChatEnhancements] Cannot edit message: not owner');
        return false;
      }

      await _supabase
          .from('chat_messages')
          .update({
            'content': newContent,
            'metadata': {
              'edited': true,
              'edited_at': DateTime.now().toIso8601String(),
            },
          })
          .eq('id', messageId);

      return true;
    } catch (e) {
      debugPrint('[ChatEnhancements] Error editing message: $e');
      return false;
    }
  }

  Future<bool> deleteMessage(String messageId) async {
    if (_currentUserId == null) return false;

    try {
      // Verify ownership
      final message = await _supabase
          .from('chat_messages')
          .select('sender_id')
          .eq('id', messageId)
          .single();

      if (message['sender_id'] != _currentUserId) {
        debugPrint('[ChatEnhancements] Cannot delete message: not owner');
        return false;
      }

      // Soft delete - mark as deleted
      await _supabase
          .from('chat_messages')
          .update({
            'content': '',
            'metadata': {
              'deleted': true,
              'deleted_at': DateTime.now().toIso8601String(),
            },
          })
          .eq('id', messageId);

      return true;
    } catch (e) {
      debugPrint('[ChatEnhancements] Error deleting message: $e');
      return false;
    }
  }

  // ==================== READ RECEIPTS ====================

  Future<void> markMessageRead(String messageId) async {
    if (_currentUserId == null) return;

    try {
      await _supabase.from('message_read_receipts').upsert({
        'message_id': messageId,
        'user_id': _currentUserId,
        'read_at': DateTime.now().toIso8601String(),
      }, onConflict: 'message_id,user_id');
    } catch (e) {
      debugPrint('[ChatEnhancements] Error marking message read: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getReadReceipts(String messageId) async {
    try {
      final response = await _supabase
          .from('message_read_receipts')
          .select('*, profiles:user_id(full_name, username)')
          .eq('message_id', messageId)
          .order('read_at', ascending: true);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[ChatEnhancements] Error getting read receipts: $e');
      return [];
    }
  }

  // ==================== MESSAGE SEARCH ====================

  Future<List<Map<String, dynamic>>> searchMessages({
    required String chatId,
    required String query,
    int limit = 50,
  }) async {
    if (query.trim().isEmpty) return [];

    try {
      final response = await _supabase
          .from('chat_messages')
          .select('*, profiles:sender_id(full_name, username)')
          .eq('chat_id', chatId)
          .ilike('content', '%$query%')
          .order('created_at', ascending: false)
          .limit(limit);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[ChatEnhancements] Error searching messages: $e');
      return [];
    }
  }

  // ==================== LINK PREVIEWS ====================

  Future<LinkPreview?> fetchLinkPreview(String url) async {
    try {
      // Check cache first
      final box = await Hive.openBox(_linkPreviewCacheBox);
      final cached = box.get(url);
      if (cached != null && cached is Map) {
        final cacheTime = DateTime.tryParse(
          cached['cached_at']?.toString() ?? '',
        );
        if (cacheTime != null &&
            DateTime.now().difference(cacheTime).inHours < 24) {
          return LinkPreview.fromJson(Map<String, dynamic>.from(cached));
        }
      }

      // Fetch the URL
      final response = await http
          .get(Uri.parse(url), headers: {'User-Agent': 'Mozilla/5.0'})
          .timeout(const Duration(seconds: 10));

      if (response.statusCode != 200) return null;

      final document = html_parser.parse(response.body);

      // Extract Open Graph meta tags
      String? getMetaContent(String property) {
        final element =
            document.querySelector('meta[property="$property"]') ??
            document.querySelector('meta[name="$property"]');
        return element?.attributes['content'];
      }

      final preview = LinkPreview(
        url: url,
        title:
            getMetaContent('og:title') ?? document.querySelector('title')?.text,
        description:
            getMetaContent('og:description') ?? getMetaContent('description'),
        imageUrl: getMetaContent('og:image'),
        siteName: getMetaContent('og:site_name'),
        favicon:
            document.querySelector('link[rel="icon"]')?.attributes['href'] ??
            document
                .querySelector('link[rel="shortcut icon"]')
                ?.attributes['href'],
      );

      // Cache the result
      final cacheData = preview.toJson();
      cacheData['cached_at'] = DateTime.now().toIso8601String();
      await box.put(url, cacheData);

      return preview;
    } catch (e) {
      debugPrint('[ChatEnhancements] Error fetching link preview: $e');
      return null;
    }
  }

  List<String> extractUrls(String text) {
    final urlRegex = RegExp(
      r'https?://[^\s<>\[\]{}|\\^`"]+',
      caseSensitive: false,
    );
    return urlRegex.allMatches(text).map((m) => m.group(0)!).toList();
  }

  // ==================== VOICE MESSAGES ====================

  Future<String?> uploadVoiceMessage(String filePath, String chatId) async {
    try {
      final fileName = 'voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      final storagePath = 'chat_audio/$chatId/$fileName';

      final file = await _supabase.storage
          .from('chat-attachments')
          .upload(
            storagePath,
            await http.MultipartFile.fromPath('file', filePath).finalize()
                as dynamic,
          );

      final publicUrl = _supabase.storage
          .from('chat-attachments')
          .getPublicUrl(storagePath);

      return publicUrl;
    } catch (e) {
      debugPrint('[ChatEnhancements] Error uploading voice message: $e');
      return null;
    }
  }

  // ==================== FILE ATTACHMENTS ====================

  Future<Map<String, String>?> uploadFileAttachment({
    required String filePath,
    required String fileName,
    required String chatId,
    required String contentType,
  }) async {
    try {
      final storagePath =
          'chat_files/$chatId/${DateTime.now().millisecondsSinceEpoch}_$fileName';

      await _supabase.storage
          .from('chat-attachments')
          .upload(
            storagePath,
            await http.MultipartFile.fromPath('file', filePath).finalize()
                as dynamic,
          );

      final publicUrl = _supabase.storage
          .from('chat-attachments')
          .getPublicUrl(storagePath);

      return {'url': publicUrl, 'name': fileName, 'type': contentType};
    } catch (e) {
      debugPrint('[ChatEnhancements] Error uploading file: $e');
      return null;
    }
  }

  void dispose() {
    _typingChannel?.unsubscribe();
    _typingCleanupTimer?.cancel();
    _typingController.close();
  }
}
