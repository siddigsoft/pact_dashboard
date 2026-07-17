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
  final List<String> featuresAr;
  final List<String> fixes;
  final List<String> fixesAr;
  final List<String> improvements;
  final List<String> improvementsAr;

  ChangelogEntry({
    required this.version,
    required this.buildNumber,
    this.patchNumber,
    required this.releaseDate,
    this.features = const [],
    this.featuresAr = const [],
    this.fixes = const [],
    this.fixesAr = const [],
    this.improvements = const [],
    this.improvementsAr = const [],
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
      version: '1.0.7',
      buildNumber: '280',
      patchNumber: null,
      releaseDate: DateTime(2026, 3, 3),
      features: _currentFeatures,
      featuresAr: _currentFeaturesAr,
      fixes: _currentFixes,
      fixesAr: _currentFixesAr,
      improvements: _currentImprovements,
      improvementsAr: _currentImprovementsAr,
    );
  }

  List<ChangelogEntry> getRecentChangelogs() {
    return _changelogs;
  }

  // ── Version 1.0.7 — March 3, 2026 ─────────────────────────────────────────

  static const List<String> _currentFeatures = [
    '🎯 Smart Activity Rules — MDM only for DM sites, WHM for DM & AIM sites',
    '📊 Total Fee Summary Card — Shows PDM ÷7 + MDM ×2 + WHM ×2 breakdown',
    '📋 MMP Column Recognition — Captures "Warehouse Monitoring" & "Market Diversion" with or without "Use" prefix, any case',
    '🏪 WHM Add-On — Warehouse name required, auto-enabled from MMP flag',
    '📈 MDM Add-On — Market name required, auto-enabled from MMP flag',
  ];

  static const List<String> _currentFeaturesAr = [
    '🎯 قواعد النشاط الذكية — MDM فقط لمواقع DM، و WHM لمواقع DM و AIM',
    '📊 بطاقة ملخص الرسوم الكلية — تعرض حساب PDM ÷7 + MDM ×2 + WHM ×2',
    '📋 التعرف على أعمدة الخطة — يلتقط "رصد المستودع" و "انحراف السوق" مع أو بدون كلمة "Use"، بأي تنسيق كتابي',
    '🏪 إضافة WHM — اسم المستودع مطلوب، يُفعَّل تلقائياً من علامة الخطة',
    '📈 إضافة MDM — اسم السوق مطلوب، يُفعَّل تلقائياً من علامة الخطة',
  ];

  static const List<String> _currentFixes = [
    'Fixed MDM appearing for non-DM activities (AIM, PDM) — now DM-only',
    'Fixed WHM not appearing for AIM activities — now correctly includes AIM',
    'Fixed total_visit_fees not saved to database on web visit report',
    'Fixed web visit report not showing MDM/WHM fee badge (×2 visits)',
    'Fixed Confirmation Audit missing operational cost submissions',
  ];

  static const List<String> _currentFixesAr = [
    'تم إصلاح ظهور MDM لأنشطة غير DM (AIM, PDM) — أصبح مخصصاً لـ DM فقط',
    'تم إصلاح عدم ظهور WHM لأنشطة AIM — أصبح يشمل AIM بشكل صحيح',
    'تم إصلاح عدم حفظ total_visit_fees في قاعدة البيانات عند تقرير الزيارة على الويب',
    'تم إصلاح عدم ظهور شارة رسوم MDM/WHM (×2 زيارة) في تقرير الزيارة على الويب',
    'تم إصلاح غياب إيصالات التكاليف التشغيلية في تدقيق التأكيد',
  ];

  static const List<String> _currentImprovements = [
    'Fee formula consistent: PDM=÷7, MDM=×2, WHM=×2 on both mobile & web',
    'MMP upload accepts 40+ column name variations for all key fields',
    'Activity flags auto-fill from MMP — enumerator only confirms, does not re-enter',
    'Bilingual labels on all activity inputs — English & Arabic in one screen',
  ];

  static const List<String> _currentImprovementsAr = [
    'صيغة الرسوم موحدة: PDM=÷7، MDM=×2، WHM=×2 على الهاتف والويب معاً',
    'رفع الخطة يقبل أكثر من 40 تنسيقاً لأسماء الأعمدة لجميع الحقول الرئيسية',
    'تُملأ علامات النشاط تلقائياً من الخطة — الفني يؤكد فقط ولا يُعيد إدخال البيانات',
    'تسميات ثنائية اللغة على جميع مدخلات النشاط — الإنجليزية والعربية في شاشة واحدة',
  ];

  static final List<ChangelogEntry> _changelogs = [
    ChangelogEntry(
      version: '1.0.7',
      buildNumber: '280',
      releaseDate: DateTime(2026, 3, 3),
      features: _currentFeatures,
      featuresAr: _currentFeaturesAr,
      fixes: _currentFixes,
      fixesAr: _currentFixesAr,
      improvements: _currentImprovements,
      improvementsAr: _currentImprovementsAr,
    ),
    ChangelogEntry(
      version: '1.0.6',
      buildNumber: '279',
      releaseDate: DateTime(2026, 3, 2),
      features: [
        '🌍 Complete Bilingual Support (English/Arabic)',
        '📋 Language Toggle Button - Switch instantly in AppBar',
        '🏭 MMP Details Section - Shows main activity & status',
        '⚠️ Enumerator Fee Note - Guidance with approval requirements',
        '🎯 Enhanced Activity Selector - Multiple selection with color coding',
        '🏪 Warehouse Monitoring (WHM) Input - Track warehouse activities',
        '📊 Market Diversion (MDM) Input - Record market monitoring',
        '📈 PDM Questionnaire Counter - Auto-calculate visit fees',
      ],
      featuresAr: [
        '🌍 دعم ثنائي اللغة كامل (الإنجليزية والعربية)',
        '📋 زر التبديل اللغوي - التبديل فوراً في شريط التطبيق',
        '🏭 قسم تفاصيل الخطة - عرض النشاط الرئيسي والحالة',
        '⚠️ ملاحظة رسوم الفنيين - إرشادات مع متطلبات الموافقة',
        '🎯 محدد النشاط المحسّن - اختيار متعدد مع ترميز اللون',
        '🏪 رصد المستودع (WHM) - تتبع أنشطة المستودع',
        '📊 مدخل رصد السوق (MDM) - تسجيل رصد السوق',
        '📈 عداد استبيان PDM - حساب تلقائي لرسوم الزيارة',
      ],
      fixes: [
        'Fixed Complete Visit Screen - Missing activity inputs now appear',
        'Fixed language detection in all screens',
        'Fixed RTL text field support for Arabic input',
      ],
      fixesAr: [
        'تم إصلاح شاشة إكمال الزيارة - المدخلات المفقودة تظهر الآن',
        'تم إصلاح كشف اللغة في جميع الشاشات',
        'تم إصلاح دعم حقل النص RTL لإدخال اللغة العربية',
      ],
      improvements: [
        'Activity selection now context-aware (GFA/CBT/PDM/MDM/WHM)',
        'Fee note alert now includes WFP AO approval requirements',
        'Better UX for offline and online states',
      ],
      improvementsAr: [
        'اختيار النشاط الآن يدرك السياق (GFA/CBT/PDM/MDM/WHM)',
        'تنبيه رسالة الرسم الآن يتضمن متطلبات موافقة WFP AO',
        'تجربة مستخدم أفضل للحالات بدون اتصال والإنترنت',
      ],
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
      featuresAr: [
        'وظائف غير متصلة كاملة لزيارات المواقع',
        'التقاط موقع GPS في وضع عدم الاتصال',
        'التقاط الصور مع تخزين base64',
      ],
      fixes: [
        'Fixed List<ConnectivityResult> handling',
        'Fixed sync service connectivity checks',
      ],
      fixesAr: [
        'تم إصلاح معالجة قائمة نتائج الاتصال',
        'تم إصلاح فحوصات الاتصال في خدمة المزامنة',
      ],
      improvements: ['Improved battery usage during GPS tracking'],
      improvementsAr: ['تحسين استخدام البطارية أثناء تتبع GPS'],
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
      featuresAr: [
        'إدارة المحفظة مع سجل المعاملات',
        'وظيفة رفع التصاريح',
        'سير عمل التحقق من الخطة',
      ],
      fixes: ['Fixed authentication token refresh'],
      fixesAr: ['تم إصلاح تجديد رمز المصادقة'],
      improvements: ['Faster app startup time', 'Reduced memory usage'],
      improvementsAr: ['وقت تشغيل أسرع للتطبيق', 'تقليل استخدام الذاكرة'],
    ),
  ];
}
