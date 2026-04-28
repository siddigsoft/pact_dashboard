import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:google_fonts/google_fonts.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../models/visit_report_data.dart';
import '../services/location_service.dart';
import '../services/offline/offline_db.dart';
import '../utils/user_identity_resolver.dart';

class VisitReportDialog extends StatefulWidget {
  final Map<String, dynamic> site;
  const VisitReportDialog({super.key, required this.site});

  @override
  State<VisitReportDialog> createState() => _VisitReportDialogState();
}

class _VisitReportDialogState extends State<VisitReportDialog> {
  final _formKey = GlobalKey<FormState>();
  final _activitiesController = TextEditingController();
  final _notesController = TextEditingController();

  final List<String> _photoPaths = [];
  int _durationMinutes = 0;
  Position? _coordinates;
  bool _isGettingLocation = false;
  bool _locationEnabled = false;
  String? _locationError;
  bool _isSubmitting = false;
  bool _loggedMissingToolKeys = false;
  bool _showCoreMmpDetails = false;
  bool _showClaimMmpDetails = false;
  bool _showDispatchMmpDetails = false;
  bool _mmpSectionExpansionInitialized = false;
  Map<String, dynamic>? _latestMmpEntry;
  final Map<String, String> _userDisplayNamesById = {};

  DateTime? _visitStartTime;
  StreamSubscription<Position>? _positionStream;

  String? _selectedActivityType;
  final Set<String> _selectedActivityTypes = <String>{};
  int _pdmQuestionnaires = 0;
  final TextEditingController _pdmQController = TextEditingController();
  final TextEditingController _marketNameController = TextEditingController();
  String _warehouseName = '';

  bool _hasMarketDiversion = false;
  bool _hasWarehouseMonitoring = false;

  // Prevent multiple PostFrameCallback triggers
  bool _autoSelectionProcessed = false;
  // Track if warning was shown on first load
  bool _restrictionWarningShown = false;

  static const int _pdmQPerVisit = 7;

  // Activity Type selector: GFA In-Kind, CBT, PDM, MDM, and WHM
  static const Map<String, String> _activityTypesEn = {
    'GFA': 'GFA In-Kind',
    'CBT': 'Cash Based\nTransfer',
    'PDM': 'Post-Distribution\nMonitoring',
    'MDM': 'Market Diversion\nMonitoring',
    'WHM': 'Warehouse\nMonitoring',
  };

  static const Map<String, String> _activityTypesAr = {
    'GFA': 'مساعدة غذائية نقدية',
    'CBT': 'تحويل مالي نقدي',
    'PDM': 'رصد ما بعد التوزيع',
    'MDM': 'رصد انحراف السوق',
    'WHM': 'رصد المستودع',
  };

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  String _bi(String en, String ar) =>
      '\u2066$en\u2069 \u200B|\u200B \u2067$ar\u2069';

  bool _isYesValue(dynamic value) {
    final normalized = value?.toString().trim().toLowerCase() ?? '';
    return normalized == 'yes' ||
        normalized == 'y' ||
        normalized == 'true' ||
        normalized == '1' ||
        normalized == 'نعم';
  }

  Map<String, dynamic> get _additionalData {
    return _safeAdditionalData(widget.site['additional_data']) ?? {};
  }

  String get _resolvedMainActivity {
    final additionalData = _additionalData;
    final candidates = [
      widget.site['main_activity']?.toString(),
      widget.site['activity_at_site']?.toString(),
      widget.site['activity_type']?.toString(),
      widget.site['activity']?.toString(),
      additionalData['main_activity']?.toString(),
      additionalData['activity_at_site']?.toString(),
      additionalData['activity_type']?.toString(),
      additionalData['activity']?.toString(),
    ];

    for (final candidate in candidates) {
      final value = candidate?.trim().toUpperCase() ?? '';
      if (value.isNotEmpty &&
          value != 'N/A' &&
          value != 'NA' &&
          value != 'NULL') {
        return value;
      }
    }

    return '';
  }

  String get _normalizedMainActivity => _resolvedMainActivity
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim()
      .toUpperCase();

  bool get _isDmMainActivity =>
      _normalizedMainActivity.startsWith('GFA') ||
      _normalizedMainActivity.contains('CBT') ||
      _normalizedMainActivity.contains('BSFP') ||
      _normalizedMainActivity == 'DM';

  bool get _isAimMainActivity =>
      _normalizedMainActivity == 'AIM' ||
      _normalizedMainActivity == 'TSFP' ||
      _normalizedMainActivity == 'PSN' ||
      _normalizedMainActivity == 'FFA' ||
      _normalizedMainActivity == 'SF' ||
      _normalizedMainActivity == 'THR' ||
      _normalizedMainActivity == 'PHL';

  String get _baseActivityCode {
    if (_normalizedMainActivity == 'PDM') return 'PDM';
    if (_normalizedMainActivity == 'MDM') return 'MDM';
    if (_normalizedMainActivity == 'WHM') return 'WHM';

    if (_isDmMainActivity) {
      return _normalizedMainActivity.contains('CBT') ? 'CBT' : 'GFA';
    }

    if (_isAimMainActivity) {
      return _normalizedMainActivity;
    }

    return _normalizedMainActivity;
  }

  List<String> _getAvailableActivities() {
    final activities = <String>[];

    if (_baseActivityCode.isNotEmpty) {
      activities.add(_baseActivityCode);
    }

    if (_hasMarketDiversion &&
        (_isDmMainActivity ||
            _baseActivityCode == 'GFA' ||
            _baseActivityCode == 'CBT' ||
            _baseActivityCode.isEmpty) &&
        !activities.contains('MDM')) {
      activities.add('MDM');
    }

    if (_hasWarehouseMonitoring &&
        (_isDmMainActivity ||
            _isAimMainActivity ||
            _baseActivityCode == 'GFA' ||
            _baseActivityCode == 'CBT' ||
            _baseActivityCode.isEmpty) &&
        !activities.contains('WHM')) {
      activities.add('WHM');
    }

    return activities;
  }

  bool _showActivitySelector() => _getAvailableActivities().isNotEmpty;

  /// True if MDM is selected (market diversion = 2 visits)
  bool get _hasMDM => _selectedActivityTypes.contains('MDM');

  bool _isActivitySelected(String activityCode) {
    return _selectedActivityTypes.contains(activityCode);
  }

  int get _pdmSiteVisits => (_pdmQuestionnaires / _pdmQPerVisit).floor();
  int get _pdmRemainder => _pdmQuestionnaires % _pdmQPerVisit;

  @override
  void initState() {
    super.initState();
    _loadDraftData();
    _startVisitTimer();
    _startLocationMonitoring();
    _refreshMmpEntryFromServer();
    _preloadUserNamesFromSiteData();
  }

  @override
  void dispose() {
    _activitiesController.dispose();
    _notesController.dispose();
    _pdmQController.dispose();
    _marketNameController.dispose();
    _positionStream?.cancel();
    super.dispose();
  }

  static Map<String, dynamic>? _safeAdditionalData(dynamic data) {
    if (data == null) return null;
    if (data is String) {
      try {
        final decoded = jsonDecode(data);
        return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
      } catch (_) {
        return null;
      }
    }
    if (data is Map) {
      return Map<String, dynamic>.from(data);
    }
    return null;
  }

  bool _isLikelyUuid(String value) => UserIdentityResolver.isLikelyUuid(value);

  bool _labelExpectsUserIdentity(String label) {
    return UserIdentityResolver.labelExpectsUserIdentity(label);
  }

  Future<void> _preloadUserNamesFromSiteData() async {
    final data = _mergedSiteDataForMmp();
    final ids = UserIdentityResolver.collectPotentialUserIdsFromData(data);

    if (ids.isEmpty) return;

    final unresolved = ids
        .where((id) => !_userDisplayNamesById.containsKey(id))
        .toList();
    if (unresolved.isEmpty) return;

    try {
      final resolvedNames = await UserIdentityResolver.resolveUserDisplayNames(
        client: Supabase.instance.client,
        userIds: unresolved,
      );

      for (final id in unresolved) {
        _userDisplayNamesById[id] = resolvedNames[id] ?? id;
      }

      if (mounted && resolvedNames.isNotEmpty) {
        setState(() {});
      }
    } catch (error) {
      debugPrint('[VisitReportDialog] Failed to resolve user names: $error');
    }
  }

  Map<String, dynamic> _mergedSiteDataForMmp() {
    if (_latestMmpEntry == null) {
      return Map<String, dynamic>.from(widget.site);
    }

    final merged = <String, dynamic>{...widget.site, ..._latestMmpEntry!};

    final baseAdditional =
        _safeAdditionalData(widget.site['additional_data']) ??
        <String, dynamic>{};
    final latestAdditional =
        _safeAdditionalData(_latestMmpEntry!['additional_data']) ??
        <String, dynamic>{};
    merged['additional_data'] = {...baseAdditional, ...latestAdditional};

    return merged;
  }

  Future<void> _refreshMmpEntryFromServer() async {
    final siteId = widget.site['id']?.toString();
    if (siteId == null || siteId.isEmpty) return;

    try {
      final response = await Supabase.instance.client
          .from('mmp_site_entries')
          .select('*')
          .eq('id', siteId)
          .maybeSingle();

      if (!mounted || response == null) return;

      final map = Map<String, dynamic>.from(response as Map);
      setState(() {
        _latestMmpEntry = map;
      });
      unawaited(_preloadUserNamesFromSiteData());
    } catch (error) {
      debugPrint(
        '[VisitReportDialog] Failed to refresh mmp_site_entries row: $error',
      );
    }
  }

  String _normalizeLookupKey(String input) {
    return input.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
  }

  String _stringifyMmpValue(dynamic value) {
    if (value == null) return '';

    if (value is bool) {
      return _isArabic ? (value ? 'نعم' : 'لا') : (value ? 'Yes' : 'No');
    }

    // Handle Map objects with special formatting
    if (value is Map) {
      return _formatComplexObject(value);
    }

    if (value is List) {
      // Handle list of objects
      if (value.isEmpty) return '';
      if (value.every((item) => item is! Map)) {
        // Simple list - just stringify with commas
        try {
          return value
              .map((v) => _stringifyMmpValue(v))
              .where((s) => s.isNotEmpty)
              .join(', ');
        } catch (_) {}
      }
      // Complex list - format nicely
      return _formatComplexObject(value);
    }

    final text = value.toString().trim();
    if (text.isEmpty) return '';

    if (_isLikelyUuid(text) && _userDisplayNamesById.containsKey(text)) {
      return _userDisplayNamesById[text]!;
    }

    final lowered = text.toLowerCase();
    if (lowered == 'null' || lowered == 'n/a' || lowered == 'na') {
      return '';
    }

    return text;
  }

  String _formatComplexObject(dynamic obj) {
    try {
      if (obj is Map) {
        final map = Map<String, dynamic>.from(obj);

        // Special handling for cp_verification
        if (map.containsKey('status') &&
            (map.containsKey('verified_at') ||
                map.containsKey('verified_by'))) {
          final status = map['status'] ?? 'unknown';
          final verifiedAt = map['verified_at'] as String?;
          final verifiedBy = map['verified_by'] as String?;

          if (verifiedAt != null && verifiedAt.isNotEmpty) {
            try {
              final dt = DateTime.parse(verifiedAt);
              final formatted =
                  '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
              return _isArabic
                  ? 'الحالة: $status | التاريخ: $formatted${verifiedBy != null ? ' | التحقق من قبل: $verifiedBy' : ''}'
                  : 'Status: $status | Date: $formatted${verifiedBy != null ? ' | Verified By: $verifiedBy' : ''}';
            } catch (_) {}
          }

          return _isArabic
              ? 'الحالة: $status${verifiedBy != null ? ' | التحقق من قبل: $verifiedBy' : ''}'
              : 'Status: $status${verifiedBy != null ? ' | Verified By: $verifiedBy' : ''}';
        }

        // Format as readable key-value pairs
        final pairs = <String>[];
        map.forEach((key, value) {
          if (value != null && value.toString().isNotEmpty) {
            final formattedKey = _formatMmpKeyLabel(key);
            final formattedValue = _stringifyMmpValue(value);
            if (formattedValue.isNotEmpty) {
              pairs.add('$formattedKey: $formattedValue');
            }
          }
        });

        if (pairs.isNotEmpty) {
          return pairs.join(' | ');
        }
      } else if (obj is List) {
        final items = <String>[];
        for (int i = 0; i < obj.length; i++) {
          final item = obj[i];
          if (item is Map) {
            items.add(_formatComplexObject(item));
          } else {
            final str = _stringifyMmpValue(item);
            if (str.isNotEmpty) items.add(str);
          }
        }
        return items.join(' | ');
      }

      return jsonEncode(obj);
    } catch (_) {
      final fallback = obj.toString().trim();
      return fallback.toLowerCase() == 'null' ? '' : fallback;
    }
  }

  String _resolveMmpValue({
    required Map<String, dynamic> siteData,
    required Map<String, dynamic> additionalData,
    required List<String> exactKeys,
    required List<String> normalizedKeys,
  }) {
    for (final key in exactKeys) {
      final fromSite = _stringifyMmpValue(siteData[key]);
      if (fromSite.isNotEmpty) return fromSite;

      final fromAdditional = _stringifyMmpValue(additionalData[key]);
      if (fromAdditional.isNotEmpty) return fromAdditional;
    }

    for (final normalizedTarget in normalizedKeys) {
      for (final entry in siteData.entries) {
        if (_normalizeLookupKey(entry.key) == normalizedTarget) {
          final value = _stringifyMmpValue(entry.value);
          if (value.isNotEmpty) return value;
        }
      }
      for (final entry in additionalData.entries) {
        if (_normalizeLookupKey(entry.key) == normalizedTarget) {
          final value = _stringifyMmpValue(entry.value);
          if (value.isNotEmpty) return value;
        }
      }
    }

    return '';
  }

  dynamic _resolveMmpRawValue({
    required Map<String, dynamic> siteData,
    required Map<String, dynamic> additionalData,
    required List<String> exactKeys,
    required List<String> normalizedKeys,
  }) {
    for (final key in exactKeys) {
      if (siteData.containsKey(key) && siteData[key] != null) {
        return siteData[key];
      }
      if (additionalData.containsKey(key) && additionalData[key] != null) {
        return additionalData[key];
      }
    }

    for (final normalizedTarget in normalizedKeys) {
      for (final entry in siteData.entries) {
        if (_normalizeLookupKey(entry.key) == normalizedTarget &&
            entry.value != null) {
          return entry.value;
        }
      }
      for (final entry in additionalData.entries) {
        if (_normalizeLookupKey(entry.key) == normalizedTarget &&
            entry.value != null) {
          return entry.value;
        }
      }
    }

    return null;
  }

  Map<String, dynamic>? _toMapValue(dynamic value) {
    if (value == null) return null;
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    if (value is String) {
      try {
        final decoded = jsonDecode(value);
        if (decoded is Map) {
          return Map<String, dynamic>.from(decoded);
        }
      } catch (_) {}
    }
    return null;
  }

  String _formatMmpKeyLabel(String key) {
    final cleaned = key
        .replaceAll(RegExp(r'[^A-Za-z0-9_ ]'), ' ')
        .replaceAll('_', ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();

    if (cleaned.isEmpty) return key;

    return cleaned
        .split(' ')
        .map((word) {
          if (word.isEmpty) return word;
          return '${word[0].toUpperCase()}${word.substring(1)}';
        })
        .join(' ');
  }

  String _normalizeLabelKey(String input) {
    return input.toLowerCase().replaceAll(RegExp(r'[\s_:\-]+'), '').trim();
  }

  String _formatNumberWithCommas(String numericText) {
    final parts = numericText.split('.');
    final integerPart = parts.first;
    final decimalPart = parts.length > 1 ? parts[1] : '';

    final buffer = StringBuffer();
    for (int i = 0; i < integerPart.length; i++) {
      final reverseIndex = integerPart.length - i;
      buffer.write(integerPart[i]);
      if (reverseIndex > 1 && reverseIndex % 3 == 1) {
        buffer.write(',');
      }
    }

    if (decimalPart.isNotEmpty) {
      return '${buffer.toString()}.$decimalPart';
    }

    return buffer.toString();
  }

  String _enhanceMmpDetailValue(String label, String value) {
    if (value.isEmpty) return value;

    final normalizedLabel = _normalizeLabelKey(label);
    if (_labelExpectsUserIdentity(label) && _isLikelyUuid(value)) {
      return _userDisplayNamesById[value] ?? value;
    }

    // Don't format already formatted complex values
    if (value.contains(' | ') ||
        value.contains('Status:') ||
        value.contains('الحالة:')) {
      return value;
    }

    final shouldFormatAmount =
        normalizedLabel.contains('payout') ||
        normalizedLabel.contains('cost') ||
        normalizedLabel.contains('budget') ||
        normalizedLabel.contains('fee') ||
        normalizedLabel.contains('transport') ||
        normalizedLabel.contains('مطالبة') ||
        normalizedLabel.contains('ارسال');

    if (!shouldFormatAmount) return value;

    final cleaned = value.replaceAll(',', '').trim();
    final parsed = num.tryParse(cleaned);
    if (parsed == null) return value;

    final normalizedNumber = parsed % 1 == 0
        ? parsed.toInt().toString()
        : parsed.toStringAsFixed(2);
    final withCommas = _formatNumberWithCommas(normalizedNumber);

    return '$withCommas SDG';
  }

  List<Widget> _buildUploadedMmpDetailSections(
    List<MapEntry<String, String>> uploadedDetails,
  ) {
    final core = <MapEntry<String, String>>[];
    final claim = <MapEntry<String, String>>[];
    final dispatch = <MapEntry<String, String>>[];

    for (final entry in uploadedDetails) {
      final label = entry.key.toLowerCase();
      if (label.contains('dispatch') || label.contains('إرسال')) {
        dispatch.add(entry);
      } else if (label.contains('claim') || label.contains('مطالبة')) {
        claim.add(entry);
      } else {
        core.add(entry);
      }
    }

    Widget buildSection({
      required String title,
      required List<MapEntry<String, String>> entries,
      required bool isExpanded,
      required VoidCallback onToggle,
    }) {
      return Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.grey.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            InkWell(
              borderRadius: BorderRadius.circular(8),
              onTap: onToggle,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          height: 1.3,
                          color: Colors.grey[800],
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 7,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.primaryOrange.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        entries.length.toString(),
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primaryOrange,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Icon(
                      isExpanded
                          ? Icons.keyboard_arrow_up_rounded
                          : Icons.keyboard_arrow_down_rounded,
                      size: 18,
                      color: Colors.grey[700],
                    ),
                  ],
                ),
              ),
            ),
            if (isExpanded) ...[
              const SizedBox(height: 8),
              ...entries.map(
                (entry) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 4,
                        child: Text(
                          entry.key,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            height: 1.4,
                            color: Colors.grey[700],
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        flex: 6,
                        child: Text(
                          entry.value,
                          textAlign: _isArabic
                              ? TextAlign.start
                              : TextAlign.end,
                          textDirection: _isArabic
                              ? TextDirection.rtl
                              : TextDirection.ltr,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            height: 1.4,
                            color: AppColors.textDark,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      );
    }

    final sections = <Widget>[];

    if (!_mmpSectionExpansionInitialized) {
      _showCoreMmpDetails = core.isNotEmpty;
      _showClaimMmpDetails = false;
      _showDispatchMmpDetails = false;
      _mmpSectionExpansionInitialized = true;
    }

    if (core.isNotEmpty) {
      sections.add(
        buildSection(
          title: _bi('Core Details', 'البيانات الأساسية'),
          entries: core,
          isExpanded: _showCoreMmpDetails,
          onToggle: () => setState(() {
            _showCoreMmpDetails = !_showCoreMmpDetails;
          }),
        ),
      );
    }
    if (claim.isNotEmpty) {
      if (sections.isNotEmpty) sections.add(const SizedBox(height: 8));
      sections.add(
        buildSection(
          title: _bi('Claim Details', 'تفاصيل المطالبة'),
          entries: claim,
          isExpanded: _showClaimMmpDetails,
          onToggle: () => setState(() {
            _showClaimMmpDetails = !_showClaimMmpDetails;
          }),
        ),
      );
    }
    if (dispatch.isNotEmpty) {
      if (sections.isNotEmpty) sections.add(const SizedBox(height: 8));
      sections.add(
        buildSection(
          title: _bi('Dispatch Details', 'تفاصيل الإرسال'),
          entries: dispatch,
          isExpanded: _showDispatchMmpDetails,
          onToggle: () => setState(() {
            _showDispatchMmpDetails = !_showDispatchMmpDetails;
          }),
        ),
      );
    }

    return sections;
  }

  List<MapEntry<String, String>> _collectMmpUploadedDetails(
    Map<String, dynamic> siteData,
    Map<String, dynamic> additionalData,
  ) {
    final details = <MapEntry<String, String>>[];
    final seen = <String>{};

    void addLabeledEntry(String label, String value) {
      final normalized = _normalizeLabelKey(label);
      if (normalized.isEmpty || seen.contains(normalized) || value.isEmpty) {
        return;
      }
      seen.add(normalized);
      details.add(MapEntry(label, _enhanceMmpDetailValue(label, value)));
    }

    void addEntry(String key, dynamic rawValue) {
      final normalizedKey = _normalizeLookupKey(key);

      if (normalizedKey == 'claimfeecalculation') {
        final mapValue = _toMapValue(rawValue);
        if (mapValue != null) {
          addLabeledEntry(
            _bi('Claim Calculation Source', 'حساب المطالبة - المصدر'),
            _stringifyMmpValue(mapValue['fee_source']),
          );
          addLabeledEntry(
            _bi('Claim Calculation Scope', 'حساب المطالبة - النطاق'),
            _stringifyMmpValue(mapValue['role_scope']),
          );
          addLabeledEntry(
            _bi('Claim Total Payout', 'حساب المطالبة - إجمالي الدفع'),
            _stringifyMmpValue(mapValue['total_payout']),
          );
          addLabeledEntry(
            _bi('Claim Transport Cost', 'حساب المطالبة - تكلفة النقل'),
            _stringifyMmpValue(mapValue['calculated_transport_cost']),
          );
          addLabeledEntry(
            _bi('Claim Enumerator Fee', 'حساب المطالبة - أجر الباحث'),
            _stringifyMmpValue(mapValue['enumerator_fee']),
          );
          return;
        }
      }

      if (normalizedKey == 'dispatchcosts') {
        final mapValue = _toMapValue(rawValue);
        if (mapValue != null) {
          addLabeledEntry(
            _bi('Dispatch Cost Status', 'تكاليف الإرسال - الحالة'),
            _stringifyMmpValue(mapValue['cost_status']),
          );
          addLabeledEntry(
            _bi('Dispatch Cost Calculated By', 'تكاليف الإرسال - حسب'),
            _stringifyMmpValue(mapValue['calculated_by']),
          );
          addLabeledEntry(
            _bi('Dispatch Transport Cost', 'تكاليف الإرسال - نقل'),
            _stringifyMmpValue(mapValue['transportation_cost']),
          );
          addLabeledEntry(
            _bi('Dispatch Transport Budget', 'تكاليف الإرسال - ميزانية النقل'),
            _stringifyMmpValue(mapValue['transport_budget_total']),
          );
          return;
        }
      }

      // Handle CP Verification
      if (normalizedKey == 'cpverification') {
        final mapValue = _toMapValue(rawValue);
        if (mapValue != null) {
          final status = mapValue['status'] ?? 'unverified';
          final verifiedAt = mapValue['verified_at'] as String?;
          final verifiedBy = mapValue['verified_by'] as String?;

          addLabeledEntry(
            _bi('CP Verification Status', 'حالة التحقق من CP'),
            _stringifyMmpValue(status),
          );
          if (verifiedAt != null && verifiedAt.isNotEmpty) {
            try {
              final dt = DateTime.parse(verifiedAt);
              final formatted = _isArabic
                  ? '${dt.day}/${dt.month}/${dt.year} ${dt.hour}:${dt.minute.toString().padLeft(2, '0')}'
                  : '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
              addLabeledEntry(_bi('CP Verified At', 'تم التحقق في'), formatted);
            } catch (_) {}
          }
          if (verifiedBy != null && verifiedBy.isNotEmpty) {
            addLabeledEntry(
              _bi('CP Verified By', 'تم التحقق من قبل'),
              _userDisplayNamesById[verifiedBy] ?? verifiedBy,
            );
          }
          return;
        }
      }

      // Handle Expected Visit (Down Payment related)
      if (normalizedKey == 'expectedvisit') {
        final listValue = rawValue is List ? rawValue : null;
        if (listValue != null && listValue.isNotEmpty) {
          final mapValue = _toMapValue(listValue.first);
          if (mapValue != null) {
            final visitType = mapValue['type'] ?? 'range';
            final endDate =
                mapValue['end_date'] ?? mapValue['endDate'] as String?;
            final expectedDate =
                mapValue['expected_date'] ??
                mapValue['expectedDate'] as String?;
            final startDate =
                mapValue['start_date'] ?? mapValue['startDate'] as String?;

            try {
              if (visitType == 'range' &&
                  startDate != null &&
                  endDate != null) {
                final start = DateTime.parse(startDate);
                final end = DateTime.parse(endDate);
                final startFormatted = _isArabic
                    ? '${start.day}/${start.month}/${start.year}'
                    : '${start.year}-${start.month.toString().padLeft(2, '0')}-${start.day.toString().padLeft(2, '0')}';
                final endFormatted = _isArabic
                    ? '${end.day}/${end.month}/${end.year}'
                    : '${end.year}-${end.month.toString().padLeft(2, '0')}-${end.day.toString().padLeft(2, '0')}';

                addLabeledEntry(
                  _bi('Expected Visit Period', 'فترة الزيارة المتوقعة'),
                  _isArabic
                      ? '$startFormatted إلى $endFormatted'
                      : '$startFormatted to $endFormatted',
                );
              } else if (expectedDate != null) {
                final dt = DateTime.parse(expectedDate);
                final formatted = _isArabic
                    ? '${dt.day}/${dt.month}/${dt.year}'
                    : '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';

                addLabeledEntry(
                  _bi('Expected Visit Date', 'تاريخ الزيارة المتوقع'),
                  formatted,
                );
              }
            } catch (_) {}
          }
          return;
        }
      }

      final value = _stringifyMmpValue(rawValue);
      if (value.isEmpty) return;

      final normalized = normalizedKey;
      if (normalized.isEmpty || seen.contains(normalized)) return;

      seen.add(normalized);
      final label = _formatMmpKeyLabel(key);
      details.add(MapEntry(label, _enhanceMmpDetailValue(label, value)));
    }

    final preferredTopLevelKeys = <String>[
      'mmp_name',
      'mmp_file_name',
      'cp_name',
      'monitoring_by',
      'tool_to_be_used',
      'tools_to_be_used',
      'survey_tool',
      'main_activity',
      'activity_at_site',
      'activity_type',
      'activity',
      'use_market_diversion',
      'use_warehouse_monitoring',
      'market_diversion_monitoring',
      'warehouse_monitoring',
      'market_name',
      'warehouse_name',
      'whm_warehouse_name',
      'mmp_status',
    ];

    for (final key in preferredTopLevelKeys) {
      addEntry(key, siteData[key]);
      addEntry(key, additionalData[key]);
    }

    final excludedAdditionalPrefixes = <String>[
      'draft_',
      'visit_',
      'start_',
      'final_',
      'permit_',
      'state_permit_',
      'locality_permit_',
      'registry_',
      '_',
    ];

    final excludedAdditionalExact = <String>{
      'assigned_to',
      'assigned_at',
      'accepted_at',
      'accepted_by',
      'claimed_at',
      'claimed_by',
      'updated_at',
      'created_at',
    };

    final sortedAdditionalKeys = additionalData.keys.toList()..sort();
    for (final key in sortedAdditionalKeys) {
      final normalized = _normalizeLookupKey(key);
      if (normalized.isEmpty) continue;

      final isExcludedPrefix = excludedAdditionalPrefixes.any(
        (prefix) => key.startsWith(prefix),
      );
      if (isExcludedPrefix || excludedAdditionalExact.contains(key)) {
        continue;
      }

      addEntry(key, additionalData[key]);
    }

    return details;
  }

  void _loadDraftData() {
    final additionalData = _safeAdditionalData(widget.site['additional_data']);
    final mergedAdditional = additionalData ?? <String, dynamic>{};

    final marketDiversionRaw = _resolveMmpRawValue(
      siteData: widget.site,
      additionalData: mergedAdditional,
      exactKeys: const [
        'use_market_diversion',
        'use_market_diversion_monitoring',
        'market_diversion',
        'market_diversion_monitoring',
      ],
      normalizedKeys: const [
        'usemarketdiversion',
        'usemarketdiversionmonitoring',
        'marketdiversion',
        'marketdiversionmonitoring',
      ],
    );

    final warehouseMonitoringRaw = _resolveMmpRawValue(
      siteData: widget.site,
      additionalData: mergedAdditional,
      exactKeys: const [
        'use_warehouse_monitoring',
        'use_warehouse',
        'warehouse_monitoring',
        'warehouse_monitoring_flag',
      ],
      normalizedKeys: const [
        'usewarehousemonitoring',
        'usewarehouse',
        'warehousemonitoring',
        'warehousemonitoringflag',
      ],
    );

    _hasMarketDiversion = _isYesValue(marketDiversionRaw);
    _hasWarehouseMonitoring = _isYesValue(warehouseMonitoringRaw);

    // Reset auto-selection flag to allow re-processing restrictions on draft load
    _autoSelectionProcessed = false;
    _restrictionWarningShown = false;

    if (additionalData != null && additionalData.isNotEmpty) {
      _hasMarketDiversion =
          _hasMarketDiversion ||
          _isYesValue(additionalData['use_market_diversion']) ||
          _isYesValue(additionalData['use_market_diversion_monitoring']) ||
          _isYesValue(additionalData['market_diversion']) ||
          _isYesValue(additionalData['market_diversion_monitoring']);
      _hasWarehouseMonitoring =
          _hasWarehouseMonitoring ||
          _isYesValue(additionalData['use_warehouse_monitoring']) ||
          _isYesValue(additionalData['use_warehouse']) ||
          _isYesValue(additionalData['warehouse_monitoring']) ||
          _isYesValue(additionalData['warehouse_monitoring_flag']);

      _activitiesController.text = additionalData['draft_activities'] ?? '';
      _notesController.text = additionalData['draft_notes'] ?? '';
      _durationMinutes = additionalData['draft_visit_duration'] ?? 0;
      _selectedActivityType = additionalData['draft_activity_type'];
      final rawSelectedActivities = additionalData['draft_activity_types'];
      if (rawSelectedActivities is List) {
        for (final value in rawSelectedActivities) {
          final normalized = value.toString().trim().toUpperCase();
          if (normalized.isNotEmpty) {
            _selectedActivityTypes.add(normalized);
          }
        }
      }
      _warehouseName =
          (additionalData['draft_warehouse_name']?.toString() ??
                  additionalData['warehouse_name']?.toString() ??
                  additionalData['whm_warehouse_name']?.toString() ??
                  additionalData['warehouse']?.toString() ??
                  '')
              .trim();
      _marketNameController.text =
          (additionalData['draft_market_name']?.toString() ??
                  additionalData['mdm_market_name']?.toString() ??
                  additionalData['market_name']?.toString() ??
                  '')
              .trim();
      final additionalDraftPaths = additionalData['draft_photo_paths'];
      if (additionalDraftPaths is List) {
        for (final p in additionalDraftPaths) {
          if (p is String && p.trim().isNotEmpty) {
            _photoPaths.add(p.trim());
          }
        }
      }
      final draftQ =
          (additionalData['draft_pdm_questionnaires'] as num?)?.toInt() ?? 0;
      if (draftQ > 0) {
        _pdmQuestionnaires = draftQ;
        _pdmQController.text = draftQ.toString();
      }

      final rawCoords = additionalData['draft_coordinates'];
      if (rawCoords != null && rawCoords is Map) {
        final coords = Map<String, dynamic>.from(rawCoords);
        final lat = (coords['latitude'] as num?)?.toDouble() ?? 0.0;
        final lng = (coords['longitude'] as num?)?.toDouble() ?? 0.0;
        final acc = (coords['accuracy'] as num?)?.toDouble() ?? 0.0;
        _coordinates = Position(
          latitude: lat,
          longitude: lng,
          timestamp: DateTime.now(),
          accuracy: acc,
          altitude: 0.0,
          heading: 0.0,
          speed: 0.0,
          speedAccuracy: 0.0,
          altitudeAccuracy: 0.0,
          headingAccuracy: 0.0,
        );
        _locationEnabled = true;
      }
    }

    final siteId = widget.site['id']?.toString() ?? '';
    if (siteId.isNotEmpty) {
      try {
        final offlineDb = OfflineDb();
        final cached = offlineDb.getCachedItem(
          OfflineDb.siteCacheBox,
          'visit_draft_$siteId',
        );
        if (cached?.data != null) {
          final draft = cached!.data;
          if (draft['draft_activities'] != null) {
            _activitiesController.text =
                (draft['draft_activities'] as String?) ?? '';
          }
          if (draft['draft_notes'] != null) {
            _notesController.text = (draft['draft_notes'] as String?) ?? '';
          }
          if (draft['draft_visit_duration'] != null) {
            _durationMinutes =
                (draft['draft_visit_duration'] as num?)?.toInt() ?? 0;
          }
          if (draft['draft_activity_type'] != null) {
            _selectedActivityType = draft['draft_activity_type'] as String?;
          }
          final rawSelectedActivities = draft['draft_activity_types'];
          if (rawSelectedActivities is List) {
            for (final value in rawSelectedActivities) {
              final normalized = value.toString().trim().toUpperCase();
              if (normalized.isNotEmpty) {
                _selectedActivityTypes.add(normalized);
              }
            }
          }
          if (draft['draft_warehouse_name'] != null) {
            _warehouseName =
                (draft['draft_warehouse_name'] as String?)?.trim() ?? '';
          }
          if (draft['draft_market_name'] != null) {
            _marketNameController.text =
                (draft['draft_market_name'] as String?)?.trim() ?? '';
          }
          final draftQ2 =
              (draft['draft_pdm_questionnaires'] as num?)?.toInt() ?? 0;
          if (draftQ2 > 0) {
            _pdmQuestionnaires = draftQ2;
            _pdmQController.text = draftQ2.toString();
          }
          final rawCoords = draft['draft_coordinates'];
          if (rawCoords != null && rawCoords is Map) {
            final coords = Map<String, dynamic>.from(rawCoords);
            final lat = (coords['latitude'] as num?)?.toDouble() ?? 0.0;
            final lng = (coords['longitude'] as num?)?.toDouble() ?? 0.0;
            final acc = (coords['accuracy'] as num?)?.toDouble() ?? 0.0;
            _coordinates = Position(
              latitude: lat,
              longitude: lng,
              timestamp: DateTime.now(),
              accuracy: acc,
              altitude: 0.0,
              heading: 0.0,
              speed: 0.0,
              speedAccuracy: 0.0,
              altitudeAccuracy: 0.0,
              headingAccuracy: 0.0,
            );
            _locationEnabled = true;
          }
          final paths = draft['draft_photo_paths'] as List?;
          if (paths != null && paths.isNotEmpty) {
            for (final p in paths) {
              if (p is! String) continue;
              final normalizedPath = p.trim();
              if (normalizedPath.isEmpty) continue;

              if (kIsWeb) {
                _photoPaths.add(normalizedPath);
                continue;
              }

              if (File(normalizedPath).existsSync()) {
                _photoPaths.add(normalizedPath);
              }
            }
          }
        }
      } catch (e) {
        debugPrint('[_loadDraftData] Error loading local draft: $e');
      }
    }

    final availableActivities = _getAvailableActivities();
    if (availableActivities.isNotEmpty) {
      _selectedActivityTypes.removeWhere(
        (activity) => !availableActivities.contains(activity),
      );

      if (_selectedActivityType != null &&
          _selectedActivityType!.trim().isNotEmpty) {
        final normalizedPrimary = _selectedActivityType!.trim().toUpperCase();
        if (availableActivities.contains(normalizedPrimary)) {
          _selectedActivityTypes.add(normalizedPrimary);
          _selectedActivityType = normalizedPrimary;
        }
      }

      // Add base activity first if nothing is selected
      if (_selectedActivityTypes.isEmpty) {
        _selectedActivityTypes.add(availableActivities.first);
      }

      // Then auto-select additional required activities
      if (_hasMarketDiversion &&
          availableActivities.contains('MDM') &&
          !_selectedActivityTypes.contains('MDM')) {
        _selectedActivityTypes.add('MDM');
      }
      if (_hasWarehouseMonitoring &&
          availableActivities.contains('WHM') &&
          !_selectedActivityTypes.contains('WHM')) {
        _selectedActivityTypes.add('WHM');
      }

      if (_selectedActivityType == null ||
          !_selectedActivityTypes.contains(_selectedActivityType)) {
        _selectedActivityType = _selectedActivityTypes.first;
      }
    }

    final visitStartedAt = widget.site['visit_started_at'] as String?;
    if (visitStartedAt != null) {
      _visitStartTime = DateTime.tryParse(visitStartedAt);
    } else {
      _visitStartTime = DateTime.now();
    }
  }

  void _startVisitTimer() {
    if (_visitStartTime != null) {
      final now = DateTime.now();
      final duration = now.difference(_visitStartTime!);
      setState(() {
        _durationMinutes = duration.inMinutes;
      });

      Future.delayed(const Duration(minutes: 1), () {
        if (mounted) {
          _startVisitTimer();
        }
      });
    }
  }

  Future<void> _startLocationMonitoring() async {
    try {
      setState(() => _isGettingLocation = true);
      _locationError = null;

      final hasPermission = await LocationService.checkPermissions();
      if (!hasPermission) {
        setState(() {
          _isGettingLocation = false;
          _locationError = _isArabic
              ? 'تم رفض إذن الموقع'
              : 'Location permission denied';
        });
        return;
      }

      final position = await LocationService.getCurrentLocation();
      if (position != null) {
        setState(() {
          _coordinates = position;
          _locationEnabled = true;
          _isGettingLocation = false;
        });
      }

      _positionStream =
          Geolocator.getPositionStream(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              distanceFilter: 10,
            ),
          ).listen((position) {
            setState(() {
              _coordinates = position;
              _locationEnabled = true;
            });
          });
    } catch (e) {
      setState(() {
        _isGettingLocation = false;
        _locationError = e.toString();
      });
    }
  }

  Future<void> _refreshLocation() async {
    setState(() => _isGettingLocation = true);
    try {
      final position = await LocationService.getCurrentLocation();
      if (position != null) {
        setState(() {
          _coordinates = position;
          _locationEnabled = true;
          _isGettingLocation = false;
        });
      } else {
        setState(() {
          _isGettingLocation = false;
          _locationError = _isArabic
              ? 'تعذر الحصول على الموقع'
              : 'Could not get location';
        });
      }
    } catch (e) {
      setState(() {
        _isGettingLocation = false;
        _locationError = e.toString();
      });
    }
  }

  Future<void> _addPhoto() async {
    final ImagePicker picker = ImagePicker();

    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: Text(_bi('Take Photo', 'التقاط صورة')),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: Text(_bi('Choose from Gallery', 'اختيار من المعرض')),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );

    if (source == null) return;

    try {
      final XFile? image = await picker.pickImage(
        source: source,
        imageQuality: 85,
        maxWidth: 1920,
      );

      if (image != null) {
        setState(() {
          _photoPaths.add(image.path);
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isArabic
                  ? 'خطأ في اختيار الصورة: $e'
                  : 'Error picking image: $e',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _removePhoto(int index) {
    setState(() {
      _photoPaths.removeAt(index);
    });
  }

  String _formatDuration(int minutes) {
    final hours = minutes ~/ 60;
    final mins = minutes % 60;
    if (hours > 0) {
      return _isArabic ? '$hoursس $minsد' : '${hours}h ${mins}m';
    }
    return _isArabic ? '$minsد' : '${mins}m';
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (!_locationEnabled || _coordinates == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _bi(
              'Final location is required. Please tap Retry to capture location.',
              'الموقع النهائي مطلوب. يرجى الضغط على إعادة المحاولة لالتقاط الموقع.',
            ),
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_activitiesController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isArabic
                ? 'يرجى وصف الأنشطة التي تمت خلال الزيارة.'
                : 'Please describe the activities performed during the visit.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_showActivitySelector() && _selectedActivityTypes.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _bi(
              'Please select at least one activity',
              'يرجى اختيار نشاط واحد على الأقل',
            ),
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_isActivitySelected('MDM') &&
        _marketNameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isArabic
                ? 'يرجى إدخال اسم السوق لأنشطة رصد انحراف السوق.'
                : 'Please enter the market name for Market Diversion Monitoring.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_isActivitySelected('WHM') && _warehouseName.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isArabic
                ? 'يرجى إدخال اسم المستودع لأنشطة رصد المستودع.'
                : 'Please enter the warehouse name for Warehouse Monitoring.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_photoPaths.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isArabic
                ? 'مطلوب صورة واحدة على الأقل لإكمال زيارة الموقع.'
                : 'At least one photo is required to complete the site visit.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final reportData = VisitReportData(
        activities: _activitiesController.text.trim(),
        notes: _notesController.text.trim(),
        photos: _photoPaths,
        durationMinutes: _durationMinutes,
        coordinates: _coordinates,
        activityType: _selectedActivityType,
        selectedActivityTypes: _selectedActivityTypes.toList(),
        pdmQuestionnaires: _pdmQuestionnaires,
        hasMarketDiversion: _hasMDM,
        marketName: _marketNameController.text.trim().isEmpty
            ? null
            : _marketNameController.text.trim(),
        warehouseName: _warehouseName.trim().isEmpty
            ? null
            : _warehouseName.trim(),
      );

      if (mounted) {
        Navigator.of(context).pop(reportData);
      }
    } catch (e) {
      debugPrint('Error submitting report: $e');
      if (mounted) {
        setState(() => _isSubmitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${_bi('Error', 'خطأ')}: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _saveDraft() async {
    final siteId = widget.site['id']?.toString() ?? '';
    if (siteId.isEmpty) return;

    try {
      final draft = <String, dynamic>{
        'draft_activities': _activitiesController.text.trim(),
        'draft_notes': _notesController.text.trim(),
        'draft_visit_duration': _durationMinutes,
        'draft_photo_paths': List<String>.from(_photoPaths),
        'draft_activity_type': _selectedActivityType,
        'draft_activity_types': _selectedActivityTypes.toList(),
        'draft_warehouse_name': _warehouseName.trim(),
        'draft_market_name': _marketNameController.text.trim(),
        if (_pdmQuestionnaires > 0)
          'draft_pdm_questionnaires': _pdmQuestionnaires,
      };
      if (_coordinates != null) {
        draft['draft_coordinates'] = {
          'latitude': _coordinates!.latitude,
          'longitude': _coordinates!.longitude,
          'accuracy': _coordinates!.accuracy,
        };
      }

      final offlineDb = OfflineDb();
      await offlineDb.cacheItem(
        OfflineDb.siteCacheBox,
        'visit_draft_$siteId',
        data: draft,
        ttl: const Duration(days: 30),
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isArabic
                  ? 'تم حفظ المسودة. يمكنك المتابعة لاحقاً.'
                  : 'Draft saved. You can continue later.',
            ),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      debugPrint('Error saving draft: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${_bi('Could not save draft', 'تعذر حفظ المسودة')}: ${e.toString()}',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final siteName =
        widget.site['site_name'] ??
        widget.site['siteName'] ??
        _bi('Unknown Site', 'موقع غير معروف');
    final siteCode =
        widget.site['site_code'] ??
        widget.site['siteCode'] ??
        widget.site['id']?.toString().substring(0, 8) ??
        '';
    final locality = widget.site['locality'] ?? '';
    final state = widget.site['state'] ?? '';

    return Directionality(
      textDirection: _isArabic ? TextDirection.rtl : TextDirection.ltr,
      child: Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: Container(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.92,
            maxWidth: 500,
          ),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.15),
                blurRadius: 30,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Professional Header with Gradient
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF1976D2), Color(0xFF1565C0)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(24),
                    topRight: Radius.circular(24),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: const BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.check_circle,
                            color: Color(0xFF1976D2),
                            size: 28,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _isArabic
                                    ? 'إكمال زيارة الموقع'
                                    : 'Complete Site Visit',
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                siteName,
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: Colors.white70,
                                  fontWeight: FontWeight.w500,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              Expanded(
                child: Form(
                  key: _formKey,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildLocationStatusCard(),

                        const SizedBox(height: 20),

                        _buildMmpDetailsCard(),

                        const SizedBox(height: 20),

                        _buildSiteInfoCard(siteCode, locality, state),

                        const SizedBox(height: 20),

                        _buildActivityTypeSelector(),

                        const SizedBox(height: 20),

                        _buildActivitiesField(),

                        const SizedBox(height: 20),

                        _buildNotesField(),

                        const SizedBox(height: 20),

                        _buildPhotosSection(),
                      ],
                    ),
                  ),
                ),
              ),

              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: Colors.grey.withOpacity(0.1)),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _isSubmitting
                            ? null
                            : () => Navigator.of(context).pop(),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          side: BorderSide(
                            color: Colors.grey.withOpacity(0.3),
                            width: 1.5,
                          ),
                        ),
                        child: Text(
                          _bi('Cancel', 'إلغاء'),
                          maxLines: 2,
                          softWrap: true,
                          textAlign: TextAlign.center,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: const Color(0xFF333333),
                            height: 1.2,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _isSubmitting ? null : _saveDraft,
                        icon: const Icon(Icons.save_outlined, size: 18),
                        label: Text(
                          _bi('Draft', 'مسودة'),
                          maxLines: 2,
                          softWrap: true,
                          textAlign: TextAlign.center,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            height: 1.2,
                          ),
                        ),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFFF9800),
                          side: const BorderSide(
                            color: Color(0xFFFF9800),
                            width: 1.5,
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton.icon(
                        onPressed: _isSubmitting ? null : _submit,
                        icon: _isSubmitting
                            ? const SizedBox.shrink()
                            : const Icon(Icons.check_circle, size: 20),
                        label: _isSubmitting
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation<Color>(
                                    Colors.white,
                                  ),
                                ),
                              )
                            : Text(
                                _bi('Complete Visit', 'إكمال الزيارة'),
                                maxLines: 2,
                                softWrap: true,
                                textAlign: TextAlign.center,
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  height: 1.2,
                                ),
                              ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1976D2),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          elevation: 2,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActivityTypeSelector() {
    final availableActivities = _getAvailableActivities();
    final hasPDMSelected = _isActivitySelected('PDM');
    final hasMDMSelected = _isActivitySelected('MDM');
    final hasWHMSelected = _isActivitySelected('WHM');

    if (availableActivities.isEmpty) {
      return const SizedBox.shrink();
    }

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFF8F9FA),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.withOpacity(0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _isArabic ? 'نوع النشاط *' : 'ACTIVITY TYPE *',
            style: GoogleFonts.poppins(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: const Color(0xFF666666),
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 6),
          // Only show restriction message if MDM/WHM are actually selected
          if (_hasMarketDiversion && hasMDMSelected)
            Text(
              _isArabic
                  ? 'تم قفل النشاط الأساسي و MDM - لا يمكن تغييرهما'
                  : 'Base activity and MDM are locked - cannot be changed',
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: Colors.deepOrange.shade700,
                fontWeight: FontWeight.w500,
              ),
            )
          else if (_hasWarehouseMonitoring && hasWHMSelected)
            Text(
              _isArabic
                  ? 'تم قفل النشاط الأساسي و WHM - لا يمكن تغييرهما'
                  : 'Base activity and WHM are locked - cannot be changed',
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: Colors.deepOrange.shade700,
                fontWeight: FontWeight.w500,
              ),
            )
          else
            Text(
              _isArabic
                  ? 'يمكنك اختيار نشاط واحد أو أكثر'
                  : 'You can select one or multiple activities',
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: Colors.grey.shade600,
                fontWeight: FontWeight.w500,
              ),
            ),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            children: availableActivities.map((key) {
              final isSelected = _isActivitySelected(key);
              final isMDM = key == 'MDM';
              final isPDM = key == 'PDM';
              final isGFA = key == 'GFA';
              final isWHM = key == 'WHM';
              final isBaseActivity = key == _baseActivityCode;

              Color chipColor = const Color(0xFFFF9800); // Orange default
              if (isMDM) chipColor = const Color(0xFF1976D2); // Blue for MDM
              if (isPDM) chipColor = const Color(0xFFFF9800); // Orange for PDM
              if (isGFA) chipColor = AppColors.primaryOrange; // Orange for GFA
              if (isWHM) chipColor = Colors.purple.shade600; // Purple for WHM

              final enText = _activityTypesEn[key] ?? '';
              final arText = _activityTypesAr[key] ?? '';
              return GestureDetector(
                onTap: () async {
                  final wasSelected = _selectedActivityTypes.contains(key);
                  final isTSFP = _normalizedMainActivity == 'TSFP';
                  final hasMarketDiversionRestriction = _hasMarketDiversion;
                  final hasWarehouseMonitoringRestriction =
                      _hasWarehouseMonitoring;

                  // CONFIRMATION DIALOG: When selecting MDM in TSFP with Market Diversion enabled
                  if (!wasSelected &&
                      key == 'MDM' &&
                      isTSFP &&
                      hasMarketDiversionRestriction) {
                    final confirmed =
                        await showDialog<bool>(
                          context: context,
                          barrierDismissible: false,
                          builder: (ctx) => AlertDialog(
                            title: Text(
                              _isArabic
                                  ? 'تأكيد رصد انحراف السوق'
                                  : 'Confirm Market Diversion Monitoring',
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            content: Text(
                              _isArabic
                                  ? 'هل أنت متأكد أنك تريد تغطية رصد انحراف السوق (MDM) في زيارة موقع TSFP؟\n\nسيؤدي هذا إلى قفل النشاط الأساسي و MDM.'
                                  : 'Are you sure you want to cover Market Diversion Monitoring (MDM) in TSFP site visit?\n\nThis will lock the base activity and MDM.',
                              style: GoogleFonts.poppins(fontSize: 14),
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(ctx, false),
                                child: Text(
                                  _isArabic ? 'لا' : 'No',
                                  style: GoogleFonts.poppins(
                                    color: Colors.grey,
                                  ),
                                ),
                              ),
                              ElevatedButton(
                                onPressed: () => Navigator.pop(ctx, true),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.deepOrange.shade600,
                                ),
                                child: Text(
                                  _isArabic ? 'أيضاً' : 'Yes',
                                  style: GoogleFonts.poppins(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ) ??
                        false;

                    if (!confirmed) {
                      return;
                    }
                  }

                  // CONFIRMATION DIALOG: When selecting WHM in TSFP with Warehouse Monitoring enabled
                  if (!wasSelected &&
                      key == 'WHM' &&
                      isTSFP &&
                      hasWarehouseMonitoringRestriction) {
                    final confirmed =
                        await showDialog<bool>(
                          context: context,
                          barrierDismissible: false,
                          builder: (ctx) => AlertDialog(
                            title: Text(
                              _isArabic
                                  ? 'تأكيد رصد المستودع'
                                  : 'Confirm Warehouse Monitoring',
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            content: Text(
                              _isArabic
                                  ? 'هل أنت متأكد أنك تريد تغطية رصد المستودع (WHM) في زيارة موقع TSFP؟\n\nسيؤدي هذا إلى قفل النشاط الأساسي و WHM.'
                                  : 'Are you sure you want to cover Warehouse Monitoring (WHM) in TSFP site visit?\n\nThis will lock the base activity and WHM.',
                              style: GoogleFonts.poppins(fontSize: 14),
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(ctx, false),
                                child: Text(
                                  _isArabic ? 'لا' : 'No',
                                  style: GoogleFonts.poppins(
                                    color: Colors.grey,
                                  ),
                                ),
                              ),
                              ElevatedButton(
                                onPressed: () => Navigator.pop(ctx, true),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.deepOrange.shade600,
                                ),
                                child: Text(
                                  _isArabic ? 'أيضاً' : 'Yes',
                                  style: GoogleFonts.poppins(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ) ??
                        false;

                    if (!confirmed) {
                      return;
                    }
                  }

                  // MARKET DIVERSION RESTRICTIONS: Lock both base activity and MDM (only after selection)
                  if (hasMarketDiversionRestriction &&
                      _selectedActivityTypes.contains('MDM')) {
                    // Prevent selecting other activities
                    if (key != 'MDM' && !isBaseActivity) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            _isArabic
                                ? '❌ انحراف السوق مطلوب - يمكن تحديد النشاط الأساسي و MDM فقط'
                                : '❌ Market Diversion required - Only base activity and MDM are allowed',
                          ),
                          duration: const Duration(seconds: 3),
                          backgroundColor: Colors.deepOrange.shade700,
                          behavior: SnackBarBehavior.floating,
                          margin: const EdgeInsets.all(16),
                        ),
                      );
                      return;
                    }
                    // Prevent deselecting base activity when market diversion is required
                    if (isBaseActivity &&
                        _selectedActivityTypes.contains(key)) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            _isArabic
                                ? '🔒 لا يمكن إلغاء تحديد النشاط الأساسي - انحراف السوق مطلوب'
                                : '🔒 Cannot deselect base activity - Market Diversion is required',
                          ),
                          duration: const Duration(seconds: 3),
                          backgroundColor: Colors.deepOrange.shade700,
                          behavior: SnackBarBehavior.floating,
                          margin: const EdgeInsets.all(16),
                        ),
                      );
                      return;
                    }
                    // Prevent deselecting MDM when market diversion is required
                    if (key == 'MDM' &&
                        _selectedActivityTypes.contains('MDM')) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            _isArabic
                                ? '🔒 لا يمكن إلغاء تحديد MDM - انحراف السوق مطلوب'
                                : '🔒 Cannot deselect MDM - Market Diversion is required',
                          ),
                          duration: const Duration(seconds: 3),
                          backgroundColor: Colors.deepOrange.shade700,
                          behavior: SnackBarBehavior.floating,
                          margin: const EdgeInsets.all(16),
                        ),
                      );
                      return;
                    }
                  }

                  // WAREHOUSE MONITORING RESTRICTIONS: Lock both base activity and WHM (only after selection)
                  if (hasWarehouseMonitoringRestriction &&
                      _selectedActivityTypes.contains('WHM')) {
                    // Prevent selecting other activities
                    if (key != 'WHM' && !isBaseActivity) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            _isArabic
                                ? '❌ مراقبة المستودع مطلوبة - يمكن تحديد النشاط الأساسي و WHM فقط'
                                : '❌ Warehouse Monitoring required - Only base activity and WHM are allowed',
                          ),
                          duration: const Duration(seconds: 3),
                          backgroundColor: Colors.deepOrange.shade700,
                          behavior: SnackBarBehavior.floating,
                          margin: const EdgeInsets.all(16),
                        ),
                      );
                      return;
                    }
                    // Prevent deselecting base activity when warehouse monitoring is required
                    if (isBaseActivity &&
                        _selectedActivityTypes.contains(key)) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            _isArabic
                                ? '🔒 لا يمكن إلغاء تحديد النشاط الأساسي - مراقبة المستودع مطلوبة'
                                : '🔒 Cannot deselect base activity - Warehouse Monitoring is required',
                          ),
                          duration: const Duration(seconds: 3),
                          backgroundColor: Colors.deepOrange.shade700,
                          behavior: SnackBarBehavior.floating,
                          margin: const EdgeInsets.all(16),
                        ),
                      );
                      return;
                    }
                    // Prevent deselecting WHM when warehouse monitoring is required
                    if (key == 'WHM' &&
                        _selectedActivityTypes.contains('WHM')) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            _isArabic
                                ? '🔒 لا يمكن إلغاء تحديد WHM - مراقبة المستودع مطلوبة'
                                : '🔒 Cannot deselect WHM - Warehouse Monitoring is required',
                          ),
                          duration: const Duration(seconds: 3),
                          backgroundColor: Colors.deepOrange.shade700,
                          behavior: SnackBarBehavior.floating,
                          margin: const EdgeInsets.all(16),
                        ),
                      );
                      return;
                    }
                  }

                  // Normal activity selection/deselection
                  setState(() {
                    if (wasSelected) {
                      _selectedActivityTypes.remove(key);
                      if (key == 'PDM') {
                        _pdmQuestionnaires = 0;
                        _pdmQController.clear();
                      }
                      if (key == 'MDM') {
                        _marketNameController.clear();
                      }
                      if (key == 'WHM') {
                        _warehouseName = '';
                      }

                      if (_selectedActivityType == key) {
                        _selectedActivityType =
                            _selectedActivityTypes.isNotEmpty
                            ? _selectedActivityTypes.first
                            : null;
                      }
                    } else {
                      _selectedActivityTypes.add(key);
                      _selectedActivityType = key;
                    }
                  });
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(
                    vertical: 12,
                    horizontal: 8,
                  ),
                  decoration: BoxDecoration(
                    color:
                        (_hasMarketDiversion &&
                                (key == 'MDM' || isBaseActivity)) ||
                            (_hasWarehouseMonitoring &&
                                (key == 'WHM' || isBaseActivity))
                        ? (isSelected ? chipColor : Colors.blueGrey.shade50)
                        : (_hasMarketDiversion &&
                                  key != 'MDM' &&
                                  !isBaseActivity) ||
                              (_hasWarehouseMonitoring &&
                                  key != 'WHM' &&
                                  !isBaseActivity)
                        ? Colors.grey.shade200
                        : isSelected
                        ? chipColor
                        : Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color:
                          (_hasMarketDiversion &&
                                  (key == 'MDM' || isBaseActivity)) ||
                              (_hasWarehouseMonitoring &&
                                  (key == 'WHM' || isBaseActivity))
                          ? (isSelected ? chipColor : Colors.blueGrey.shade300)
                          : (_hasMarketDiversion &&
                                    key != 'MDM' &&
                                    !isBaseActivity) ||
                                (_hasWarehouseMonitoring &&
                                    key != 'WHM' &&
                                    !isBaseActivity)
                          ? Colors.grey.shade400
                          : isSelected
                          ? chipColor
                          : Colors.grey.shade300,
                      width: isSelected ? 2 : 1.5,
                    ),
                    boxShadow:
                        isSelected &&
                            !((_hasMarketDiversion &&
                                    (key == 'MDM' || isBaseActivity)) ||
                                (_hasWarehouseMonitoring &&
                                    (key == 'WHM' || isBaseActivity)))
                        ? [
                            BoxShadow(
                              color: chipColor.withOpacity(0.2),
                              blurRadius: 8,
                              offset: const Offset(0, 3),
                            ),
                          ]
                        : [],
                  ),
                  child: Stack(
                    children: [
                      Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            isMDM
                                ? Icons.store_outlined
                                : isPDM
                                ? Icons.fact_check_outlined
                                : isWHM
                                ? Icons.warehouse_outlined
                                : Icons.shopping_bag_outlined,
                            size: 24,
                            color:
                                (_hasMarketDiversion &&
                                        (key == 'MDM' || isBaseActivity)) ||
                                    (_hasWarehouseMonitoring &&
                                        (key == 'WHM' || isBaseActivity))
                                ? (isSelected
                                      ? Colors.white
                                      : chipColor.withOpacity(0.7))
                                : (_hasMarketDiversion &&
                                          key != 'MDM' &&
                                          !isBaseActivity) ||
                                      (_hasWarehouseMonitoring &&
                                          key != 'WHM' &&
                                          !isBaseActivity)
                                ? Colors.grey.shade600
                                : isSelected
                                ? Colors.white
                                : chipColor,
                          ),
                          const SizedBox(height: 6),
                          // Activity code (GFA, CBT, etc.)
                          Text(
                            key,
                            style: GoogleFonts.poppins(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color:
                                  (_hasMarketDiversion &&
                                          (key == 'MDM' || isBaseActivity)) ||
                                      (_hasWarehouseMonitoring &&
                                          (key == 'WHM' || isBaseActivity))
                                  ? (isSelected
                                        ? Colors.white
                                        : chipColor.withOpacity(0.7))
                                  : (_hasMarketDiversion &&
                                            key != 'MDM' &&
                                            !isBaseActivity) ||
                                        (_hasWarehouseMonitoring &&
                                            key != 'WHM' &&
                                            !isBaseActivity)
                                  ? Colors.grey.shade600
                                  : isSelected
                                  ? Colors.white
                                  : chipColor,
                            ),
                          ),
                          const SizedBox(height: 2),
                          // English Description
                          Text(
                            enText,
                            textAlign: TextAlign.center,
                            style: GoogleFonts.poppins(
                              fontSize: 8,
                              height: 1.1,
                              fontWeight: FontWeight.w500,
                              color:
                                  (_hasMarketDiversion &&
                                          (key == 'MDM' || isBaseActivity)) ||
                                      (_hasWarehouseMonitoring &&
                                          (key == 'WHM' || isBaseActivity))
                                  ? (isSelected
                                        ? Colors.white.withValues(alpha: 0.9)
                                        : Colors.grey.shade600)
                                  : (_hasMarketDiversion &&
                                            key != 'MDM' &&
                                            !isBaseActivity) ||
                                        (_hasWarehouseMonitoring &&
                                            key != 'WHM' &&
                                            !isBaseActivity)
                                  ? Colors.grey.shade500
                                  : isSelected
                                  ? Colors.white.withValues(alpha: 0.9)
                                  : Colors.grey.shade700,
                            ),
                          ),
                          const SizedBox(height: 1),
                          // Arabic Description
                          Text(
                            arText,
                            textAlign: TextAlign.center,
                            style: GoogleFonts.poppins(
                              fontSize: 7.5,
                              height: 1.1,
                              fontWeight: FontWeight.w400,
                              color:
                                  (_hasMarketDiversion &&
                                          (key == 'MDM' || isBaseActivity)) ||
                                      (_hasWarehouseMonitoring &&
                                          (key == 'WHM' || isBaseActivity))
                                  ? (isSelected
                                        ? Colors.white.withValues(alpha: 0.8)
                                        : Colors.grey.shade600)
                                  : (_hasMarketDiversion &&
                                            key != 'MDM' &&
                                            !isBaseActivity) ||
                                        (_hasWarehouseMonitoring &&
                                            key != 'WHM' &&
                                            !isBaseActivity)
                                  ? Colors.grey.shade500
                                  : isSelected
                                  ? Colors.white.withValues(alpha: 0.8)
                                  : Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                      // Lock icon overlay for restricted activities (base activity + MDM/WHM when required)
                      if ((_hasMarketDiversion &&
                              (key == 'MDM' || isBaseActivity)) ||
                          (_hasWarehouseMonitoring &&
                              (key == 'WHM' || isBaseActivity)))
                        Positioned(
                          top: 4,
                          right: 4,
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: Colors.deepOrange.shade600,
                              borderRadius: BorderRadius.circular(4),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.deepOrange.shade600.withOpacity(
                                    0.3,
                                  ),
                                  blurRadius: 4,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: const Icon(
                              Icons.lock_rounded,
                              size: 13,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      // Disabled icon for other activities when restrictions apply
                      if ((_hasMarketDiversion &&
                              key != 'MDM' &&
                              !isBaseActivity) ||
                          (_hasWarehouseMonitoring &&
                              key != 'WHM' &&
                              !isBaseActivity))
                        Positioned(
                          top: 4,
                          right: 4,
                          child: Container(
                            padding: const EdgeInsets.all(3),
                            decoration: BoxDecoration(
                              color: Colors.grey.shade400,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Icon(
                              Icons.lock,
                              size: 12,
                              color: Colors.white,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),

          // ── Fee Information Section for PDM/MDM ─────────────────────────────
          if (hasPDMSelected || hasMDMSelected) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: hasPDMSelected && !hasMDMSelected
                    ? Colors.orange.shade50
                    : Colors.blue.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: hasPDMSelected && !hasMDMSelected
                      ? Colors.orange.shade200
                      : Colors.blue.shade200,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.info_rounded,
                    size: 18,
                    color: hasPDMSelected && !hasMDMSelected
                        ? Colors.orange.shade700
                        : Colors.blue.shade700,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _bi('Enumerator Fee Note', 'ملاحظة رسوم الفنيين'),
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: hasPDMSelected && !hasMDMSelected
                                ? Colors.orange.shade900
                                : Colors.blue.shade900,
                          ),
                        ),
                        const SizedBox(height: 4),
                        if (hasPDMSelected && !hasMDMSelected)
                          Text(
                            _bi(
                              'Your enumerator fee will be calculated based on questionnaires submitted. Every 7 questionnaires = 1 visit fee',
                              'سيتم احتساب أتعابك بناءً على عدد الاستبيانات المقدمة. كل 7 استبيانات = رسم زيارة واحد',
                            ),
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: hasPDMSelected && !hasMDMSelected
                                  ? Colors.orange.shade700
                                  : Colors.blue.shade700,
                              height: 1.3,
                            ),
                          )
                        else
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _bi(
                                  '⚠️ If site has 2 activities (e.g., GFA + MDM):',
                                  '⚠️ في حالة وجود نشاطين (مثل: GFA + MDM):',
                                ),
                                style: GoogleFonts.poppins(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: hasPDMSelected && !hasMDMSelected
                                      ? Colors.orange.shade900
                                      : Colors.blue.shade900,
                                  height: 1.4,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _bi(
                                  '1️⃣ You MUST confirm with supervisor & coordinator first\n2️⃣ Clearly: Will you cover 2 activities at this site?\n3️⃣ Without confirmation = Only 1 site fee allowed',
                                  '1️⃣ يجب عليك تأكيد الموافقة مع المشرف والمنسق أولاً\n2️⃣ بوضوح: هل سيتم تغطية كلا النشاطين في هذه الزيارة؟\n3️⃣ بدون تأكيد = زيارة موقع واحدة فقط مسموح',
                                ),
                                style: GoogleFonts.poppins(
                                  fontSize: 9.5,
                                  color: Colors.red.shade700,
                                  height: 1.5,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],

          // ── PDM: questionnaire count input ────────────────────────────────
          if (hasPDMSelected) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.orange.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.quiz_outlined,
                        size: 15,
                        color: Colors.orange.shade700,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        _bi(
                          'Questionnaires Submitted *',
                          'عدد الاستبيانات المقدمة *',
                        ),
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                          color: Colors.orange.shade800,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    _bi(
                      'Every 7 questionnaires = 1 site visit fee',
                      'كل 7 استبيانات = زيارة موقع واحدة',
                    ),
                    style: GoogleFonts.poppins(
                      fontSize: 10,
                      color: Colors.orange.shade600,
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _pdmQController,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      hintText: _bi('Enter count', 'أدخل العدد'),
                      hintStyle: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w400,
                        color: const Color(0xFF8C8C8C),
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      isDense: true,
                      filled: true,
                      fillColor: Colors.white,
                    ),
                    onChanged: (v) => setState(() {
                      _pdmQuestionnaires = int.tryParse(v) ?? 0;
                    }),
                  ),
                  if (_pdmQuestionnaires > 0) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.orange.shade100,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '$_pdmQuestionnaires ÷ $_pdmQPerVisit = $_pdmSiteVisits ${_isArabic ? 'زيارة مدفوعة' : 'site visit fee(s)'}',
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                              color: Colors.orange.shade900,
                            ),
                          ),
                          if (_pdmRemainder > 0)
                            Text(
                              _isArabic
                                  ? '$_pdmRemainder/$_pdmQPerVisit نحو الزيارة التالية'
                                  : '$_pdmRemainder/$_pdmQPerVisit toward next visit',
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                color: Colors.orange.shade700,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],

          // ── MDM: market name + 2-visit badge ─────────────────────────────
          if (hasMDMSelected) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.blue.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.store_outlined,
                        size: 15,
                        color: Colors.blue.shade700,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _bi(
                            'Market Diversion Monitoring — × 2 visits',
                            'رصد انحراف السوق — × ٢ زيارة',
                          ),
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            color: Colors.blue.shade800,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.blue.shade600,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _isArabic ? '× ٢' : '× 2',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _bi('Market Name Covered *', 'اسم السوق المُغطى *'),
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      fontSize: 11,
                      color: Colors.blue.shade800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _marketNameController,
                    decoration: InputDecoration(
                      hintText: _bi(
                        'Enter market name...',
                        'أدخل اسم السوق...',
                      ),
                      hintStyle: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w400,
                        color: const Color(0xFF8C8C8C),
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      isDense: true,
                      filled: true,
                      fillColor: Colors.white,
                      prefixIcon: Icon(
                        Icons.storefront,
                        size: 18,
                        color: Colors.blue.shade400,
                      ),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ],
              ),
            ),
          ],

          // ── WHM: warehouse name + 2-visit badge ─────────────────────────
          if (hasWHMSelected) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.purple.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.purple.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.warehouse_outlined,
                        size: 15,
                        color: Colors.purple.shade700,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _bi(
                            'Warehouse Monitoring — × 2 visits',
                            'رصد المستودع — × ٢ زيارة',
                          ),
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            color: Colors.purple.shade800,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.purple.shade600,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _isArabic ? '× ٢' : '× 2',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _bi('Warehouse Name *', 'اسم المستودع *'),
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      fontSize: 11,
                      color: Colors.purple.shade800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextFormField(
                    textDirection: _isArabic
                        ? TextDirection.rtl
                        : TextDirection.ltr,
                    initialValue: _warehouseName,
                    decoration: InputDecoration(
                      hintText: _bi(
                        'Enter warehouse name...',
                        'أدخل اسم المستودع...',
                      ),
                      hintStyle: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w400,
                        color: const Color(0xFF8C8C8C),
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      isDense: true,
                      filled: true,
                      fillColor: Colors.white,
                      prefixIcon: Icon(
                        Icons.home_work_outlined,
                        size: 18,
                        color: Colors.purple.shade400,
                      ),
                    ),
                    onChanged: (value) => setState(() {
                      _warehouseName = value;
                    }),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildLocationStatusCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.backgroundGray,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color:
                          _coordinates != null && (_coordinates!.accuracy <= 10)
                          ? Colors.black
                          : Colors.black.withValues(alpha: 0.3),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.navigation,
                      color: _coordinates != null
                          ? Colors.white
                          : Colors.white.withValues(alpha: 0.5),
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _isArabic ? 'حالة الموقع' : 'Location Status',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: AppColors.textDark,
                        ),
                      ),
                      if (_coordinates != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          _bi(
                            'Accuracy: ${_coordinates!.accuracy.toStringAsFixed(1)}m',
                            'الدقة: ${_coordinates!.accuracy.toStringAsFixed(1)}م',
                          ),
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: _coordinates!.accuracy <= 10
                                ? Colors.green
                                : Colors.orange,
                          ),
                        ),
                      ] else if (_locationError != null)
                        Text(
                          _locationError!,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.red,
                          ),
                        )
                      else if (_isGettingLocation)
                        Text(
                          _bi(
                            'Getting location...',
                            'جاري الحصول على الموقع...',
                          ),
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: AppColors.textLight,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          if (_coordinates == null && !_isGettingLocation) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _refreshLocation,
                icon: const Icon(Icons.refresh, size: 18),
                label: Text(_bi('Retry', 'إعادة المحاولة')),
                style: OutlinedButton.styleFrom(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.timer, size: 18, color: Colors.black54),
                  const SizedBox(width: 8),
                  Text(
                    _bi('Visit Duration', 'مدة الزيارة'),
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: AppColors.textLight,
                    ),
                  ),
                ],
              ),
              Text(
                _formatDuration(_durationMinutes),
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textDark,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMmpDetailsCard() {
    final siteData = _mergedSiteDataForMmp();
    final additionalData =
        _safeAdditionalData(siteData['additional_data']) ?? <String, dynamic>{};
    final toolsToBeUsed = _resolveMmpValue(
      siteData: siteData,
      additionalData: additionalData,
      exactKeys: const [
        'tool_to_be_used',
        'tool_to_be_use',
        'tools_to_be_used',
        'tools_to_be_use',
        'survey_tool',
        'tool_used',
        'tool',
      ],
      normalizedKeys: const [
        'tooltobeused',
        'tooltobeuse',
        'toolstobeused',
        'toolstobeuse',
        'surveytool',
        'toolused',
        'tool',
      ],
    );
    final mainActivity = _resolveMmpValue(
      siteData: siteData,
      additionalData: additionalData,
      exactKeys: const [
        'main_activity',
        'activity_at_site',
        'activity_type',
        'activity',
      ],
      normalizedKeys: const [
        'mainactivity',
        'activityatsite',
        'activitytype',
        'activity',
      ],
    ).toUpperCase();
    final mmpStatus = _resolveMmpValue(
      siteData: siteData,
      additionalData: additionalData,
      exactKeys: const ['mmp_status', 'status'],
      normalizedKeys: const ['mmpstatus', 'status'],
    );
    final uploadedDetails = _collectMmpUploadedDetails(
      siteData,
      additionalData,
    );

    final marketDiversionRaw = _resolveMmpRawValue(
      siteData: siteData,
      additionalData: additionalData,
      exactKeys: const [
        'use_market_diversion',
        'use_market_diversion_monitoring',
        'market_diversion',
        'market_diversion_monitoring',
      ],
      normalizedKeys: const [
        'usemarketdiversion',
        'usemarketdiversionmonitoring',
        'marketdiversion',
        'marketdiversionmonitoring',
      ],
    );

    final warehouseMonitoringRaw = _resolveMmpRawValue(
      siteData: siteData,
      additionalData: additionalData,
      exactKeys: const [
        'use_warehouse_monitoring',
        'use_warehouse',
        'warehouse_monitoring',
        'warehouse_monitoring_flag',
      ],
      normalizedKeys: const [
        'usewarehousemonitoring',
        'usewarehouse',
        'warehousemonitoring',
        'warehousemonitoringflag',
      ],
    );

    final derivedTools = <String>{};
    final normalizedMainActivity = mainActivity.trim().toUpperCase();

    // Uploaded MMP file uses DM/AIM under "Tool to be used".
    // Prefer deriving those families first when explicit tool value is missing.
    if (_isDmMainActivity ||
        normalizedMainActivity == 'GFA' ||
        normalizedMainActivity == 'CBT' ||
        normalizedMainActivity == 'DM') {
      derivedTools.add('DM');
    } else if (_isAimMainActivity ||
        normalizedMainActivity == 'AIM' ||
        normalizedMainActivity == 'TSFP' ||
        normalizedMainActivity == 'PSN' ||
        normalizedMainActivity == 'FFA' ||
        normalizedMainActivity == 'SF' ||
        normalizedMainActivity == 'THR' ||
        normalizedMainActivity == 'PHL') {
      derivedTools.add('AIM');
    } else if (normalizedMainActivity == 'PDM') {
      derivedTools.add('PDM');
    }

    // Last resort: infer technical add-on tools from flags only.
    if (derivedTools.isEmpty) {
      if (_isYesValue(marketDiversionRaw)) {
        derivedTools.add('MDM');
      }
      if (_isYesValue(warehouseMonitoringRaw)) {
        derivedTools.add('WHM');
      }
    }

    final toolsToBeUsedDisplay = toolsToBeUsed.isNotEmpty
        ? toolsToBeUsed
        : derivedTools.join(' + ');

    if (toolsToBeUsedDisplay.isEmpty && !_loggedMissingToolKeys) {
      _loggedMissingToolKeys = true;
      debugPrint(
        '[VisitReportDialog] Tools value missing for site ${siteData['id']}. '
        'site keys: ${siteData.keys.toList()} | additional_data keys: ${additionalData.keys.toList()} | '
        'derived market_diversion=${_isYesValue(marketDiversionRaw)} warehouse_monitoring=${_isYesValue(warehouseMonitoringRaw)} main_activity=$mainActivity',
      );
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primaryOrange.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.primaryOrange.withValues(alpha: 0.3),
          width: 1.5,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.info_rounded,
                color: AppColors.primaryOrange,
                size: 20,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  _isArabic ? 'تفاصيل الخطة' : 'MMP DETAILS',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primaryOrange,
                    letterSpacing: 1,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _isArabic ? 'الأدوات المستخدمة' : 'Tools to be Used',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: Colors.grey[600],
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                toolsToBeUsedDisplay.isEmpty ? 'N/A' : toolsToBeUsedDisplay,
                textAlign: _isArabic ? TextAlign.start : TextAlign.end,
                textDirection: _isArabic
                    ? TextDirection.rtl
                    : TextDirection.ltr,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primaryOrange,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isArabic ? 'النشاط الرئيسي' : 'Main Activity',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      mainActivity.isEmpty ? 'N/A' : mainActivity,
                      textAlign: _isArabic ? TextAlign.start : TextAlign.end,
                      textDirection: _isArabic
                          ? TextDirection.rtl
                          : TextDirection.ltr,
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primaryOrange,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isArabic ? 'الحالة' : 'Status',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.accentGreen.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        mmpStatus,
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.accentGreen,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (uploadedDetails.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              _isArabic ? 'بيانات MMP المرفوعة' : 'Uploaded MMP Data',
              style: GoogleFonts.poppins(
                fontSize: 12,
                color: Colors.grey[700],
                fontWeight: FontWeight.w600,
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(height: 8),
            ..._buildUploadedMmpDetailSections(uploadedDetails),
          ],
        ],
      ),
    );
  }

  Widget _buildSiteInfoCard(String siteCode, String locality, String state) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.backgroundGray,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _isArabic ? 'معلومات الموقع' : 'SITE INFORMATION',
            style: GoogleFonts.poppins(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: AppColors.textLight,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isArabic ? 'رمز الموقع' : 'Site Code',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.textLight,
                      ),
                    ),
                    Text(
                      siteCode,
                      textAlign: _isArabic ? TextAlign.start : TextAlign.end,
                      textDirection: _isArabic
                          ? TextDirection.rtl
                          : TextDirection.ltr,
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isArabic ? 'المحلية' : 'Locality',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.textLight,
                      ),
                    ),
                    Text(
                      locality.isNotEmpty
                          ? locality
                          : (state.isNotEmpty ? state : 'N/A'),
                      textAlign: _isArabic ? TextAlign.start : TextAlign.end,
                      textDirection: _isArabic
                          ? TextDirection.rtl
                          : TextDirection.ltr,
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildActivitiesField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              _isArabic ? 'الأنشطة المنفذة' : 'ACTIVITIES PERFORMED',
              style: GoogleFonts.poppins(
                fontSize: 10,
                fontWeight: FontWeight.bold,
                color: AppColors.textLight,
                letterSpacing: 1.2,
              ),
            ),
            const SizedBox(width: 4),
            const Text('*', style: TextStyle(color: Colors.red, fontSize: 14)),
          ],
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: _activitiesController,
          maxLines: 4,
          validator: (value) {
            if (value == null || value.trim().isEmpty) {
              return _isArabic
                  ? 'يرجى وصف الأنشطة المنفذة'
                  : 'Please describe the activities performed';
            }
            return null;
          },
          decoration: InputDecoration(
            hintText: _isArabic
                ? 'وصف الأنشطة التي تمت خلال الزيارة...'
                : 'Describe the activities performed during the visit...',
            hintStyle: GoogleFonts.poppins(
              fontSize: 12,
              fontWeight: FontWeight.w400,
              color: const Color(0xFF8C8C8C),
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            filled: true,
            fillColor: AppColors.backgroundGray,
          ),
        ),
      ],
    );
  }

  Widget _buildNotesField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _isArabic ? 'ملاحظات إضافية' : 'ADDITIONAL NOTES',
          style: GoogleFonts.poppins(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            color: AppColors.textLight,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: _notesController,
          maxLines: 3,
          decoration: InputDecoration(
            hintText: _isArabic
                ? 'أي ملاحظات أو مشكلات أو توصيات إضافية...'
                : 'Any additional observations, issues, or recommendations...',
            hintStyle: GoogleFonts.poppins(
              fontSize: 12,
              fontWeight: FontWeight.w400,
              color: const Color(0xFF8C8C8C),
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            filled: true,
            fillColor: AppColors.backgroundGray,
          ),
        ),
      ],
    );
  }

  Widget _buildPhotosSection() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.backgroundGray,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    _isArabic ? 'صور الموقع' : 'SITE PHOTOS',
                    style: GoogleFonts.poppins(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textLight,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Text(
                    '*',
                    style: TextStyle(color: Colors.red, fontSize: 14),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                _bi(
                  'At least one photo required',
                  'مطلوب صورة واحدة على الأقل',
                ),
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  color: AppColors.textLight,
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _addPhoto,
                  icon: const Icon(Icons.camera_alt, size: 18),
                  label: Text(_bi('Add Photo', 'إضافة صورة')),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.black,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
            ],
          ),
          if (_photoPaths.isNotEmpty) ...[
            const SizedBox(height: 16),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
              ),
              itemCount: _photoPaths.length,
              itemBuilder: (context, index) {
                final photoPath = _photoPaths[index];
                final imageWidget = kIsWeb
                    ? Image.network(
                        photoPath,
                        width: double.infinity,
                        height: double.infinity,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) {
                          return Container(
                            color: AppColors.backgroundGray,
                            child: const Icon(Icons.broken_image, size: 32),
                          );
                        },
                      )
                    : Image.file(
                        File(photoPath),
                        width: double.infinity,
                        height: double.infinity,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) {
                          return Container(
                            color: AppColors.backgroundGray,
                            child: const Icon(Icons.broken_image, size: 32),
                          );
                        },
                      );

                return Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: imageWidget,
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: GestureDetector(
                        onTap: () => _removePhoto(index),
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Colors.black,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.close,
                            color: Colors.white,
                            size: 16,
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 4,
                      left: 4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '${index + 1}',
                          style: GoogleFonts.poppins(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.check_circle, size: 16, color: Colors.black),
                const SizedBox(width: 8),
                Text(
                  _isArabic
                      ? '${_photoPaths.length} ${_photoPaths.length != 1 ? 'صور' : 'صورة'} مضافة'
                      : '${_photoPaths.length} photo${_photoPaths.length != 1 ? 's' : ''} added',
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
