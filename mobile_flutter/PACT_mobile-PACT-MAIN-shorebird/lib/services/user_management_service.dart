import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/user.dart';

/// Handles user management operations (approval, rejection, role assignment, updates)
/// Complements AuthenticationService with admin/supervisor operations
class UserManagementService {
  final supabase = Supabase.instance.client;

  // Singleton pattern
  static final UserManagementService _instance =
      UserManagementService._internal();
  factory UserManagementService() => _instance;
  UserManagementService._internal();

  /// APPROVE USER ACCOUNT
  /// Admin sets profile status to 'approved'
  /// User can then login
  Future<bool> approveUser(String userId) async {
    try {
      await supabase
          .from('profiles')
          .update({
            'status': 'approved',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', userId);

      debugPrint('User $userId approved');
      return true;
    } catch (e) {
      debugPrint('Error approving user: $e');
      return false;
    }
  }

  /// REJECT USER ACCOUNT
  /// Admin sets profile status to 'rejected'
  /// Account is permanently disabled
  Future<bool> rejectUser(String userId) async {
    try {
      await supabase
          .from('profiles')
          .update({
            'status': 'rejected',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', userId);

      debugPrint('User $userId rejected');
      return true;
    } catch (e) {
      debugPrint('Error rejecting user: $e');
      return false;
    }
  }

  /// UPDATE USER PROFILE
  /// Coordinator/Admin can update user information
  Future<bool> updateUserProfile(User user) async {
    try {
      final updateData = {
        'full_name': user.fullName ?? user.name,
        'phone': user.phone,
        'avatar_url': user.avatar,
        'state_id': user.stateId,
        'locality_id': user.localityId,
        'hub_id': user.hubId,
        'availability': user.availability,
        'updated_at': DateTime.now().toIso8601String(),
      };

      // Remove null values
      updateData.removeWhere((key, value) => value == null);

      await supabase.from('profiles').update(updateData).eq('id', user.id);

      debugPrint('User ${user.id} profile updated');
      return true;
    } catch (e) {
      debugPrint('Error updating user profile: $e');
      return false;
    }
  }

  /// UPDATE USER LOCATION
  /// Data collector updates GPS location
  /// Latitude and longitude required
  Future<bool> updateUserLocation(
    String userId,
    double latitude,
    double longitude, {
    double? accuracy,
    String? region,
    String? address,
    bool isSharing = true,
  }) async {
    try {
      final location = UserLocation(
        latitude: latitude,
        longitude: longitude,
        accuracy: accuracy,
        region: region,
        address: address,
        isSharing: isSharing,
        lastUpdated: DateTime.now().toIso8601String(),
      );

      await supabase
          .from('profiles')
          .update({
            'location': location.toJson(),
            'location_sharing': isSharing,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', userId);

      debugPrint('User $userId location updated');
      return true;
    } catch (e) {
      debugPrint('Error updating user location: $e');
      return false;
    }
  }

  /// UPDATE USER AVAILABILITY
  /// Data collector sets their status: online, offline, busy
  Future<bool> updateUserAvailability(
    String userId,
    String status, // 'online', 'offline', 'busy'
  ) async {
    try {
      if (!['online', 'offline', 'busy'].contains(status.toLowerCase())) {
        throw Exception('Invalid availability status: $status');
      }

      await supabase
          .from('profiles')
          .update({
            'availability': status.toLowerCase(),
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', userId);

      debugPrint('User $userId availability set to $status');
      return true;
    } catch (e) {
      debugPrint('Error updating user availability: $e');
      return false;
    }
  }

  /// TOGGLE LOCATION SHARING
  /// User can enable/disable location sharing with team
  Future<bool> toggleLocationSharing(String userId, bool isSharing) async {
    try {
      await supabase
          .from('profiles')
          .update({
            'location_sharing': isSharing,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', userId);

      final action = isSharing ? 'enabled' : 'disabled';
      debugPrint('User $userId location sharing $action');
      return true;
    } catch (e) {
      debugPrint('Error toggling location sharing: $e');
      return false;
    }
  }

  /// ADD ROLE TO USER
  /// Admin assigns additional role to user
  /// A user can have multiple roles
  Future<bool> addRole(String userId, String role) async {
    try {
      // Check if role already exists
      final existing = await supabase
          .from('user_roles')
          .select()
          .eq('user_id', userId)
          .eq('role', role)
          .maybeSingle();

      if (existing != null) {
        debugPrint('User already has role: $role');
        return true;
      }

      await supabase.from('user_roles').insert({
        'user_id': userId,
        'role': role,
        'assigned_at': DateTime.now().toIso8601String(),
      });

      debugPrint('Role $role added to user $userId');
      return true;
    } catch (e) {
      debugPrint('Error adding role to user: $e');
      return false;
    }
  }

  /// REMOVE ROLE FROM USER
  /// Admin removes role from user
  Future<bool> removeRole(String userId, String role) async {
    try {
      await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', role);

      debugPrint('Role $role removed from user $userId');
      return true;
    } catch (e) {
      debugPrint('Error removing role from user: $e');
      return false;
    }
  }

  /// GET USER BY ID
  /// Fetch full user profile with roles
  Future<User?> getUserById(String userId) async {
    try {
      final profileData = await supabase
          .from('profiles')
          .select()
          .eq('id', userId)
          .maybeSingle();

      if (profileData == null) {
        debugPrint('User $userId not found');
        return null;
      }

      // Fetch user roles
      final rolesData = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId);

      final userRoles = <AppRole>[];
      for (final roleData in rolesData) {
        final roleStr = roleData['role'] as String?;
        if (roleStr != null) {
          try {
            final role = _stringToAppRole(roleStr);
            userRoles.add(role);
          } catch (e) {
            debugPrint('Failed to parse role: $roleStr');
          }
        }
      }

      return _buildUserFromProfile(profileData, userRoles);
    } catch (e) {
      debugPrint('Error fetching user: $e');
      return null;
    }
  }

  /// GET ALL USERS
  /// Admin fetches all users with optional filtering
  Future<List<User>> getAllUsers({
    String? role,
    String? stateId,
    String? hubId,
    String? status, // 'pending', 'approved', 'rejected'
  }) async {
    try {
      var query = supabase.from('profiles').select();

      if (role != null) {
        // Need to join with user_roles if filtering by role
        query = supabase.from('user_roles').select('user_id').eq('role', role);
        final roleUsers = await query;
        if ((roleUsers.isEmpty)) {
          return [];
        }

        final userIds = (roleUsers as List)
            .map((r) => r['user_id'] as String)
            .toList();

        query = supabase.from('profiles').select().inFilter('id', userIds);
      }

      if (stateId != null) {
        query = query.eq('state_id', stateId);
      }

      if (hubId != null) {
        query = query.eq('hub_id', hubId);
      }

      if (status != null) {
        query = query.eq('status', status);
      }

      final profilesData = await query;

      if ((profilesData is! List)) {
        return [];
      }

      final users = <User>[];
      for (final profileData in profilesData) {
        // Fetch roles for each user
        final rolesData = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profileData['id'] as String);

        final userRoles = <AppRole>[];
        for (final roleData in rolesData) {
          final roleStr = roleData['role'] as String?;
          if (roleStr != null) {
            try {
              final appRole = _stringToAppRole(roleStr);
              userRoles.add(appRole);
            } catch (e) {
              debugPrint('Failed to parse role: $roleStr');
            }
          }
        }

        final user = _buildUserFromProfile(profileData, userRoles);
        users.add(user);
      }

      return users;
    } catch (e) {
      debugPrint('Error fetching users: $e');
      return [];
    }
  }

  /// GET PENDING APPROVAL USERS
  /// Admin view of users awaiting approval
  Future<List<User>> getPendingApprovalUsers() async {
    return getAllUsers(status: 'pending');
  }

  /// GET USERS BY HUB
  /// Supervisor/Admin can fetch team members in their hub
  Future<List<User>> getUsersByHub(String hubId) async {
    return getAllUsers(hubId: hubId);
  }

  /// GET USERS BY STATE
  /// Coordinator/Supervisor can fetch team members in their state
  Future<List<User>> getUsersByState(String stateId) async {
    return getAllUsers(stateId: stateId);
  }

  /// STREAM USERS
  /// Real-time subscription to user changes
  Stream<List<User>> streamUsers({
    String? role,
    String? stateId,
    String? hubId,
    String? status,
  }) {
    return supabase
        .from('profiles')
        .stream(primaryKey: ['id'])
        .map((profilesList) async {
          var filtered = profilesList;

          if (status != null) {
            filtered = filtered.where((p) => p['status'] == status).toList();
          }

          if (stateId != null) {
            filtered = filtered.where((p) => p['state_id'] == stateId).toList();
          }

          if (hubId != null) {
            filtered = filtered.where((p) => p['hub_id'] == hubId).toList();
          }

          final users = <User>[];
          for (final profileData in filtered) {
            final rolesData = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', profileData['id'] as String);

            final userRoles = <AppRole>[];
            for (final roleData in rolesData) {
              final roleStr = roleData['role'] as String?;
              if (roleStr != null) {
                try {
                  final appRole = _stringToAppRole(roleStr);
                  userRoles.add(appRole);
                } catch (e) {
                  debugPrint('Failed to parse role: $roleStr');
                }
              }
            }

            final user = _buildUserFromProfile(profileData, userRoles);
            users.add(user);
          }

          return users;
        })
        .asyncExpand((future) => Stream.fromFuture(future));
  }

  /// SET USER CLASSIFICATION
  /// Coordinator/Admin assigns cost level and role scope
  Future<bool> setUserClassification(
    String userId, {
    required String level, // 'level_1', 'level_2', 'level_3'
    required String roleScope, // 'state', 'hub', 'national'
    bool hasRetainer = false,
    int retainerAmountCents = 0,
    String retainerCurrency = 'SDG',
  }) async {
    try {
      await supabase
          .from('profiles')
          .update({
            'classification_level': level,
            'role_scope': roleScope,
            'has_retainer': hasRetainer,
            'retainer_amount_cents': retainerAmountCents,
            'retainer_currency': retainerCurrency,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', userId);

      debugPrint('User $userId classification set: $level / $roleScope');
      return true;
    } catch (e) {
      debugPrint('Error setting user classification: $e');
      return false;
    }
  }

  /// UPDATE BANK ACCOUNT DETAILS
  /// User updates payment account information
  Future<bool> updateBankAccount(
    String userId, {
    required String accountName,
    required String accountNumber,
    required String branch,
  }) async {
    try {
      // Store bank account in a separate secure table (RLS protected)
      await supabase.from('user_bank_accounts').upsert({
        'user_id': userId,
        'account_name': accountName,
        'account_number': accountNumber,
        'branch': branch,
        'updated_at': DateTime.now().toIso8601String(),
      }, onConflict: 'user_id');

      debugPrint('Bank account updated for user $userId');
      return true;
    } catch (e) {
      debugPrint('Error updating bank account: $e');
      return false;
    }
  }

  /// FETCH FCM TOKENS
  /// Get Firebase Cloud Messaging tokens for user
  Future<List<String>> getUserFCMTokens(String userId) async {
    try {
      final profileData = await supabase
          .from('profiles')
          .select('fcm_tokens')
          .eq('id', userId)
          .maybeSingle();

      if (profileData == null) return [];

      final tokens = profileData['fcm_tokens'] as List?;
      return tokens?.cast<String>() ?? [];
    } catch (e) {
      debugPrint('Error fetching FCM tokens: $e');
      return [];
    }
  }

  /// ADD FCM TOKEN
  /// Store device FCM token for push notifications
  Future<bool> addFCMToken(String userId, String token) async {
    try {
      final profileData = await supabase
          .from('profiles')
          .select('fcm_tokens')
          .eq('id', userId)
          .maybeSingle();

      final currentTokens = List<String>.from(
        profileData?['fcm_tokens'] as List? ?? [],
      );

      if (!currentTokens.contains(token)) {
        currentTokens.add(token);
        await supabase
            .from('profiles')
            .update({'fcm_tokens': currentTokens})
            .eq('id', userId);

        debugPrint('FCM token added for user $userId');
      }

      return true;
    } catch (e) {
      debugPrint('Error adding FCM token: $e');
      return false;
    }
  }

  // ===== HELPER METHODS =====

  /// Build User object from profile data
  User _buildUserFromProfile(
    Map<String, dynamic> profileData,
    List<AppRole> userRoles,
  ) {
    // Parse location if stored as JSON
    UserLocation? location;
    if (profileData['location'] != null) {
      try {
        final locationData = profileData['location'];
        if (locationData is String) {
          location = UserLocation.fromJson(
            Map<String, dynamic>.from(Uri.splitQueryString(locationData)),
          );
        } else if (locationData is Map) {
          location = UserLocation.fromJson(
            Map<String, dynamic>.from(locationData),
          );
        }
      } catch (e) {
        debugPrint('Error parsing location data: $e');
      }
    }

    // Parse classification
    UserClassification? classification;
    if (profileData['classification_level'] != null) {
      try {
        classification = UserClassification(
          level: profileData['classification_level'] ?? 'level_1',
          roleScope: profileData['role_scope'] ?? 'state',
          hasRetainer: profileData['has_retainer'] ?? false,
          retainerAmountCents: profileData['retainer_amount_cents'] ?? 0,
          retainerCurrency: profileData['retainer_currency'] ?? 'SDG',
          effectiveFrom:
              profileData['effective_from'] ?? DateTime.now().toIso8601String(),
          effectiveUntil: profileData['effective_until'],
        );
      } catch (e) {
        debugPrint('Error parsing classification data: $e');
      }
    }

    return User(
      id: profileData['id'] as String,
      name: profileData['full_name'] as String? ?? 'User',
      email: profileData['email'] as String? ?? '',
      phone: profileData['phone'] as String?,
      role: profileData['role'] as String? ?? 'dataCollector',
      createdAt: profileData['created_at'] as String?,
      updatedAt: profileData['updated_at'] as String?,
      isApproved: profileData['status'] == 'approved',
      employeeId: profileData['employee_id'] as String?,
      phoneVerified: profileData['phone_verified'] as bool? ?? false,
      phoneVerifiedAt: profileData['phone_verified_at'] as String?,
      stateId: profileData['state_id'] as String?,
      localityId: profileData['locality_id'] as String?,
      hubId: profileData['hub_id'] as String?,
      avatar: profileData['avatar_url'] as String?,
      username: profileData['username'] as String?,
      fullName: profileData['full_name'] as String?,
      lastActive:
          profileData['last_active'] as String? ??
          DateTime.now().toIso8601String(),
      availability: profileData['availability'] as String? ?? 'offline',
      roles: userRoles.isNotEmpty ? userRoles : null,
      location: location,
      classification: classification,
    );
  }

  /// Convert string to AppRole
  AppRole _stringToAppRole(String value) {
    switch (value.toLowerCase()) {
      case 'datacollector':
        return AppRole.dataCollector;
      case 'coordinator':
        return AppRole.coordinator;
      case 'supervisor':
        return AppRole.supervisor;
      case 'fieldopmanager':
      case 'fom':
        return AppRole.fom;
      case 'admin':
        return AppRole.admin;
      default:
        throw Exception('Unknown role: $value');
    }
  }
}
