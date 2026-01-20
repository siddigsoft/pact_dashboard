import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import '../models/chat.dart';
import '../models/chat_message.dart';
import '../models/chat_participant.dart';

class ChatService {
  final SupabaseClient _supabase = Supabase.instance.client;
  static const String _chatCacheBoxName = 'chat_cache_box';
  static const String _chatCacheKey = 'chat_list';
  static const String _messageQueueBoxName = 'message_queue_box';
  static const String _messageCacheBoxName = 'message_cache_box';

  final Map<String, List<ChatParticipant>> _participantCache = {};
  
  /// Check if device is online
  Future<bool> _isOnline() async {
    final result = await Connectivity().checkConnectivity();
    return !result.contains(ConnectivityResult.none);
  }
  
  /// Open message queue box for offline messages
  Future<Box> _openMessageQueueBox() async {
    return Hive.openBox(_messageQueueBoxName);
  }
  
  /// Open message cache box
  Future<Box> _openMessageCacheBox() async {
    return Hive.openBox(_messageCacheBoxName);
  }
  
  /// Queue a message for later sync
  Future<ChatMessage> _queueMessageOffline(String chatId, String content, String contentType) async {
    final currentUser = _supabase.auth.currentUser;
    final localId = const Uuid().v4();
    final now = DateTime.now();
    
    final pendingMessage = {
      'local_id': localId,
      'chat_id': chatId,
      'sender_id': currentUser?.id,
      'content': content,
      'content_type': contentType,
      'status': 'pending',
      'created_at': now.toIso8601String(),
      'synced': false,
    };
    
    // Save to queue
    final box = await _openMessageQueueBox();
    await box.put(localId, pendingMessage);
    
    debugPrint('[ChatService] Message queued offline: $localId');
    
    return ChatMessage(
      id: localId,
      chatId: chatId,
      senderId: currentUser?.id ?? '',
      content: content,
      contentType: contentType,
      status: 'pending',
      createdAt: now,
    );
  }
  
  /// Get pending messages count
  Future<int> getPendingMessagesCount() async {
    final box = await _openMessageQueueBox();
    return box.length;
  }
  
  /// Get pending messages for a chat
  Future<List<ChatMessage>> getPendingMessages(String chatId) async {
    final box = await _openMessageQueueBox();
    final messages = <ChatMessage>[];
    
    for (var key in box.keys) {
      final data = box.get(key);
      if (data != null && data is Map) {
        final map = Map<String, dynamic>.from(data);
        if (map['chat_id'] == chatId && map['synced'] != true) {
          messages.add(ChatMessage(
            id: map['local_id'] ?? key.toString(),
            chatId: map['chat_id'],
            senderId: map['sender_id'] ?? '',
            content: map['content'] ?? '',
            contentType: map['content_type'] ?? 'text',
            status: 'pending',
            createdAt: DateTime.tryParse(map['created_at'] ?? '') ?? DateTime.now(),
          ));
        }
      }
    }
    
    return messages;
  }
  
  /// Sync all pending messages
  Future<int> syncPendingMessages() async {
    if (!await _isOnline()) {
      debugPrint('[ChatService] Cannot sync - offline');
      return 0;
    }
    
    final box = await _openMessageQueueBox();
    int syncedCount = 0;
    final keysToRemove = <dynamic>[];
    
    for (var key in box.keys) {
      final data = box.get(key);
      if (data == null || data is! Map) continue;
      
      final map = Map<String, dynamic>.from(data);
      if (map['synced'] == true) {
        keysToRemove.add(key);
        continue;
      }
      
      try {
        await _supabase.from('chat_messages').insert({
          'chat_id': map['chat_id'],
          'sender_id': map['sender_id'],
          'content': map['content'],
          'content_type': map['content_type'] ?? 'text',
          'status': 'sent',
        });
        
        keysToRemove.add(key);
        syncedCount++;
        debugPrint('[ChatService] Synced message: $key');
      } catch (e) {
        debugPrint('[ChatService] Failed to sync message $key: $e');
      }
    }
    
    // Remove synced messages
    for (var key in keysToRemove) {
      await box.delete(key);
    }
    
    debugPrint('[ChatService] Synced $syncedCount messages');
    return syncedCount;
  }
  
  /// Cache messages for a chat
  Future<void> cacheMessages(String chatId, List<ChatMessage> messages) async {
    try {
      final box = await _openMessageCacheBox();
      await box.put('messages_$chatId', {
        'updated_at': DateTime.now().toIso8601String(),
        'messages': messages.map((m) => {
          'id': m.id,
          'chat_id': m.chatId,
          'sender_id': m.senderId,
          'content': m.content,
          'content_type': m.contentType,
          'status': m.status,
          'created_at': m.createdAt.toIso8601String(),
        }).toList(),
      });
    } catch (e) {
      debugPrint('[ChatService] Error caching messages: $e');
    }
  }
  
  /// Get cached messages for a chat
  Future<List<ChatMessage>> getCachedMessages(String chatId) async {
    try {
      final box = await _openMessageCacheBox();
      final cache = box.get('messages_$chatId');
      if (cache == null || cache is! Map) return [];
      
      final rawMessages = cache['messages'];
      if (rawMessages is! List) return [];
      
      return rawMessages.map((item) {
        final map = Map<String, dynamic>.from(item as Map);
        return ChatMessage(
          id: map['id'] ?? '',
          chatId: map['chat_id'] ?? chatId,
          senderId: map['sender_id'] ?? '',
          content: map['content'] ?? '',
          contentType: map['content_type'] ?? 'text',
          status: map['status'] ?? 'sent',
          createdAt: DateTime.tryParse(map['created_at'] ?? '') ?? DateTime.now(),
        );
      }).toList();
    } catch (e) {
      debugPrint('[ChatService] Error loading cached messages: $e');
      return [];
    }
  }

  // Get current user ID
  String? getCurrentUserId() {
    return _supabase.auth.currentUser?.id;
  }

  Future<Box> _openChatCacheBox() async {
    return Hive.openBox(_chatCacheBoxName);
  }

  Future<void> _cacheChats(List<Chat> chats) async {
    try {
      final box = await _openChatCacheBox();
      await box.put(_chatCacheKey, {
        'updated_at': DateTime.now().toIso8601String(),
        'chats': chats.map((chat) => chat.toCacheJson()).toList(),
      });
    } catch (e) {
      // ignore: avoid_print
      print('Error caching chats: $e');
    }
  }

  Future<void> _removeChatFromCache(String chatId) async {
    try {
      final box = await _openChatCacheBox();
      final cache = box.get(_chatCacheKey);
      if (cache is! Map) return;

      final rawChats = cache['chats'];
      if (rawChats is! List) return;

      final updated = <Map<String, dynamic>>[];
      for (final item in rawChats) {
        if (item is! Map) continue;
        final map = Map<String, dynamic>.from(item);
        if (map['id'] != chatId) {
          updated.add(map);
        }
      }

      await box.put(_chatCacheKey, {
        'updated_at': DateTime.now().toIso8601String(),
        'chats': updated,
      });
    } catch (e) {
      // ignore: avoid_print
      print('Error removing chat from cache: $e');
    }
  }

  Future<List<Chat>> getCachedUserChats() async {
    try {
      final box = await _openChatCacheBox();
      final cache = box.get(_chatCacheKey);
      if (cache is! Map) return [];

      final rawChats = cache['chats'];
      if (rawChats is! List) return [];

      final chats = <Chat>[];
      for (final item in rawChats) {
        if (item is! Map) continue;
        chats.add(Chat.fromJson(Map<String, dynamic>.from(item)));
      }

      for (final chat in chats) {
        if (chat.otherParticipantId != null &&
            (chat.otherParticipantName == null ||
                chat.otherParticipantName!.isEmpty)) {
          final counterpartId = chat.otherParticipantId!;
          final shortId = counterpartId.length > 8
              ? counterpartId.substring(0, 8)
              : counterpartId;
          chat.otherParticipantName = 'User $shortId';
        }

        if (chat.participants.isNotEmpty) {
          _participantCache[chat.id] = chat.participants
              .map(
                (participant) => ChatParticipant(
                  chatId: participant.chatId,
                  userId: participant.userId,
                  userName: participant.userName,
                  joinedAt: participant.joinedAt,
                ),
              )
              .toList();
        }
      }

      return chats;
    } catch (e) {
      // ignore: avoid_print
      print('Error loading cached chats: $e');
      return [];
    }
  }

  String _buildInFilterPayload(Iterable<String> values) {
    final quoted = values.map((value) => '"$value"').join(',');
    return '($quoted)';
  }

  bool _isValidUuid(String? value) {
    if (value == null || value.isEmpty) {
      return false;
    }
    return RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    ).hasMatch(value);
  }

  Future<Map<String, String>> _fetchProfileNames(Set<String> userIds) async {
    if (userIds.isEmpty) return {};

    final validIds = userIds.where(_isValidUuid).toSet();
    if (validIds.isEmpty) {
      return {};
    }

    try {
      final response = await _supabase
          .from('profiles')
          .select('id, username, full_name, email')
          .filter('id', 'in', _buildInFilterPayload(validIds));

      final names = <String, String>{};
      for (final item in response) {
        final map = Map<String, dynamic>.from(item as Map);
        final id = map['id'] as String?;
        if (id == null) continue;
        final username = (map['username'] as String?)?.trim();
        final fullName = (map['full_name'] as String?)?.trim();
        final email = (map['email'] as String?)?.trim();
        if (username != null && username.isNotEmpty) {
          names[id] = username;
        } else if (fullName != null && fullName.isNotEmpty) {
          names[id] = fullName;
        } else if (email != null && email.isNotEmpty) {
          names[id] = email;
        } else {
          final shortId = id.length > 8 ? id.substring(0, 8) : id;
          names[id] = 'User $shortId';
        }
      }
      return names;
    } catch (e) {
      // ignore: avoid_print
      print('Error fetching profile names: $e');
      return {};
    }
  }

  ChatParticipant? _findParticipantById(
    List<ChatParticipant> participants,
    String userId,
  ) {
    for (final participant in participants) {
      if (participant.userId == userId) {
        return participant;
      }
    }
    return null;
  }

  String? _parseOtherParticipantFromPairKey(
    String? pairKey,
    String currentUserId,
  ) {
    if (pairKey == null || pairKey.isEmpty) {
      return null;
    }
    final uuidPattern = RegExp(
      r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
    );

    final matches = uuidPattern.allMatches(pairKey);
    for (final match in matches) {
      final candidate = pairKey.substring(match.start, match.end);
      if (candidate != currentUserId) {
        return candidate;
      }
    }
    return null;
  }

  Future<String?> _findOtherParticipantFromMessages(
    String chatId,
    String currentUserId,
  ) async {
    try {
      final response = await _supabase
          .from('chat_messages')
          .select('sender_id')
          .eq('chat_id', chatId)
          .order('created_at', ascending: false)
          .limit(25);

      for (final item in response) {
        final map = Map<String, dynamic>.from(item as Map);
        final senderId = map['sender_id'] as String?;
        if (senderId != null && senderId != currentUserId) {
          return senderId;
        }
      }
    } catch (e) {
      // ignore: avoid_print
      print('Error finding participant via messages: $e');
    }

    return null;
  }

  Future<List<ChatParticipant>> _completeParticipantList(
    String chatId,
    List<ChatParticipant> participants,
  ) async {
    if (participants.length == 1) {
      try {
        final messages = await _supabase
            .from('chat_messages')
            .select(
              'sender_id, profiles!chat_messages_sender_id_fkey(full_name, email, username)',
            )
            .eq('chat_id', chatId)
            .order('created_at', ascending: false)
            .limit(10);

        for (final message in messages) {
          final map = Map<String, dynamic>.from(message as Map);
          final senderId = map['sender_id'] as String?;
          if (senderId == null ||
              participants.any(
                (participant) => participant.userId == senderId,
              )) {
            continue;
          }

          final profile = map['profiles'];
          final profileMap = profile is Map
              ? Map<String, dynamic>.from(profile)
              : null;
          final username = (profileMap?['username'] as String?)?.trim();
          final fullName = (profileMap?['full_name'] as String?)?.trim();
          final email = (profileMap?['email'] as String?)?.trim();

          participants.add(
            ChatParticipant(
              chatId: chatId,
              userId: senderId,
              userName: username?.isNotEmpty == true
                  ? username
                  : (fullName?.isNotEmpty == true
                        ? fullName
                        : (email?.isNotEmpty == true ? email : null)),
              joinedAt: DateTime.now(),
            ),
          );
        }
      } catch (e) {
        // ignore: avoid_print
        print('Error fetching participants from messages: $e');
      }
    }

    final missingNameIds = participants
        .where(
          (participant) =>
              participant.userName == null ||
              participant.userName!.trim().isEmpty,
        )
        .map((participant) => participant.userId)
        .toSet();

    if (missingNameIds.isNotEmpty) {
      final fallbackNames = await _fetchProfileNames(missingNameIds);
      for (final participant in participants) {
        final name = fallbackNames[participant.userId];
        if (name != null && name.isNotEmpty) {
          participant.userName = name;
        }
      }
    }

    for (final participant in participants) {
      if (participant.userName == null ||
          participant.userName!.trim().isEmpty) {
        final shortId = participant.userId.length > 8
            ? participant.userId.substring(0, 8)
            : participant.userId;
        participant.userName = 'User $shortId';
      }
    }

    _participantCache[chatId] = participants
        .map(
          (participant) => ChatParticipant(
            chatId: participant.chatId,
            userId: participant.userId,
            userName: participant.userName,
            joinedAt: participant.joinedAt,
          ),
        )
        .toList();

    return participants;
  }

  // Get all chats for current user
  Future<List<Chat>> getUserChats() async {
    final currentUser = _supabase.auth.currentUser;
    if (currentUser == null) return [];

    try {
      // Get all chats where user is a participant
      final response = await _supabase
          .from('chat_participants')
          .select('chat_id, chats(*)')
          .eq('user_id', currentUser.id);

      final chats = <Chat>[];
      final profileIds = <String>{};
      for (final row in response) {
        final chatData = row['chats'];
        if (chatData != null) {
          final chat = Chat.fromJson(Map<String, dynamic>.from(chatData));

          if (chat.createdBy != null) {
            profileIds.add(chat.createdBy!);
          }

          // Load participants for this chat, using cache when possible
          final participants = await getChatParticipants(chat.id);
          chat.participants = List<ChatParticipant>.from(participants);

          for (final participant in chat.participants) {
            if (participant.userName == null || participant.userName!.isEmpty) {
              profileIds.add(participant.userId);
            }
          }

          if (!chat.isGroup) {
            String? counterpartId;

            final counterpartFromParticipants = participants.firstWhere(
              (participant) => participant.userId != currentUser.id,
              orElse: () => ChatParticipant(
                chatId: chat.id,
                userId: currentUser.id,
                userName: null,
                joinedAt: DateTime.now(),
              ),
            );

            if (counterpartFromParticipants.userId != currentUser.id) {
              counterpartId = counterpartFromParticipants.userId;
              chat.otherParticipantName =
                  counterpartFromParticipants.userName ??
                  chat.otherParticipantName;
            }

            counterpartId ??= _parseOtherParticipantFromPairKey(
              chat.pairKey,
              currentUser.id,
            );

            counterpartId ??= await _findOtherParticipantFromMessages(
              chat.id,
              currentUser.id,
            );

            if (counterpartId != null) {
              chat.otherParticipantId = counterpartId;
              profileIds.add(counterpartId);

              var participant = _findParticipantById(
                chat.participants,
                counterpartId,
              );
              if (participant == null) {
                participant = ChatParticipant(
                  chatId: chat.id,
                  userId: counterpartId,
                  userName: chat.otherParticipantName,
                  joinedAt: DateTime.now(),
                );
                chat.participants.add(participant);
              } else if (participant.userName != null &&
                  participant.userName!.isNotEmpty) {
                chat.otherParticipantName ??= participant.userName;
              }

              chat.otherParticipantName ??= _findParticipantById(
                chat.participants,
                counterpartId,
              )?.userName;
            }
          }

          chats.add(chat);
        }
      }

      if (profileIds.isNotEmpty) {
        final resolvedNames = await _fetchProfileNames(profileIds);
        for (final chat in chats) {
          for (final participant in chat.participants) {
            final resolved = resolvedNames[participant.userId];
            if (resolved != null && resolved.isNotEmpty) {
              participant.userName = resolved;
            } else if (participant.userName == null ||
                participant.userName!.isEmpty) {
              final shortId = participant.userId.length > 8
                  ? participant.userId.substring(0, 8)
                  : participant.userId;
              participant.userName = 'User $shortId';
            }
          }

          if (chat.createdBy != null) {
            chat.createdByName =
                resolvedNames[chat.createdBy!] ?? chat.createdByName;
          }

          final counterpartId = chat.otherParticipantId;
          if (counterpartId != null) {
            final resolvedName = resolvedNames[counterpartId];
            if (resolvedName != null && resolvedName.isNotEmpty) {
              chat.otherParticipantName = resolvedName;
              final participant = _findParticipantById(
                chat.participants,
                counterpartId,
              );
              if (participant != null) {
                participant.userName = resolvedName;
              }
            } else if (chat.otherParticipantName == null ||
                chat.otherParticipantName!.isEmpty) {
              final shortId = counterpartId.length > 8
                  ? counterpartId.substring(0, 8)
                  : counterpartId;
              chat.otherParticipantName = 'User $shortId';
            }
          }
        }
      }

      await _cacheChats(chats);

      return chats;
    } catch (e) {
      // ignore: avoid_print
      print('Error getting user chats: $e');
      final cached = await getCachedUserChats();
      if (cached.isNotEmpty) {
        return cached;
      }
      return [];
    }
  }

  // Create a new private chat between two users
  Future<Chat?> createPrivateChat(
    String otherUserId, {
    String? chatName,
  }) async {
    final currentUser = _supabase.auth.currentUser;
    if (currentUser == null) return null;

    // Check if chat already exists
    final existingChat = await _findExistingPrivateChat(otherUserId);
    if (existingChat != null) return existingChat;

    try {
      // Create pair key (sorted user IDs)
      final userIds = [currentUser.id, otherUserId]..sort();
      final pairKey = '${userIds[0]}-${userIds[1]}';

      // Create chat
      final chatResponse = await _supabase
          .from('chats')
          .insert({
            'name': chatName ?? 'Private Chat',
            'type': 'private',
            'is_group': false,
            'created_by': currentUser.id,
            'pair_key': pairKey,
          })
          .select()
          .single();

      final chat = Chat.fromJson(chatResponse);

      // Add participants
      await _supabase.from('chat_participants').insert([
        {'chat_id': chat.id, 'user_id': currentUser.id},
        {'chat_id': chat.id, 'user_id': otherUserId},
      ]);

      // Load participants with user names
      final participants = await getChatParticipants(
        chat.id,
        forceRefresh: true,
      );
      chat.participants = List<ChatParticipant>.from(participants);

      chat.otherParticipantId = otherUserId;

      if (_findParticipantById(chat.participants, otherUserId) == null) {
        chat.participants.add(
          ChatParticipant(
            chatId: chat.id,
            userId: otherUserId,
            userName: null,
            joinedAt: DateTime.now(),
          ),
        );
      }

      final names = await _fetchProfileNames({
        if (chat.createdBy != null) chat.createdBy!,
        otherUserId,
      });

      if (chat.createdBy != null) {
        chat.createdByName = names[chat.createdBy!];
      }

      final counterpart = _findParticipantById(chat.participants, otherUserId);
      final resolvedOtherName = names[otherUserId];
      if (counterpart != null) {
        counterpart.userName = resolvedOtherName ?? counterpart.userName;
      }
      chat.otherParticipantName = resolvedOtherName ?? counterpart?.userName;
      if (chat.otherParticipantName == null ||
          chat.otherParticipantName!.isEmpty) {
        final shortId = otherUserId.length > 8
            ? otherUserId.substring(0, 8)
            : otherUserId;
        chat.otherParticipantName = 'User $shortId';
      }

      return chat;
    } catch (e) {
      print('Error creating private chat: $e');
      return null;
    }
  }

  // Find existing private chat between two users
  Future<Chat?> _findExistingPrivateChat(String otherUserId) async {
    final currentUser = _supabase.auth.currentUser;
    if (currentUser == null) return null;

    final userIds = [currentUser.id, otherUserId]..sort();
    final pairKey = '${userIds[0]}-${userIds[1]}';

    try {
      final response = await _supabase
          .from('chats')
          .select()
          .eq('pair_key', pairKey)
          .eq('type', 'private')
          .single();

      return Chat.fromJson(response);
    } catch (e) {
      // Chat doesn't exist
      return null;
    }
  }

  // Get messages for a chat
  Future<List<ChatMessage>> getChatMessages(
    String chatId, {
    int limit = 50,
  }) async {
    // Check connectivity
    final isOnline = await _isOnline();
    
    if (!isOnline) {
      debugPrint('[ChatService] Offline - loading cached messages');
      final cached = await getCachedMessages(chatId);
      final pending = await getPendingMessages(chatId);
      // Combine cached and pending, sort by date
      final all = [...cached, ...pending];
      all.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      return all;
    }
    
    try {
      final response = await _supabase
          .from('chat_messages')
          .select()
          .eq('chat_id', chatId)
          .order('created_at', ascending: true)
          .limit(limit);

      final messages = response.map((json) => ChatMessage.fromJson(json)).toList();
      
      // Cache messages for offline use
      await cacheMessages(chatId, messages);
      
      // Also include pending messages not yet synced
      final pending = await getPendingMessages(chatId);
      final all = [...messages, ...pending];
      all.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      
      return all;
    } catch (e) {
      debugPrint('[ChatService] Error getting messages, using cache: $e');
      final cached = await getCachedMessages(chatId);
      final pending = await getPendingMessages(chatId);
      final all = [...cached, ...pending];
      all.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      return all;
    }
  }

  // Send a message
  Future<ChatMessage?> sendMessage(
    String chatId,
    String content, {
    String contentType = 'text',
  }) async {
    final currentUser = _supabase.auth.currentUser;
    if (currentUser == null) return null;

    // Check connectivity - queue offline if no network
    final isOnline = await _isOnline();
    if (!isOnline) {
      debugPrint('[ChatService] Offline - queuing message for later sync');
      return _queueMessageOffline(chatId, content, contentType);
    }

    try {
      final response = await _supabase
          .from('chat_messages')
          .insert({
            'chat_id': chatId,
            'sender_id': currentUser.id,
            'content': content,
            'content_type': contentType,
            'status': 'sent',
          })
          .select()
          .single();

      return ChatMessage.fromJson(response);
    } catch (e) {
      debugPrint('[ChatService] Error sending message, queuing offline: $e');
      // Network error - queue for later
      return _queueMessageOffline(chatId, content, contentType);
    }
  }

  // Mark message as read
  Future<void> markMessageAsRead(String messageId) async {
    final currentUser = _supabase.auth.currentUser;
    if (currentUser == null) return;

    try {
      await _supabase.from('chat_message_reads').upsert({
        'message_id': messageId,
        'user_id': currentUser.id,
        'read_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      print('Error marking message as read: $e');
    }
  }

  // Get unread message count for a chat
  Future<int> getUnreadCount(String chatId) async {
    final currentUser = _supabase.auth.currentUser;
    if (currentUser == null) return 0;

    try {
      // Get total messages in chat
      final totalMessages = await _supabase
          .from('chat_messages')
          .select('id')
          .eq('chat_id', chatId)
          .neq('sender_id', currentUser.id); // Exclude own messages

      // Get read messages
      final readMessages = await _supabase
          .from('chat_message_reads')
          .select('message_id')
          .eq('user_id', currentUser.id);

      final readMessageIds = readMessages.map((r) => r['message_id']).toSet();

      return totalMessages
          .where((msg) => !readMessageIds.contains(msg['id']))
          .length;
    } catch (e) {
      print('Error getting unread count: $e');
      return 0;
    }
  }

  // Get all users (for user selection)
  Future<List<Map<String, dynamic>>> getAllUsers() async {
    try {
      final response = await _supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .neq('id', _supabase.auth.currentUser?.id ?? '');

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      print('Error getting users: $e');
      return [];
    }
  }

  // Get chat participants
  Future<List<ChatParticipant>> getChatParticipants(
    String chatId, {
    bool forceRefresh = false,
  }) async {
    if (!forceRefresh && _participantCache.containsKey(chatId)) {
      return _participantCache[chatId]!
          .map(
            (participant) => ChatParticipant(
              chatId: participant.chatId,
              userId: participant.userId,
              userName: participant.userName,
              joinedAt: participant.joinedAt,
            ),
          )
          .toList();
    }

    try {
      final response = await _supabase
          .from('chat_participants')
          .select('*, profiles(username, full_name, email)')
          .eq('chat_id', chatId);

      final participants = response.map((json) {
        final map = Map<String, dynamic>.from(json);
        final profile = map['profiles'];
        final profileMap = profile is Map
            ? Map<String, dynamic>.from(profile)
            : null;
        final username = (profileMap?['username'] as String?)?.trim();
        final fullName = (profileMap?['full_name'] as String?)?.trim();
        final email = (profileMap?['email'] as String?)?.trim();
        final userId = map['user_id'] as String;
        String? resolvedName;
        if (username != null && username.isNotEmpty) {
          resolvedName = username;
        } else if (fullName != null && fullName.isNotEmpty) {
          resolvedName = fullName;
        } else if (email != null && email.isNotEmpty) {
          resolvedName = email;
        }

        return ChatParticipant(
          chatId: map['chat_id'],
          userId: userId,
          userName: resolvedName,
          joinedAt: DateTime.parse(map['joined_at']),
        );
      }).toList();

      return _completeParticipantList(chatId, participants);
    } catch (e) {
      // ignore: avoid_print
      print('Join with profiles failed, trying separate queries: $e');
      try {
        final response = await _supabase
            .from('chat_participants')
            .select('*')
            .eq('chat_id', chatId);

        final participants = <ChatParticipant>[];

        for (final json in response) {
          final map = Map<String, dynamic>.from(json);
          participants.add(
            ChatParticipant(
              chatId: map['chat_id'],
              userId: map['user_id'],
              userName: null,
              joinedAt: DateTime.parse(map['joined_at']),
            ),
          );
        }

        return _completeParticipantList(chatId, participants);
      } catch (e) {
        // ignore: avoid_print
        print('Error getting chat participants: $e');
        if (_participantCache.containsKey(chatId)) {
          return _participantCache[chatId]!
              .map(
                (participant) => ChatParticipant(
                  chatId: participant.chatId,
                  userId: participant.userId,
                  userName: participant.userName,
                  joinedAt: participant.joinedAt,
                ),
              )
              .toList();
        }
        return [];
      }
    }
  }

  // Mark messages as read
  Future<void> markMessagesAsRead(String chatId) async {
    final currentUser = _supabase.auth.currentUser;
    if (currentUser == null) return;

    try {
      // Get unread messages for this chat
      final unreadMessages = await _supabase
          .from('chat_messages')
          .select('id')
          .eq('chat_id', chatId)
          .neq('sender_id', currentUser.id);

      if (unreadMessages.isNotEmpty) {
        final messageIds = unreadMessages.map((msg) => msg['id']).toList();

        // Mark as read (upsert to avoid duplicates)
        await _supabase
            .from('chat_message_reads')
            .upsert(
              messageIds
                  .map(
                    (messageId) => {
                      'message_id': messageId,
                      'user_id': currentUser.id,
                      'read_at': DateTime.now().toIso8601String(),
                    },
                  )
                  .toList(),
              onConflict: 'message_id,user_id',
            );
      }
    } catch (e) {
      print('Error marking messages as read: $e');
    }
  }

  // Delete a chat and all its messages
  Future<void> deleteChat(String chatId) async {
    try {
      // First, get all message IDs from this chat
      final messages = await _supabase
          .from('chat_messages')
          .select('id')
          .eq('chat_id', chatId);

      final messageIds = (messages as List)
          .map((msg) => msg['id'] as String)
          .toList();

      // Delete message reads if there are any messages
      if (messageIds.isNotEmpty) {
        for (final messageId in messageIds) {
          await _supabase
              .from('chat_message_reads')
              .delete()
              .eq('message_id', messageId);
        }
      }

      // Delete all messages in the chat
      await _supabase.from('chat_messages').delete().eq('chat_id', chatId);

      // Delete all participants
      await _supabase.from('chat_participants').delete().eq('chat_id', chatId);

      // Delete the chat itself
      await _supabase.from('chats').delete().eq('id', chatId);

      _participantCache.remove(chatId);
      await _removeChatFromCache(chatId);
    } catch (e) {
      print('Error deleting chat: $e');
      rethrow;
    }
  }

  // Delete a single message
  Future<void> deleteMessage(String messageId) async {
    try {
      // Delete message reads first
      await _supabase
          .from('chat_message_reads')
          .delete()
          .eq('message_id', messageId);

      // Delete the message
      await _supabase.from('chat_messages').delete().eq('id', messageId);
    } catch (e) {
      print('Error deleting message: $e');
      rethrow;
    }
  }

  /// Find or create a direct chat with another user
  /// Returns the Chat object if found or created successfully
  Future<Chat?> findOrCreateDirectChat(String targetUserId) async {
    final currentUserId = getCurrentUserId();
    if (currentUserId == null) {
      print('[ChatService] findOrCreateDirectChat: No current user ID');
      return null;
    }

    print('[ChatService] findOrCreateDirectChat: currentUser=$currentUserId, target=$targetUserId');

    try {
      // First, check if a direct chat already exists between these users
      // Build pair key for lookup (sorted UUIDs joined by underscore)
      final sortedIds = [currentUserId, targetUserId]..sort();
      final pairKey = sortedIds.join('_');
      print('[ChatService] Looking for chat with pair_key: $pairKey');

      // Check for existing chat with this pair key
      // Fallback: also check by participants if pair_key query fails
      List<dynamic> existingChats = [];
      
      try {
        existingChats = await _supabase
            .from('chats')
            .select('*')
            .eq('pair_key', pairKey)
            .eq('is_group', false)
            .limit(1);
      } catch (pairKeyError) {
        print('[ChatService] pair_key query failed, trying participant lookup: $pairKeyError');
        // Fallback: Find chat by looking at participants
        // This handles cases where pair_key column might not exist
        try {
          final myChats = await _supabase
              .from('chat_participants')
              .select('chat_id')
              .eq('user_id', currentUserId);
          
          if (myChats.isNotEmpty) {
            final chatIds = (myChats as List).map((c) => c['chat_id'] as String).toList();
            
            for (final chatId in chatIds) {
              final participants = await _supabase
                  .from('chat_participants')
                  .select('user_id')
                  .eq('chat_id', chatId);
              
              final participantIds = (participants as List).map((p) => p['user_id'] as String).toSet();
              if (participantIds.contains(targetUserId) && participantIds.length == 2) {
                // Found existing direct chat
                final chatData = await _supabase
                    .from('chats')
                    .select('*')
                    .eq('id', chatId)
                    .eq('is_group', false)
                    .maybeSingle();
                if (chatData != null) {
                  existingChats = [chatData];
                  break;
                }
              }
            }
          }
        } catch (fallbackError) {
          print('[ChatService] Fallback participant lookup also failed: $fallbackError');
        }
      }

      if (existingChats.isNotEmpty) {
        final chatData = Map<String, dynamic>.from(existingChats.first as Map);
        final chat = Chat.fromJson(chatData);
        
        // Load participants
        final participants = await getChatParticipants(chat.id);
        chat.participants = List.from(participants);
        
        // Set other participant info
        final otherParticipant = participants.firstWhere(
          (p) => p.userId != currentUserId,
          orElse: () => ChatParticipant(
            chatId: chat.id,
            userId: targetUserId,
            userName: null,
            joinedAt: DateTime.now(),
          ),
        );
        chat.otherParticipantId = otherParticipant.userId;
        chat.otherParticipantName = otherParticipant.userName;
        
        return chat;
      }

      // No existing chat found, create a new one
      print('[ChatService] No existing chat found, creating new one');
      final chatId = const Uuid().v4();
      final now = DateTime.now().toIso8601String();

      // Get target user's name
      String? targetUserName;
      try {
        final profileResponse = await _supabase
            .from('profiles')
            .select('full_name')
            .eq('id', targetUserId)
            .maybeSingle();
        
        if (profileResponse != null) {
          targetUserName = profileResponse['full_name'] as String?;
        }
      } catch (e) {
        print('[ChatService] Error fetching target user profile: $e');
      }

      // Create the chat - try with pair_key first, fallback without
      try {
        await _supabase.from('chats').insert({
          'id': chatId,
          'type': 'direct',  // REQUIRED: 'type' column cannot be null
          'is_group': false,
          'pair_key': pairKey,
          'created_by': currentUserId,
          'created_at': now,
          'updated_at': now,
        });
      } catch (insertError) {
        print('[ChatService] Insert with pair_key failed, trying without: $insertError');
        // Try without pair_key in case column doesn't exist
        await _supabase.from('chats').insert({
          'id': chatId,
          'type': 'direct',  // REQUIRED: 'type' column cannot be null
          'is_group': false,
          'created_by': currentUserId,
          'created_at': now,
          'updated_at': now,
        });
      }

      // Add both users as participants
      await _supabase.from('chat_participants').insert([
        {
          'chat_id': chatId,
          'user_id': currentUserId,
          'joined_at': now,
        },
        {
          'chat_id': chatId,
          'user_id': targetUserId,
          'joined_at': now,
        },
      ]);

      // Create and return the chat object
      final chat = Chat(
        id: chatId,
        isGroup: false,
        name: targetUserName ?? 'Direct Chat',
        type: 'private',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        createdBy: currentUserId,
        pairKey: pairKey,
      );

      chat.otherParticipantId = targetUserId;
      chat.otherParticipantName = targetUserName;

      return chat;
    } catch (e, stackTrace) {
      print('[ChatService] Error in findOrCreateDirectChat: $e');
      print('[ChatService] Stack trace: $stackTrace');
      rethrow; // Rethrow so the caller can show a more detailed error
    }
  }
}
