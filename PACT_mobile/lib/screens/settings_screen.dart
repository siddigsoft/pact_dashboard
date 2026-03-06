import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart'
    show kIsWeb, defaultTargetPlatform, TargetPlatform;
import 'package:permission_handler/permission_handler.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'dart:io';
import '../widgets/reusable_app_bar.dart';
import '../widgets/custom_drawer_menu.dart';
import '../theme/app_colors.dart';
import '../services/biometric_auth_service.dart';
import '../services/local_storage_service.dart';
import '../services/sos_emergency_service.dart';
import '../services/visit_location_settings.dart';
import '../services/screen_analytics_mixin.dart';
import '../providers/app_preferences_provider.dart';
import 'safety_hub_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen>
    with ScreenAnalyticsMixin {
  static const String _broadcastPopupEnabledSettingKey =
      'broadcast_popup_enabled';

  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final ImagePicker _imagePicker = ImagePicker();

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
  bool _broadcastPopupEnabled = true;
  bool _darkMode = false;
  double _fontScale = 1.0;
  bool _compactDisplay = false;
  bool _biometricEnabled = false;
  bool _biometricAvailable = false;
  bool _loadingPermissions = false;
  Map<String, PermissionStatus> _permissionStatuses = {};
  int _sosCountdownSeconds = SosEmergencyService.defaultSosCountdownSeconds;
  bool _sosHapticWarningEnabled =
      SosEmergencyService.defaultSosHapticWarningEnabled;
  bool _sosLongPressRequired = SosEmergencyService.defaultSosRequireLongPress;
  bool _sosVolumeUpHoldEnabled =
      SosEmergencyService.defaultSosVolumeUpHoldEnabled;
  bool _sosTestModeEnabled = SosEmergencyService.defaultSosTestModeEnabled;
  int _visitLocationAccuracyThresholdMeters =
      VisitLocationSettings.defaultLocationAccuracyThresholdMeters;

  final LocalStorageService _localStorageService = LocalStorageService();
  final SosEmergencyService _sosEmergencyService = SosEmergencyService();

  static const List<String> _requiredPermissionKeys = [
    'Location',
    'Camera',
    'Microphone',
    'Notifications',
  ];
  static const List<String> _optionalPermissionKeys = ['Phone', 'Storage'];

  bool get _canEditSosCountdown {
    final role = (_userRole ?? '').toLowerCase().trim();
    return role == 'admin' || role == 'supervisor';
  }

  bool get _isAndroidPlatform {
    if (kIsWeb) return false;
    return defaultTargetPlatform == TargetPlatform.android;
  }

  // Password change
  final TextEditingController _oldPasswordController = TextEditingController();
  final TextEditingController _newPasswordController = TextEditingController();
  final TextEditingController _confirmPasswordController =
      TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadUserData();
    _checkBiometricAvailability();
    _loadPermissionStatuses();
    // Track screen view
    logScreenView('SettingsScreen');
  }

  Future<void> _loadPermissionStatuses() async {
    if (kIsWeb) {
      setState(() {
        _permissionStatuses = {};
      });
      return;
    }

    setState(() => _loadingPermissions = true);

    try {
      final statuses = <String, PermissionStatus>{
        'Location': await Permission.locationWhenInUse.status,
        'Camera': await Permission.camera.status,
        'Microphone': await Permission.microphone.status,
        'Notifications': await Permission.notification.status,
        'Phone': await Permission.phone.status,
        'Storage': await Permission.storage.status,
      };

      if (!mounted) return;
      setState(() {
        _permissionStatuses = statuses;
      });
    } catch (e) {
      debugPrint('Error loading permission statuses: $e');
    } finally {
      if (mounted) {
        setState(() => _loadingPermissions = false);
      }
    }
  }

  Future<void> _requestPermission(String key) async {
    if (kIsWeb) return;

    Permission permission;
    switch (key) {
      case 'Location':
        permission = Permission.locationWhenInUse;
        break;
      case 'Camera':
        permission = Permission.camera;
        break;
      case 'Microphone':
        permission = Permission.microphone;
        break;
      case 'Notifications':
        permission = Permission.notification;
        break;
      case 'Phone':
        permission = Permission.phone;
        break;
      case 'Storage':
      default:
        permission = Permission.storage;
        break;
    }

    try {
      await permission.request();
      await _loadPermissionStatuses();
    } catch (e) {
      debugPrint('Error requesting $key permission: $e');
    }
  }

  String _permissionStatusLabel(PermissionStatus status) {
    if (status.isGranted) return 'Granted';
    if (status.isLimited) return 'Limited';
    if (status.isPermanentlyDenied) return 'Permanently Denied';
    if (status.isRestricted) return 'Restricted';
    return 'Denied';
  }

  Color _permissionStatusColor(PermissionStatus status) {
    if (status.isGranted || status.isLimited) return Colors.green;
    if (status.isRestricted) return Colors.orange;
    return Colors.red;
  }

  bool _isPermissionGrantedLike(PermissionStatus? status) {
    if (status == null) return false;
    return status.isGranted || status.isLimited;
  }

  int _grantedPermissionCount(List<String> keys) {
    return keys
        .where((key) => _isPermissionGrantedLike(_permissionStatuses[key]))
        .length;
  }

  Future<void> _requestRequiredPermissions() async {
    if (kIsWeb) return;

    for (final key in _requiredPermissionKeys) {
      await _requestPermission(key);
    }

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Required permission checks completed / تم فحص الأذونات المطلوبة',
        ),
        backgroundColor: Colors.green,
      ),
    );
  }

  Color _permissionHealthColor({required int granted, required int total}) {
    if (total <= 0) return Colors.grey;
    if (granted >= total) return Colors.green;
    if (granted <= 0) return Colors.red;
    return Colors.orange;
  }

  String _permissionHealthLabel({required int granted, required int total}) {
    if (total <= 0) return 'Unknown / غير معروف';
    if (granted >= total) return 'Excellent / ممتاز';
    if (granted <= 0) return 'Needs Attention / يحتاج متابعة';
    return 'Partial / جزئي';
  }

  Widget _buildPermissionSummaryCard({
    required List<String> requiredKeys,
    required List<String> optionalKeys,
  }) {
    if (kIsWeb) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.blue.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.blue.withValues(alpha: 0.2)),
        ),
        child: Text(
          'Permission status is managed by browser settings on web / حالة الأذونات تتم إدارتها من إعدادات المتصفح على الويب.',
          style: GoogleFonts.poppins(fontSize: 12, color: AppColors.textLight),
        ),
      );
    }

    final requiredGranted = _grantedPermissionCount(requiredKeys);
    final optionalGranted = _grantedPermissionCount(optionalKeys);
    final total = requiredKeys.length + optionalKeys.length;
    final grantedTotal = requiredGranted + optionalGranted;
    final overallColor = _permissionHealthColor(
      granted: grantedTotal,
      total: total,
    );
    final overallLabel = _permissionHealthLabel(
      granted: grantedTotal,
      total: total,
    );

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.indigo.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.indigo.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: overallColor,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Permission Health / صحة الأذونات',
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.indigo,
                  ),
                ),
              ),
              Text(
                overallLabel,
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: overallColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Required: $requiredGranted/${requiredKeys.length} granted / المطلوب: $requiredGranted/${requiredKeys.length}',
            style: GoogleFonts.poppins(fontSize: 12, color: AppColors.textDark),
          ),
          Text(
            'Optional: $optionalGranted/${optionalKeys.length} granted / الاختياري: $optionalGranted/${optionalKeys.length}',
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: AppColors.textLight,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPermissionGroupLabel({
    required String title,
    required int granted,
    required int total,
  }) {
    final dotColor = _permissionHealthColor(granted: granted, total: total);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 4, 6),
      child: Row(
        children: [
          Container(
            width: 9,
            height: 9,
            decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              title,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.textLight,
              ),
            ),
          ),
          Text(
            '$granted/$total',
            style: GoogleFonts.poppins(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: dotColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPermissionTile(String key, IconData icon) {
    if (kIsWeb) {
      return ListTile(
        leading: Icon(icon, color: AppColors.primaryBlue),
        title: Text(
          key,
          style: GoogleFonts.poppins(fontWeight: FontWeight.w500),
        ),
        subtitle: Text(
          'Managed by browser settings / تتم الإدارة من المتصفح',
          style: GoogleFonts.poppins(fontSize: 12, color: AppColors.textLight),
        ),
      );
    }

    final status = _permissionStatuses[key];
    final statusLabel = status == null
        ? 'Unknown'
        : _permissionStatusLabel(status);
    final statusColor = status == null
        ? Colors.grey
        : _permissionStatusColor(status);

    final isGranted = _isPermissionGrantedLike(status);
    final isPermanentDeny = status?.isPermanentlyDenied == true;

    return ListTile(
      leading: Icon(icon, color: AppColors.primaryBlue),
      title: Text(key, style: GoogleFonts.poppins(fontWeight: FontWeight.w500)),
      subtitle: Text(
        statusLabel,
        style: GoogleFonts.poppins(fontSize: 12, color: statusColor),
      ),
      trailing: isGranted
          ? const Icon(Icons.check_circle, color: Colors.green)
          : TextButton(
              onPressed: () async {
                if (isPermanentDeny) {
                  await openAppSettings();
                } else {
                  await _requestPermission(key);
                }
              },
              child: Text(
                isPermanentDeny ? 'Settings / الإعدادات' : 'Allow / سماح',
              ),
            ),
    );
  }

  @override
  void dispose() {
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
          final appearance = settings['appearance'] as Map<String, dynamic>?;
          setState(() {
            _notificationsEnabled =
                settings['notifications']?['enabled'] as bool? ?? true;
            _darkMode = appearance?['darkMode'] as bool? ?? _darkMode;
            _fontScale = (appearance?['fontScale'] is num)
                ? (appearance!['fontScale'] as num).toDouble()
                : _fontScale;
            _compactDisplay =
                appearance?['compactDisplay'] as bool? ?? _compactDisplay;
          });
        }
      }

      final appPreferences = context.read<AppPreferencesProvider>();

      setState(() {
        _darkMode = appPreferences.darkMode;
        _fontScale = appPreferences.fontScale;
        _compactDisplay = appPreferences.compactDisplay;
        _sosCountdownSeconds = _sosEmergencyService.getSosCountdownSeconds();
        _sosHapticWarningEnabled = _sosEmergencyService
            .isSosHapticWarningEnabled();
        _sosLongPressRequired = _sosEmergencyService.isSosLongPressRequired();
        _sosVolumeUpHoldEnabled = _sosEmergencyService
            .isSosVolumeUpHoldEnabled();
        _sosTestModeEnabled = _sosEmergencyService.isSosTestModeEnabled();
        _visitLocationAccuracyThresholdMeters =
            VisitLocationSettings.normalizeThreshold(
              _localStorageService.getAppSetting(
                VisitLocationSettings.locationAccuracyThresholdMetersSettingKey,
              ),
            );
        final configuredBroadcastPopup = _localStorageService.getAppSetting(
          _broadcastPopupEnabledSettingKey,
        );
        _broadcastPopupEnabled = configuredBroadcastPopup is bool
            ? configuredBroadcastPopup
            : true;
      });

      setState(() => _isLoading = false);
    } catch (e) {
      debugPrint('Error loading user data: $e');
      setState(() => _isLoading = false);
    }
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

  Future<void> _resetSosSettingsToDefaults() async {
    if (!_canEditSosCountdown) return;

    final shouldReset = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Row(
          children: [
            Icon(
              Icons.warning_amber_rounded,
              color: Theme.of(dialogContext).colorScheme.error,
            ),
            const SizedBox(width: 8),
            const Expanded(child: Text('Reset SOS Settings')),
          ],
        ),
        content: const Text(
          'This is a sensitive action. This will restore SOS countdown and haptic warning to default values. Continue?',
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await HapticFeedback.selectionClick();
              if (dialogContext.mounted) {
                Navigator.of(dialogContext).pop(false);
              }
            },
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            onPressed: () async {
              await HapticFeedback.lightImpact();
              if (dialogContext.mounted) {
                Navigator.of(dialogContext).pop(true);
              }
            },
            child: const Text('Reset'),
          ),
        ],
      ),
    );

    if (shouldReset != true) return;

    await _applySosDefaultsReset();
  }

  Future<void> _applySosDefaultsReset() async {
    if (!_canEditSosCountdown) return;

    setState(() {
      _sosCountdownSeconds = SosEmergencyService.defaultSosCountdownSeconds;
      _sosHapticWarningEnabled =
          SosEmergencyService.defaultSosHapticWarningEnabled;
    });

    try {
      await _localStorageService.saveAppSetting(
        SosEmergencyService.sosCountdownSecondsSettingKey,
        _sosCountdownSeconds,
      );
      await _localStorageService.saveAppSetting(
        SosEmergencyService.sosHapticWarningEnabledSettingKey,
        _sosHapticWarningEnabled,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('SOS settings reset to defaults'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to reset SOS settings: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _resetDisplaySettingsToDefaults() async {
    final shouldReset = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Row(
          children: [
            Icon(
              Icons.warning_amber_rounded,
              color: Theme.of(dialogContext).colorScheme.error,
            ),
            const SizedBox(width: 8),
            const Expanded(child: Text('Reset Display Settings')),
          ],
        ),
        content: const Text(
          'This will restore Dark Mode, Font Size, and Compact Display to default values. Continue?',
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await HapticFeedback.selectionClick();
              if (dialogContext.mounted) {
                Navigator.of(dialogContext).pop(false);
              }
            },
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange,
              foregroundColor: Colors.white,
            ),
            onPressed: () async {
              await HapticFeedback.lightImpact();
              if (dialogContext.mounted) {
                Navigator.of(dialogContext).pop(true);
              }
            },
            child: const Text('Reset'),
          ),
        ],
      ),
    );

    if (shouldReset != true) return;

    final appPreferences = context.read<AppPreferencesProvider>();

    setState(() {
      _darkMode = false;
      _fontScale = 1.0;
      _compactDisplay = false;
    });

    await appPreferences.setDarkMode(false);
    await appPreferences.setFontScale(1.0);
    await appPreferences.setCompactDisplay(false);

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Display settings reset to defaults'),
        backgroundColor: Colors.green,
      ),
    );
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

  Future<void> _updateProfile() async {
    if (_userId == null) return;

    setState(() => _isSaving = true);

    try {
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

      // Update user settings
      final settingsData = {
        'settings': {
          'notifications': {'enabled': _notificationsEnabled},
          'appearance': {
            'darkMode': _darkMode,
            'fontScale': _fontScale,
            'compactDisplay': _compactDisplay,
          },
        },
      };

      await Supabase.instance.client.from('user_settings').upsert({
        'user_id': _userId!,
        ...settingsData,
      });

      if (_canEditSosCountdown) {
        await _localStorageService.saveAppSetting(
          SosEmergencyService.sosCountdownSecondsSettingKey,
          _sosCountdownSeconds,
        );
        await _localStorageService.saveAppSetting(
          SosEmergencyService.sosHapticWarningEnabledSettingKey,
          _sosHapticWarningEnabled,
        );
      }

      await _localStorageService.saveAppSetting(
        _broadcastPopupEnabledSettingKey,
        _broadcastPopupEnabled,
      );

      await _localStorageService.saveAppSetting(
        SosEmergencyService.sosRequireLongPressSettingKey,
        _sosLongPressRequired,
      );

      await _localStorageService.saveAppSetting(
        SosEmergencyService.sosVolumeUpHoldEnabledSettingKey,
        _sosVolumeUpHoldEnabled,
      );

      await _localStorageService.saveAppSetting(
        SosEmergencyService.sosTestModeEnabledSettingKey,
        _sosTestModeEnabled,
      );

      await _localStorageService.saveAppSetting(
        VisitLocationSettings.locationAccuracyThresholdMetersSettingKey,
        _visitLocationAccuracyThresholdMeters,
      );

      final appPreferences = context.read<AppPreferencesProvider>();
      await appPreferences.setDarkMode(_darkMode);
      await appPreferences.setFontScale(_fontScale);
      await appPreferences.setCompactDisplay(_compactDisplay);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Profile updated successfully'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      debugPrint('Error updating profile: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error updating profile: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() => _isSaving = false);
    }
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

  Widget _buildSwitchTile({
    required String title,
    required String subtitle,
    required bool value,
    required Function(bool)? onChanged,
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
      activeThumbColor: AppColors.primaryBlue,
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
            ReusableAppBar(
              title: 'Settings / الإعدادات',
              scaffoldKey: _scaffoldKey,
            ),
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
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
                              ListTile(
                                leading: const Icon(
                                  Icons.gps_fixed,
                                  color: AppColors.primaryBlue,
                                ),
                                title: Text(
                                  'Visit GPS Accuracy Lock (meters)',
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                subtitle: Text(
                                  'Complete Visit locks GPS only when accuracy is at or below this threshold',
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: AppColors.textLight,
                                  ),
                                ),
                                trailing: DropdownButton<int>(
                                  value: _visitLocationAccuracyThresholdMeters,
                                  borderRadius: BorderRadius.circular(12),
                                  items: const [10, 20, 30, 50, 75, 100].map((
                                    value,
                                  ) {
                                    return DropdownMenuItem<int>(
                                      value: value,
                                      child: Text('$value m'),
                                    );
                                  }).toList(),
                                  onChanged: (value) {
                                    if (value == null) return;
                                    setState(() {
                                      _visitLocationAccuracyThresholdMeters =
                                          value;
                                    });
                                  },
                                ),
                              ),
                            ],
                          ),

                          const SizedBox(height: 24),

                          // Notifications
                          _buildSection(
                            title: 'Notifications',
                            icon: Icons.notifications_outlined,
                            color: AppColors.accentGreen,
                            children: [
                              _buildSwitchTile(
                                title: 'Enable Notifications',
                                subtitle: 'Receive push notifications',
                                value: _notificationsEnabled,
                                onChanged: (value) => setState(
                                  () => _notificationsEnabled = value,
                                ),
                                icon: Icons.notifications,
                              ),
                              _buildSwitchTile(
                                title: 'Broadcast Pop-up / نافذة البث',
                                subtitle:
                                    'Show instant broadcast pop-up on dashboard / عرض نافذة بث فورية في لوحة التحكم',
                                value: _broadcastPopupEnabled,
                                onChanged: (value) => setState(
                                  () => _broadcastPopupEnabled = value,
                                ),
                                icon: Icons.campaign,
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
                              ListTile(
                                leading: const Icon(
                                  Icons.restart_alt,
                                  color: Colors.orange,
                                ),
                                title: Text(
                                  'Reset Display Settings',
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w500,
                                    color: Colors.orange,
                                  ),
                                ),
                                subtitle: Text(
                                  'Restore dark mode, font size, and compact display defaults',
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: AppColors.textLight,
                                  ),
                                ),
                                trailing: TextButton(
                                  onPressed: _resetDisplaySettingsToDefaults,
                                  child: const Text('Reset'),
                                ),
                                onTap: _resetDisplaySettingsToDefaults,
                              ),
                              _buildSwitchTile(
                                title: 'Dark Mode',
                                subtitle: 'Switch to dark theme',
                                value: _darkMode,
                                onChanged: (value) async {
                                  setState(() => _darkMode = value);
                                  await context
                                      .read<AppPreferencesProvider>()
                                      .setDarkMode(value);
                                },
                                icon: Icons.dark_mode,
                              ),
                              ListTile(
                                leading: const Icon(
                                  Icons.format_size,
                                  color: AppColors.primaryBlue,
                                ),
                                title: Text(
                                  'Font Size',
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                subtitle: Text(
                                  'Adjust app text size for readability',
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: AppColors.textLight,
                                  ),
                                ),
                                trailing: DropdownButton<double>(
                                  value: _fontScale,
                                  borderRadius: BorderRadius.circular(12),
                                  items: const [0.9, 1.0, 1.1, 1.2, 1.3].map((
                                    value,
                                  ) {
                                    return DropdownMenuItem<double>(
                                      value: value,
                                      child: Text('${(value * 100).round()}%'),
                                    );
                                  }).toList(),
                                  onChanged: (value) async {
                                    if (value == null) return;
                                    setState(() => _fontScale = value);
                                    await context
                                        .read<AppPreferencesProvider>()
                                        .setFontScale(value);
                                  },
                                ),
                              ),
                              _buildSwitchTile(
                                title: 'Compact Display',
                                subtitle:
                                    'Reduce spacing to fit more content on screen',
                                value: _compactDisplay,
                                onChanged: (value) async {
                                  setState(() => _compactDisplay = value);
                                  await context
                                      .read<AppPreferencesProvider>()
                                      .setCompactDisplay(value);
                                },
                                icon: Icons.view_compact_alt_outlined,
                              ),
                            ],
                          ),

                          const SizedBox(height: 24),

                          // Security - Biometrics & Password
                          _buildSection(
                            title: 'Security',
                            icon: Icons.lock_outline,
                            color: AppColors.accentGreen,
                            children: [
                              ListTile(
                                leading: const Icon(
                                  Icons.sos,
                                  color: Colors.red,
                                ),
                                title: Text(
                                  'Emergency SOS',
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                subtitle: Text(
                                  'Open Safety Hub for emergency actions',
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: AppColors.textLight,
                                  ),
                                ),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => const SafetyHubScreen(),
                                    ),
                                  );
                                },
                              ),
                              _buildSwitchTile(
                                title: 'Require Long Press for SOS',
                                subtitle:
                                    'Hold the SOS button to prevent accidental emergency triggers',
                                value: _sosLongPressRequired,
                                onChanged: (value) => setState(
                                  () => _sosLongPressRequired = value,
                                ),
                                icon: Icons.touch_app,
                              ),
                              _buildSwitchTile(
                                title: 'Volume Up Hold (3s) for SOS',
                                subtitle: _isAndroidPlatform
                                    ? 'Trigger SOS by holding volume up for 3 seconds (foreground app)'
                                    : 'Available on Android only (foreground app)',
                                value: _isAndroidPlatform
                                    ? _sosVolumeUpHoldEnabled
                                    : false,
                                onChanged: _isAndroidPlatform
                                    ? (value) => setState(
                                        () => _sosVolumeUpHoldEnabled = value,
                                      )
                                    : null,
                                icon: Icons.volume_up,
                              ),
                              _buildSwitchTile(
                                title: 'SOS Test Mode (No Real Call)',
                                subtitle:
                                    'Run SOS trigger flow without placing phone calls',
                                value: _sosTestModeEnabled,
                                onChanged: (value) =>
                                    setState(() => _sosTestModeEnabled = value),
                                icon: Icons.science_outlined,
                              ),
                              if (!_canEditSosCountdown)
                                ListTile(
                                  leading: const Icon(
                                    Icons.info_outline,
                                    color: AppColors.primaryBlue,
                                  ),
                                  title: Text(
                                    'SOS Settings (Read Only)',
                                    style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  subtitle: Text(
                                    'Countdown: ${_sosCountdownSeconds}s · 1s Haptic: ${_sosHapticWarningEnabled ? 'On' : 'Off'}\nManaged by Admin/Supervisor',
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      color: AppColors.textLight,
                                    ),
                                  ),
                                ),
                              const Divider(height: 24),

                              if (_canEditSosCountdown) ...[
                                ListTile(
                                  leading: const Icon(
                                    Icons.sos,
                                    color: AppColors.primaryBlue,
                                  ),
                                  title: Text(
                                    'SOS Countdown Seconds',
                                    style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  subtitle: Text(
                                    'Choose delay before emergency call starts',
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      color: AppColors.textLight,
                                    ),
                                  ),
                                  trailing: DropdownButton<int>(
                                    value: _sosCountdownSeconds,
                                    borderRadius: BorderRadius.circular(12),
                                    items:
                                        List.generate(
                                          10,
                                          (index) => index + 1,
                                        ).map((value) {
                                          return DropdownMenuItem<int>(
                                            value: value,
                                            child: Text('$value s'),
                                          );
                                        }).toList(),
                                    onChanged: (value) {
                                      if (value == null) return;
                                      setState(() {
                                        _sosCountdownSeconds = value;
                                      });
                                    },
                                  ),
                                ),
                                _buildSwitchTile(
                                  title: 'SOS 1-Second Haptic Warning',
                                  subtitle:
                                      'Pulse vibration when countdown reaches 1 second',
                                  value: _sosHapticWarningEnabled,
                                  onChanged: (value) => setState(
                                    () => _sosHapticWarningEnabled = value,
                                  ),
                                  icon: Icons.vibration,
                                ),
                                ListTile(
                                  leading: const Icon(
                                    Icons.restart_alt,
                                    color: Colors.orange,
                                  ),
                                  title: Text(
                                    'Reset SOS Settings to Defaults',
                                    style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.w500,
                                      color: Colors.orange,
                                    ),
                                  ),
                                  subtitle: Text(
                                    'Restore countdown and haptic warning defaults',
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      color: AppColors.textLight,
                                    ),
                                  ),
                                  trailing: TextButton(
                                    onPressed: _resetSosSettingsToDefaults,
                                    child: const Text('Reset'),
                                  ),
                                  onTap: _resetSosSettingsToDefaults,
                                ),
                                const Divider(height: 24),
                              ],

                              // Biometric Authentication
                              if (_biometricAvailable)
                                Column(
                                  children: [
                                    _buildSwitchTile(
                                      title: 'Biometric Authentication',
                                      subtitle: _biometricEnabled
                                          ? 'Enabled for quick login'
                                          : 'Use fingerprint or face recognition',
                                      value: _biometricEnabled,
                                      onChanged: _toggleBiometric,
                                      icon: Icons.fingerprint,
                                    ),
                                    const Divider(height: 24),
                                  ],
                                ),
                              // Password Change
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

                          const SizedBox(height: 24),

                          // Permissions & Access
                          _buildSection(
                            title: 'Permissions & Access',
                            icon: Icons.verified_user_outlined,
                            color: Colors.indigo,
                            children: [
                              _buildPermissionSummaryCard(
                                requiredKeys: _requiredPermissionKeys,
                                optionalKeys: _optionalPermissionKeys,
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: _requestRequiredPermissions,
                                      icon: const Icon(Icons.security),
                                      label: const Text(
                                        'Allow All Required / سماح للكل',
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  OutlinedButton.icon(
                                    onPressed: _loadPermissionStatuses,
                                    icon: const Icon(Icons.refresh),
                                    label: const Text('Refresh / تحديث'),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              if (_loadingPermissions)
                                const Padding(
                                  padding: EdgeInsets.symmetric(vertical: 8),
                                  child: LinearProgressIndicator(),
                                ),
                              _buildPermissionGroupLabel(
                                title:
                                    'Required Permissions / الأذونات المطلوبة',
                                granted: _grantedPermissionCount(
                                  _requiredPermissionKeys,
                                ),
                                total: _requiredPermissionKeys.length,
                              ),
                              _buildPermissionTile(
                                'Location',
                                Icons.location_on,
                              ),
                              _buildPermissionTile('Camera', Icons.camera_alt),
                              _buildPermissionTile('Microphone', Icons.mic),
                              _buildPermissionTile(
                                'Notifications',
                                Icons.notifications_active,
                              ),
                              const Divider(height: 16),
                              _buildPermissionGroupLabel(
                                title:
                                    'Optional Permissions / الأذونات الاختيارية',
                                granted: _grantedPermissionCount(
                                  _optionalPermissionKeys,
                                ),
                                total: _optionalPermissionKeys.length,
                              ),
                              _buildPermissionTile('Phone', Icons.phone),
                              _buildPermissionTile('Storage', Icons.sd_storage),
                              const Divider(height: 24),
                              ListTile(
                                leading: const Icon(
                                  Icons.refresh,
                                  color: AppColors.primaryBlue,
                                ),
                                title: const Text(
                                  'Refresh Permission Status / تحديث حالة الأذونات',
                                ),
                                subtitle: const Text(
                                  'Re-check all permission statuses / إعادة فحص جميع الأذونات',
                                ),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: _loadPermissionStatuses,
                              ),
                              ListTile(
                                leading: const Icon(
                                  Icons.settings,
                                  color: AppColors.primaryBlue,
                                ),
                                title: const Text(
                                  'Open Device App Settings / فتح إعدادات التطبيق',
                                ),
                                subtitle: const Text(
                                  'Manage permissions from system settings / إدارة الأذونات من إعدادات النظام',
                                ),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () async {
                                  await openAppSettings();
                                },
                              ),
                            ],
                          ),

                          const SizedBox(height: 24),

                          // Other
                          _buildSection(
                            title: 'Other / أخرى',
                            icon: Icons.tune,
                            color: Colors.teal,
                            children: [
                              ListTile(
                                leading: const Icon(
                                  Icons.manage_accounts,
                                  color: AppColors.primaryBlue,
                                ),
                                title: const Text(
                                  'Account Overview / نظرة عامة على الحساب',
                                ),
                                subtitle: Text(
                                  'Role / الدور: ${_userRole ?? 'N/A'}',
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: AppColors.textLight,
                                  ),
                                ),
                              ),
                              ListTile(
                                leading: const Icon(
                                  Icons.info_outline,
                                  color: AppColors.primaryBlue,
                                ),
                                title: const Text(
                                  'Session Info / معلومات الجلسة',
                                ),
                                subtitle: Text(
                                  'User ID / معرف المستخدم: ${_userId?.substring(0, 8) ?? 'N/A'}...',
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: AppColors.textLight,
                                  ),
                                ),
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
                                      'Save Changes / حفظ التغييرات',
                                      style: GoogleFonts.poppins(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w600,
                                        color: Colors.white,
                                      ),
                                    ),
                            ),
                          ),

                          const SizedBox(height: 24),
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
