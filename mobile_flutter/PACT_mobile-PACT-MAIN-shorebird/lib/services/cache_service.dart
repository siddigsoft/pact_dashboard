import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Cache service for budget-related data to reduce API calls
class BudgetCacheService {
  static const String _budgetKey = 'cached_budget_data';
  static const String _lastFetchKey = 'budget_last_fetch';
  static const Duration _cacheDuration = Duration(hours: 1); // Cache for 1 hour

  static Future<void> cacheBudgetData(String siteVisitId, Map<String, dynamic> budgetData) async {
    final prefs = await SharedPreferences.getInstance();
    final cacheKey = '${_budgetKey}_$siteVisitId';

    final cacheEntry = {
      'data': budgetData,
      'timestamp': DateTime.now().toIso8601String(),
    };

    await prefs.setString(cacheKey, jsonEncode(cacheEntry));
  }

  static Future<Map<String, dynamic>?> getCachedBudgetData(String siteVisitId) async {
    final prefs = await SharedPreferences.getInstance();
    final cacheKey = '${_budgetKey}_$siteVisitId';

    final cachedString = prefs.getString(cacheKey);
    if (cachedString == null) return null;

    try {
      final cacheEntry = jsonDecode(cachedString) as Map<String, dynamic>;
      final timestamp = DateTime.parse(cacheEntry['timestamp'] as String);

      // Check if cache is still valid
      if (DateTime.now().difference(timestamp) < _cacheDuration) {
        return cacheEntry['data'] as Map<String, dynamic>;
      } else {
        // Cache expired, remove it
        await prefs.remove(cacheKey);
        return null;
      }
    } catch (e) {
      // Invalid cache format, remove it
      await prefs.remove(cacheKey);
      return null;
    }
  }

  static Future<void> clearBudgetCache() async {
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys().where((key) => key.startsWith(_budgetKey)).toList();
    for (final key in keys) {
      await prefs.remove(key);
    }
  }

  static Future<void> clearExpiredCache() async {
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys().where((key) => key.startsWith(_budgetKey)).toList();

    for (final key in keys) {
      final cachedString = prefs.getString(key);
      if (cachedString != null) {
        try {
          final cacheEntry = jsonDecode(cachedString) as Map<String, dynamic>;
          final timestamp = DateTime.parse(cacheEntry['timestamp'] as String);

          if (DateTime.now().difference(timestamp) >= _cacheDuration) {
            await prefs.remove(key);
          }
        } catch (e) {
          await prefs.remove(key);
        }
      }
    }
  }
}

/// Cache service for cost submissions to support offline functionality
class SubmissionCacheService {
  static const String _submissionsKey = 'cached_submissions';
  static const String _pendingUploadsKey = 'pending_uploads';

  static Future<void> cacheSubmissionForOffline(Map<String, dynamic> submissionData) async {
    final prefs = await SharedPreferences.getInstance();
    final cached = await getCachedSubmissions();

    cached.add({
      ...submissionData,
      'cached_at': DateTime.now().toIso8601String(),
      'id': 'offline_${DateTime.now().millisecondsSinceEpoch}',
    });

    await prefs.setString(_submissionsKey, jsonEncode(cached));
  }

  static Future<List<Map<String, dynamic>>> getCachedSubmissions() async {
    final prefs = await SharedPreferences.getInstance();
    final cachedString = prefs.getString(_submissionsKey);

    if (cachedString == null) return [];

    try {
      final cached = jsonDecode(cachedString) as List<dynamic>;
      return cached.map((item) => item as Map<String, dynamic>).toList();
    } catch (e) {
      return [];
    }
  }

  static Future<void> removeCachedSubmission(String submissionId) async {
    final prefs = await SharedPreferences.getInstance();
    final cached = await getCachedSubmissions();

    cached.removeWhere((submission) => submission['id'] == submissionId);
    await prefs.setString(_submissionsKey, jsonEncode(cached));
  }

  static Future<void> clearAllCachedSubmissions() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_submissionsKey);
  }

  static Future<bool> hasOfflineSubmissions() async {
    final cached = await getCachedSubmissions();
    return cached.isNotEmpty;
  }
}