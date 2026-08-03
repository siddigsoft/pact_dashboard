import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:developer' as developer;

class AdvanceRequestService {
  /// Get existing advance request for a site
  static Future<Map<String, dynamic>?> getExistingRequest(
    String siteId,
    String userId,
  ) async {
    try {
      final response = await Supabase.instance.client
          .from('down_payment_requests')
          .select('*')
          .eq('requested_by', userId)
          .or('mmp_site_entry_id.eq.$siteId,site_visit_id.eq.$siteId')
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();

      return response;
    } catch (e) {
      developer.log('Error getting advance request: $e');
      return null;
    }
  }

  /// Check for an existing ACTIVE advance for this site (any collector, not just the caller).
  /// Returns the duplicate row if found, null if the site is clear to submit.
  static Future<Map<String, dynamic>?> checkForActiveDuplicate({
    required String? siteId,
    required String siteName,
    String? hubId,
  }) async {
    try {
      const cancelledStatuses = ['cancelled', 'rejected', 'deleted'];

      // Path A — precise check by mmp_site_entry_id (preferred)
      if (siteId != null && siteId.isNotEmpty) {
        final byEntryId = await Supabase.instance.client
            .from('down_payment_requests')
            .select('id, status, requested_amount, requested_by')
            .eq('mmp_site_entry_id', siteId)
            .not('status', 'in', '(${cancelledStatuses.map((s) => '"$s"').join(',')})')
            .limit(1)
            .maybeSingle();
        if (byEntryId != null) return byEntryId;
      }

      // Path B — fallback by site_name + hub_id (catches legacy / cross-path duplicates)
      if (siteName.isNotEmpty && hubId != null && hubId.isNotEmpty) {
        final byName = await Supabase.instance.client
            .from('down_payment_requests')
            .select('id, status, requested_amount, requested_by')
            .eq('site_name', siteName.trim())
            .eq('hub_id', hubId)
            .not('status', 'in', '(${cancelledStatuses.map((s) => '"$s"').join(',')})')
            .limit(1)
            .maybeSingle();
        if (byName != null) return byName;
      }

      return null;
    } catch (e) {
      developer.log('Error checking for duplicate advance: $e');
      return null; // Non-fatal — let the insert attempt proceed and rely on DB constraints
    }
  }

  /// Create a new advance request.
  /// Throws a [StateError] if an active advance already exists for the site.
  static Future<Map<String, dynamic>> createRequest({
    required String userId,
    required String? siteId,
    required String siteName,
    required double transportationBudget,
    required double requestedAmount,
    required String paymentType, // 'full_advance' or 'installments'
    required String justification,
    List<Map<String, dynamic>>? installmentPlan,
    String? hubId,
    String? hubName,
    String? requesterRole,
  }) async {
    try {
      // Get user profile for hub_id and role if not provided
      if (hubId == null || requesterRole == null) {
        final profile = await Supabase.instance.client
            .from('profiles')
            .select('hub_id, role')
            .eq('id', userId)
            .maybeSingle();

        hubId = hubId ?? profile?['hub_id'] as String?;
        requesterRole = requesterRole ?? profile?['role'] as String?;
      }

      // ── Duplicate guard ────────────────────────────────────────────────────
      // The web app has an equivalent check in DownPaymentContext. The mobile
      // app previously had NO pre-flight check, meaning it could insert a second
      // active advance for a site that had already been claimed by another
      // collector — particularly after a reclaim-and-redispatch cycle.
      final duplicate = await checkForActiveDuplicate(
        siteId: siteId,
        siteName: siteName,
        hubId: hubId,
      );
      if (duplicate != null) {
        final status = (duplicate['status'] as String? ?? 'unknown').replaceAll('_', ' ');
        final amount = (duplicate['requested_amount'] as num?)?.toStringAsFixed(0) ?? '?';
        throw StateError(
          'An active advance request ($amount SDG — $status) already exists for '
          'this site. Cancel or resolve it before submitting a new one.',
        );
      }
      // ──────────────────────────────────────────────────────────────────────

      // Determine requester role (dataCollector or coordinator)
      final role = (requesterRole ?? '').toLowerCase();
      final finalRequesterRole =
          (role == 'coordinator' ||
              role == 'field_coordinator' ||
              role == 'state_coordinator')
          ? 'coordinator'
          : 'dataCollector';

      final response = await Supabase.instance.client
          .from('down_payment_requests')
          .insert({
            'mmp_site_entry_id': siteId,
            'site_name': siteName,
            'requested_by': userId,
            'requester_role': finalRequesterRole,
            'hub_id': hubId,
            'hub_name': hubName,
            'total_transportation_budget': transportationBudget,
            'requested_amount': requestedAmount,
            'payment_type': paymentType,
            'installment_plan': installmentPlan ?? [],
            'justification': justification,
            'supporting_documents': [],
            'status': 'pending_supervisor',
            'supervisor_status': 'pending',
          })
          .select()
          .single();

      return response;
    } catch (e) {
      developer.log('Error creating advance request: $e');
      rethrow;
    }
  }

  /// Get all advance requests for the current user
  static Future<List<Map<String, dynamic>>> getUserRequests(
    String userId,
  ) async {
    try {
      final response = await Supabase.instance.client
          .from('down_payment_requests')
          .select('*')
          .eq('requested_by', userId)
          .order('created_at', ascending: false);

      return (response as List).map((e) => e as Map<String, dynamic>).toList();
      return [];
    } catch (e) {
      developer.log('Error loading user advance requests: $e');
      return [];
    }
  }

  /// Get status badge information
  static Map<String, dynamic> getStatusBadge(String status) {
    switch (status.toLowerCase()) {
      case 'pending_supervisor':
        return {
          'label': 'Pending Supervisor',
          'color': Colors.orange,
          'icon': Icons.access_time,
        };
      case 'pending_admin':
        return {
          'label': 'Pending Admin',
          'color': Colors.blue,
          'icon': Icons.access_time,
        };
      case 'approved':
        return {
          'label': 'Approved',
          'color': Colors.green,
          'icon': Icons.check_circle,
        };
      case 'rejected':
        return {'label': 'Rejected', 'color': Colors.red, 'icon': Icons.cancel};
      case 'partially_paid':
        return {
          'label': 'Partial Payment',
          'color': Colors.blue,
          'icon': Icons.payment,
        };
      case 'fully_paid':
        return {
          'label': 'Paid',
          'color': Colors.green,
          'icon': Icons.check_circle,
        };
      case 'cancelled':
        return {
          'label': 'Cancelled',
          'color': Colors.grey,
          'icon': Icons.cancel,
        };
      default:
        return {'label': status, 'color': Colors.grey, 'icon': Icons.info};
    }
  }
}
