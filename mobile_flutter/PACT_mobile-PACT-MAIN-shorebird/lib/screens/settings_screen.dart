import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shorebird_code_push/shorebird_code_push.dart';
import 'dart:io';
import '../widgets/reusable_app_bar.dart';
import '../widgets/custom_drawer_menu.dart';
import '../theme/app_colors.dart';
import '../services/offline/offline_db.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
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
  bool _darkMode = false;
  
  // App version
  String _appVersion = '';
  String _buildNumber = '';
  int? _patchNumber;

  // Sync status
  int _pendingSyncCount = 0;
  int _pendingSiteVisitsCount = 0;
  int _pendingRequestsCount = 0;

  // Password change
  final bool _showChangePassword = false;
  final TextEditingController _oldPasswordController = TextEditingController();
  final TextEditingController _newPasswordController = TextEditingController();
  final TextEditingController _confirmPasswordController =
      TextEditingController();
  final bool _obscureOldPassword = true;
  final bool _obscureNewPassword = true;
  final bool _obscureConfirmPassword = true;

  @override
  void initState() {
    super.initState();
    _loadUserData();
    _loadAppVersion();
    _loadSyncStatus();
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
        final isAvailable = await codePush.isShorebirdAvailable();
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
            _darkMode = settings['appearance']?['darkMode'] as bool? ?? false;
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
          'appearance': {'darkMode': _darkMode},
        },
      };

      await Supabase.instance.client.from('user_settings').upsert({
        'user_id': _userId!,
        ...settingsData,
      });

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
            child: const Icon(Icons.cloud_upload, color: Colors.white, size: 20),
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

                          // Security
                          _buildSection(
                            title: 'Security',
                            icon: Icons.lock_outline,
                            color: AppColors.accentGreen,
                            children: [
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
                                          ? 'Version $_appVersion (Build $_buildNumber, Patch $_patchNumber)'
                                          : 'Version $_appVersion (Build $_buildNumber)',
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
