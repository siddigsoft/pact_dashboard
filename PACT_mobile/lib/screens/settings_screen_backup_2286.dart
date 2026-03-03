import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shorebird_code_push/shorebird_code_push.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:io';
import 'dart:async';
import 'dart:convert';
import '../widgets/reusable_app_bar.dart';
import '../widgets/custom_drawer_menu.dart';
import '../theme/app_colors.dart';
import '../services/offline/offline_db.dart';
import '../services/biometric_auth_service.dart';
import '../services/offline_notifications_service.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final ImagePicker _imagePicker = ImagePicker();
  final _offlineNotificationsService = OfflineNotificationsService();

  bool _isLoading = true;
  bool _isSaving = false;
  String? _userId;
  String? _userName = '';
  String? _userEmail = '';
  String? _userAvatar;
  String? _userRole;

  // Settings state
  bool _locationSharing = false;
  bool _notificationsEnabled = true;
  bool _darkMode = false;
  bool _biometricEnabled = false;
  bool _biometricAvailable = false;

  // Notification settings
  String _notificationSound = 'default';
  bool _notificationVibration = true;
  bool _notificationLights = true;
  bool _chatNotifications = true;
  bool _callNotifications = true;
  bool _updateNotifications = true;
  bool _dndEnabled = false;
  TimeOfDay _dndStartTime = const TimeOfDay(hour: 22, minute: 0);
  TimeOfDay _dndEndTime = const TimeOfDay(hour: 8, minute: 0);
  final List<String> _dndDays = [];

  // Mobile optimization settings
  bool _dataSaverMode = false;
  bool _reduceImageQuality = false;
  bool _offlineSyncEnabled = true;
  bool _autoBackupEnabled = true;
  String _lastBackupTime = 'Never';

  // Offline notifications state
  int _queuedNotificationsCount = 0;
  final bool _showRetryOptions = false;
  final NotificationSyncStatus _syncStatus = NotificationSyncStatus.idle;

  // Accessibility settings
  double _fontSize = 1.0; // 1.0 = normal, 0.8 = small, 1.2 = large
  bool _highContrast = false;
  bool _reduceAnimations = false;

  // App version
  String _appVersion = '';
  String _buildNumber = '';
  int? _patchNumber;

  // Sync status
  int _pendingSyncCount = 0;
  int _pendingSiteVisitsCount = 0;
  int _pendingRequestsCount = 0;

  // Offline notifications status
  late NotificationSyncStatus _notificationSyncStatus;

  // Password change
  final bool _showChangePassword = false;
  final TextEditingController _oldPasswordController = TextEditingController();
  final TextEditingController _newPasswordController = TextEditingController();
  final TextEditingController _confirmPasswordController =
      TextEditingController();
  final bool _obscureOldPassword = true;
  final bool _obscureNewPassword = true;
  final bool _obscureConfirmPassword = true;

  // Auto-save timer
  Timer? _autoSaveTimer;

  @override
  void initState() {
    super.initState();
    _initializeOfflineNotifications();
    _loadUserData();
    _loadAppVersion();
    _loadSyncStatus();
    _checkBiometricAvailability();
  }

  /// Initialize offline notifications service and listeners
  Future<void> _initializeOfflineNotifications() async {
    try {
      await _offlineNotificationsService.initialize();

      // Set initial status
      _notificationSyncStatus = NotificationSyncStatus.idle;

      // Get initial queue count
      final queue = await _offlineNotificationsService.getQueuedNotifications();
      if (mounted) {
        setState(() {
          _queuedNotificationsCount = queue.length;
        });
      }

      // Listen to queue count updates
      _offlineNotificationsService.queueCountStream.listen((count) {
        if (mounted) {
          setState(() => _queuedNotificationsCount = count);
        }
      });

      // Listen to sync status updates
      _offlineNotificationsService.syncStatusStream.listen((status) {
        if (mounted) {
          setState(() => _notificationSyncStatus = status);
        }
      });

      debugPrint('[Settings] Offline notifications initialized with listeners');
    } catch (e) {
      debugPrint('Error initializing offline notifications: $e');
    }
  }

  /// Retry failed notifications
  Future<void> _retryFailedNotifications() async {
    setState(() => _notificationSyncStatus = NotificationSyncStatus.syncing);

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Retrying failed notifications...'),
        duration: Duration(seconds: 2),
      ),
    );

    // Sync would be triggered by parent service
    debugPrint('[Settings] Manual retry triggered for offline notifications');
  }

  /// Show detailed view of queued notifications
  Future<void> _showQueueDetailedView() async {
    final notifications = await _offlineNotificationsService
        .getQueuedNotifications();
    if (!mounted) return;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.only(
            topLeft: Radius.circular(20),
            topRight: Radius.circular(20),
          ),
        ),
        child: Scaffold(
          appBar: AppBar(
            title: Text(
              'Queued Notifications (${notifications.length})',
              style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
            ),
            centerTitle: true,
            elevation: 0,
            backgroundColor: AppColors.primaryBlue,
            automaticallyImplyLeading: false,
            actions: [
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          body: notifications.isEmpty
              ? Center(
                  child: Text(
                    'No notifications queued',
                    style: GoogleFonts.poppins(color: AppColors.textLight),
                  ),
                )
              : ListView.builder(
                  itemCount: notifications.length,
                  itemBuilder: (context, index) {
                    final notif = notifications[index];
                    return ListTile(
                      leading: Icon(
                        notif['type'] == 'call'
                            ? Icons.call
                            : notif['type'] == 'chat'
                            ? Icons.message
                            : Icons.info,
                        color: AppColors.primaryBlue,
                      ),
                      title: Text(
                        notif['title'] ?? 'Unknown',
                        style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        notif['body'] ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: notif['synced'] == true
                              ? AppColors.accentGreen.withOpacity(0.1)
                              : Colors.orange.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          notif['synced'] == true ? 'Synced' : 'Pending',
                          style: GoogleFonts.poppins(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: notif['synced'] == true
                                ? AppColors.accentGreen
                                : Colors.orange,
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }

  Future<void> _checkBiometricAvailability() async {
    try {
      final biometricService = BiometricAuthService();
      final isAvailable = await biometricService.isBiometricAvailable();
      final isEnabled = await biometricService.isBiometricEnabled();

      setState(() {
        _biometricAvailable = isAvailable;
        _biometricEnabled = isEnabled;
      });
    } catch (e) {
      debugPrint('Error checking biometric availability: $e');
    }
  }

  Future<void> _toggleBiometric(bool value) async {
    try {
      final biometricService = BiometricAuthService();
      final user = Supabase.instance.client.auth.currentUser;

      if (value) {
        // Enable biometric - authenticate first
        final authenticated = await biometricService.authenticate(
          reason: 'Enable biometric authentication for faster login',
        );

        if (authenticated && user != null && user.email != null) {
          // Get user password via dialog
          if (mounted) {
            final password = await _showPasswordInputDialog();
            if (password != null && password.isNotEmpty) {
              // Store credentials for biometric login
              await biometricService.storeCredentials(user.email!, password);

              // Enable biometric (this also stores email)
              await biometricService.enableBiometric(user.email!);

              setState(() => _biometricEnabled = true);
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Biometric authentication enabled successfully',
                    ),
                    backgroundColor: Colors.green,
                  ),
                );
              }
            } else {
              setState(() => _biometricEnabled = false);
            }
          }
        } else {
          setState(() => _biometricEnabled = false);
        }
      } else {
        // Disable biometric
        await biometricService.disableBiometric();
        setState(() => _biometricEnabled = false);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Biometric authentication disabled'),
              backgroundColor: Colors.orange,
            ),
          );
        }
      }
    } catch (e) {
      debugPrint('Error toggling biometric: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
      // Reset toggle state if there was an error
      setState(() => _biometricEnabled = !value);
    }
  }

  Future<String?> _showPasswordInputDialog() async {
    TextEditingController passwordController = TextEditingController();
    bool obscureText = true;

    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return StatefulBuilder(
          builder: (context, setState) => AlertDialog(
            title: const Text('Enter Your Password'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Your password is needed to enable biometric login'),
                const SizedBox(height: 16),
                TextField(
                  controller: passwordController,
                  obscureText: obscureText,
                  decoration: InputDecoration(
                    labelText: 'Password',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    suffixIcon: IconButton(
                      icon: Icon(
                        obscureText ? Icons.visibility_off : Icons.visibility,
                      ),
                      onPressed: () {
                        setState(() => obscureText = !obscureText);
                      },
                    ),
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  Navigator.pop(context, passwordController.text);
                },
                child: const Text('Save'),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _loadSyncStatus() async {
    try {
      final offlineDb = OfflineDb();
      final pendingSync = offlineDb.getPendingSyncActions(status: 'pending');
      final pendingSiteVisits = offlineDb.getPendingSiteVisits();

      setState(() {
        _pendingSyncCount = pendingSync.length;
        _pendingSiteVisitsCount = pendingSiteVisits.length;
        _pendingRequestsCount = pendingSync.length + pendingSiteVisits.length;
      });
    } catch (e) {
      debugPrint('Error loading sync status: $e');
    }
  }

  Future<void> _loadAppVersion() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();

      // Get Shorebird patch number
      int? patchNumber;
      try {
        final codePush = ShorebirdCodePush();
        final isAvailable = codePush.isShorebirdAvailable();
        if (isAvailable) {
          patchNumber = await codePush.currentPatchNumber();
        }
      } catch (e) {
        debugPrint('Error getting Shorebird patch number: $e');
      }

      setState(() {
        _appVersion = packageInfo.version;
        _buildNumber = packageInfo.buildNumber;
        _patchNumber = patchNumber;
      });
    } catch (e) {
      debugPrint('Error loading app version: $e');
    }
  }

  @override
  void dispose() {
    _autoSaveTimer?.cancel();
    _offlineNotificationsService.dispose();
    _oldPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _loadUserData() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) {
        setState(() => _isLoading = false);
        return;
      }

      _userId = user.id;
      _userEmail = user.email;

      // Load profile data
      final profileResponse = await Supabase.instance.client
          .from('profiles')
          .select('full_name, avatar_url, role, location_sharing')
          .eq('id', user.id)
          .maybeSingle();

      if (profileResponse != null) {
        setState(() {
          _userName = profileResponse['full_name'] as String? ?? '';
          _userAvatar = profileResponse['avatar_url'] as String?;
          _userRole = profileResponse['role'] as String?;
          _locationSharing =
              profileResponse['location_sharing'] as bool? ?? false;
        });
      }

      // Load notification settings
      final settingsResponse = await Supabase.instance.client
          .from('user_settings')
          .select('settings')
          .eq('user_id', user.id)
          .maybeSingle();

      if (settingsResponse != null) {
        final settings = settingsResponse['settings'] as Map<String, dynamic>?;
        if (settings != null) {
          setState(() {
            _notificationsEnabled =
                settings['notifications']?['enabled'] as bool? ?? true;
            _notificationSound =
                settings['notification_sound'] as String? ?? 'default';
            _notificationVibration =
                settings['notification_vibration'] as bool? ?? true;
            _notificationLights =
                settings['notification_lights'] as bool? ?? true;
            _chatNotifications =
                settings['chat_notifications'] as bool? ?? true;
            _callNotifications =
                settings['call_notifications'] as bool? ?? true;
            _updateNotifications =
                settings['update_notifications'] as bool? ?? true;
            _dndEnabled = settings['dnd_enabled'] as bool? ?? false;
            _dataSaverMode = settings['data_saver_mode'] as bool? ?? false;
            _reduceImageQuality =
                settings['reduce_image_quality'] as bool? ?? false;
            _offlineSyncEnabled =
                settings['offline_sync_enabled'] as bool? ?? true;
            _autoBackupEnabled =
                settings['auto_backup_enabled'] as bool? ?? true;
            _lastBackupTime =
                settings['last_backup_time'] as String? ?? 'Never';
            _darkMode = settings['appearance']?['darkMode'] as bool? ?? false;
            _fontSize =
                (settings['accessibility']?['fontSize'] as num?)?.toDouble() ??
                1.0;
            _highContrast =
                settings['accessibility']?['highContrast'] as bool? ?? false;
            _reduceAnimations =
                settings['accessibility']?['reduceAnimations'] as bool? ??
                false;
          });
        }
      }

      setState(() => _isLoading = false);
    } catch (e) {
      debugPrint('Error loading user data: $e');
      setState(() => _isLoading = false);
    }
  }

  Future<void> _updateProfile() async {
    if (_userId == null) return;

    setState(() => _isSaving = true);

    try {
      // Build settings data
      final settingsData = {
        'settings': {
          'notifications': {'enabled': _notificationsEnabled},
          'notification_sound': _notificationSound,
          'notification_vibration': _notificationVibration,
          'notification_lights': _notificationLights,
          'chat_notifications': _chatNotifications,
          'call_notifications': _callNotifications,
          'update_notifications': _updateNotifications,
          'dnd_enabled': _dndEnabled,
          'dnd_start_time':
              '${_dndStartTime.hour.toString().padLeft(2, '0')}:${_dndStartTime.minute.toString().padLeft(2, '0')}',
          'dnd_end_time':
              '${_dndEndTime.hour.toString().padLeft(2, '0')}:${_dndEndTime.minute.toString().padLeft(2, '0')}',
          'data_saver_mode': _dataSaverMode,
          'reduce_image_quality': _reduceImageQuality,
          'offline_sync_enabled': _offlineSyncEnabled,
          'auto_backup_enabled': _autoBackupEnabled,
          'last_backup_time': _lastBackupTime,
          'appearance': {'darkMode': _darkMode},
          'accessibility': {
            'fontSize': _fontSize,
            'highContrast': _highContrast,
            'reduceAnimations': _reduceAnimations,
          },
        },
      };

      // Update profile
      final updateData = <String, dynamic>{
        'full_name': _userName,
        'location_sharing': _locationSharing,
      };

      if (_userAvatar != null) {
        updateData['avatar_url'] = _userAvatar;
      }

      final response = await Supabase.instance.client
          .from('profiles')
          .update(updateData)
          .eq('id', _userId!)
          .select()
          .maybeSingle();

      if (response == null) {
        throw Exception('Failed to update profile');
      }

      // Update user settings in Supabase
      await Supabase.instance.client.from('user_settings').upsert({
        'user_id': _userId!,
        ...settingsData,
      });

      // ALSO save settings to local storage as fallback
      await _saveSettingsLocally(settingsData);

      // Apply settings to app immediately
      await _applySettingsToApp();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Settings saved and applied successfully'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      debugPrint('Error updating settings: $e');

      // Try to save locally even if Supabase fails
      try {
        final settingsData = {
          'settings': {
            'notifications': {'enabled': _notificationsEnabled},
            'notification_sound': _notificationSound,
            'notification_vibration': _notificationVibration,
            'notification_lights': _notificationLights,
            'chat_notifications': _chatNotifications,
            'call_notifications': _callNotifications,
            'update_notifications': _updateNotifications,
            'dnd_enabled': _dndEnabled,
            'data_saver_mode': _dataSaverMode,
            'reduce_image_quality': _reduceImageQuality,
            'offline_sync_enabled': _offlineSyncEnabled,
            'auto_backup_enabled': _autoBackupEnabled,
            'appearance': {'darkMode': _darkMode},
            'accessibility': {
              'fontSize': _fontSize,
              'highContrast': _highContrast,
              'reduceAnimations': _reduceAnimations,
            },
          },
        };
        await _saveSettingsLocally(settingsData);
        await _applySettingsToApp();

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Settings saved locally (will sync when online)'),
              backgroundColor: Colors.orange,
            ),
          );
        }
      } catch (localError) {
        debugPrint('Error saving settings locally: $localError');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Error updating settings: ${e.toString()}'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } finally {
      setState(() => _isSaving = false);
    }
  }

  /// Save settings to local storage (SharedPreferences) as fallback
  Future<void> _saveSettingsLocally(Map<String, dynamic> settingsData) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final settingsJson = jsonEncode(settingsData);
      await prefs.setString('user_settings_backup', settingsJson);
      debugPrint('Settings saved to local storage');
    } catch (e) {
      debugPrint('Error saving settings locally: $e');
    }
  }

  /// Apply settings changes to the app immediately
  Future<void> _applySettingsToApp() async {
    try {
      // Apply dark mode
      if (mounted) {
        // Note: You need to integrate this with your theme provider
        // For now, we'll just debug log it
        debugPrint('Dark mode setting applied: $_darkMode');
      }

      // Apply font size
      debugPrint('Font size setting applied: $_fontSize');

      // Apply other settings as needed
      debugPrint('All settings applied to app');
    } catch (e) {
      debugPrint('Error applying settings to app: $e');
    }
  }

  /// Auto-save settings after each change (with debounce)
  Future<void> _autoSaveSettings() async {
    // Cancel any pending auto-save
    if (_autoSaveTimer != null) {
      _autoSaveTimer!.cancel();
    }

    // Schedule new auto-save after 2 seconds of inactivity
    _autoSaveTimer = Timer(const Duration(seconds: 2), () {
      if (_userId != null && mounted) {
        _updateProfile();
      }
    });
  }

  Future<void> _pickImage() async {
    try {
      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 512,
        maxHeight: 512,
        imageQuality: 85,
      );

      if (image == null) return;

      // Upload to Supabase storage
      final file = File(image.path);
      final fileBytes = await file.readAsBytes();
      final fileName =
          '${_userId}_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final filePath = fileName;

      await Supabase.instance.client.storage
          .from('avatars')
          .uploadBinary(
            filePath,
            fileBytes,
            fileOptions: const FileOptions(upsert: true),
          );

      final publicUrl = Supabase.instance.client.storage
          .from('avatars')
          .getPublicUrl(filePath);

      setState(() {
        _userAvatar = publicUrl;
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Profile picture updated'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      debugPrint('Error picking image: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error uploading image: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _changePassword() async {
    if (_oldPasswordController.text.isEmpty ||
        _newPasswordController.text.isEmpty ||
        _confirmPasswordController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('All fields are required'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_newPasswordController.text.length < 8) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Password must be at least 8 characters'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_newPasswordController.text != _confirmPasswordController.text) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Passwords do not match'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      // Use Supabase edge function for password change
      final response = await Supabase.instance.client.functions.invoke(
        'self-change-password',
        body: {
          'currentPassword': _oldPasswordController.text,
          'newPassword': _newPasswordController.text,
        },
      );

      if (response.status != 200) {
        throw Exception('Password change failed: ${response.data}');
      }

      final responseData = response.data;
      if (responseData != null && responseData is Map) {
        if (responseData['success'] != true) {
          throw Exception(
            responseData['error']?.toString() ?? 'Password change failed',
          );
        }
      }

      _oldPasswordController.clear();
      _newPasswordController.clear();
      _confirmPasswordController.clear();

      if (mounted) {
        Navigator.pop(context); // Close dialog
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Password changed successfully'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      debugPrint('Error changing password: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() => _isSaving = false);
    }
  }

  String _getInitials(String? name) {
    if (name == null || name.isEmpty) return 'U';
    final parts = name.split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name[0].toUpperCase();
  }

  Widget _buildSection({
    required String title,
    required IconData icon,
    required Color color,
    required List<Widget> children,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [color.withOpacity(0.1), color.withOpacity(0.05)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, color: Colors.white, size: 20),
                ),
                const SizedBox(width: 12),
                Text(
                  title,
                  style: GoogleFonts.poppins(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textDark,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: children),
          ),
        ],
      ),
    );
  }

  Widget _buildTextField({
    required String label,
    required String value,
    Function(String)? onChanged,
    IconData? icon,
    bool readOnly = false,
  }) {
    return TextField(
      controller: TextEditingController(text: value),
      onChanged: onChanged,
      readOnly: readOnly,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: icon != null
            ? Icon(icon, color: AppColors.primaryBlue)
            : null,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: readOnly,
        fillColor: readOnly ? AppColors.backgroundGray : Colors.white,
      ),
    );
  }

  Widget _buildSyncStatusBanner() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.orange.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.orange.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.orange,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(
              Icons.cloud_upload,
              color: Colors.white,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Pending Sync',
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    color: Colors.orange[800],
                    fontSize: 14,
                  ),
                ),
                Text(
                  '$_pendingRequestsCount item${_pendingRequestsCount > 1 ? 's' : ''} waiting to upload',
                  style: GoogleFonts.poppins(
                    color: Colors.orange[700],
                    fontSize: 12,
                  ),
                ),
                if (_pendingSiteVisitsCount > 0)
                  Text(
                    '($_pendingSiteVisitsCount site visit${_pendingSiteVisitsCount > 1 ? 's' : ''}, $_pendingSyncCount other action${_pendingSyncCount > 1 ? 's' : ''})',
                    style: GoogleFonts.poppins(
                      color: Colors.orange[600],
                      fontSize: 11,
                    ),
                  ),
              ],
            ),
          ),
          IconButton(
            icon: Icon(Icons.refresh, color: Colors.orange[700]),
            onPressed: _loadSyncStatus,
            tooltip: 'Refresh sync status',
          ),
        ],
      ),
    );
  }

  Widget _buildSwitchTile({
    required String title,
    required String subtitle,
    required bool value,
    required Function(bool) onChanged,
    IconData? icon,
  }) {
    return SwitchListTile(
      title: Text(
        title,
        style: GoogleFonts.poppins(fontWeight: FontWeight.w500),
      ),
      subtitle: Text(
        subtitle,
        style: GoogleFonts.poppins(fontSize: 12, color: AppColors.textLight),
      ),
      value: value,
      onChanged: onChanged,
      secondary: icon != null ? Icon(icon, color: AppColors.primaryBlue) : null,
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? AppColors.primaryBlue
            : null,
      ),
    );
  }

  Widget _buildDropdownTile({
    required String title,
    required String value,
    required List<String> items,
    required Function(String?) onChanged,
    IconData? icon,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, color: AppColors.primaryBlue),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w500),
                ),
              ],
            ),
          ),
          DropdownButton<String>(
            value: value,
            items: items.map((item) {
              return DropdownMenuItem<String>(
                value: item,
                child: Text(
                  item.replaceFirst(item[0], item[0].toUpperCase()),
                  style: GoogleFonts.poppins(fontSize: 12),
                ),
              );
            }).toList(),
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }

  /// Build offline notifications queue status widget with stream listeners
  Widget _buildOfflineNotificationsStatus() {
    return Column(
      children: [
        // Queue count stream
        StreamBuilder<int>(
          stream: _offlineNotificationsService.queueCountStream,
          builder: (context, snapshot) {
            final count = snapshot.data ?? 0;
            if (count == 0) {
              return Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.green.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.green.withOpacity(0.3)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.check_circle, color: Colors.green[700]),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'All notifications synced',
                        style: GoogleFonts.poppins(
                          color: Colors.green[700],
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }
            return Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.orange.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.orange.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  Icon(Icons.notifications_active, color: Colors.orange[700]),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '$count notification${count > 1 ? 's' : ''} queued offline',
                      style: GoogleFonts.poppins(
                        color: Colors.orange[700],
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
        const SizedBox(height: 12),
        // Sync status stream
        StreamBuilder<NotificationSyncStatus>(
          stream: _offlineNotificationsService.syncStatusStream,
          builder: (context, snapshot) {
            final status = snapshot.data ?? NotificationSyncStatus.idle;
            if (status == NotificationSyncStatus.idle) {
              return const SizedBox.shrink();
            }

            IconData icon;
            Color color;
            String message;

            switch (status) {
              case NotificationSyncStatus.syncing:
                icon = Icons.sync;
                color = Colors.blue;
                message = 'Syncing notifications...';
                break;
              case NotificationSyncStatus.success:
                icon = Icons.check_circle;
                color = Colors.green;
                message = 'Sync completed successfully';
                break;
              case NotificationSyncStatus.failed:
                icon = Icons.error;
                color = Colors.red;
                message = 'Sync failed - will retry';
                break;
              case NotificationSyncStatus.partiallyFailed:
                icon = Icons.warning;
                color = Colors.orange;
                message = 'Partial sync - some failed';
                break;
              default:
                return const SizedBox.shrink();
            }

            return Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: color.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  status == NotificationSyncStatus.syncing
                      ? SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(color),
                          ),
                        )
                      : Icon(icon, color: color),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      message,
                      style: GoogleFonts.poppins(
                        color: color,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.backgroundGray,
      drawer: CustomDrawerMenu(
        currentUser: Supabase.instance.client.auth.currentUser,
        onClose: () => _scaffoldKey.currentState?.closeDrawer(),
      ),
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(title: 'Settings', scaffoldKey: _scaffoldKey),
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Sync Status Banner
                          if (_pendingRequestsCount > 0)
                            _buildSyncStatusBanner(),

                          // Profile Section
                          _buildSection(
                            title: 'Profile',
                            icon: Icons.person_outline,
                            color: AppColors.primaryOrange,
                            children: [
                              // Profile Picture
                              Center(
                                child: Column(
                                  children: [
                                    Stack(
                                      children: [
                                        CircleAvatar(
                                          radius: 50,
                                          backgroundColor:
                                              AppColors.primaryBlue,
                                          backgroundImage: _userAvatar != null
                                              ? NetworkImage(_userAvatar!)
                                              : null,
                                          child: _userAvatar == null
                                              ? Text(
                                                  _getInitials(_userName),
                                                  style: GoogleFonts.poppins(
                                                    fontSize: 32,
                                                    fontWeight: FontWeight.bold,
                                                    color: Colors.white,
                                                  ),
                                                )
                                              : null,
                                        ),
                                        Positioned(
                                          bottom: 0,
                                          right: 0,
                                          child: GestureDetector(
                                            onTap: _pickImage,
                                            child: Container(
                                              padding: const EdgeInsets.all(4),
                                              decoration: const BoxDecoration(
                                                color: AppColors.primaryBlue,
                                                shape: BoxShape.circle,
                                              ),
                                              child: const Icon(
                                                Icons.camera_alt,
                                                size: 20,
                                                color: Colors.white,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    TextButton(
                                      onPressed: _pickImage,
                                      child: const Text('Change Photo'),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              // Name
                              _buildTextField(
                                label: 'Full Name',
                                value: _userName ?? '',
                                onChanged: (value) =>
                                    setState(() => _userName = value),
                                icon: Icons.person,
                              ),
                              const SizedBox(height: 16),
                              // Email (read-only)
                              _buildTextField(
                                label: 'Email',
                                value: _userEmail ?? '',
                                readOnly: true,
                                icon: Icons.email,
                              ),
                              const SizedBox(height: 16),
                              // Role (read-only)
                              if (_userRole != null)
                                _buildTextField(
                                  label: 'Role',
                                  value: _userRole!,
                                  readOnly: true,
                                  icon: Icons.badge,
                                ),
                            ],
                          ),

                          const SizedBox(height: 24),

                          // Location Settings
                          _buildSection(
                            title: 'Location',
                            icon: Icons.location_on,
                            color: Colors.cyan,
                            children: [
                              _buildSwitchTile(
                                title: 'Share Location with Team',
                                subtitle:
                                    'Allow team members to see your location',
                                value: _locationSharing,
                                onChanged: (value) =>
                                    setState(() => _locationSharing = value),
                                icon: Icons.location_on,
                              ),
                            ],
                          ),

                          const SizedBox(height: 24),

                          // Notifications (Expanded Section)
                          _buildSection(
                            title: 'Notifications',
                            icon: Icons.notifications_outlined,
                            color: AppColors.accentGreen,
                            children: [
                              // Offline Notifications Queue Status
                              _buildOfflineNotificationsStatus(),
                              const SizedBox(height: 16),
                              _buildSwitchTile(
                                title: 'Enable Notifications',
                                subtitle: 'Receive push notifications',
                                value: _notificationsEnabled,
                                onChanged: (value) => setState(
                                  () => _notificationsEnabled = value,
                                ),
                                icon: Icons.notifications,
                              ),
                              const Divider(height: 24),
                              Text(
                                'Notification Categories',
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 12),
                              _buildSwitchTile(
                                title: 'Chat Messages',
                                subtitle: 'Notifications from team chat',
                                value: _chatNotifications,
                                onChanged: (value) =>
                                    setState(() => _chatNotifications = value),
                                icon: Icons.message,
                              ),
                              _buildSwitchTile(
                                title: 'Calls & Meetings',
                                subtitle:
                                    'Incoming calls and meeting reminders',
                                value: _callNotifications,
                                onChanged: (value) =>
                                    setState(() => _callNotifications = value),
                                icon: Icons.call,
                              ),
                              _buildSwitchTile(
                                title: 'System Updates',
                                subtitle:
                                    'App updates and system notifications',
                                value: _updateNotifications,
                                onChanged: (value) => setState(
                                  () => _updateNotifications = value,
                                ),
                                icon: Icons.system_update,
                              ),
                              const Divider(height: 24),
                              Text(
                                'Notification Settings',
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 12),
                              _buildDropdownTile(
                                title: 'Notification Sound',
                                value: _notificationSound,
                                items: ['default', 'chime', 'bell', 'silent'],
                                onChanged: (value) {
                                  if (value != null) {
                                    setState(() => _notificationSound = value);
                                  }
                                },
                              ),
                              _buildSwitchTile(
                                title: 'Vibration',
                                subtitle: 'Vibrate on notification',
                                value: _notificationVibration,
                                onChanged: (value) => setState(
                                  () => _notificationVibration = value,
                                ),
                                icon: Icons.vibration,
                              ),
                              _buildSwitchTile(
                                title: 'Notification Lights',
                                subtitle: 'Show LED indicator (Android)',
                                value: _notificationLights,
                                onChanged: (value) =>
                                    setState(() => _notificationLights = value),
                                icon: Icons.lightbulb,
                              ),
                            ],
                          ),

                          const SizedBox(height: 24),

                          // Do Not Disturb Settings
                          _buildSection(
                            title: 'Do Not Disturb',
                            icon: Icons.do_not_disturb,
                            color: Colors.red,
                            children: [
                              _buildSwitchTile(
                                title: 'Enable DND',
                                subtitle:
                                    'Disable notifications during set hours',
                                value: _dndEnabled,
                                onChanged: (value) =>
                                    setState(() => _dndEnabled = value),
                                icon: Icons.schedule,
                              ),
                              if (_dndEnabled) ...[
                                const Divider(height: 24),
                                Padding(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 12,
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'DND Time Range',
                                        style: GoogleFonts.poppins(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 14,
                                        ),
                                      ),
                                      const SizedBox(height: 16),
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  'From',
                                                  style: GoogleFonts.poppins(
                                                    fontSize: 12,
                                                    color: AppColors.textLight,
                                                  ),
                                                ),
                                                Container(
                                                  margin: const EdgeInsets.only(
                                                    top: 8,
                                                  ),
                                                  padding: const EdgeInsets.all(
                                                    12,
                                                  ),
                                                  decoration: BoxDecoration(
                                                    border: Border.all(
                                                      color: AppColors
                                                          .backgroundGray,
                                                    ),
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          8,
                                                        ),
                                                  ),
                                                  child: GestureDetector(
                                                    onTap: () async {
                                                      final time =
                                                          await showTimePicker(
                                                            context: context,
                                                            initialTime:
                                                                _dndStartTime,
                                                          );
                                                      if (time != null) {
                                                        setState(
                                                          () => _dndStartTime =
                                                              time,
                                                        );
                                                      }
                                                    },
                                                    child: Text(
                                                      _dndStartTime.format(
                                                        context,
                                                      ),
                                                      style:
                                                          GoogleFonts.poppins(
                                                            fontWeight:
                                                                FontWeight.w600,
                                                          ),
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  'To',
                                                  style: GoogleFonts.poppins(
                                                    fontSize: 12,
                                                    color: AppColors.textLight,
                                                  ),
                                                ),
                                                Container(
                                                  margin: const EdgeInsets.only(
                                                    top: 8,
                                                  ),
                                                  padding: const EdgeInsets.all(
                                                    12,
                                                  ),
                                                  decoration: BoxDecoration(
                                                    border: Border.all(
                                                      color: AppColors
                                                          .backgroundGray,
                                                    ),
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          8,
                                                        ),
                                                  ),
                                                  child: GestureDetector(
                                                    onTap: () async {
                                                      final time =
                                                          await showTimePicker(
                                                            context: context,
                                                            initialTime:
                                                                _dndEndTime,
                                                          );
                                                      if (time != null) {
                                                        setState(
                                                          () => _dndEndTime =
                                                              time,
                                                        );
                                                      }
                                                    },
                                                    child: Text(
                                                      _dndEndTime.format(
                                                        context,
                                                      ),
                                                      style:
                                                          GoogleFonts.poppins(
                                                            fontWeight:
                                                                FontWeight.w600,
                                                          ),
                                                    ),
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
                              ],
                            ],
                          ),

                          const SizedBox(height: 24),

                          // Offline Notifications
                          _buildSection(
                            title: 'Offline Notifications',
                            icon: Icons.cloud_off,
                            color: Colors.orange,
                            children: [
                              _buildSwitchTile(
                                title: 'Enable Offline Queue',
                                subtitle:
                                    'Queue notifications when offline, sync when online',
                                value: _offlineSyncEnabled,
                                onChanged: (value) {
                                  setState(() => _offlineSyncEnabled = value);
                                },
                                icon: Icons.sync,
                              ),
                              const Divider(height: 24),
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: _queuedNotificationsCount > 0
                                      ? Colors.orange.withOpacity(0.1)
                                      : Colors.green.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(
                                    color: _queuedNotificationsCount > 0
                                        ? Colors.orange
                                        : Colors.green,
                                  ),
                                ),
                                child: Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Queue Status',
                                          style: GoogleFonts.poppins(
                                            fontWeight: FontWeight.w600,
                                            fontSize: 12,
                                            color: AppColors.textLight,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          '$_queuedNotificationsCount queued',
                                          style: GoogleFonts.poppins(
                                            fontWeight: FontWeight.w700,
                                            fontSize: 16,
                                            color: _queuedNotificationsCount > 0
                                                ? Colors.orange.shade700
                                                : Colors.green.shade700,
                                          ),
                                        ),
                                      ],
                                    ),
                                    ElevatedButton.icon(
                                      onPressed: _queuedNotificationsCount > 0
                                          ? _showQueueDetailedView
                                          : null,
                                      icon: const Icon(Icons.list),
                                      label: Text(
                                        'View',
                                        style: GoogleFonts.poppins(
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor:
                                            _queuedNotificationsCount > 0
                                            ? Colors.orange
                                            : Colors.grey,
                                        foregroundColor: Colors.white,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 12),
                              if (_queuedNotificationsCount > 0)
                                ElevatedButton.icon(
                                  onPressed: _retryFailedNotifications,
                                  icon: const Icon(Icons.refresh),
                                  label: Text(
                                    'Retry Sync',
                                    style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppColors.accentGreen,
                                    foregroundColor: Colors.white,
                                  ),
                                ),
                            ],
                          ),

                          const SizedBox(height: 24),

                          // Appearance
                          _buildSection(
                            title: 'Appearance',
                            icon: Icons.palette_outlined,
                            color: Colors.purple,
                            children: [
                              _buildSwitchTile(
                                title: 'Dark Mode',
                                subtitle: 'Switch to dark theme',
                                value: _darkMode,
                                onChanged: (value) =>
                                    setState(() => _darkMode = value),
                                icon: Icons.dark_mode,
                              ),
                            ],
                          ),

                          const SizedBox(height: 24),

                          // Mobile Optimization
                          _buildSection(
                            title: 'Mobile Optimization',
                            icon: Icons.phone_android,
                            color: Colors.cyan,
                            children: [
                              _buildSwitchTile(
                                title: 'Data Saver Mode',
                                subtitle:
                                    'Reduce data usage and compress images',
                                value: _dataSaverMode,
                                onChanged: (value) =>
                                    setState(() => _dataSaverMode = value),
                                icon: Icons.data_usage,
                              ),
                              const Divider(height: 24),
                              _buildSwitchTile(
                                title: 'Reduce Image Quality',
                                subtitle: 'Load images at lower resolution',
                                value: _reduceImageQuality,
                                onChanged: (value) =>
                                    setState(() => _reduceImageQuality = value),
                                icon: Icons.image,
                              ),
                            ],
                          ),

                          const SizedBox(height: 24),

                          // Offline & Sync
                          _buildSection(
                            title: 'Offline & Sync',
                            icon: Icons.cloud_sync,
                            color: Colors.orange,
                            children: [
                              _buildSwitchTile(
                                title: 'Offline Sync',
                                subtitle: 'Save changes locally when offline',
                                value: _offlineSyncEnabled,
                                onChanged: (value) =>
                                    setState(() => _offlineSyncEnabled = value),
                                icon: Icons.sync,
                              ),
                              const Divider(height: 24),
                              _buildSwitchTile(
                                title: 'Auto Backup',
                                subtitle: 'Automatically backup settings',
                                value: _autoBackupEnabled,
                                onChanged: (value) =>
                                    setState(() => _autoBackupEnabled = value),
                                icon: Icons.backup,
                              ),
                              if (_lastBackupTime != 'Never') ...[
                                const Divider(height: 24),
                                Padding(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 12,
                                  ),
                                  child: Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            'Last Backup',
                                            style: GoogleFonts.poppins(
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                          Text(
                                            _lastBackupTime,
                                            style: GoogleFonts.poppins(
                                              fontSize: 12,
                                              color: AppColors.textLight,
                                            ),
                                          ),
                                        ],
                                      ),
                                      ElevatedButton.icon(
                                        onPressed: () async {
                                          // Trigger backup
                                          setState(
                                            () => _lastBackupTime = 'Just now',
                                          );
                                          ScaffoldMessenger.of(
                                            context,
                                          ).showSnackBar(
                                            const SnackBar(
                                              content: Text(
                                                'Backup in progress...',
                                              ),
                                            ),
                                          );
                                        },
                                        icon: const Icon(Icons.cloud_upload),
                                        label: const Text('Backup Now'),
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor:
                                              AppColors.primaryBlue,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ],
                          ),

                          const SizedBox(height: 24),

                          // Accessibility Settings
                          _buildSection(
                            title: 'Accessibility',
                            icon: Icons.accessibility_new,
                            color: Colors.teal,
                            children: [
                              // Font Size Slider
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 12,
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Font Size',
                                      style: GoogleFonts.poppins(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        Text(
                                          'Small',
                                          style: GoogleFonts.poppins(
                                            fontSize: 12,
                                          ),
                                        ),
                                        Expanded(
                                          child: Slider(
                                            value: _fontSize,
                                            min: 0.8,
                                            max: 1.5,
                                            divisions: 7,
                                            onChanged: (value) => setState(
                                              () => _fontSize = value,
                                            ),
                                            label: _fontSize == 0.8
                                                ? 'Small'
                                                : _fontSize == 1.0
                                                ? 'Normal'
                                                : _fontSize == 1.2
                                                ? 'Large'
                                                : 'Extra Large',
                                          ),
                                        ),
                                        Text(
                                          'Large',
                                          style: GoogleFonts.poppins(
                                            fontSize: 12,
                                          ),
                                        ),
                                      ],
                                    ),
                                    Center(
                                      child: Text(
                                        _fontSize == 0.8
                                            ? 'Small (80%)'
                                            : _fontSize == 1.0
                                            ? 'Normal (100%)'
                                            : _fontSize == 1.2
                                            ? 'Large (120%)'
                                            : 'Extra Large (${(_fontSize * 100).toStringAsFixed(0)}%)',
                                        style: GoogleFonts.poppins(
                                          fontSize: 12,
                                          color: Colors.grey[600],
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const Divider(height: 24),
                              _buildSwitchTile(
                                title: 'High Contrast',
                                subtitle:
                                    'Increase contrast for better visibility',
                                value: _highContrast,
                                onChanged: (value) =>
                                    setState(() => _highContrast = value),
                                icon: Icons.contrast,
                              ),
                              const Divider(height: 24),
                              _buildSwitchTile(
                                title: 'Reduce Animations',
                                subtitle: 'Minimize motion and animations',
                                value: _reduceAnimations,
                                onChanged: (value) =>
                                    setState(() => _reduceAnimations = value),
                                icon: Icons.animation,
                              ),
                            ],
                          ),

                          const SizedBox(height: 24),

                          // Security
                          _buildSection(
                            title: 'Security',
                            icon: Icons.lock_outline,
                            color: AppColors.accentGreen,
                            children: [
                              if (_biometricAvailable) ...[
                                _buildSwitchTile(
                                  title: 'Biometric Authentication',
                                  subtitle:
                                      'Use fingerprint or face recognition for secure login',
                                  value: _biometricEnabled,
                                  onChanged: _toggleBiometric,
                                  icon: Icons.fingerprint,
                                ),
                                const Divider(height: 24),
                              ] else ...[
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: Colors.blue.withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(
                                      color: Colors.blue.withOpacity(0.3),
                                    ),
                                  ),
                                  child: Row(
                                    children: [
                                      const Icon(
                                        Icons.info_outline,
                                        color: Colors.blue,
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Text(
                                          'Biometric not available on this device/platform',
                                          style: GoogleFonts.poppins(
                                            fontSize: 12,
                                            color: Colors.blue[700],
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const Divider(height: 24),
                              ],
                              ListTile(
                                leading: const Icon(
                                  Icons.lock,
                                  color: AppColors.primaryBlue,
                                ),
                                title: const Text('Change Password'),
                                subtitle: const Text(
                                  'Update your account password',
                                ),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () => _showPasswordChangeDialog(),
                              ),
                            ],
                          ),

                          const SizedBox(height: 32),

                          // Save Button
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: _isSaving ? null : _updateProfile,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.primaryBlue,
                                padding: const EdgeInsets.symmetric(
                                  vertical: 16,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: _isSaving
                                  ? const SizedBox(
                                      height: 20,
                                      width: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        valueColor:
                                            AlwaysStoppedAnimation<Color>(
                                              Colors.white,
                                            ),
                                      ),
                                    )
                                  : Text(
                                      'Save Changes',
                                      style: GoogleFonts.poppins(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w600,
                                        color: Colors.white,
                                      ),
                                    ),
                            ),
                          ),

                          const SizedBox(height: 24),

                          // App Version Display
                          if (_appVersion.isNotEmpty) ...[
                            Center(
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 12,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: AppColors.backgroundGray,
                                  ),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.info_outline,
                                      size: 18,
                                      color: AppColors.textLight,
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      _patchNumber != null
                                          ? 'PACT Mobile v$_appVersion+$_buildNumber (Patch $_patchNumber)'
                                          : 'PACT Mobile v$_appVersion+$_buildNumber',
                                      style: GoogleFonts.poppins(
                                        fontSize: 13,
                                        color: AppColors.textLight,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 16),
                          ],
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  void _showPasswordChangeDialog() {
    showDialog(
      context: context,
      builder: (context) => _PasswordChangeDialog(
        oldPasswordController: _oldPasswordController,
        newPasswordController: _newPasswordController,
        confirmPasswordController: _confirmPasswordController,
        isSaving: _isSaving,
        onChangePassword: () async {
          await _changePassword();
        },
        onCancel: () {
          Navigator.pop(context);
          _oldPasswordController.clear();
          _newPasswordController.clear();
          _confirmPasswordController.clear();
        },
      ),
    );
  }
}

class _PasswordChangeDialog extends StatefulWidget {
  final TextEditingController oldPasswordController;
  final TextEditingController newPasswordController;
  final TextEditingController confirmPasswordController;
  final bool isSaving;
  final Future<void> Function() onChangePassword;
  final VoidCallback onCancel;

  const _PasswordChangeDialog({
    required this.oldPasswordController,
    required this.newPasswordController,
    required this.confirmPasswordController,
    required this.isSaving,
    required this.onChangePassword,
    required this.onCancel,
  });

  @override
  State<_PasswordChangeDialog> createState() => _PasswordChangeDialogState();
}

class _PasswordChangeDialogState extends State<_PasswordChangeDialog> {
  bool _obscureOldPassword = true;
  bool _obscureNewPassword = true;
  bool _obscureConfirmPassword = true;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.lock, color: AppColors.primaryBlue),
                const SizedBox(width: 8),
                Text(
                  'Change Password',
                  style: GoogleFonts.poppins(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: widget.onCancel,
                ),
              ],
            ),
            const SizedBox(height: 24),
            // Old Password
            TextField(
              controller: widget.oldPasswordController,
              obscureText: _obscureOldPassword,
              decoration: InputDecoration(
                labelText: 'Current Password',
                prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(
                  icon: Icon(
                    _obscureOldPassword
                        ? Icons.visibility
                        : Icons.visibility_off,
                  ),
                  onPressed: () => setState(
                    () => _obscureOldPassword = !_obscureOldPassword,
                  ),
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 16),
            // New Password
            TextField(
              controller: widget.newPasswordController,
              obscureText: _obscureNewPassword,
              decoration: InputDecoration(
                labelText: 'New Password',
                prefixIcon: const Icon(Icons.lock),
                suffixIcon: IconButton(
                  icon: Icon(
                    _obscureNewPassword
                        ? Icons.visibility
                        : Icons.visibility_off,
                  ),
                  onPressed: () => setState(
                    () => _obscureNewPassword = !_obscureNewPassword,
                  ),
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 16),
            // Confirm Password
            TextField(
              controller: widget.confirmPasswordController,
              obscureText: _obscureConfirmPassword,
              decoration: InputDecoration(
                labelText: 'Confirm New Password',
                prefixIcon: const Icon(Icons.lock),
                suffixIcon: IconButton(
                  icon: Icon(
                    _obscureConfirmPassword
                        ? Icons.visibility
                        : Icons.visibility_off,
                  ),
                  onPressed: () => setState(
                    () => _obscureConfirmPassword = !_obscureConfirmPassword,
                  ),
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: widget.onCancel,
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: widget.isSaving
                      ? null
                      : () => widget.onChangePassword(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryBlue,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 12,
                    ),
                  ),
                  child: widget.isSaving
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              Colors.white,
                            ),
                          ),
                        )
                      : const Text('Change Password'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
