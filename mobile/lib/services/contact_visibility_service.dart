// lib/services/contact_visibility_service.dart
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:developer' as developer;

/// Service to filter contacts based on role-based access control rules
///
/// Access Rules:
/// - Data Collectors: See own hub/state team + admins/ict/fom/data_team
/// - Coordinators: See all state users + data collectors in state + admins/ict/fom/data_team
/// - Admins/ICT/FOM/Data Team: Can see all users
class ContactVisibilityService {
  static const String debugTag = '[ContactVisibilityService]';
  static final ContactVisibilityService _instance =
      ContactVisibilityService._internal();

  factory ContactVisibilityService() {
    return _instance;
  }

  ContactVisibilityService._internal();

  final _supabase = Supabase.instance.client;

  /// Get filtered contacts for calls/messages based on current user's role
  ///
  /// Returns: List of visible user profiles for the current user
  Future<List<Map<String, dynamic>>> getVisibleContacts() async {
    try {
      final currentUser = _supabase.auth.currentUser;
      if (currentUser == null) {
        developer.log('$debugTag No authenticated user', name: debugTag);
        return [];
      }

      // Get current user's profile
      final currentProfile = await _supabase
          .from('profiles')
          .select('id, role, state_id, hub_id')
          .eq('id', currentUser.id)
          .maybeSingle();

      if (currentProfile == null) {
        developer.log(
          '$debugTag Current user profile not found',
          name: debugTag,
        );
        return [];
      }

      final currentRole =
          (currentProfile['role'] as String?)?.toLowerCase() ?? '';
      final currentStateId = currentProfile['state_id'] as String?;
      final currentHubId = currentProfile['hub_id'] as String?;

      developer.log(
        '$debugTag Current user: role=$currentRole, state=$currentStateId, hub=$currentHubId',
        name: debugTag,
      );

      // Rule-based filtering
      if (currentRole.contains('admin') || currentRole.contains('super')) {
        // ADMINS: Can see everyone except themselves
        return _getAdminContacts(currentUser.id);
      } else if (currentRole == 'fom' ||
          currentRole == 'ict' ||
          currentRole == 'data_team') {
        // FOM/ICT/Data Team: Can see everyone in their domain
        return _getGlobalRoleContacts(currentUser.id, currentRole);
      } else if (currentRole.contains('coordinator') ||
          currentRole.contains('state_coordinator') ||
          currentRole.contains('field_coordinator')) {
        // COORDINATORS: See state-level users
        return _getCoordinatorContacts(
          currentUser.id,
          currentStateId,
          currentHubId,
        );
      } else if (currentRole == 'datacollector' ||
          currentRole == 'data_collector' ||
          currentRole == 'enumerator') {
        // DATA COLLECTORS: See hub/state team + admins/ict/fom/data_team
        return _getDataCollectorContacts(
          currentUser.id,
          currentStateId,
          currentHubId,
        );
      } else {
        // Unknown role - be restrictive
        developer.log('$debugTag Unknown role: $currentRole', name: debugTag);
        return [];
      }
    } catch (e) {
      developer.log(
        '$debugTag Error getting visible contacts: $e',
        name: debugTag,
        error: e,
      );
      return [];
    }
  }

  /// Admin users can see all other users
  Future<List<Map<String, dynamic>>> _getAdminContacts(
    String currentUserId,
  ) async {
    try {
      final response = await _supabase
          .from('profiles')
          .select(
            'id, full_name, email, avatar_url, role, state_id, hub_id, phone',
          )
          .neq('id', currentUserId)
          .order('full_name');

      developer.log(
        '$debugTag Admin sees ${(response as List).length} contacts',
        name: debugTag,
      );
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      developer.log(
        '$debugTag Error in _getAdminContacts: $e',
        name: debugTag,
        error: e,
      );
      return [];
    }
  }

  /// Global role users (FOM, ICT, Data Team) can see most users
  Future<List<Map<String, dynamic>>> _getGlobalRoleContacts(
    String currentUserId,
    String currentRole,
  ) async {
    try {
      // Get all users except:
      // - Themselves
      // - Pending status users
      const visibleRoles = [
        'admin',
        'super_admin',
        'fom',
        'ict',
        'data_team',
        'coordinator',
        'field_coordinator',
        'state_coordinator',
        'supervisor',
        'datacollector',
        'data_collector',
      ];

      final response = await _supabase
          .from('profiles')
          .select(
            'id, full_name, email, avatar_url, role, state_id, hub_id, phone',
          )
          .neq('id', currentUserId)
          .inFilter('role', visibleRoles)
          .order('full_name');

      developer.log(
        '$debugTag $currentRole sees ${(response as List).length} contacts',
        name: debugTag,
      );
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      developer.log(
        '$debugTag Error in _getGlobalRoleContacts: $e',
        name: debugTag,
        error: e,
      );
      return [];
    }
  }

  /// Coordinators can see:
  /// - All users in their state
  /// - Data collectors in their state
  /// - Admins, ICT, FOM, Data Team users
  Future<List<Map<String, dynamic>>> _getCoordinatorContacts(
    String currentUserId,
    String? coordinatorStateId,
    String? coordinatorHubId,
  ) async {
    try {
      if (coordinatorStateId == null || coordinatorStateId.isEmpty) {
        developer.log(
          '$debugTag Coordinator has no state assigned, returning empty',
          name: debugTag,
        );
        return [];
      }

      // Get users in coordinator's state
      final stateUsers = await _supabase
          .from('profiles')
          .select(
            'id, full_name, email, avatar_url, role, state_id, hub_id, phone',
          )
          .eq('state_id', coordinatorStateId)
          .neq('id', currentUserId)
          .order('full_name');

      // Get global role users (admin, fom, ict, data_team)
      const globalRoles = ['admin', 'super_admin', 'fom', 'ict', 'data_team'];
      final globalRoleUsers = await _supabase
          .from('profiles')
          .select(
            'id, full_name, email, avatar_url, role, state_id, hub_id, phone',
          )
          .inFilter('role', globalRoles)
          .neq('id', currentUserId)
          .order('full_name');

      final allContacts = <Map<String, dynamic>>[
        ...List<Map<String, dynamic>>.from(stateUsers),
        ...List<Map<String, dynamic>>.from(globalRoleUsers),
      ];

      // Remove duplicates by ID
      final seen = <String>{};
      final uniqueContacts = allContacts.where((contact) {
        final id = contact['id'] as String;
        if (seen.contains(id)) {
          return false;
        }
        seen.add(id);
        return true;
      }).toList();

      developer.log(
        '$debugTag Coordinator (state: $coordinatorStateId) sees ${uniqueContacts.length} contacts',
        name: debugTag,
      );
      return uniqueContacts;
    } catch (e) {
      developer.log(
        '$debugTag Error in _getCoordinatorContacts: $e',
        name: debugTag,
        error: e,
      );
      return [];
    }
  }

  /// Data Collectors can see:
  /// - Team members in their hub/state
  /// - Supervisors in their hub
  /// - Coordinators in their state
  /// - Admins, ICT, FOM, Data Team users
  Future<List<Map<String, dynamic>>> _getDataCollectorContacts(
    String currentUserId,
    String? dataCollectorStateId,
    String? dataCollectorHubId,
  ) async {
    try {
      if (dataCollectorStateId == null || dataCollectorStateId.isEmpty) {
        developer.log(
          '$debugTag Data Collector has no state assigned, returning empty',
          name: debugTag,
        );
        return [];
      }

      // Get team members in same hub
      final hubTeamUsers = await _supabase
          .from('profiles')
          .select(
            'id, full_name, email, avatar_url, role, state_id, hub_id, phone',
          )
          .eq('state_id', dataCollectorStateId)
          .eq('hub_id', dataCollectorHubId ?? '')
          .neq('id', currentUserId)
          .order('full_name');

      // Get coordinators and supervisors in same state (if hub is null)
      final stateLeadership = await _supabase
          .from('profiles')
          .select(
            'id, full_name, email, avatar_url, role, state_id, hub_id, phone',
          )
          .eq('state_id', dataCollectorStateId)
          .inFilter('role', [
            'coordinator',
            'field_coordinator',
            'state_coordinator',
            'supervisor',
            'hub_supervisor',
          ])
          .neq('id', currentUserId)
          .order('full_name');

      // Get global admin/support users (can call anyone)
      const globalRoles = ['admin', 'super_admin', 'fom', 'ict', 'data_team'];
      final globalRoleUsers = await _supabase
          .from('profiles')
          .select(
            'id, full_name, email, avatar_url, role, state_id, hub_id, phone',
          )
          .inFilter('role', globalRoles)
          .neq('id', currentUserId)
          .order('full_name');

      final allContacts = <Map<String, dynamic>>[
        ...List<Map<String, dynamic>>.from(hubTeamUsers),
        ...List<Map<String, dynamic>>.from(stateLeadership),
        ...List<Map<String, dynamic>>.from(globalRoleUsers),
      ];

      // Remove duplicates by ID
      final seen = <String>{};
      final uniqueContacts = allContacts.where((contact) {
        final id = contact['id'] as String;
        if (seen.contains(id)) {
          return false;
        }
        seen.add(id);
        return true;
      }).toList();

      developer.log(
        '$debugTag Data Collector (state: $dataCollectorStateId, hub: $dataCollectorHubId) sees ${uniqueContacts.length} contacts',
        name: debugTag,
      );
      return uniqueContacts;
    } catch (e) {
      developer.log(
        '$debugTag Error in _getDataCollectorContacts: $e',
        name: debugTag,
        error: e,
      );
      return [];
    }
  }

  /// Check if a specific user can be contacted by current user
  ///
  /// This is a targeted check for individual users
  Future<bool> canContactUser(String targetUserId) async {
    try {
      final visibleContacts = await getVisibleContacts();
      return visibleContacts.any((contact) => contact['id'] == targetUserId);
    } catch (e) {
      developer.log(
        '$debugTag Error checking if can contact user: $e',
        name: debugTag,
        error: e,
      );
      return false;
    }
  }

  /// Get list of visible roles for current user
  /// Used for role-level filtering in queries
  Future<List<String>> getVisibleRoles() async {
    try {
      final contacts = await getVisibleContacts();
      final roles = <String>{};
      for (final contact in contacts) {
        if (contact['role'] != null) {
          roles.add(contact['role'].toString());
        }
      }
      developer.log(
        '$debugTag Visible roles: ${roles.toList()}',
        name: debugTag,
      );
      return roles.toList();
    } catch (e) {
      developer.log(
        '$debugTag Error getting visible roles: $e',
        name: debugTag,
        error: e,
      );
      return [];
    }
  }

  /// Get list of visible user IDs (for bulk operations)
  Future<List<String>> getVisibleUserIds() async {
    try {
      final contacts = await getVisibleContacts();
      return contacts.map((c) => c['id'] as String).toList();
    } catch (e) {
      developer.log(
        '$debugTag Error getting visible user IDs: $e',
        name: debugTag,
        error: e,
      );
      return [];
    }
  }
}
