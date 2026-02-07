import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/support_ticket.dart';

/// Service for managing support tickets in the mobile app.
/// Handles CRUD operations, messaging, and real-time subscriptions.
class SupportTicketService {
  final SupabaseClient _supabase;

  SupportTicketService({SupabaseClient? supabase})
      : _supabase = supabase ?? Supabase.instance.client;

  String get _currentUserId => _supabase.auth.currentUser?.id ?? '';
  String get _currentUserName =>
      _supabase.auth.currentUser?.userMetadata?['full_name'] as String? ??
      _supabase.auth.currentUser?.email ??
      'Unknown';

  /// Fetch all tickets for the current user
  Future<List<SupportTicket>> getMyTickets() async {
    final response = await _supabase
        .from('support_tickets')
        .select()
        .eq('user_id', _currentUserId)
        .order('created_at', ascending: false);

    return (response as List)
        .map((json) => SupportTicket.fromJson(json))
        .toList();
  }

  /// Fetch a single ticket by ID
  Future<SupportTicket?> getTicket(String ticketId) async {
    final response = await _supabase
        .from('support_tickets')
        .select()
        .eq('id', ticketId)
        .maybeSingle();

    if (response == null) return null;
    return SupportTicket.fromJson(response);
  }

  /// Create a new support ticket
  Future<SupportTicket> createTicket({
    required String subject,
    required String description,
    String category = 'general',
    String priority = 'medium',
  }) async {
    final data = {
      'user_id': _currentUserId,
      'subject': subject,
      'description': description,
      'category': category,
      'priority': priority,
      'status': 'open',
      'source': 'mobile',
    };

    final response = await _supabase
        .from('support_tickets')
        .insert(data)
        .select()
        .single();

    final ticket = SupportTicket.fromJson(response);

    // Also insert the description as the first message
    if (description.isNotEmpty) {
      await _supabase.from('ticket_messages').insert({
        'ticket_id': ticket.id,
        'sender_id': _currentUserId,
        'sender_name': _currentUserName,
        'message': description,
        'is_admin': false,
      });
    }

    return ticket;
  }

  /// Send a message on a ticket
  Future<TicketMessage> sendMessage({
    required String ticketId,
    required String message,
  }) async {
    final data = {
      'ticket_id': ticketId,
      'sender_id': _currentUserId,
      'sender_name': _currentUserName,
      'message': message,
      'is_admin': false,
    };

    final response = await _supabase
        .from('ticket_messages')
        .insert(data)
        .select()
        .single();

    // Update ticket's updated_at timestamp
    await _supabase.from('support_tickets').update({
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('id', ticketId);

    return TicketMessage.fromJson(response);
  }

  /// Fetch all messages for a ticket
  Future<List<TicketMessage>> getMessages(String ticketId) async {
    final response = await _supabase
        .from('ticket_messages')
        .select()
        .eq('ticket_id', ticketId)
        .order('created_at', ascending: true);

    return (response as List)
        .map((json) => TicketMessage.fromJson(json))
        .toList();
  }

  /// Subscribe to real-time ticket updates
  StreamSubscription<List<Map<String, dynamic>>> subscribeToTickets(
    void Function(List<SupportTicket>) onUpdate,
  ) {
    return _supabase
        .from('support_tickets')
        .stream(primaryKey: ['id'])
        .eq('user_id', _currentUserId)
        .order('created_at', ascending: false)
        .listen((data) {
      final tickets = data.map((json) => SupportTicket.fromJson(json)).toList();
      onUpdate(tickets);
    });
  }

  /// Subscribe to real-time messages for a ticket
  StreamSubscription<List<Map<String, dynamic>>> subscribeToMessages(
    String ticketId,
    void Function(List<TicketMessage>) onUpdate,
  ) {
    return _supabase
        .from('ticket_messages')
        .stream(primaryKey: ['id'])
        .eq('ticket_id', ticketId)
        .order('created_at', ascending: true)
        .listen((data) {
      final messages =
          data.map((json) => TicketMessage.fromJson(json)).toList();
      onUpdate(messages);
    });
  }

  /// Close a ticket (user can close their own open tickets)
  Future<void> closeTicket(String ticketId) async {
    await _supabase.from('support_tickets').update({
      'status': 'closed',
      'resolved_at': DateTime.now().toIso8601String(),
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('id', ticketId);
  }

  /// Get count of unread/open tickets
  Future<int> getOpenTicketCount() async {
    final response = await _supabase
        .from('support_tickets')
        .select('id')
        .eq('user_id', _currentUserId)
        .inFilter('status', ['open', 'in_progress', 'waiting']);

    return (response as List).length;
  }

  /// Available categories for ticket creation
  static const List<Map<String, String>> categories = [
    {'value': 'general', 'label': 'General'},
    {'value': 'technical', 'label': 'Technical Issue'},
    {'value': 'login', 'label': 'Login / Access'},
    {'value': 'sync', 'label': 'Data Sync'},
    {'value': 'gps', 'label': 'GPS / Location'},
    {'value': 'offline', 'label': 'Offline Mode'},
    {'value': 'payment', 'label': 'Payment / Wallet'},
    {'value': 'site_visit', 'label': 'Site Visit'},
    {'value': 'mmp', 'label': 'MMP / Planning'},
    {'value': 'feature_request', 'label': 'Feature Request'},
    {'value': 'other', 'label': 'Other'},
  ];
}
