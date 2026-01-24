// lib/services/remote_changelog_service.dart

import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shorebird_code_push/shorebird_code_push.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ChangelogEntry {
  final String id;
  final String version;
  final String buildNumber;
  final int? patchNumber;
  final DateTime releaseDate;
  final List<String> featuresEn;
  final List<String> featuresAr;
  final List<String> fixesEn;
  final List<String> fixesAr;
  final List<String> improvementsEn;
  final List<String> improvementsAr;
  final List<String>? breakingChangesEn;
  final List<String>? breakingChangesAr;
  final bool isActive;

  ChangelogEntry({
    required this.id,
    required this.version,
    required this.buildNumber,
    this.patchNumber,
    required this.releaseDate,
    this.featuresEn = const [],
    this.featuresAr = const [],
    this.fixesEn = const [],
    this.fixesAr = const [],
    this.improvementsEn = const [],
    this.improvementsAr = const [],
    this.breakingChangesEn,
    this.breakingChangesAr,
    this.isActive = true,
  });

  String get fullVersion {
    if (patchNumber != null) {
      return '$version (Build $buildNumber, Patch $patchNumber)';
    }
    return '$version (Build $buildNumber)';
  }

  List<String> getFeatures(String locale) => locale == 'ar' ? featuresAr : featuresEn;
  List<String> getFixes(String locale) => locale == 'ar' ? fixesAr : fixesEn;
  List<String> getImprovements(String locale) => locale == 'ar' ? improvementsAr : improvementsEn;
  List<String>? getBreakingChanges(String locale) => locale == 'ar' ? breakingChangesAr : breakingChangesEn;

  bool get hasChanges => featuresEn.isNotEmpty || fixesEn.isNotEmpty || improvementsEn.isNotEmpty;
  bool get hasBreakingChanges => (breakingChangesEn?.isNotEmpty ?? false);

  factory ChangelogEntry.fromJson(Map<String, dynamic> json) {
    return ChangelogEntry(
      id: json['id']?.toString() ?? '',
      version: json['version'] ?? '',
      buildNumber: json['build_number']?.toString() ?? '',
      patchNumber: json['patch_number'] as int?,
      releaseDate: DateTime.tryParse(json['release_date'] ?? '') ?? DateTime.now(),
      featuresEn: List<String>.from(json['features_en'] ?? []),
      featuresAr: List<String>.from(json['features_ar'] ?? []),
      fixesEn: List<String>.from(json['fixes_en'] ?? []),
      fixesAr: List<String>.from(json['fixes_ar'] ?? []),
      improvementsEn: List<String>.from(json['improvements_en'] ?? []),
      improvementsAr: List<String>.from(json['improvements_ar'] ?? []),
      breakingChangesEn: json['breaking_changes_en'] != null 
          ? List<String>.from(json['breaking_changes_en']) 
          : null,
      breakingChangesAr: json['breaking_changes_ar'] != null 
          ? List<String>.from(json['breaking_changes_ar']) 
          : null,
      isActive: json['is_active'] ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'version': version,
    'build_number': buildNumber,
    'patch_number': patchNumber,
    'release_date': releaseDate.toIso8601String(),
    'features_en': featuresEn,
    'features_ar': featuresAr,
    'fixes_en': fixesEn,
    'fixes_ar': fixesAr,
    'improvements_en': improvementsEn,
    'improvements_ar': improvementsAr,
    'breaking_changes_en': breakingChangesEn,
    'breaking_changes_ar': breakingChangesAr,
    'is_active': isActive,
  };
}

class RemoteChangelogService {
  static final RemoteChangelogService _instance = RemoteChangelogService._internal();
  factory RemoteChangelogService() => _instance;
  RemoteChangelogService._internal();

  static const String _cacheBoxName = 'changelog_cache';
  static const String _lastSeenVersionKey = 'last_seen_version';
  static const String _cachedChangelogsKey = 'cached_changelogs';

  final _supabase = Supabase.instance.client;
  
  String _currentVersion = '';
  String _currentBuildNumber = '';
  int? _currentPatchNumber;
  List<ChangelogEntry> _changelogs = [];
  bool _isInitialized = false;

  Future<void> initialize() async {
    if (_isInitialized) return;
    
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      _currentVersion = packageInfo.version;
      _currentBuildNumber = packageInfo.buildNumber;

      try {
        final codePush = ShorebirdCodePush();
        final isAvailable = await codePush.isShorebirdAvailable();
        if (isAvailable) {
          _currentPatchNumber = await codePush.currentPatchNumber();
        }
      } catch (e) {
        debugPrint('[RemoteChangelogService] Error getting patch number: $e');
      }

      await _fetchChangelogs();
      _isInitialized = true;
      debugPrint('[RemoteChangelogService] Initialized: v$_currentVersion build $_currentBuildNumber patch $_currentPatchNumber');
    } catch (e) {
      debugPrint('[RemoteChangelogService] Error initializing: $e');
      await _loadCachedChangelogs();
    }
  }

  Future<void> _fetchChangelogs() async {
    try {
      final response = await _supabase
          .from('app_changelogs')
          .select()
          .eq('is_active', true)
          .order('release_date', ascending: false)
          .limit(10);

      _changelogs = (response as List)
          .map((json) => ChangelogEntry.fromJson(json))
          .toList();

      await _cacheChangelogs();
      debugPrint('[RemoteChangelogService] Fetched ${_changelogs.length} changelogs from server');
    } catch (e) {
      debugPrint('[RemoteChangelogService] Error fetching changelogs: $e');
      await _loadCachedChangelogs();
    }
  }

  Future<void> _cacheChangelogs() async {
    try {
      if (!Hive.isBoxOpen(_cacheBoxName)) {
        await Hive.openBox(_cacheBoxName);
      }
      final box = Hive.box(_cacheBoxName);
      final jsonList = _changelogs.map((c) => c.toJson()).toList();
      await box.put(_cachedChangelogsKey, jsonList);
    } catch (e) {
      debugPrint('[RemoteChangelogService] Error caching changelogs: $e');
    }
  }

  Future<void> _loadCachedChangelogs() async {
    try {
      if (!Hive.isBoxOpen(_cacheBoxName)) {
        await Hive.openBox(_cacheBoxName);
      }
      final box = Hive.box(_cacheBoxName);
      final cached = box.get(_cachedChangelogsKey);
      
      if (cached != null) {
        _changelogs = (cached as List)
            .map((json) => ChangelogEntry.fromJson(Map<String, dynamic>.from(json)))
            .toList();
        debugPrint('[RemoteChangelogService] Loaded ${_changelogs.length} cached changelogs');
      } else {
        _changelogs = _getFallbackChangelogs();
      }
    } catch (e) {
      debugPrint('[RemoteChangelogService] Error loading cached changelogs: $e');
      _changelogs = _getFallbackChangelogs();
    }
  }

  String get currentVersionString {
    if (_currentPatchNumber != null) {
      return '$_currentVersion.$_currentBuildNumber.$_currentPatchNumber';
    }
    return '$_currentVersion.$_currentBuildNumber';
  }

  String get displayVersion {
    if (_currentPatchNumber != null) {
      return 'v$_currentVersion (Build $_currentBuildNumber, Patch $_currentPatchNumber)';
    }
    return 'v$_currentVersion (Build $_currentBuildNumber)';
  }

  Future<bool> hasNewVersion() async {
    try {
      if (!Hive.isBoxOpen(_cacheBoxName)) {
        await Hive.openBox(_cacheBoxName);
      }
      final box = Hive.box(_cacheBoxName);
      final lastSeen = box.get(_lastSeenVersionKey) as String?;
      
      if (lastSeen == null) {
        debugPrint('[RemoteChangelogService] No previous version seen - showing dialog');
        return true;
      }
      
      final isNew = lastSeen != currentVersionString;
      debugPrint('[RemoteChangelogService] Last seen: $lastSeen, Current: $currentVersionString, isNew: $isNew');
      return isNew;
    } catch (e) {
      debugPrint('[RemoteChangelogService] Error checking new version: $e');
      return true;
    }
  }

  Future<void> markVersionAsSeen() async {
    try {
      if (!Hive.isBoxOpen(_cacheBoxName)) {
        await Hive.openBox(_cacheBoxName);
      }
      final box = Hive.box(_cacheBoxName);
      await box.put(_lastSeenVersionKey, currentVersionString);
      debugPrint('[RemoteChangelogService] Marked version as seen: $currentVersionString');
    } catch (e) {
      debugPrint('[RemoteChangelogService] Error marking version as seen: $e');
    }
  }

  ChangelogEntry? getCurrentChangelog() {
    if (_changelogs.isEmpty) return null;
    
    final current = _changelogs.firstWhere(
      (c) => c.version == _currentVersion && 
             c.buildNumber == _currentBuildNumber &&
             c.patchNumber == _currentPatchNumber,
      orElse: () => _changelogs.first,
    );
    return current;
  }

  List<ChangelogEntry> getAllChangelogs() => _changelogs;

  Future<void> refresh() async {
    _isInitialized = false;
    await initialize();
  }

  List<ChangelogEntry> _getFallbackChangelogs() {
    return [
      ChangelogEntry(
        id: 'fallback-1',
        version: _currentVersion.isNotEmpty ? _currentVersion : '1.0.5',
        buildNumber: _currentBuildNumber.isNotEmpty ? _currentBuildNumber : '8',
        patchNumber: _currentPatchNumber,
        releaseDate: DateTime.now(),
        featuresEn: [
          'Complete offline functionality for site visits',
          'GPS location capture while offline',
          'Bulk permit upload for states and localities',
          'Smart Dispatch system for optimal site assignment',
        ],
        featuresAr: [
          'وظائف كاملة بدون اتصال لزيارات الموقع',
          'التقاط موقع GPS بدون اتصال',
          'تحميل تصاريح مجمعة للولايات والمحليات',
          'نظام الإرسال الذكي للتعيين الأمثل للمواقع',
        ],
        fixesEn: [
          'Fixed TextDirection errors for Arabic language',
          'Fixed WebRTC call initiation',
          'Improved sync reliability',
        ],
        fixesAr: [
          'إصلاح أخطاء اتجاه النص للغة العربية',
          'إصلاح بدء مكالمات WebRTC',
          'تحسين موثوقية المزامنة',
        ],
        improvementsEn: [
          'Better battery usage during GPS tracking',
          'Faster app startup time',
        ],
        improvementsAr: [
          'استخدام أفضل للبطارية أثناء تتبع GPS',
          'وقت بدء تشغيل أسرع للتطبيق',
        ],
      ),
    ];
  }
}
