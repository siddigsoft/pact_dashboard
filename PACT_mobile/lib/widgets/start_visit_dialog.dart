import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../theme/app_colors.dart';
import '../utils/user_identity_resolver.dart';

class StartVisitDialog extends StatefulWidget {
  final Map<String, dynamic> site;
  const StartVisitDialog({super.key, required this.site});

  @override
  State<StartVisitDialog> createState() => _StartVisitDialogState();
}

class _StartVisitDialogState extends State<StartVisitDialog> {
  late final Future<Map<String, String>> _userDisplayNamesFuture;

  @override
  void initState() {
    super.initState();
    _userDisplayNamesFuture = _resolveUserDisplayNames();
  }

  Future<Map<String, String>> _resolveUserDisplayNames() async {
    final additionalData =
        _safeAdditionalData(widget.site['additional_data']) ??
        <String, dynamic>{};
    final merged = <String, dynamic>{...widget.site, ...additionalData};
    final ids = UserIdentityResolver.collectPotentialUserIdsFromData(merged);
    if (ids.isEmpty) return {};
    try {
      return await UserIdentityResolver.resolveUserDisplayNames(
        client: Supabase.instance.client,
        userIds: ids,
      );
    } catch (_) {
      return {};
    }
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

  static String _stringify(dynamic value) {
    if (value == null) return '';
    final text = value.toString().trim();
    if (text.isEmpty) return '';
    final lowered = text.toLowerCase();
    if (lowered == 'null' || lowered == 'n/a' || lowered == 'na') return '';
    return text;
  }

  static String _resolveFromSite(
    Map<String, dynamic> site,
    Map<String, dynamic> additionalData,
    List<String> keys,
  ) {
    for (final key in keys) {
      final v = _stringify(site[key]);
      if (v.isNotEmpty) return v;
      final a = _stringify(additionalData[key]);
      if (a.isNotEmpty) return a;
    }
    return '';
  }

  static String _formatMmpKeyLabel(String key) {
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

  static String _normalizeLookupKey(String input) {
    return input.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
  }

  static String _normalizeLabelKey(String input) {
    return input.toLowerCase().replaceAll(RegExp(r'[\s_:\-]+'), '').trim();
  }

  static Map<String, dynamic>? _toMapValue(dynamic value) {
    if (value == null) return null;
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    if (value is String) {
      try {
        final decoded = jsonDecode(value);
        if (decoded is Map) return Map<String, dynamic>.from(decoded);
      } catch (_) {}
    }
    return null;
  }

  static String _stringifyMmpValue(
    dynamic value,
    bool isArabic, {
    Map<String, String> userDisplayNames = const {},
  }) {
    if (value == null) return '';
    if (value is bool) {
      return isArabic ? (value ? 'نعم' : 'لا') : (value ? 'Yes' : 'No');
    }
    if (value is List || value is Map) {
      try {
        return jsonEncode(value);
      } catch (_) {
        final fallback = value.toString().trim();
        return fallback.toLowerCase() == 'null' ? '' : fallback;
      }
    }
    final text = value.toString().trim();
    if (text.isEmpty) return '';
    final lowered = text.toLowerCase();
    if (lowered == 'null' || lowered == 'n/a' || lowered == 'na') return '';
    if (UserIdentityResolver.isLikelyUuid(text)) {
      return userDisplayNames[text] ?? text;
    }
    return text;
  }

  static String _formatNumberWithCommas(String numericText) {
    final parts = numericText.split('.');
    final integerPart = parts.first;
    final decimalPart = parts.length > 1 ? parts[1] : '';
    final buffer = StringBuffer();
    for (int i = 0; i < integerPart.length; i++) {
      final reverseIndex = integerPart.length - i;
      buffer.write(integerPart[i]);
      if (reverseIndex > 1 && reverseIndex % 3 == 1) buffer.write(',');
    }
    if (decimalPart.isNotEmpty) return '${buffer.toString()}.$decimalPart';
    return buffer.toString();
  }

  static String _enhanceMmpDetailValue(
    String label,
    String value, {
    Map<String, String> userDisplayNames = const {},
  }) {
    if (value.isEmpty) return value;
    if (UserIdentityResolver.labelExpectsUserIdentity(label) &&
        UserIdentityResolver.isLikelyUuid(value)) {
      return userDisplayNames[value] ?? value;
    }
    final normalizedLabel = _normalizeLabelKey(label);
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
    return '${_formatNumberWithCommas(normalizedNumber)} SDG';
  }

  static String _bi(bool isArabic, String en, String ar) => isArabic ? ar : en;

  static List<Widget> _buildUploadedMmpDetailSections(
    bool isArabic,
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
            Padding(
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
                ],
              ),
            ),
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
                        textAlign: isArabic ? TextAlign.start : TextAlign.end,
                        textDirection: isArabic
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
        ),
      );
    }

    final sections = <Widget>[];
    if (core.isNotEmpty) {
      sections.add(
        buildSection(
          title: isArabic ? 'البيانات الأساسية' : 'Core Details',
          entries: core,
        ),
      );
    }
    if (claim.isNotEmpty) {
      if (sections.isNotEmpty) sections.add(const SizedBox(height: 8));
      sections.add(
        buildSection(
          title: isArabic ? 'تفاصيل المطالبة' : 'Claim Details',
          entries: claim,
        ),
      );
    }
    if (dispatch.isNotEmpty) {
      if (sections.isNotEmpty) sections.add(const SizedBox(height: 8));
      sections.add(
        buildSection(
          title: isArabic ? 'تفاصيل الإرسال' : 'Dispatch Details',
          entries: dispatch,
        ),
      );
    }
    return sections;
  }

  static List<MapEntry<String, String>> _collectUploadedDetails(
    Map<String, dynamic> siteData,
    Map<String, dynamic> additionalData,
    bool isArabic,
    Map<String, String> userDisplayNames,
  ) {
    final details = <MapEntry<String, String>>[];
    final seen = <String>{};

    void addLabeledEntry(String label, String value) {
      final normalized = _normalizeLabelKey(label);
      if (normalized.isEmpty || seen.contains(normalized) || value.isEmpty) {
        return;
      }
      seen.add(normalized);
      details.add(
        MapEntry(
          label,
          _enhanceMmpDetailValue(
            label,
            value,
            userDisplayNames: userDisplayNames,
          ),
        ),
      );
    }

    void addEntry(String key, dynamic rawValue) {
      final normalizedKey = _normalizeLookupKey(key);

      if (normalizedKey == 'claimfeecalculation') {
        final mapValue = _toMapValue(rawValue);
        if (mapValue != null) {
          addLabeledEntry(
            _bi(isArabic, 'Claim Calculation Source', 'حساب المطالبة - المصدر'),
            _stringifyMmpValue(
              mapValue['fee_source'],
              isArabic,
              userDisplayNames: userDisplayNames,
            ),
          );
          addLabeledEntry(
            _bi(isArabic, 'Claim Calculation Scope', 'حساب المطالبة - النطاق'),
            _stringifyMmpValue(
              mapValue['role_scope'],
              isArabic,
              userDisplayNames: userDisplayNames,
            ),
          );
          addLabeledEntry(
            _bi(isArabic, 'Claim Total Payout', 'حساب المطالبة - إجمالي الدفع'),
            _stringifyMmpValue(
              mapValue['total_payout'],
              isArabic,
              userDisplayNames: userDisplayNames,
            ),
          );
          addLabeledEntry(
            _bi(
              isArabic,
              'Claim Transport Cost',
              'حساب المطالبة - تكلفة النقل',
            ),
            _stringifyMmpValue(
              mapValue['calculated_transport_cost'],
              isArabic,
              userDisplayNames: userDisplayNames,
            ),
          );
          addLabeledEntry(
            _bi(isArabic, 'Claim Enumerator Fee', 'حساب المطالبة - أجر الباحث'),
            _stringifyMmpValue(
              mapValue['enumerator_fee'],
              isArabic,
              userDisplayNames: userDisplayNames,
            ),
          );
          return;
        }
      }

      if (normalizedKey == 'dispatchcosts') {
        final mapValue = _toMapValue(rawValue);
        if (mapValue != null) {
          addLabeledEntry(
            _bi(isArabic, 'Dispatch Cost Status', 'تكاليف الإرسال - الحالة'),
            _stringifyMmpValue(
              mapValue['cost_status'],
              isArabic,
              userDisplayNames: userDisplayNames,
            ),
          );
          addLabeledEntry(
            _bi(
              isArabic,
              'Dispatch Cost Calculated By',
              'تكاليف الإرسال - حسب',
            ),
            _stringifyMmpValue(
              mapValue['calculated_by'],
              isArabic,
              userDisplayNames: userDisplayNames,
            ),
          );
          addLabeledEntry(
            _bi(isArabic, 'Dispatch Transport Cost', 'تكاليف الإرسال - نقل'),
            _stringifyMmpValue(
              mapValue['transportation_cost'],
              isArabic,
              userDisplayNames: userDisplayNames,
            ),
          );
          addLabeledEntry(
            _bi(
              isArabic,
              'Dispatch Transport Budget',
              'تكاليف الإرسال - ميزانية النقل',
            ),
            _stringifyMmpValue(
              mapValue['transport_budget_total'],
              isArabic,
              userDisplayNames: userDisplayNames,
            ),
          );
          return;
        }
      }

      if (rawValue is Map || rawValue is List) return;

      final value = _stringifyMmpValue(
        rawValue,
        isArabic,
        userDisplayNames: userDisplayNames,
      );
      if (value.isEmpty) return;
      if (normalizedKey.isEmpty || seen.contains(normalizedKey)) return;
      seen.add(normalizedKey);
      details.add(
        MapEntry(
          _formatMmpKeyLabel(key),
          _enhanceMmpDetailValue(
            _formatMmpKeyLabel(key),
            value,
            userDisplayNames: userDisplayNames,
          ),
        ),
      );
    }

    const preferredKeys = [
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
      'market_name',
      'warehouse_name',
      'whm_warehouse_name',
      'mmp_status',
    ];
    for (final key in preferredKeys) {
      addEntry(key, siteData[key]);
      addEntry(key, additionalData[key]);
    }

    const excludedPrefixes = [
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
    const excludedExact = {
      'assigned_to',
      'assigned_at',
      'accepted_at',
      'accepted_by',
      'claimed_at',
      'claimed_by',
      'updated_at',
      'created_at',
    };
    final sortedKeys = additionalData.keys.toList()..sort();
    for (final key in sortedKeys) {
      if (excludedExact.contains(key)) continue;
      if (excludedPrefixes.any((p) => key.startsWith(p))) continue;
      addEntry(key, additionalData[key]);
    }
    return details;
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final additionalData =
        _safeAdditionalData(widget.site['additional_data']) ?? {};
    final siteName =
        widget.site['site_name'] ??
        widget.site['siteName'] ??
        (isArabic ? 'موقع غير معروف' : 'Unknown Site');
    final siteCode =
        widget.site['site_code'] ??
        widget.site['siteCode'] ??
        widget.site['id']?.toString().substring(0, 8) ??
        '';
    final state = widget.site['state'] ?? '';
    final locality = widget.site['locality'] ?? '';
    final status = widget.site['status'] ?? (isArabic ? 'معلق' : 'Pending');

    final toolsToBeUsed = _resolveFromSite(widget.site, additionalData, const [
      'tool_to_be_used',
      'tool_to_be_use',
      'tools_to_be_used',
      'tools_to_be_use',
      'survey_tool',
      'tool_used',
      'tool',
    ]);
    final mainActivity = _resolveFromSite(widget.site, additionalData, const [
      'main_activity',
      'activity_at_site',
      'activity_type',
      'activity',
    ]).toUpperCase();
    final mmpStatus = _resolveFromSite(widget.site, additionalData, const [
      'mmp_status',
      'status',
    ]);
    final toolsDisplay = toolsToBeUsed.isNotEmpty
        ? toolsToBeUsed
        : (mainActivity.isNotEmpty ? mainActivity : '');
    final mainActivityDisplay = mainActivity.isNotEmpty ? mainActivity : '';
    final mmpStatusDisplay = mmpStatus.isNotEmpty ? mmpStatus : status;
    return FutureBuilder<Map<String, String>>(
      future: _userDisplayNamesFuture,
      builder: (context, snapshot) {
        final userDisplayNames = snapshot.data ?? const <String, String>{};
        final uploadedDetails = _collectUploadedDetails(
          widget.site,
          additionalData,
          isArabic,
          userDisplayNames,
        );

        return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 450, maxHeight: 780),
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
                          Icons.play_arrow,
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
                              isArabic
                                  ? 'بدء زيارة الموقع'
                                  : 'Start Site Visit',
                              style: GoogleFonts.poppins(
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              siteName,
                              style: GoogleFonts.poppins(
                                fontSize: 12,
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
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Site Information card (exact same as Complete Site dialog)
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: AppColors.backgroundGray,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isArabic ? 'معلومات الموقع' : 'SITE INFORMATION',
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
                                      isArabic ? 'رمز الموقع' : 'Site Code',
                                      style: GoogleFonts.poppins(
                                        fontSize: 10,
                                        color: AppColors.textLight,
                                      ),
                                    ),
                                    Text(
                                      siteCode,
                                      textAlign: isArabic
                                          ? TextAlign.start
                                          : TextAlign.end,
                                      textDirection: isArabic
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
                                      isArabic ? 'المحلية' : 'Locality',
                                      style: GoogleFonts.poppins(
                                        fontSize: 10,
                                        color: AppColors.textLight,
                                      ),
                                    ),
                                    Text(
                                      locality.isNotEmpty
                                          ? locality
                                          : (state.isNotEmpty ? state : 'N/A'),
                                      textAlign: isArabic
                                          ? TextAlign.start
                                          : TextAlign.end,
                                      textDirection: isArabic
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
                    ),

                    const SizedBox(height: 20),

                    // MMP Details card (exact same as Complete Site dialog)
                    Container(
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
                                  isArabic ? 'تفاصيل الخطة' : 'MMP DETAILS',
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
                                isArabic
                                    ? 'الأدوات المستخدمة'
                                    : 'Tools to be Used',
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  color: Colors.grey[600],
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                toolsDisplay.isEmpty ? 'N/A' : toolsDisplay,
                                textAlign: isArabic
                                    ? TextAlign.start
                                    : TextAlign.end,
                                textDirection: isArabic
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
                                      isArabic
                                          ? 'النشاط الرئيسي'
                                          : 'Main Activity',
                                      style: GoogleFonts.poppins(
                                        fontSize: 12,
                                        color: Colors.grey[600],
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      mainActivityDisplay.isEmpty
                                          ? 'N/A'
                                          : mainActivityDisplay,
                                      textAlign: isArabic
                                          ? TextAlign.start
                                          : TextAlign.end,
                                      textDirection: isArabic
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
                                      isArabic ? 'الحالة' : 'Status',
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
                                        color: AppColors.accentGreen.withValues(
                                          alpha: 0.15,
                                        ),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        mmpStatusDisplay,
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
                              isArabic
                                  ? 'بيانات MMP المرفوعة'
                                  : 'Uploaded MMP Data',
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                color: Colors.grey[700],
                                fontWeight: FontWeight.w600,
                                letterSpacing: 0.3,
                              ),
                            ),
                            const SizedBox(height: 8),
                            ..._buildUploadedMmpDetailSections(
                              isArabic,
                              uploadedDetails,
                            ),
                          ],
                        ],
                      ),
                    ),

                    const SizedBox(height: 24),

                    // What Happens Next
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF7E0),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: const Color(0xFFFFD166).withOpacity(0.3),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isArabic
                                ? 'ماذا سيحدث بعد ذلك؟'
                                : 'WHAT HAPPENS NEXT?',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: const Color(0xFF666666),
                              letterSpacing: 1,
                            ),
                          ),
                          const SizedBox(height: 16),
                          _buildStepItem(
                            '1',
                            isArabic
                                ? 'سيبدأ احتساب مدة الزيارة'
                                : 'Visit duration timer will start',
                          ),
                          const SizedBox(height: 12),
                          _buildStepItem(
                            '2',
                            isArabic
                                ? 'مراقبة الموقع لتتبع الدقة'
                                : 'Location monitoring begins',
                          ),
                          const SizedBox(height: 12),
                          _buildStepItem(
                            '3',
                            isArabic
                                ? 'إضافة الصور والملاحظات'
                                : 'Add photos & observations',
                          ),
                          const SizedBox(height: 12),
                          _buildStepItem(
                            '4',
                            isArabic
                                ? 'إكمال التقرير عند الانتهاء'
                                : 'Complete report when done',
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Action Buttons
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
                      onPressed: () => Navigator.of(context).pop(false),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        side: BorderSide(
                          color: Colors.grey.withOpacity(0.3),
                          width: 1.5,
                        ),
                      ),
                      child: Text(
                        isArabic ? 'إلغاء' : 'Cancel',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF333333),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => Navigator.of(context).pop(true),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1976D2),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 2,
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.play_arrow, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            isArabic ? 'بدء الزيارة' : 'Start Visit',
                            style: GoogleFonts.poppins(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
        );
      },
    );
  }

  Widget _buildStepItem(String number, String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: const BoxDecoration(
            color: Color(0xFFFF9800),
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              number,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: const Color(0xFF333333),
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}
