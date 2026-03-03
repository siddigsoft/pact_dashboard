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

  bool get hasChanges =>
      features.isNotEmpty || fixes.isNotEmpty || improvements.isNotEmpty;
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
        final isAvailable = codePush.isShorebirdAvailable();
        if (isAvailable) {
          _currentPatchNumber = await codePush.currentPatchNumber();
        }
      } catch (e) {
        debugPrint('[ChangelogService] Error getting patch number: $e');
      }

      debugPrint(
        '[ChangelogService] Initialized: v$_currentVersion build $_currentBuildNumber patch $_currentPatchNumber',
      );
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
        debugPrint(
          '[ChangelogService] No previous version seen - showing dialog',
        );
        return true;
      }

      final isNew = lastSeen != currentVersionString;
      debugPrint(
        '[ChangelogService] Last seen: $lastSeen, Current: $currentVersionString, isNew: $isNew',
      );
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
      debugPrint(
        '[ChangelogService] Marked version as seen: $currentVersionString',
      );
    } catch (e) {
      debugPrint('[ChangelogService] Error marking version as seen: $e');
    }
  }

  ChangelogEntry getCurrentChangelog() {
    return ChangelogEntry(
      version: '1.0.6',
      buildNumber: '279',
      patchNumber: null,
      releaseDate: DateTime(2026, 3, 2),
      features: _currentFeatures,
      fixes: _currentFixes,
      improvements: _currentImprovements,
    );
  }

  List<ChangelogEntry> getRecentChangelogs() {
    return _changelogs;
  }

  /// Get current changelog features in the specified language
  List<String> getCurrentFeatures({bool isArabic = false}) {
    return isArabic
        ? _translatedContent['features_ar'] ?? _currentFeatures
        : _currentFeatures;
  }

  /// Get current changelog fixes in the specified language
  List<String> getCurrentFixes({bool isArabic = false}) {
    return isArabic
        ? _translatedContent['fixes_ar'] ?? _currentFixes
        : _currentFixes;
  }

  /// Get current changelog improvements in the specified language
  List<String> getCurrentImprovements({bool isArabic = false}) {
    return isArabic
        ? _translatedContent['improvements_ar'] ?? _currentImprovements
        : _currentImprovements;
  }

  // Features, fixes, and improvements - Bilingual (English/Arabic)
  static const List<String> _currentFeatures = [
    '🌍 Complete Bilingual Support (English/Arabic)',
    '📋 Language Toggle Button - Switch instantly in AppBar',
    '🏭 MMP Details Section - Shows main activity & status',
    '⚠️ Enumerator Fee Note - Guidance with approval requirements',
    '🎯 Enhanced Activity Selector - Multiple selection with color coding',
    '🏪 Warehouse Monitoring (WHM) Input - Track warehouse activities',
    '📊 Market Diversion (MDM) Input - Record market monitoring',
    '📈 PDM Questionnaire Counter - Auto-calculate visit fees',
    '🎨 Visual Enhancements - Icons, badges, and styling improvements',
    '🌐 RTL Text Support - Full right-to-left input for Arabic',
  ];

  static const List<String> _currentFixes = [
    'Fixed Complete Visit Screen - Missing activity inputs now appear',
    'Fixed language detection in all screens',
    'Fixed RTL text field support for Arabic input',
    'Fixed conditional activity input visibility',
    'Fixed activity-to-fee calculation multipliers',
    'Fixed MMP details card bilingual display',
  ];

  static const List<String> _currentImprovements = [
    'Activity selection now context-aware (GFA/CBT/PDM/MDM/WHM)',
    'Warehouse input visibility improved (appears after fee summary)',
    'Fee note alert now includes WFP AO approval requirements',
    'All Arabic translations verified and complete',
    'Language toggle button easily accessible in AppBar',
    'Better UX for offline and online states',
  ];

  // Arabic translations for features/fixes/improvements
  static const Map<String, List<String>> _translatedContent = {
    'features_ar': [
      '🌍 دعم ثنائي اللغة كامل (الإنجليزية والعربية)',
      '📋 زر التبديل اللغوي - التبديل فوراً في شريط التطبيق',
      '🏭 قسم تفاصيل الخطة - عرض النشاط الرئيسي والحالة',
      '⚠️ ملاحظة رسوم الفنيين - إرشادات مع متطلبات الموافقة',
      '🎯 محدد النشاط المحسّن - اختيار متعدد مع ترميز اللون',
      '🏪 رصد المستودع (WHM) - تتبع أنشطة المستودع',
      '📊 مدخل رصد السوق (MDM) - تسجيل رصد السوق',
      '📈 عداد استبيان PDM - حساب تلقائي لرسوم الزيارة',
      '🎨 تحسينات بصرية - الرموز والشارات وتحسينات التصميم',
      '🌐 دعم النص من اليمين لليسار (RTL) - إدخال كامل من اليمين لليسار للعربية',
    ],
    'fixes_ar': [
      'تم إصلاح شاشة إكمال الزيارة - المدخلات المفقودة تظهر الآن',
      'تم إصلاح كشف اللغة في جميع الشاشات',
      'تم إصلاح دعم حقل النص RTL لإدخال اللغة العربية',
      'تم إصلاح رؤية إدخال النشاط الشرطي',
      'تم إصلاح معاملات حساب النشاط إلى الرسم',
      'تم إصلاح عرض كارت تفاصيل الخطة ثنائي اللغة',
    ],
    'improvements_ar': [
      'اختيار النشاط الآن يدرك السياق (GFA/CBT/PDM/MDM/WHM)',
      'تحسين رؤية مدخل المستودع (يظهر بعد ملخص الرسم)',
      'تنبيه رسالة الرسم الآن يتضمن متطلبات موافقة WFP AO',
      'تم التحقق من جميع ترجمات اللغة العربية واكتمالها',
      'زر تبديل اللغة يسهل الوصول إليه في شريط التطبيق',
      'تجربة مستخدم أفضل للحالات بدون اتصال والإنترنت',
    ],
  };

  static final List<ChangelogEntry> _changelogs = [
    ChangelogEntry(
      version: '1.0.6',
      buildNumber: '279',
      releaseDate: DateTime(2026, 3, 2),
      features: _currentFeatures,
      fixes: _currentFixes,
      improvements: _currentImprovements,
    ),
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
      improvements: ['Improved battery usage during GPS tracking'],
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
      fixes: ['Fixed authentication token refresh'],
      improvements: ['Faster app startup time', 'Reduced memory usage'],
    ),
  ];
}
