import 'package:flutter/foundation.dart' show kIsWeb, kDebugMode;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Handles all authentication-related operations
class AuthService {
  final supabase = Supabase.instance.client;

  // Singleton pattern
  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;
  AuthService._internal();

  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;

    // Listen for auth state changes
    supabase.auth.onAuthStateChange.listen((data) {
      if (data.event == AuthChangeEvent.signedIn) {
        // Handle sign in
        _handleSignIn(data.session?.user);
      } else if (data.event == AuthChangeEvent.signedOut) {
        // Handle sign out
        _handleSignOut();
      }
    });

    _initialized = true;
  }

  Future<void> _handleSignIn(User? user) async {
    if (user == null) return;

    try {
      // Store auth data locally for offline access
      final session = supabase.auth.currentSession;
      if (session != null) {
        await _storeAuthDataLocally(session);
      }

      // Check if user profile exists in Users table
      final profile = await supabase
          .from('Users')
          .select()
          .eq('UID', user.id)
          .maybeSingle();

      if (profile == null) {
        // Create new user profile if doesn't exist
        await supabase.from('Users').insert({
          'UID': user.id,
          'Display name':
              user.userMetadata?['full_name'] ??
              user.email?.split('@')[0] ??
              'User',
          'Email': user.email,
          'phone': user.userMetadata?['phone'],
          'Providers': ['email'],
          'Provider type': 'email',
          'Created at': DateTime.now().toIso8601String(),
          'Last sign in at': DateTime.now().toIso8601String(),
          'status': 'online',
        });
      } else {
        // Update last sign in time
        await supabase
            .from('Users')
            .update({'Last sign in at': DateTime.now().toIso8601String()})
            .eq('UID', user.id);
      }

      // Ensure user has worker role
      final role = await supabase
          .from('user_roles')
          .select()
          .eq('user_id', user.id)
          .eq('role', 'worker')
          .maybeSingle();

      if (role == null) {
        await supabase.from('user_roles').insert({
          'user_id': user.id,
          'role': 'worker',
        });
      }
    } catch (e) {
      debugPrint('Error handling sign in: $e');
    }
  }

  void _handleSignOut() {
    // Clear local authentication data
    _clearLocalAuthData();
    // Add any other cleanup needed on sign out
  }

  // Stream of auth changes
  Stream<AuthState> get authStateChanges => supabase.auth.onAuthStateChange;

  // Current user
  User? get currentUser => supabase.auth.currentUser;

  // Sign in with email and password
  Future<AuthResponse> signIn({
    required String email,
    required String password,
  }) async {
    try {
      final response = await supabase.auth.signInWithPassword(
        email: email,
        password: password,
      );
      return response;
    } on AuthException catch (e) {
      if (kDebugMode) {
        print('Auth error: ${e.message}');
      }
      throw AuthException(e.message);
    } catch (e) {
      throw AuthException('An unexpected error occurred');
    }
  }

  Future<AuthResponse> signUp({
    required String email,
    required String password,
    String? name,
    String? phone,
    String? employeeId,
    String? role,
    String? hubId,
    String? stateId,
    String? localityId,
    String? avatarUrl,
  }) async {
    try {
      // CRITICAL: Always include role in metadata (defaults to 'dataCollector' if not provided)
      // This ensures the handle_new_user trigger can properly set the profile role
      // The database trigger reads from raw_user_meta_data->>'role'
      final normalizedRole = role?.trim().toLowerCase() ?? 'dataCollector';
      
      debugPrint('[AuthService] SignUp with metadata: role=$normalizedRole, hubId=$hubId, stateId=$stateId, localityId=$localityId');
      
      final response = await supabase.auth.signUp(
        email: email,
        password: password,
        data: {
          // Always include name (use email prefix if not provided)
          'name': name?.trim() ?? email.split('@')[0],
          // Include phone if provided
          if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
          // Include employeeId if provided
          if (employeeId != null && employeeId.trim().isNotEmpty) 'employeeId': employeeId.trim(),
          // CRITICAL: Always include role (never null)
          'role': normalizedRole,
          // Include location data if provided (required for coordinators/data collectors)
          if (hubId != null && hubId.trim().isNotEmpty) 'hubId': hubId.trim(),
          if (stateId != null && stateId.trim().isNotEmpty) 'stateId': stateId.trim(),
          if (localityId != null && localityId.trim().isNotEmpty) 'localityId': localityId.trim(),
          // Include avatar if provided
          if (avatarUrl != null && avatarUrl.trim().isNotEmpty) 'avatar': avatarUrl.trim(),
        },
      );
      
      debugPrint('[AuthService] SignUp successful. User ID: ${response.user?.id}');
      debugPrint('[AuthService] User metadata: ${response.user?.userMetadata}');
      
      return response;
    } on AuthException catch (e) {
      if (kDebugMode) {
        debugPrint('[AuthService] SignUp error: ${e.message}');
      }
      throw AuthException(e.message);
    } catch (e) {
      debugPrint('[AuthService] Unexpected signup error: $e');
      throw AuthException('An unexpected error occurred');
    }
  }

  // Sign out
  Future<void> signOut() async {
    try {
      await supabase.auth.signOut();
      // Clear local authentication data
      await _clearLocalAuthData();
    } catch (e) {
      throw AuthException('Failed to sign out');
    }
  }

  /// Check if user is approved for login
  Future<bool> isUserApproved(String userId) async {
    try {
      final profile = await supabase
          .from('profiles')
          .select('status')
          .eq('id', userId)
          .single();

      return profile['status'] == 'approved';
    } catch (e) {
      debugPrint('Error checking user approval: $e');
      return false;
    }
  }

  /// Approve user (admin function)
  Future<void> approveUser(String userId) async {
    try {
      await supabase
          .from('profiles')
          .update({'status': 'approved'})
          .eq('id', userId);
    } catch (e) {
      throw AuthException('Failed to approve user');
    }
  }

  /// Resend verification email
  Future<void> resendVerificationEmail(String email) async {
    try {
      await supabase.auth.resend(type: OtpType.signup, email: email);
    } catch (e) {
      throw AuthException('Failed to resend verification email');
    }
  }

  /// Request password reset with OTP
  Future<void> requestPasswordReset(String email) async {
    try {
      // Call the verify-reset-otp edge function with 'generate' action
      final response = await supabase.functions.invoke(
        'verify-reset-otp',
        body: {'email': email.toLowerCase(), 'action': 'generate'},
      );

      if (response.status != 200) {
        throw AuthException('Failed to send reset code');
      }

      // The function returns success even if user doesn't exist (security)
    } catch (e) {
      debugPrint('Error requesting password reset: $e');
      throw AuthException('Failed to send reset code. Please try again.');
    }
  }

  /// Verify OTP for password reset
  Future<void> verifyPasswordResetOTP(String email, String otp) async {
    try {
      final response = await supabase.functions.invoke(
        'verify-reset-otp',
        body: {'email': email.toLowerCase(), 'otp': otp},
      );

      if (response.status != 200) {
        throw AuthException('Invalid or expired verification code');
      }

      final data = response.data;
      if (data == null || !(data['success'] as bool)) {
        throw AuthException('Invalid or expired verification code');
      }
    } catch (e) {
      debugPrint('Error verifying OTP: $e');
      if (e is AuthException) rethrow;
      throw AuthException('Failed to verify code. Please try again.');
    }
  }

  /// Reset password with OTP
  Future<void> resetPasswordWithOTP(
    String email,
    String otp,
    String newPassword,
  ) async {
    try {
      final response = await supabase.functions.invoke(
        'reset-password-with-otp',
        body: {
          'email': email.toLowerCase(),
          'otp': otp,
          'newPassword': newPassword,
        },
      );

      if (response.status != 200) {
        throw AuthException('Failed to reset password');
      }

      final data = response.data;
      if (data == null || !(data['success'] as bool)) {
        throw AuthException('Failed to reset password');
      }
    } catch (e) {
      debugPrint('Error resetting password: $e');
      if (e is AuthException) rethrow;
      throw AuthException('Failed to reset password. Please try again.');
    }
  }

  /// Signs in user with Google OAuth using platform-specific approach
  Future<bool> signInWithGoogle() async {
    try {
      final response = await supabase.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: kIsWeb
            ? 'http://localhost:8080' // Local development URL
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
        session.user.userMetadata?['full_name'] ?? '',
      );
      await prefs.setBool('is_logged_in', true);
      await prefs.setInt('token_expires_at', session.expiresAt ?? 0);
    } catch (e) {
      debugPrint('Error storing auth data locally: $e');
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
      await prefs.setBool('is_logged_in', false);
      await prefs.remove('token_expires_at');
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
  Future<Map<String, dynamic>?> getLocalUserProfile() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userId = prefs.getString('user_id');
      final userEmail = prefs.getString('user_email');
      final userName = prefs.getString('user_name');

      if (userId == null) return null;

      return {'id': userId, 'email': userEmail, 'name': userName};
    } catch (e) {
      debugPrint('Error getting local user profile: $e');
      return null;
    }
  }

  /// Store user preferences locally
  Future<void> storeUserPreferences(Map<String, dynamic> preferences) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      preferences.forEach((key, value) async {
        if (value is String) {
          await prefs.setString('pref_$key', value);
        } else if (value is bool) {
          await prefs.setBool('pref_$key', value);
        } else if (value is int) {
          await prefs.setInt('pref_$key', value);
        } else if (value is double) {
          await prefs.setDouble('pref_$key', value);
        }
      });
    } catch (e) {
      debugPrint('Error storing user preferences: $e');
    }
  }

  /// Get user preferences from local storage
  Future<Map<String, dynamic>> getUserPreferences() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final preferences = <String, dynamic>{};

      // Get all keys that start with 'pref_'
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
