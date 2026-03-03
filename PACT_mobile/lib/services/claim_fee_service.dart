import 'package:supabase_flutter/supabase_flutter.dart';

class ClaimFeeBreakdown {
  final double transportBudget;
  final double enumeratorFee;
  final double totalPayout;
  final String? classificationLevel;
  final String? roleScope;
  final String feeSource;
  final String currency;

  ClaimFeeBreakdown({
    required this.transportBudget,
    required this.enumeratorFee,
    required this.totalPayout,
    this.classificationLevel,
    this.roleScope,
    required this.feeSource,
    this.currency = 'SDG',
  });

  Map<String, dynamic> toJson() => {
    'transportBudget': transportBudget,
    'enumeratorFee': enumeratorFee,
    'totalPayout': totalPayout,
    'classificationLevel': classificationLevel,
    'roleScope': roleScope,
    'feeSource': feeSource,
    'currency': currency,
  };

  String get formattedTransportBudget =>
      '${transportBudget.toStringAsFixed(0)} $currency';
  String get formattedEnumeratorFee =>
      '${enumeratorFee.toStringAsFixed(0)} $currency';
  String get formattedTotalPayout =>
      '${totalPayout.toStringAsFixed(0)} $currency';
}

class ClaimFeeService {
  static const double defaultEnumeratorFeeSDG = 50.0;

  final SupabaseClient _supabase = Supabase.instance.client;

  Future<ClaimFeeBreakdown?> calculateFeeForClaim(
    String siteId,
    String userId,
  ) async {
    try {
      final siteEntryFuture = _supabase
          .from('mmp_site_entries')
          .select('transport_fee, enumerator_fee, cost, additional_data')
          .eq('id', siteId)
          .single();

      final classificationFuture = _supabase
          .from('user_classifications')
          .select('classification_level, role_scope, is_active')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('effective_from', ascending: false)
          .limit(1)
          .maybeSingle();

      final results = await Future.wait([
        siteEntryFuture,
        classificationFuture,
      ]);

      final siteEntry = results[0];
      final userClassification = results[1];

      if (siteEntry == null) {
        print('Error: Site entry not found for id: $siteId');
        return null;
      }

      final transportBudget = _parseDouble(siteEntry['transport_fee']);

      double enumeratorFee = defaultEnumeratorFeeSDG;
      String? classificationLevel;
      String? roleScope;
      String feeSource = 'default';

      if (userClassification != null) {
        classificationLevel =
            userClassification['classification_level'] as String?;
        roleScope = userClassification['role_scope'] as String?;
        print(
          '[ClaimFeeService] user_classifications from DB: '
          'classification_level=$classificationLevel, role_scope=$roleScope (raw)',
        );

        // Normalize role_scope to valid enum values for classification_role_scope.
        // DB enum only allows: field_officer, team_leader, supervisor, coordinator.
        final beforeNorm = roleScope;
        roleScope = _normalizeRoleScopeForEnum(roleScope);
        if (beforeNorm != roleScope) {
          print('[ClaimFeeService] role_scope normalized: $beforeNorm -> $roleScope');
        }

        if (classificationLevel != null && roleScope != null) {
          final feeStructure = await _supabase
              .from('classification_fee_structures')
              .select(
                'site_visit_base_fee_cents, complexity_multiplier, currency, is_active',
              )
              .eq('classification_level', classificationLevel)
              .eq('role_scope', roleScope)
              .eq('is_active', true)
              .order('effective_from', ascending: false)
              .limit(1)
              .maybeSingle();

          if (feeStructure != null) {
            // Fees are stored directly in SDG, not cents (despite column name)
            final baseFee = _parseDouble(
              feeStructure['site_visit_base_fee_cents'],
            );
            final multiplier = _parseDouble(
              feeStructure['complexity_multiplier'],
              defaultValue: 1.0,
            );
            // Round to 2 decimal places: baseFee * multiplier, then round
            enumeratorFee = (baseFee * multiplier * 100).roundToDouble() / 100;
            feeSource = 'classification';
          }
        }
      }

      final totalPayout = transportBudget + enumeratorFee;

      return ClaimFeeBreakdown(
        transportBudget: transportBudget,
        enumeratorFee: enumeratorFee,
        totalPayout: totalPayout,
        classificationLevel: classificationLevel,
        roleScope: roleScope,
        feeSource: feeSource,
        currency: 'SDG',
      );
    } catch (e, stack) {
      print('Error calculating claim fee: $e');
      print('Claim fee stack: $stack');
      return null;
    }
  }

  Future<EnumeratorFeeResult> calculateEnumeratorFeeForUser(
    String userId,
  ) async {
    try {
      final userClassification = await _supabase
          .from('user_classifications')
          .select('classification_level, role_scope')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('effective_from', ascending: false)
          .limit(1)
          .maybeSingle();

      if (userClassification == null) {
        return EnumeratorFeeResult(
          fee: defaultEnumeratorFeeSDG,
          classificationLevel: null,
          source: 'default',
        );
      }

      final classificationLevel =
          userClassification['classification_level'] as String?;
      final roleScope =
          _normalizeRoleScopeForEnum(userClassification['role_scope'] as String?);

      if (classificationLevel == null || roleScope == null) {
        return EnumeratorFeeResult(
          fee: defaultEnumeratorFeeSDG,
          classificationLevel: null,
          source: 'default',
        );
      }

      final feeStructure = await _supabase
          .from('classification_fee_structures')
          .select('site_visit_base_fee_cents, complexity_multiplier')
          .eq('classification_level', classificationLevel)
          .eq('role_scope', roleScope)
          .eq('is_active', true)
          .order('effective_from', ascending: false)
          .limit(1)
          .maybeSingle();

      if (feeStructure == null) {
        return EnumeratorFeeResult(
          fee: defaultEnumeratorFeeSDG,
          classificationLevel: classificationLevel,
          source: 'default',
        );
      }

      final baseFee = _parseDouble(feeStructure['site_visit_base_fee_cents']);
      final multiplier = _parseDouble(
        feeStructure['complexity_multiplier'],
        defaultValue: 1.0,
      );
      final calculatedFee = (baseFee * multiplier * 100).roundToDouble() / 100;

      return EnumeratorFeeResult(
        fee: calculatedFee,
        classificationLevel: classificationLevel,
        source: 'classification',
      );
    } catch (e) {
      print('Error calculating enumerator fee: $e');
      return EnumeratorFeeResult(
        fee: defaultEnumeratorFeeSDG,
        classificationLevel: null,
        source: 'default',
      );
    }
  }

  /// Maps app/UI role names to the database enum classification_role_scope.
  /// Valid enum values: field_officer, team_leader, supervisor, coordinator.
  /// Use this when sending p_role_scope to claim_site_visit RPC.
  static String? normalizeRoleScopeForEnum(String? roleScope) {
    return _normalizeRoleScopeForEnum(roleScope);
  }

  static String? _normalizeRoleScopeForEnum(String? roleScope) {
    if (roleScope == null || roleScope.isEmpty) return roleScope;
    final lower = roleScope.toLowerCase();
    switch (lower) {
      case 'enumerator':
      case 'datacollector':
      case 'data_collector':
      case 'dc':
        return 'field_officer';
      case 'field_officer':
      case 'team_leader':
      case 'supervisor':
      case 'coordinator':
        return lower;
      default:
        return roleScope;
    }
  }

  double _parseDouble(dynamic value, {double defaultValue = 0.0}) {
    if (value == null) return defaultValue;
    if (value is num) return value.toDouble();
    if (value is String) {
      return double.tryParse(value) ?? defaultValue;
    }
    return defaultValue;
  }
}

class EnumeratorFeeResult {
  final double fee;
  final String? classificationLevel;
  final String source;

  EnumeratorFeeResult({
    required this.fee,
    this.classificationLevel,
    required this.source,
  });
}
