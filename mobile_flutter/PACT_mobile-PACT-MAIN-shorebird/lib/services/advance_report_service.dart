import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:developer' as developer;
import '../models/advance_request_report.dart';

class AdvanceReportService {
  static final _supabase = Supabase.instance.client;

  static Future<List<AdvanceRequestData>> fetchAllRequests() async {
    try {
      final response = await _supabase
          .from('down_payment_requests')
          .select('''
            *,
            profiles:requested_by(id, full_name, username, email),
            mmp_site_entries:mmp_site_entry_id(id, state, cp_name)
          ''')
          .order('requested_at', ascending: false);

      return (response as List)
          .map((json) => AdvanceRequestData.fromJson(json))
          .toList();
    } catch (e) {
      developer.log('Error fetching advance requests: $e');
      return [];
    }
  }

  static Future<Map<String, dynamic>> fetchProfiles() async {
    try {
      final response = await _supabase
          .from('profiles')
          .select('id, full_name, username, email');
      
      final Map<String, dynamic> profileMap = {};
      for (var profile in response as List) {
        profileMap[profile['id']] = profile;
      }
      return profileMap;
    } catch (e) {
      developer.log('Error fetching profiles: $e');
      return {};
    }
  }

  static ReportStats calculateStats(List<AdvanceRequestData> requests) {
    double totalRequested = 0;
    double totalApproved = 0;
    double totalPending = 0;
    double totalRejected = 0;
    int approvedCount = 0;
    int pendingCount = 0;
    int rejectedCount = 0;

    for (var req in requests) {
      totalRequested += req.requestedAmount;
      
      switch (req.status.toLowerCase()) {
        case 'approved':
        case 'partially_paid':
        case 'fully_paid':
          totalApproved += req.requestedAmount;
          approvedCount++;
          break;
        case 'pending_supervisor':
        case 'pending_admin':
          totalPending += req.requestedAmount;
          pendingCount++;
          break;
        case 'rejected':
        case 'cancelled':
          totalRejected += req.requestedAmount;
          rejectedCount++;
          break;
      }
    }

    return ReportStats(
      totalRequested: totalRequested,
      totalApproved: totalApproved,
      totalPending: totalPending,
      totalRejected: totalRejected,
      totalCount: requests.length,
      approvedCount: approvedCount,
      pendingCount: pendingCount,
      rejectedCount: rejectedCount,
    );
  }

  static List<ReportGroupData> groupByTeamMember(List<AdvanceRequestData> requests) {
    final Map<String, List<AdvanceRequestData>> grouped = {};
    
    for (var req in requests) {
      final key = req.requesterName ?? req.requestedBy;
      grouped.putIfAbsent(key, () => []).add(req);
    }

    return grouped.entries.map((entry) {
      final reqs = entry.value;
      final totalRequested = reqs.fold<double>(0, (sum, r) => sum + r.requestedAmount);
      final totalApproved = reqs
          .where((r) => ['approved', 'partially_paid', 'fully_paid'].contains(r.status.toLowerCase()))
          .fold<double>(0, (sum, r) => sum + r.requestedAmount);
      final pending = reqs
          .where((r) => ['pending_supervisor', 'pending_admin'].contains(r.status.toLowerCase()))
          .length;

      return ReportGroupData(
        name: entry.key,
        requests: reqs.length,
        totalRequested: totalRequested,
        totalApproved: totalApproved,
        pending: pending,
      );
    }).toList()
      ..sort((a, b) => b.totalRequested.compareTo(a.totalRequested));
  }

  static List<ReportGroupData> groupByHub(List<AdvanceRequestData> requests) {
    final Map<String, List<AdvanceRequestData>> grouped = {};
    
    for (var req in requests) {
      final key = req.hubName ?? 'Unknown Hub';
      grouped.putIfAbsent(key, () => []).add(req);
    }

    return grouped.entries.map((entry) {
      final reqs = entry.value;
      final totalRequested = reqs.fold<double>(0, (sum, r) => sum + r.requestedAmount);
      final totalApproved = reqs
          .where((r) => ['approved', 'partially_paid', 'fully_paid'].contains(r.status.toLowerCase()))
          .fold<double>(0, (sum, r) => sum + r.requestedAmount);
      final pending = reqs
          .where((r) => ['pending_supervisor', 'pending_admin'].contains(r.status.toLowerCase()))
          .length;

      return ReportGroupData(
        name: entry.key,
        requests: reqs.length,
        totalRequested: totalRequested,
        totalApproved: totalApproved,
        pending: pending,
      );
    }).toList()
      ..sort((a, b) => b.totalRequested.compareTo(a.totalRequested));
  }

  static List<ReportGroupData> groupByStatus(List<AdvanceRequestData> requests) {
    final Map<String, List<AdvanceRequestData>> grouped = {};
    
    for (var req in requests) {
      final key = req.status;
      grouped.putIfAbsent(key, () => []).add(req);
    }

    return grouped.entries.map((entry) {
      final reqs = entry.value;
      final totalRequested = reqs.fold<double>(0, (sum, r) => sum + r.requestedAmount);
      final totalApproved = reqs
          .where((r) => ['approved', 'partially_paid', 'fully_paid'].contains(r.status.toLowerCase()))
          .fold<double>(0, (sum, r) => sum + r.requestedAmount);
      final pending = reqs
          .where((r) => ['pending_supervisor', 'pending_admin'].contains(r.status.toLowerCase()))
          .length;

      return ReportGroupData(
        name: StatusBadgeInfo.fromStatus(entry.key).label,
        requests: reqs.length,
        totalRequested: totalRequested,
        totalApproved: totalApproved,
        pending: pending,
      );
    }).toList()
      ..sort((a, b) => b.totalRequested.compareTo(a.totalRequested));
  }

  static List<ReportGroupData> groupByState(List<AdvanceRequestData> requests) {
    final Map<String, List<AdvanceRequestData>> grouped = {};
    
    for (var req in requests) {
      final key = req.stateName ?? 'Unknown State';
      grouped.putIfAbsent(key, () => []).add(req);
    }

    return grouped.entries.map((entry) {
      final reqs = entry.value;
      final totalRequested = reqs.fold<double>(0, (sum, r) => sum + r.requestedAmount);
      final totalApproved = reqs
          .where((r) => ['approved', 'partially_paid', 'fully_paid'].contains(r.status.toLowerCase()))
          .fold<double>(0, (sum, r) => sum + r.requestedAmount);
      final pending = reqs
          .where((r) => ['pending_supervisor', 'pending_admin'].contains(r.status.toLowerCase()))
          .length;

      return ReportGroupData(
        name: entry.key,
        requests: reqs.length,
        totalRequested: totalRequested,
        totalApproved: totalApproved,
        pending: pending,
      );
    }).toList()
      ..sort((a, b) => b.totalRequested.compareTo(a.totalRequested));
  }

  static List<ReportGroupData> groupByProject(List<AdvanceRequestData> requests) {
    final Map<String, List<AdvanceRequestData>> grouped = {};
    
    for (var req in requests) {
      final key = req.projectName ?? 'Unknown Project';
      grouped.putIfAbsent(key, () => []).add(req);
    }

    return grouped.entries.map((entry) {
      final reqs = entry.value;
      final totalRequested = reqs.fold<double>(0, (sum, r) => sum + r.requestedAmount);
      final totalApproved = reqs
          .where((r) => ['approved', 'partially_paid', 'fully_paid'].contains(r.status.toLowerCase()))
          .fold<double>(0, (sum, r) => sum + r.requestedAmount);
      final pending = reqs
          .where((r) => ['pending_supervisor', 'pending_admin'].contains(r.status.toLowerCase()))
          .length;

      return ReportGroupData(
        name: entry.key,
        requests: reqs.length,
        totalRequested: totalRequested,
        totalApproved: totalApproved,
        pending: pending,
      );
    }).toList()
      ..sort((a, b) => b.totalRequested.compareTo(a.totalRequested));
  }

  static Future<bool> checkUserHasReportAccess() async {
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) return false;

      final profile = await _supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

      if (profile == null) return false;

      final role = (profile['role'] as String?)?.toLowerCase() ?? '';
      
      return role == 'admin' ||
          role == 'super_admin' ||
          role == 'supervisor' ||
          role == 'coordinator' ||
          role == 'field_coordinator' ||
          role == 'state_coordinator' ||
          role == 'fom' ||
          role == 'finance' ||
          role == 'country_director' ||
          role == 'data_team';
    } catch (e) {
      developer.log('Error checking report access: $e');
      return false;
    }
  }

  static Future<String?> getCurrentUserRole() async {
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) return null;

      final profile = await _supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

      return profile?['role'] as String?;
    } catch (e) {
      developer.log('Error getting user role: $e');
      return null;
    }
  }
}
