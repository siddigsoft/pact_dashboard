import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart' show debugPrint;

/// Social networking and friend management
class SocialNetworkService {
  static final SocialNetworkService _instance =
      SocialNetworkService._internal();

  factory SocialNetworkService() {
    return _instance;
  }

  SocialNetworkService._internal();

  final _supabase = Supabase.instance.client;

  /// Search for users by name or email
  Future<List<Map<String, dynamic>>> searchUsers(String query) async {
    try {
      final results = await _supabase
          .from('profiles')
          .select('id, name, email, avatar_url')
          .or('name.ilike.%$query%,email.ilike.%$query%')
          .limit(10);

      return results.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[SocialNetwork] Error searching users: $e');
      return [];
    }
  }

  /// Send friend request
  Future<bool> sendFriendRequest(String userId, String targetUserId) async {
    try {
      // Check if already connected
      final existing = await _supabase
          .from('user_connections')
          .select()
          .or(
            'user_id.eq.$userId.and.connected_user_id.eq.$targetUserId,user_id.eq.$targetUserId.and.connected_user_id.eq.$userId',
          );

      if (existing.isNotEmpty) {
        debugPrint('[SocialNetwork] Already connected');
        return false;
      }

      await _supabase.from('user_requests').insert({
        'from_user_id': userId,
        'to_user_id': targetUserId,
        'status': 'pending',
        'created_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[SocialNetwork] Friend request sent');
      return true;
    } catch (e) {
      debugPrint('[SocialNetwork] Error sending friend request: $e');
      return false;
    }
  }

  /// Accept friend request
  Future<bool> acceptFriendRequest(String requestId, String userId) async {
    try {
      // Get request details
      final request = await _supabase
          .from('user_requests')
          .select()
          .eq('id', requestId)
          .single();

      // Create connection
      await _supabase.from('user_connections').insert({
        'user_id': userId,
        'connected_user_id': (request['from_user_id'] as String?),
        'status': 'active',
        'connected_at': DateTime.now().toIso8601String(),
      });

      // Update request
      await _supabase
          .from('user_requests')
          .update({'status': 'accepted'})
          .eq('id', requestId);

      debugPrint('[SocialNetwork] Friend request accepted');
      return true;
    } catch (e) {
      debugPrint('[SocialNetwork] Error accepting request: $e');
      return false;
    }
  }

  /// Reject friend request
  Future<bool> rejectFriendRequest(String requestId) async {
    try {
      await _supabase
          .from('user_requests')
          .update({'status': 'rejected'})
          .eq('id', requestId);

      return true;
    } catch (e) {
      debugPrint('[SocialNetwork] Error rejecting request: $e');
      return false;
    }
  }

  /// Get pending friend requests
  Future<List<Map<String, dynamic>>> getPendingRequests(String userId) async {
    try {
      final requests = await _supabase
          .from('user_requests')
          .select('*, profiles(id, name, email, avatar_url)')
          .eq('to_user_id', userId)
          .eq('status', 'pending')
          .order('created_at', ascending: false);

      return requests.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[SocialNetwork] Error getting pending requests: $e');
      return [];
    }
  }

  /// Get user connections (friends)
  Future<List<Map<String, dynamic>>> getUserConnections(String userId) async {
    try {
      final connections = await _supabase
          .from('user_connections')
          .select('*, profiles:connected_user_id(id, name, email, avatar_url)')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('connected_at', ascending: false);

      return connections.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[SocialNetwork] Error getting connections: $e');
      return [];
    }
  }

  /// Remove connection (unfriend)
  Future<bool> removeConnection(String userId, String connectedUserId) async {
    try {
      await _supabase
          .from('user_connections')
          .delete()
          .or(
            'user_id.eq.$userId.and.connected_user_id.eq.$connectedUserId,user_id.eq.$connectedUserId.and.connected_user_id.eq.$userId',
          );

      return true;
    } catch (e) {
      debugPrint('[SocialNetwork] Error removing connection: $e');
      return false;
    }
  }

  /// Get user stats for profile
  Future<Map<String, dynamic>> getUserStats(String userId) async {
    try {
      // Get transaction count
      final txCount = await _supabase
          .from('wallet_transactions')
          .select()
          .eq('user_id', userId)
          .count(CountOption.exact);

      // Get total earned
      final earned = await _supabase
          .from('wallet_transactions')
          .select()
          .eq('user_id', userId)
          .eq('type', 'earning');

      final totalEarned = earned.fold<double>(
        0,
        (sum, tx) => sum + ((tx['amount'] as num?)?.toDouble() ?? 0),
      );

      // Get connections count
      const connectionsKey = 'count';
      final connections = await _supabase
          .from('user_connections')
          .select()
          .eq('user_id', userId)
          .eq('status', 'active')
          .count(CountOption.exact);

      return {
        'transaction_count': txCount.count,
        'total_earned': totalEarned,
        'relationships': connections.count,
        'member_since': DateTime.now().subtract(Duration(days: 365)),
      };
    } catch (e) {
      debugPrint('[SocialNetwork] Error getting user stats: $e');
      return {
        'transaction_count': 0,
        'total_earned': 0,
        'relationships': 0,
        'member_since': DateTime.now(),
      };
    }
  }

  /// Get activity feed
  Future<List<Map<String, dynamic>>> getActivityFeed(
    String userId, {
    int limit = 20,
  }) async {
    try {
      // Get friend activity
      final connections = await _supabase
          .from('user_connections')
          .select('connected_user_id')
          .eq('user_id', userId)
          .eq('status', 'active');

      final friendIds = (connections as List)
          .map((c) => c['connected_user_id'] as String)
          .toList();

      if (friendIds.isEmpty) return [];

      final activities = <Map<String, dynamic>>[];

      for (final friendId in friendIds) {
        final friendActivity = await _supabase
            .from('wallet_transactions')
            .select()
            .eq('user_id', friendId)
            .order('created_at', ascending: false)
            .limit(5);

        activities.addAll(friendActivity.cast<Map<String, dynamic>>());
      }

      // Sort by date
      activities.sort((a, b) {
        final dateA = DateTime.parse(a['created_at'] as String);
        final dateB = DateTime.parse(b['created_at'] as String);
        return dateB.compareTo(dateA);
      });

      return activities.take(limit).toList();
    } catch (e) {
      debugPrint('[SocialNetwork] Error getting activity feed: $e');
      return [];
    }
  }

  /// Share achievement
  Future<bool> shareAchievement(
    String userId,
    String title,
    String description,
  ) async {
    try {
      await _supabase.from('user_achievements').insert({
        'user_id': userId,
        'title': title,
        'description': description,
        'shared': true,
        'created_at': DateTime.now().toIso8601String(),
      });

      return true;
    } catch (e) {
      debugPrint('[SocialNetwork] Error sharing achievement: $e');
      return false;
    }
  }

  /// Get user achievements
  Future<List<Map<String, dynamic>>> getUserAchievements(String userId) async {
    try {
      final achievements = await _supabase
          .from('user_achievements')
          .select()
          .eq('user_id', userId)
          .eq('shared', true)
          .order('created_at', ascending: false);

      return achievements.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[SocialNetwork] Error getting achievements: $e');
      return [];
    }
  }
}

extension CountOptionExt on CountOption {
  static const CountOption exact = CountOption.exact;
}

enum CountOption { exact, planned, estimated }
