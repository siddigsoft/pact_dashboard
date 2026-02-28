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
    'Cost Payment Receipt Confirmation — new "Cost Payments" section in Wallet shows all paid cost submissions and lets you confirm receipt with a digital signature / تأكيد استلام دفعات التكاليف — قسم جديد في المحفظة يعرض التسديدات المدفوعة ويتيح تأكيد الاستلام بتوقيع رقمي',
    'Wallet pending-confirmation banner now covers transport advances, withdrawals, AND cost payments in a single alert / تنبيه بانتظار التأكيد يشمل الآن سلف النقل والسحوبات ودفعات التكاليف معاً',
    'Bank account validation before withdrawal — app now blocks withdrawal request if no bank account is on file / التحقق من الحساب البنكي قبل السحب — يمنع التطبيق الآن تقديم طلب سحب إذا لم يكن هناك حساب مسجل',
  ];

  static const List<String> _currentFixes = [
    'Finance "Mark Paid" action now correctly notifies the recipient to confirm receipt in their Wallet / إجراء "تحديد كمدفوع" من المالية يُرسل الآن إشعاراً صحيحاً للمستلم لتأكيد الاستلام في محفظته',
    'Approval timeline for cost submissions now shows live receipt-confirmation status (confirmed ✓ or awaiting ⚠) / مخطط الاعتماد لتقديمات التكاليف يعرض الآن حالة تأكيد الاستلام مباشرةً',
  ];

  static const List<String> _currentImprovements = [
    'Digital signature flow for cost payments mirrors the existing transport advance confirmation UX / تدفق التوقيع الرقمي لدفعات التكاليف يطابق تجربة تأكيد سلف النقل الحالية',
    'Cost Payments tab badge shows count of items pending your confirmation / شارة تبويب دفعات التكاليف تعرض عدد البنود التي تنتظر تأكيدك',
    'Per-request USD equivalent shown in bulk payment email dialogs to catch rate typos / مكافئ USD لكل طلب يظهر في نوافذ البريد الجماعي للكشف عن أخطاء سعر الصرف',
  ];

  static final List<ChangelogEntry> _changelogs = [
    ChangelogEntry(
      version: '1.0.6',
      buildNumber: '9',
      releaseDate: DateTime(2026, 2, 28),
      features: _currentFeatures,
      fixes: _currentFixes,
      improvements: _currentImprovements,
    ),
    ChangelogEntry(
      version: '1.0.5',
      buildNumber: '8',
      patchNumber: 9,
      releaseDate: DateTime(2026, 1, 23),
      features: [
        'File attachments in chat - send images and documents',
        'Voice message recording with hold-to-record',
        'Role-based calling restrictions for field staff',
        'Camera and gallery integration for photo sharing',
      ],
      fixes: [
        'Fixed microphone and camera permissions for calls',
        'Fixed chat message input layout',
        'Improved presence sync with state and hub fields',
      ],
      improvements: [
        'WhatsApp-style attachment picker',
        'Recording indicator with duration timer',
        'Smoother message input toggle between mic and send',
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
