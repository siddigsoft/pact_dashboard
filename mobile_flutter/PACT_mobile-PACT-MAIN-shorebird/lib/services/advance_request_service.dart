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

  /// Create a new advance request
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
