// lib/services/analytics_service.dart

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

enum AnalyticsEventType {
  appOpen,
  appClose,
  screenView,
  buttonClick,
  featureUsed,
  siteVisitStarted,
  siteVisitCompleted,
  photoTaken,
  formSubmitted,
  syncCompleted,
  error,
  searchPerformed,
  filterApplied,
}

class AnalyticsEvent {
  final String id;
  final AnalyticsEventType type;
  final String? screenName;
  final String? action;
  final Map<String, dynamic> properties;
  final DateTime timestamp;
  final String? userId;
  final bool isSynced;

  AnalyticsEvent({
    required this.id,
    required this.type,
    this.screenName,
    this.action,
    this.properties = const {},
    required this.timestamp,
    this.userId,
    this.isSynced = false,
  });

  factory AnalyticsEvent.fromJson(Map<String, dynamic> json) {
    return AnalyticsEvent(
      id: json['id'] ?? '',
      type: AnalyticsEventType.values[json['type'] ?? 0],
      screenName: json['screen_name'],
      action: json['action'],
      properties: Map<String, dynamic>.from(json['properties'] ?? {}),
      timestamp: DateTime.tryParse(json['timestamp'] ?? '') ?? DateTime.now(),
      userId: json['user_id'],
      isSynced: json['is_synced'] ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type.index,
    'screen_name': screenName,
    'action': action,
    'properties': properties,
    'timestamp': timestamp.toIso8601String(),
    'user_id': userId,
    'is_synced': isSynced,
  };

  AnalyticsEvent copyWith({bool? isSynced}) {
    return AnalyticsEvent(
      id: id,
      type: type,
      screenName: screenName,
      action: action,
      properties: properties,
      timestamp: timestamp,
      userId: userId,
      isSynced: isSynced ?? this.isSynced,
    );
  }
}

class UsageStats {
  final int totalSessions;
  final Duration totalUsageTime;
  final int siteVisitsCompleted;
  final int photosUploaded;
  final int formsSubmitted;
  final Map<String, int> screenViews;
  final Map<String, int> featureUsage;

  UsageStats({
    required this.totalSessions,
    required this.totalUsageTime,
    required this.siteVisitsCompleted,
    required this.photosUploaded,
    required this.formsSubmitted,
    required this.screenViews,
    required this.featureUsage,
  });

  factory UsageStats.empty() {
    return UsageStats(
      totalSessions: 0,
      totalUsageTime: Duration.zero,
      siteVisitsCompleted: 0,
      photosUploaded: 0,
      formsSubmitted: 0,
      screenViews: {},
      featureUsage: {},
    );
  }
}

class AnalyticsService {
  static final AnalyticsService _instance = AnalyticsService._internal();
  factory AnalyticsService() => _instance;
  AnalyticsService._internal();

  static const String _cacheBoxName = 'analytics_cache';
  static const String _eventsKey = 'events';
  static const String _statsKey = 'stats';
  static const int _maxCachedEvents = 500;

  final _supabase = Supabase.instance.client;
  
  List<AnalyticsEvent> _events = [];
  DateTime? _sessionStart;
  String? _currentScreen;
  bool _isEnabled = true;
  bool _isInitialized = false;

  bool get isEnabled => _isEnabled;

  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      if (!Hive.isBoxOpen(_cacheBoxName)) {
        await Hive.openBox(_cacheBoxName);
      }

      await _loadEvents();
      _sessionStart = DateTime.now();
      _isInitialized = true;

      await trackEvent(AnalyticsEventType.appOpen);
      debugPrint('[AnalyticsService] Initialized with ${_events.length} cached events');
    } catch (e) {
      debugPrint('[AnalyticsService] Error initializing: $e');
    }
  }

  Future<void> _loadEvents() async {
    try {
      final box = Hive.box(_cacheBoxName);
      final eventsJson = box.get(_eventsKey) as List?;
      
      if (eventsJson != null) {
        _events = eventsJson
            .map((json) => AnalyticsEvent.fromJson(Map<String, dynamic>.from(json)))
            .toList();
      }
    } catch (e) {
      debugPrint('[AnalyticsService] Error loading events: $e');
    }
  }

  Future<void> _saveEvents() async {
    try {
      final box = Hive.box(_cacheBoxName);
      
      if (_events.length > _maxCachedEvents) {
        _events = _events.sublist(_events.length - _maxCachedEvents);
      }
      
      final jsonList = _events.map((e) => e.toJson()).toList();
      await box.put(_eventsKey, jsonList);
    } catch (e) {
      debugPrint('[AnalyticsService] Error saving events: $e');
    }
  }

  void setEnabled(bool enabled) {
    _isEnabled = enabled;
    debugPrint('[AnalyticsService] Analytics ${enabled ? 'enabled' : 'disabled'}');
  }

  Future<void> trackEvent(
    AnalyticsEventType type, {
    String? screenName,
    String? action,
    Map<String, dynamic>? properties,
  }) async {
    if (!_isEnabled) return;

    try {
      final userId = _supabase.auth.currentUser?.id;
      
      final event = AnalyticsEvent(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        type: type,
        screenName: screenName ?? _currentScreen,
        action: action,
        properties: _sanitizeProperties(properties ?? {}),
        timestamp: DateTime.now(),
        userId: userId,
      );

      _events.add(event);
      await _saveEvents();

      debugPrint('[AnalyticsService] Event tracked: ${type.name}');
    } catch (e) {
      debugPrint('[AnalyticsService] Error tracking event: $e');
    }
  }

  Map<String, dynamic> _sanitizeProperties(Map<String, dynamic> properties) {
    final sanitized = <String, dynamic>{};
    
    for (final entry in properties.entries) {
      final key = entry.key;
      final value = entry.value;
      
      if (key.toLowerCase().contains('email') ||
          key.toLowerCase().contains('phone') ||
          key.toLowerCase().contains('password') ||
          key.toLowerCase().contains('token')) {
        continue;
      }

      if (value is String && value.length > 100) {
        sanitized[key] = '${value.substring(0, 100)}...';
      } else if (value is num || value is bool || value is String) {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  Future<void> trackScreenView(String screenName) async {
    _currentScreen = screenName;
    await trackEvent(
      AnalyticsEventType.screenView,
      screenName: screenName,
    );
  }

  Future<void> trackButtonClick(String buttonName, {String? screenName}) async {
    await trackEvent(
      AnalyticsEventType.buttonClick,
      action: buttonName,
      screenName: screenName,
    );
  }

  Future<void> trackFeatureUsed(String featureName, {Map<String, dynamic>? properties}) async {
    await trackEvent(
      AnalyticsEventType.featureUsed,
      action: featureName,
      properties: properties,
    );
  }

  Future<void> trackSiteVisitStarted(String siteId) async {
    await trackEvent(
      AnalyticsEventType.siteVisitStarted,
      properties: {'site_id': siteId},
    );
  }

  Future<void> trackSiteVisitCompleted(String siteId, {Duration? duration}) async {
    await trackEvent(
      AnalyticsEventType.siteVisitCompleted,
      properties: {
        'site_id': siteId,
        'duration_minutes': duration?.inMinutes,
      },
    );
  }

  Future<void> trackError(String errorMessage, {String? stackTrace}) async {
    await trackEvent(
      AnalyticsEventType.error,
      properties: {
        'error': errorMessage.substring(0, errorMessage.length.clamp(0, 200)),
      },
    );
  }

  Future<void> syncEvents() async {
    final unsyncedEvents = _events.where((e) => !e.isSynced).toList();
    
    if (unsyncedEvents.isEmpty) return;

    try {
      final batch = unsyncedEvents.take(100).toList();
      
      await _supabase.from('app_analytics').insert(
        batch.map((e) => {
          'event_type': e.type.name,
          'screen_name': e.screenName,
          'action': e.action,
          'properties': e.properties,
          'timestamp': e.timestamp.toIso8601String(),
          'user_id': e.userId,
        }).toList(),
      );

      for (final event in batch) {
        final index = _events.indexWhere((e) => e.id == event.id);
        if (index != -1) {
          _events[index] = event.copyWith(isSynced: true);
        }
      }

      _events.removeWhere((e) => e.isSynced);
      await _saveEvents();

      debugPrint('[AnalyticsService] Synced ${batch.length} events');
    } catch (e) {
      debugPrint('[AnalyticsService] Error syncing events: $e');
    }
  }

  UsageStats getLocalStats() {
    int sessions = 0;
    int siteVisits = 0;
    int photos = 0;
    int forms = 0;
    final screenViews = <String, int>{};
    final features = <String, int>{};

    for (final event in _events) {
      switch (event.type) {
        case AnalyticsEventType.appOpen:
          sessions++;
          break;
        case AnalyticsEventType.siteVisitCompleted:
          siteVisits++;
          break;
        case AnalyticsEventType.photoTaken:
          photos++;
          break;
        case AnalyticsEventType.formSubmitted:
          forms++;
          break;
        case AnalyticsEventType.screenView:
          if (event.screenName != null) {
            screenViews[event.screenName!] = (screenViews[event.screenName!] ?? 0) + 1;
          }
          break;
        case AnalyticsEventType.featureUsed:
          if (event.action != null) {
            features[event.action!] = (features[event.action!] ?? 0) + 1;
          }
          break;
        default:
          break;
      }
    }

    return UsageStats(
      totalSessions: sessions,
      totalUsageTime: _sessionStart != null 
          ? DateTime.now().difference(_sessionStart!)
          : Duration.zero,
      siteVisitsCompleted: siteVisits,
      photosUploaded: photos,
      formsSubmitted: forms,
      screenViews: screenViews,
      featureUsage: features,
    );
  }

  Future<void> endSession() async {
    if (_sessionStart != null) {
      final duration = DateTime.now().difference(_sessionStart!);
      await trackEvent(
        AnalyticsEventType.appClose,
        properties: {'session_duration_seconds': duration.inSeconds},
      );
    }
    await syncEvents();
  }

  int get pendingEventsCount => _events.where((e) => !e.isSynced).length;

  void dispose() {}
}
