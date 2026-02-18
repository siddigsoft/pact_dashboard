import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SupportTicket {
  final String id;
  final String userId;
  final String subject;
  final String description;
  final String category;
  final String priority;
  final String status;
  final String? assignedTo;
  final List<TicketMessage> messages;
  final DateTime createdAt;
  final DateTime? resolvedAt;

  SupportTicket({
    required this.id,
    required this.userId,
    required this.subject,
    required this.description,
    required this.category,
    this.priority = 'normal',
    this.status = 'open',
    this.assignedTo,
    this.messages = const [],
    required this.createdAt,
    this.resolvedAt,
  });

  factory SupportTicket.fromJson(Map<String, dynamic> json) {
    return SupportTicket(
      id: json['id']?.toString() ?? '',
      userId: json['user_id']?.toString() ?? '',
      subject: json['subject']?.toString() ?? '',
      description: json['description']?.toString() ?? '',
      category: json['category']?.toString() ?? 'general',
      priority: json['priority']?.toString() ?? 'normal',
      status: json['status']?.toString() ?? 'open',
      assignedTo: json['assigned_to']?.toString(),
      messages: (json['ticket_messages'] ?? json['messages']) != null
          ? ((json['ticket_messages'] ?? json['messages']) as List)
                .map((m) => TicketMessage.fromJson(m))
                .toList()
          : [],
      createdAt:
          DateTime.tryParse(json['created_at']?.toString() ?? '') ??
          DateTime.now(),
      resolvedAt: json['resolved_at'] != null
          ? DateTime.tryParse(json['resolved_at'].toString())
          : null,
    );
  }
}

class TicketMessage {
  final String id;
  final String ticketId;
  final String senderId;
  final String senderName;
  final String content;
  final bool isStaffReply;
  final DateTime createdAt;

  TicketMessage({
    required this.id,
    required this.ticketId,
    required this.senderId,
    required this.senderName,
    required this.content,
    this.isStaffReply = false,
    required this.createdAt,
  });

  factory TicketMessage.fromJson(Map<String, dynamic> json) {
    return TicketMessage(
      id: json['id']?.toString() ?? '',
      ticketId: json['ticket_id']?.toString() ?? '',
      senderId: json['sender_id']?.toString() ?? '',
      senderName:
          json['sender_name']?.toString() ??
          json['profiles']?['full_name']?.toString() ??
          '',
      content: json['message']?.toString() ?? json['content']?.toString() ?? '',
      isStaffReply: json['is_admin'] as bool? ?? json['is_staff_reply'] as bool? ?? false,
      createdAt:
          DateTime.tryParse(json['created_at']?.toString() ?? '') ??
          DateTime.now(),
    );
  }
}

class HelpArticle {
  final String id;
  final String titleEn;
  final String titleAr;
  final String contentEn;
  final String contentAr;
  final String category;
  final List<String> tags;
  final int viewCount;
  final bool isFeatured;

  HelpArticle({
    required this.id,
    required this.titleEn,
    required this.titleAr,
    required this.contentEn,
    required this.contentAr,
    required this.category,
    this.tags = const [],
    this.viewCount = 0,
    this.isFeatured = false,
  });

  factory HelpArticle.fromJson(Map<String, dynamic> json) {
    return HelpArticle(
      id: json['id']?.toString() ?? '',
      titleEn: json['title_en']?.toString() ?? '',
      titleAr: json['title_ar']?.toString() ?? '',
      contentEn: json['content_en']?.toString() ?? '',
      contentAr: json['content_ar']?.toString() ?? '',
      category: json['category']?.toString() ?? '',
      tags: json['tags'] != null ? List<String>.from(json['tags']) : [],
      viewCount: json['view_count'] as int? ?? 0,
      isFeatured: json['is_featured'] as bool? ?? false,
    );
  }

  String getTitle(String locale) => locale == 'ar' ? titleAr : titleEn;
  String getContent(String locale) => locale == 'ar' ? contentAr : contentEn;
}

class ContextualHelpTip {
  final String screenName;
  final String titleEn;
  final String titleAr;
  final String contentEn;
  final String contentAr;
  final String? targetElement;
  final int order;

  ContextualHelpTip({
    required this.screenName,
    required this.titleEn,
    required this.titleAr,
    required this.contentEn,
    required this.contentAr,
    this.targetElement,
    this.order = 0,
  });

  factory ContextualHelpTip.fromJson(Map<String, dynamic> json) {
    return ContextualHelpTip(
      screenName: json['screen_name']?.toString() ?? '',
      titleEn: json['title_en']?.toString() ?? '',
      titleAr: json['title_ar']?.toString() ?? '',
      contentEn: json['content_en']?.toString() ?? '',
      contentAr: json['content_ar']?.toString() ?? '',
      targetElement: json['target_element']?.toString(),
      order: json['order'] as int? ?? 0,
    );
  }

  String getTitle(String locale) => locale == 'ar' ? titleAr : titleEn;
  String getContent(String locale) => locale == 'ar' ? contentAr : contentEn;
}

class HelpEnhancementsService {
  final SupabaseClient _supabase = Supabase.instance.client;
  static const String _offlineHelpBox = 'offline_help_articles';
  static const String _walkthroughProgressBox = 'walkthrough_progress';

  String? get _currentUserId => _supabase.auth.currentUser?.id;

  // ==================== SUPPORT TICKETS ====================

  Future<List<SupportTicket>> getMyTickets() async {
    try {
      final response = await _supabase
          .from('support_tickets')
          .select('*, ticket_messages(*)')
          .eq('user_id', _currentUserId ?? '')
          .order('created_at', ascending: false);

      return (response as List).map((t) => SupportTicket.fromJson(t)).toList();
    } catch (e) {
      debugPrint('[HelpEnhancements] Error getting tickets: $e');
      return [];
    }
  }

  Future<SupportTicket?> createTicket({
    required String subject,
    required String description,
    required String category,
    String priority = 'medium',
    String? screenshotUrl,
  }) async {
    try {
      final response = await _supabase
          .from('support_tickets')
          .insert({
            'user_id': _currentUserId,
            'subject': subject,
            'description': description,
            'category': category,
            'priority': priority,
            'status': 'open',
            'source': 'mobile',
          })
          .select()
          .single();

      return SupportTicket.fromJson(response);
    } catch (e) {
      debugPrint('[HelpEnhancements] Error creating ticket: $e');
      return null;
    }
  }

  Future<bool> addTicketMessage(String ticketId, String content) async {
    try {
      final userId = _currentUserId;
      if (userId == null) return false;
      final name = await _getCurrentUserDisplayName();
      await _supabase.from('ticket_messages').insert({
        'ticket_id': ticketId,
        'sender_id': userId,
        'sender_name': name,
        'message': content,
        'is_admin': false,
      });
      return true;
    } catch (e) {
      debugPrint('[HelpEnhancements] Error adding message: $e');
      return false;
    }
  }

  Future<String> _getCurrentUserDisplayName() async {
    try {
      final res = await _supabase
          .from('profiles')
          .select('full_name')
          .eq('id', _currentUserId ?? '')
          .maybeSingle();
      return (res?['full_name']?.toString() ?? '').trim().isEmpty
          ? 'User'
          : (res!['full_name'] as String).trim();
    } catch (_) {
      return 'User';
    }
  }

  Future<bool> closeTicket(String ticketId) async {
    try {
      await _supabase
          .from('support_tickets')
          .update({
            'status': 'closed',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', ticketId);
      return true;
    } catch (e) {
      debugPrint('[HelpEnhancements] Error closing ticket: $e');
      return false;
    }
  }

  Future<SupportTicket?> getTicketById(String ticketId) async {
    try {
      final response = await _supabase
          .from('support_tickets')
          .select('*, ticket_messages(*)')
          .eq('id', ticketId)
          .eq('user_id', _currentUserId ?? '')
          .maybeSingle();
      if (response == null) return null;
      return SupportTicket.fromJson(response);
    } catch (e) {
      debugPrint('[HelpEnhancements] Error getting ticket: $e');
      return null;
    }
  }

  Stream<List<TicketMessage>> subscribeToTicketMessages(String ticketId) {
    return _supabase
        .from('ticket_messages')
        .stream(primaryKey: ['id'])
        .eq('ticket_id', ticketId)
        .order('created_at', ascending: true)
        .map((data) => data.map((m) => TicketMessage.fromJson(m)).toList());
  }

  // ==================== KNOWLEDGE BASE SEARCH ====================

  Future<List<HelpArticle>> searchKnowledgeBase(String query) async {
    if (query.trim().isEmpty) return [];

    try {
      final response = await _supabase
          .from('help_articles')
          .select()
          .or(
            'title_en.ilike.%$query%,title_ar.ilike.%$query%,content_en.ilike.%$query%,content_ar.ilike.%$query%,tags.cs.{$query}',
          )
          .order('view_count', ascending: false)
          .limit(20);

      return (response as List).map((a) => HelpArticle.fromJson(a)).toList();
    } catch (e) {
      debugPrint('[HelpEnhancements] Error searching knowledge base: $e');
      return [];
    }
  }

  Future<List<HelpArticle>> getArticlesByCategory(String category) async {
    try {
      final response = await _supabase
          .from('help_articles')
          .select()
          .eq('category', category)
          .order('view_count', ascending: false);

      return (response as List).map((a) => HelpArticle.fromJson(a)).toList();
    } catch (e) {
      debugPrint('[HelpEnhancements] Error getting articles: $e');
      return [];
    }
  }

  Future<List<HelpArticle>> getFeaturedArticles() async {
    try {
      final response = await _supabase
          .from('help_articles')
          .select()
          .eq('is_featured', true)
          .order('view_count', ascending: false)
          .limit(10);

      return (response as List).map((a) => HelpArticle.fromJson(a)).toList();
    } catch (e) {
      debugPrint('[HelpEnhancements] Error getting featured articles: $e');
      return [];
    }
  }

  Future<void> trackArticleView(String articleId) async {
    try {
      await _supabase.rpc(
        'increment_article_view',
        params: {'article_id': articleId},
      );
    } catch (e) {
      debugPrint('[HelpEnhancements] Error tracking view: $e');
    }
  }

  // ==================== CONTEXTUAL HELP ====================

  Future<List<ContextualHelpTip>> getContextualHelp(String screenName) async {
    try {
      final response = await _supabase
          .from('contextual_help')
          .select()
          .eq('screen_name', screenName)
          .order('order', ascending: true);

      return (response as List)
          .map((h) => ContextualHelpTip.fromJson(h))
          .toList();
    } catch (e) {
      debugPrint('[HelpEnhancements] Error getting contextual help: $e');
      return [];
    }
  }

  // ==================== FEEDBACK SUBMISSION ====================

  Future<bool> submitFeedback({
    required String type, // 'bug', 'feature', 'general'
    required String message,
    String? screenshotUrl,
    Map<String, dynamic>? deviceInfo,
  }) async {
    try {
      await _supabase.from('user_feedback').insert({
        'user_id': _currentUserId,
        'type': type,
        'message': message,
        'screenshot_url': screenshotUrl,
        'device_info': deviceInfo,
        'app_version': '1.0.6+9',
      });
      return true;
    } catch (e) {
      debugPrint('[HelpEnhancements] Error submitting feedback: $e');
      return false;
    }
  }

  // ==================== GUIDED WALKTHROUGHS ====================

  Future<bool> hasCompletedWalkthrough(String walkthroughId) async {
    try {
      final box = await Hive.openBox(_walkthroughProgressBox);
      return box.get(walkthroughId, defaultValue: false) as bool;
    } catch (e) {
      return false;
    }
  }

  Future<void> markWalkthroughComplete(String walkthroughId) async {
    try {
      final box = await Hive.openBox(_walkthroughProgressBox);
      await box.put(walkthroughId, true);
    } catch (e) {
      debugPrint('[HelpEnhancements] Error marking walkthrough: $e');
    }
  }

  Future<void> resetWalkthroughs() async {
    try {
      final box = await Hive.openBox(_walkthroughProgressBox);
      await box.clear();
    } catch (e) {
      debugPrint('[HelpEnhancements] Error resetting walkthroughs: $e');
    }
  }

  // ==================== OFFLINE HELP ARTICLES ====================

  Future<void> cacheHelpArticles() async {
    try {
      final articles = await getFeaturedArticles();
      final box = await Hive.openBox(_offlineHelpBox);

      await box.put('cached_articles', {
        'updated_at': DateTime.now().toIso8601String(),
        'articles': articles
            .map(
              (a) => {
                'id': a.id,
                'title_en': a.titleEn,
                'title_ar': a.titleAr,
                'content_en': a.contentEn,
                'content_ar': a.contentAr,
                'category': a.category,
                'tags': a.tags,
              },
            )
            .toList(),
      });

      debugPrint('[HelpEnhancements] Cached ${articles.length} help articles');
    } catch (e) {
      debugPrint('[HelpEnhancements] Error caching articles: $e');
    }
  }

  Future<List<HelpArticle>> getCachedHelpArticles() async {
    try {
      final box = await Hive.openBox(_offlineHelpBox);
      final cached = box.get('cached_articles');
      if (cached == null) return [];

      final articles = cached['articles'] as List?;
      if (articles == null) return [];

      return articles
          .map((a) => HelpArticle.fromJson(Map<String, dynamic>.from(a)))
          .toList();
    } catch (e) {
      debugPrint('[HelpEnhancements] Error getting cached articles: $e');
      return [];
    }
  }

  // ==================== EMERGENCY SOS ====================

  Future<List<Map<String, dynamic>>> getEmergencyContacts() async {
    try {
      final response = await _supabase
          .from('support_contacts')
          .select()
          .eq('is_emergency', true)
          .eq('is_active', true)
          .order('sort_order', ascending: true);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[HelpEnhancements] Error getting emergency contacts: $e');
      return [];
    }
  }

  Future<void> logEmergencyContact(String contactId, String action) async {
    try {
      await _supabase.from('emergency_contact_logs').insert({
        'user_id': _currentUserId,
        'contact_id': contactId,
        'action': action,
      });
    } catch (e) {
      debugPrint('[HelpEnhancements] Error logging emergency contact: $e');
    }
  }

  // ==================== LIVE CHAT SUPPORT ====================

  Future<String?> startLiveChatSession() async {
    try {
      // Create a support chat
      final response = await _supabase
          .from('support_chats')
          .insert({'user_id': _currentUserId, 'status': 'waiting'})
          .select()
          .single();

      return response['id']?.toString();
    } catch (e) {
      debugPrint('[HelpEnhancements] Error starting live chat: $e');
      return null;
    }
  }

  Stream<List<Map<String, dynamic>>> subscribeToChatMessages(String chatId) {
    return _supabase
        .from('support_chat_messages')
        .stream(primaryKey: ['id'])
        .eq('chat_id', chatId)
        .order('created_at', ascending: true);
  }

  Future<bool> sendChatMessage(String chatId, String content) async {
    try {
      await _supabase.from('support_chat_messages').insert({
        'chat_id': chatId,
        'sender_id': _currentUserId,
        'content': content,
        'is_support_agent': false,
      });
      return true;
    } catch (e) {
      debugPrint('[HelpEnhancements] Error sending chat message: $e');
      return false;
    }
  }

  Future<void> endLiveChatSession(String chatId) async {
    try {
      await _supabase
          .from('support_chats')
          .update({
            'status': 'closed',
            'ended_at': DateTime.now().toIso8601String(),
          })
          .eq('id', chatId);
    } catch (e) {
      debugPrint('[HelpEnhancements] Error ending chat: $e');
    }
  }
}
