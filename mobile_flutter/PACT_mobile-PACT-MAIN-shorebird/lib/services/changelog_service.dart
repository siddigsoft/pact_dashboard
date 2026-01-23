// lib/services/changelog_service.dart

import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shorebird_code_push/shorebird_code_push.dart';

class ChangelogEntry {
  final String version;
  final String buildNumber;
  final int? patchNumber;
  final DateTime releaseDate;
  final List<String> features;
  final List<String> fixes;
  final List<String> improvements;

  ChangelogEntry({
    required this.version,
    required this.buildNumber,
    this.patchNumber,
    required this.releaseDate,
    this.features = const [],
    this.fixes = const [],
    this.improvements = const [],
  });

  String get fullVersion {
    if (patchNumber != null) {
      return '$version (Build $buildNumber, Patch $patchNumber)';
    }
    return '$version (Build $buildNumber)';
  }

  bool get hasChanges => features.isNotEmpty || fixes.isNotEmpty || improvements.isNotEmpty;
}

class ChangelogService {
  static final ChangelogService _instance = ChangelogService._internal();
  factory ChangelogService() => _instance;
  ChangelogService._internal();

  static const String _cacheBoxName = 'changelog_cache';
  static const String _lastSeenVersionKey = 'last_seen_version';

  String _currentVersion = '';
  String _currentBuildNumber = '';
  int? _currentPatchNumber;

  Future<void> initialize() async {
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
        debugPrint('[ChangelogService] Error getting patch number: $e');
      }

      debugPrint('[ChangelogService] Initialized: v$_currentVersion build $_currentBuildNumber patch $_currentPatchNumber');
    } catch (e) {
      debugPrint('[ChangelogService] Error initializing: $e');
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
        debugPrint('[ChangelogService] No previous version seen - showing dialog');
        return true;
      }
      
      final isNew = lastSeen != currentVersionString;
      debugPrint('[ChangelogService] Last seen: $lastSeen, Current: $currentVersionString, isNew: $isNew');
      return isNew;
    } catch (e) {
      debugPrint('[ChangelogService] Error checking new version: $e');
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
      debugPrint('[ChangelogService] Marked version as seen: $currentVersionString');
    } catch (e) {
      debugPrint('[ChangelogService] Error marking version as seen: $e');
    }
  }

  ChangelogEntry getCurrentChangelog() {
    return ChangelogEntry(
      version: _currentVersion,
      buildNumber: _currentBuildNumber,
      patchNumber: _currentPatchNumber,
      releaseDate: DateTime.now(),
      features: _currentFeatures,
      fixes: _currentFixes,
      improvements: _currentImprovements,
    );
  }

  List<ChangelogEntry> getRecentChangelogs() {
    return _changelogs;
  }

  static const List<String> _currentFeatures = [
    'Online presence detection - see who is available for calls',
    'Audio and video calls with WebRTC',
    'Real-time messaging with offline support',
    'Communications screen for unified calls and chats',
  ];

  static const List<String> _currentFixes = [
    'Fixed user online status not displaying correctly',
    'Fixed presence sync with Supabase realtime',
    'Improved connectivity detection for offline mode',
  ];

  static const List<String> _currentImprovements = [
    'Dark blue version text in drawer menu',
    'Better offline data caching with Hive',
    'Enhanced sync queue for pending operations',
  ];

  static final List<ChangelogEntry> _changelogs = [
    ChangelogEntry(
      version: '1.0.5',
      buildNumber: '8',
      patchNumber: 9,
      releaseDate: DateTime(2026, 1, 23),
      features: _currentFeatures,
      fixes: _currentFixes,
      improvements: _currentImprovements,
    ),
    ChangelogEntry(
      version: '1.0.4',
      buildNumber: '7',
      releaseDate: DateTime(2026, 1, 20),
      features: [
        'Complete offline functionality for site visits',
        'GPS location capture while offline',
        'Photo capture with base64 storage',
      ],
      fixes: [
        'Fixed List<ConnectivityResult> handling',
        'Fixed sync service connectivity checks',
      ],
      improvements: [
        'Improved battery usage during GPS tracking',
      ],
    ),
    ChangelogEntry(
      version: '1.0.3',
      buildNumber: '6',
      releaseDate: DateTime(2026, 1, 15),
      features: [
        'Wallet management with transaction history',
        'Permit upload functionality',
        'MMP verification workflow',
      ],
      fixes: [
        'Fixed authentication token refresh',
      ],
      improvements: [
        'Faster app startup time',
        'Reduced memory usage',
      ],
    ),
  ];
}
