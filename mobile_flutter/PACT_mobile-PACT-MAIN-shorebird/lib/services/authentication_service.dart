import 'package:flutter/foundation.dart' show kIsWeb, kDebugMode;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user.dart' as app_models;

/// Handles all authentication-related operations
/// Implements TypeScript UserContext authentication flows
class AuthenticationService {
  final supabase = Supabase.instance.client;

  // Singleton pattern
  static final AuthenticationService _instance =
      AuthenticationService._internal();
  factory AuthenticationService() => _instance;
  AuthenticationService._internal();

  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;

    // Listen for auth state changes
    supabase.auth.onAuthStateChange.listen((data) {
      // Debug logging to help trace unexpected sign-outs
      debugPrint(
        '[AuthenticationService] Auth state changed: ${data.event} at ${DateTime.now().toIso8601String()}',
      );
      if (kDebugMode) {
        final userId = data.session?.user.id;
        final session = data.session;
        debugPrint(
          '[AuthenticationService] Auth user for event ${data.event}: ${userId ?? 'null'}',
        );
        if (session != null) {
          debugPrint(
            '[AuthenticationService] Session expired: ${session.isExpired}',
          );
          debugPrint(
            '[AuthenticationService] Session expires at: ${session.expiresAt}',
          );
        }
      }

      if (data.event == AuthChangeEvent.signedIn) {
        _handleSignIn(data.session?.user);
      } else if (data.event == AuthChangeEvent.signedOut) {
        // Only handle sign out if it's a real sign out, not a transient error
        // Check if this is a user-initiated sign out or a token refresh failure
        final currentSession = supabase.auth.currentSession;
        final hasLocalAuthData = _hasLocalAuthData();

        debugPrint(
          '[AuthenticationService] Sign out detected - current session: ${currentSession != null}, has local auth: $hasLocalAuthData',
        );

        // If we have local auth data but no session, this might be a transient error
        // Don't clear local data immediately - user might still be able to recover
        // Only clear if it's been a while or if explicitly requested
        // Also check if we had a previous session - if not, this might be a false alarm
        if (hasLocalAuthData && currentSession == null) {
          debugPrint(
            '[AuthenticationService] Detected potential transient auth error - delaying local data clear',
          );
          // Delay clearing to allow for potential recovery
          // Give it more time (5 seconds) for long operations like photo uploads
          Future.delayed(const Duration(seconds: 5), () async {
            // Try to refresh session before clearing
            try {
              final refreshedSession = await supabase.auth.refreshSession();
              if (refreshedSession.session != null) {
                debugPrint(
                  '[AuthenticationService] Session recovered after delay - not clearing local data',
                );
                // Update local auth data with refreshed session
                _storeAuthDataLocally(refreshedSession.session!);
                return;
              }
            } catch (refreshError) {
              debugPrint(
                '[AuthenticationService] Session refresh after delay failed: $refreshError',
              );
            }

            // Final check - is session still null?
            final finalSessionCheck = supabase.auth.currentSession;
            if (finalSessionCheck == null) {
              debugPrint(
                '[AuthenticationService] Session still null after delay - clearing local data',
              );
              _handleSignOut();
            } else {
              debugPrint(
                '[AuthenticationService] Session exists after delay - not clearing local data',
              );
              // Update local auth data with current session
              _storeAuthDataLocally(finalSessionCheck);
            }
          });
        } else if (!hasLocalAuthData) {
          // No local auth data means this is likely a clean sign out or already cleared
          debugPrint(
            '[AuthenticationService] No local auth data - normal sign out flow',
          );
          _handleSignOut();
        } else {
          // Session exists but sign-out event fired - might be a false alarm during refresh
          debugPrint(
            '[AuthenticationService] Session exists but sign-out event fired - likely false alarm, ignoring',
          );
        }
      } else if (data.event == AuthChangeEvent.tokenRefreshed) {
        debugPrint('[AuthenticationService] Token refreshed successfully');
        // Update local auth data with new session
        if (data.session != null) {
          _storeAuthDataLocally(data.session!);
        }
      }
    });

    _initialized = true;
  }

  /// Check if local auth data exists (synchronous check)
  /// This is a best-effort check - for accurate results use getLocalAuthData()
  bool _hasLocalAuthData() {
    try {
      // Quick check: see if we have a current session
      // If session exists, local data should exist too
      final session = supabase.auth.currentSession;
      if (session != null && !session.isExpired) {
        return true;
      }
      // If no session, check if user ID is available
      final userId = supabase.auth.currentUser?.id;
      return userId != null;
    } catch (e) {
      debugPrint('Error checking local auth data: $e');
      return false;
    }
  }

  // Handle Supabase auth user sign-in (User is Supabase/gotrue user)
  Future<void> _handleSignIn(User? user) async {
    if (user == null) return;

    try {
      // Store auth data locally for offline access
      final session = supabase.auth.currentSession;
      if (session != null) {
        await _storeAuthDataLocally(session);
      }

      // Update user's last_active timestamp (if column exists)
      try {
        await supabase
            .from('profiles')
            .update({'last_active': DateTime.now().toIso8601String()})
            .eq('id', user.id);
      } catch (e) {
        // Column might not exist, ignore error
        debugPrint(
          'Note: Could not update last_active (column may not exist): $e',
        );
      }

      // Ensure user has worker/dataCollector role (only if RLS allows)
      try {
        final roleExists = await supabase
            .from('user_roles')
            .select()
            .eq('user_id', user.id)
            .maybeSingle();

        if (roleExists == null) {
          try {
            await supabase.from('user_roles').insert({
              'user_id': user.id,
              'role': 'dataCollector',
            });
          } catch (insertError) {
            // RLS might prevent insertion, that's okay - user might already have role from elsewhere
            debugPrint(
              'Note: Could not insert dataCollector role (RLS may prevent): $insertError',
            );
          }
        }
      } catch (e) {
        // Role check/insert failed, but don't block sign-in
        debugPrint('Note: Role check/insert failed (non-critical): $e');
      }
    } catch (e) {
      debugPrint('Error handling sign in: $e');
    }
  }

  void _handleSignOut() {
    debugPrint(
      '[AuthenticationService] _handleSignOut invoked at ${DateTime.now().toIso8601String()}',
    );
    if (kDebugMode) {
      final currentUserId = supabase.auth.currentUser?.id;
      debugPrint(
        '[AuthenticationService] Clearing local auth data for user: ${currentUserId ?? 'null'}',
      );
    }
    _clearLocalAuthData();
  }

  // Stream of auth changes
  Stream<AuthState> get authStateChanges => supabase.auth.onAuthStateChange;

  // Current user
  User? get currentAuthUser => supabase.auth.currentUser;

  /// REGISTRATION FLOW
  /// User submits registration form with email, password, name, phone, role, location info, avatar
  /// Avatar uploaded to `avatars` storage bucket
  /// Supabase Auth `signUp()` creates auth user
  /// User data stored in `user_metadata`
  /// Profile created via trigger with status 'pending'
  /// User awaits admin approval before login
  /// Verification email sent automatically by Supabase
  Future<bool> registerUser(app_models.UserRegister userData) async {
    try {
      // CRITICAL: Always include role in metadata (defaults to 'dataCollector' if not provided)
      // This ensures the handle_new_user trigger can properly set the profile role
      // The database trigger reads from raw_user_meta_data->>'role'
      final normalizedRole =
          (userData.role?.trim().toLowerCase() ?? 'dataCollector');

      debugPrint('[AuthenticationService] Registering user with metadata:');
      debugPrint('  - role: $normalizedRole');
      debugPrint('  - hubId: ${userData.hubId}');
      debugPrint('  - stateId: ${userData.stateId}');
      debugPrint('  - localityId: ${userData.localityId}');
      debugPrint('  - email: ${userData.email}');

      final response = await supabase.auth.signUp(
        email: userData.email,
        password: userData.password,
        data: {
          // Always include name (use email prefix if not provided)
          'name': userData.name.trim() ?? userData.email.split('@')[0],
          // Include phone if provided
          if (userData.phone != null && userData.phone!.trim().isNotEmpty)
            'phone': userData.phone!.trim(),
          // Include employeeId if provided
          if (userData.employeeId != null &&
              userData.employeeId!.trim().isNotEmpty)
            'employeeId': userData.employeeId!.trim(),
          // CRITICAL: Always include role (never null) - this is what the trigger reads
          'role': normalizedRole,
          // Include location data if provided (required for coordinators/data collectors)
          if (userData.hubId != null && userData.hubId!.trim().isNotEmpty)
            'hubId': userData.hubId!.trim(),
          if (userData.stateId != null && userData.stateId!.trim().isNotEmpty)
            'stateId': userData.stateId!.trim(),
          if (userData.localityId != null &&
              userData.localityId!.trim().isNotEmpty)
            'localityId': userData.localityId!.trim(),
          // Include avatar if provided
          if (userData.avatar != null && userData.avatar!.trim().isNotEmpty)
            'avatar': userData.avatar!.trim(),
        },
      );

      if (response.user == null) {
        debugPrint(
          '[AuthenticationService] Registration failed: No user returned',
        );
        return false;
      }

      debugPrint(
        '[AuthenticationService] Registration successful. User ID: ${response.user?.id}',
      );
      debugPrint(
        '[AuthenticationService] User metadata sent: ${response.user?.userMetadata}',
      );
      debugPrint(
        '[AuthenticationService] User awaits email verification and admin approval.',
      );

      return true;
    } on AuthException catch (e) {
      debugPrint('[AuthenticationService] Supabase signup error: ${e.message}');
      return false;
    } catch (e) {
      debugPrint('[AuthenticationService] Registration error: $e');
      return false;
    }
  }

  /// LOGIN FLOW
  /// User provides email/password
  /// Check if email verified (catches "email not confirmed" error)
  /// On email not verified: Auto-resend verification email
  /// If verified: Fetch profile from database
  /// Check approval status (status === 'approved')
  /// If not approved: Sign out and block login
  /// If approved: Construct User object from profile + auth metadata
  /// Merge roles from `user_roles` table
  /// Store user in localStorage and context
  Future<app_models.User?> login(String email, String password) async {
    try {
      final authResponse = await supabase.auth.signInWithPassword(
        email: email,
        password: password,
      );

      if (authResponse.user == null) {
        debugPrint('Login failed: No auth user returned');
        return null;
      }

      // Fetch profile from database
      final profileData = await supabase
          .from('profiles')
          .select()
          .eq('id', authResponse.user!.id)
          .maybeSingle();

      // Fetch user roles
      final rolesData = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', authResponse.user!.id);

      final userRoles = <app_models.AppRole>[];
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

      // Check approval status - MUST be approved
      final isApproved =
          profileData != null && profileData['status'] == 'approved';
      if (!isApproved) {
        debugPrint('User account is pending approval');
        await supabase.auth.signOut();
        return null;
      }

      // Construct User from profile data
      final user = _buildUserFromProfile(
        authResponse.user!,
        profileData,
        userRoles,
      );

      // Store in local storage
      await _storeUserLocally(user);
      await _storeAuthDataLocally(authResponse.session!);

      return user;
    } on AuthException catch (e) {
      // Check if email not verified
      final msg = e.message.toLowerCase();
      final isEmailNotConfirmed =
          msg.contains('email') &&
          (msg.contains('confirm') || msg.contains('verified'));

      if (isEmailNotConfirmed) {
        debugPrint(
          'Email not verified. Attempting to resend verification email.',
        );
        try {
          await supabase.auth.resend(type: OtpType.signup, email: email);
          debugPrint('Verification email resent to $email');
        } catch (resendError) {
          debugPrint('Failed to resend verification email: $resendError');
        }
        return null;
      }

      debugPrint('Login failed: ${e.message}');
      return null;
    } catch (e) {
      debugPrint('Login error: $e');
      return null;
    }
  }

  /// LOGOUT FLOW
  /// Clear local state immediately so route guards react without delay
  /// Then sign out from Supabase (network async)
  Future<void> logout() async {
    try {
      // Clear local state immediately
      _clearLocalAuthData();

      // Sign out from Supabase
      await supabase.auth.signOut();

      debugPrint('Logout successful');
    } catch (e) {
      debugPrint('Logout error: $e');
      rethrow;
    }
  }

  /// SESSION HYDRATION
  /// Restores user session from existing Supabase auth token
  /// E.g., after page refresh
  /// Implements retry logic with exponential backoff
  Future<app_models.User?> hydrateCurrentUser() async {
    const maxRetries = 10;
    const baseDelay = 300;

    for (int attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          final delay = _calculateBackoffDelay(attempt, baseDelay);
          debugPrint(
            'Hydration retry attempt ${attempt + 1}/$maxRetries, delay ${delay}ms...',
          );
          await Future.delayed(Duration(milliseconds: delay));
        }

        // Get current auth user
        final authUserResponse = await supabase.auth.getUser();
        if (authUserResponse.user == null) {
          debugPrint('No auth user found for hydration');
          continue;
        }

        final user = authUserResponse.user!;

        // Fetch profile
        final profileData = await supabase
            .from('profiles')
            .select()
            .eq('id', user.id)
            .maybeSingle();

        if (profileData == null) {
          debugPrint('No profile found for user ${user.id}');
          continue;
        }

        // Fetch roles
        final rolesData = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id);

        final userRoles = <app_models.AppRole>[];
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

        // Check approval status
        final isApproved = profileData['status'] == 'approved';
        if (!isApproved) {
          debugPrint('User is not approved');
          return null;
        }

        final hydratedUser = _buildUserFromProfile(
          user,
          profileData,
          userRoles,
        );

        debugPrint('Successfully hydrated current user');
        return hydratedUser;
      } catch (e) {
        debugPrint('Error hydrating current user (attempt ${attempt + 1}): $e');
      }
    }

    debugPrint('Failed to hydrate current user after all retries');
    return null;
  }

  /// GOOGLE OAUTH LOGIN
  Future<bool> signInWithGoogle() async {
    try {
      final response = await supabase.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: kIsWeb
            ? 'http://localhost:3000/auth/callback'
            : 'io.supabase.pact://login-callback/',
      );

      if (response) {
        final session = supabase.auth.currentSession;
        if (session != null) {
          await _handleSignIn(session.user);
          return true;
        }
      }
      return false;
    } catch (e) {
      debugPrint('Google sign in error: $e');
      return false;
    }
  }

  /// RESEND VERIFICATION EMAIL
  Future<bool> resendVerificationEmail(String email) async {
    try {
      await supabase.auth.resend(type: OtpType.signup, email: email);
      debugPrint('Verification email sent to $email');
      return true;
    } on AuthException catch (e) {
      debugPrint('Failed to resend verification email: ${e.message}');
      return false;
    } catch (e) {
      debugPrint('Error resending verification email: $e');
      return false;
    }
  }

  /// RESET PASSWORD
  Future<bool> resetPassword(String email) async {
    try {
      await supabase.auth.resetPasswordForEmail(email);
      debugPrint('Password reset email sent to $email');
      return true;
    } on AuthException catch (e) {
      debugPrint('Failed to send reset password email: ${e.message}');
      return false;
    } catch (e) {
      debugPrint('Error resetting password: $e');
      return false;
    }
  }

  /// UPDATE PASSWORD (for authenticated users)
  Future<bool> updatePassword(String newPassword) async {
    try {
      await supabase.auth.updateUser(UserAttributes(password: newPassword));
      debugPrint('Password updated successfully');
      return true;
    } on AuthException catch (e) {
      debugPrint('Failed to update password: ${e.message}');
      return false;
    } catch (e) {
      debugPrint('Error updating password: $e');
      return false;
    }
  }

  /// ===== HELPER METHODS =====

  /// Calculate exponential backoff delay
  int _calculateBackoffDelay(int attempt, int baseDelay) {
    final delay = baseDelay * (1.5 * (attempt - 1)).toInt();
    return delay > 2000 ? 2000 : delay;
  }

  /// Build app user object from profile data
  app_models.User _buildUserFromProfile(
    User authUser,
    Map<String, dynamic>? profileData,
    List<app_models.AppRole> userRoles,
  ) {
    final metadata = authUser.userMetadata ?? {};

    // Parse location if stored as JSON string
    app_models.UserLocation? location;
    if (profileData != null && profileData['location'] != null) {
      try {
        final locationData = profileData['location'];
        if (locationData is String) {
          // Try to parse JSON string
          location = app_models.UserLocation.fromJson(
            Map<String, dynamic>.from(Uri.splitQueryString(locationData)),
          );
        } else if (locationData is Map) {
          location = app_models.UserLocation.fromJson(
            Map<String, dynamic>.from(locationData),
          );
        }
      } catch (e) {
        debugPrint('Error parsing location data: $e');
      }
    }

    // Parse classification if available
    app_models.UserClassification? classification;
    if (profileData != null && profileData['classification_level'] != null) {
      try {
        classification = app_models.UserClassification(
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

    final role = _parseString(metadata['role']) ?? 'dataCollector';
    final isApproved = profileData?['status'] == 'approved';

    return app_models.User(
      id: authUser.id,
      name:
          _parseString(metadata['name']) ??
          authUser.email?.split('@')[0] ??
          'User',
      email: authUser.email ?? '',
      role: role,
      createdAt: profileData?['created_at'] as String?,
      updatedAt: profileData?['updated_at'] as String?,
      isApproved: isApproved,
      employeeId:
          _parseString(metadata['employeeId']) ??
          profileData?['employee_id'] as String?,
      phoneVerified: profileData?['phone_verified'] as bool? ?? false,
      phoneVerifiedAt: profileData?['phone_verified_at'] as String?,
      emailVerified: authUser.emailConfirmedAt != null,
      // emailConfirmedAt is already a String? in supabase_flutter 2.x
      emailVerifiedAt: authUser.emailConfirmedAt,
      stateId:
          _parseString(metadata['stateId']) ??
          profileData?['state_id'] as String?,
      localityId:
          _parseString(metadata['localityId']) ??
          profileData?['locality_id'] as String?,
      hubId:
          _parseString(metadata['hubId']) ?? profileData?['hub_id'] as String?,
      avatar:
          _parseString(metadata['avatar']) ??
          profileData?['avatar_url'] as String?,
      username: profileData?['username'] as String?,
      fullName: profileData?['full_name'] as String?,
      phone:
          _parseString(metadata['phone']) ?? profileData?['phone'] as String?,
      lastActive:
          profileData?['last_active'] as String? ??
          DateTime.now().toIso8601String(),
      availability: profileData?['availability'] as String? ?? 'offline',
      roles: userRoles.isNotEmpty ? userRoles : null,
      location: location,
      classification: classification,
    );
  }

  /// Convert string to AppRole
  app_models.AppRole _stringToAppRole(String value) {
    switch (value.toLowerCase()) {
      case 'datacollector':
        return app_models.AppRole.dataCollector;
      case 'coordinator':
        return app_models.AppRole.coordinator;
      case 'supervisor':
        return app_models.AppRole.supervisor;
      case 'fieldopmanager':
      case 'fom':
        return app_models.AppRole.fom;
      case 'admin':
        return app_models.AppRole.admin;
      default:
        throw Exception('Unknown role: $value');
    }
  }

  /// Safe string parsing
  String? _parseString(dynamic value) {
    if (value == null) return null;
    if (value is String) return value;
    return value.toString();
  }

  // ===== LOCAL STORAGE METHODS =====

  /// Store authentication data locally for offline access
  Future<void> _storeAuthDataLocally(Session session) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('auth_token', session.accessToken);
      await prefs.setString('refresh_token', session.refreshToken ?? '');
      await prefs.setString('user_id', session.user.id);
      await prefs.setString('user_email', session.user.email ?? '');
      await prefs.setString(
        'user_name',
        session.user.userMetadata?['name'] ?? '',
      );
      await prefs.setBool('is_logged_in', true);
      await prefs.setInt('token_expires_at', session.expiresAt ?? 0);

      debugPrint('Auth data stored locally');
    } catch (e) {
      debugPrint('Error storing auth data locally: $e');
    }
  }

  /// Store user data locally
  Future<void> _storeUserLocally(app_models.User user) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userJson = user.toJson();
      await prefs.setString('current_user', userJson.toString());
      await prefs.setString('user_role', user.role);
      await prefs.setString('user_id', user.id);
      debugPrint('User data stored locally');
    } catch (e) {
      debugPrint('Error storing user data locally: $e');
    }
  }

  /// Clear local authentication data
  Future<void> _clearLocalAuthData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('auth_token');
      await prefs.remove('refresh_token');
      await prefs.remove('user_id');
      await prefs.remove('user_email');
      await prefs.remove('user_name');
      await prefs.remove('current_user');
      await prefs.remove('user_role');
      await prefs.setBool('is_logged_in', false);
      await prefs.remove('token_expires_at');

      debugPrint('Local auth data cleared');
    } catch (e) {
      debugPrint('Error clearing local auth data: $e');
    }
  }

  /// Get locally stored authentication data
  Future<Map<String, dynamic>?> getLocalAuthData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final isLoggedIn = prefs.getBool('is_logged_in') ?? false;
      if (!isLoggedIn) return null;

      final token = prefs.getString('auth_token');
      final refreshToken = prefs.getString('refresh_token');
      final userId = prefs.getString('user_id');
      final userEmail = prefs.getString('user_email');
      final userName = prefs.getString('user_name');
      final expiresAt = prefs.getInt('token_expires_at');

      if (token == null || userId == null) return null;

      // Check if token is expired
      final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      if (expiresAt != null && now > expiresAt) {
        await _clearLocalAuthData();
        return null;
      }

      return {
        'access_token': token,
        'refresh_token': refreshToken,
        'user_id': userId,
        'user_email': userEmail,
        'user_name': userName,
        'expires_at': expiresAt,
      };
    } catch (e) {
      debugPrint('Error getting local auth data: $e');
      return null;
    }
  }

  /// Check if user is logged in locally (for offline access)
  Future<bool> isLoggedInLocally() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool('is_logged_in') ?? false;
    } catch (e) {
      return false;
    }
  }

  /// Get cached user profile data
  Future<app_models.User?> getLocalUserProfile() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userJsonStr = prefs.getString('current_user');
      if (userJsonStr == null) return null;

      // Note: You'll need to implement proper JSON parsing
      // This is a simplified version
      return null;
    } catch (e) {
      debugPrint('Error getting local user profile: $e');
      return null;
    }
  }

  /// Store user preferences locally
  Future<void> storeUserPreferences(Map<String, dynamic> preferences) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      for (final entry in preferences.entries) {
        final key = 'pref_${entry.key}';
        final value = entry.value;

        if (value is String) {
          await prefs.setString(key, value);
        } else if (value is bool) {
          await prefs.setBool(key, value);
        } else if (value is int) {
          await prefs.setInt(key, value);
        } else if (value is double) {
          await prefs.setDouble(key, value);
        }
      }

      debugPrint('User preferences stored');
    } catch (e) {
      debugPrint('Error storing user preferences: $e');
    }
  }

  /// Get user preferences from local storage
  Future<Map<String, dynamic>> getUserPreferences() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final preferences = <String, dynamic>{};
      final keys = prefs.getKeys().where((key) => key.startsWith('pref_'));

      for (final key in keys) {
        final value = prefs.get(key);
        if (value != null) {
          preferences[key.substring(5)] = value; // Remove 'pref_' prefix
        }
      }

      return preferences;
    } catch (e) {
      debugPrint('Error getting user preferences: $e');
      return {};
    }
  }
}
