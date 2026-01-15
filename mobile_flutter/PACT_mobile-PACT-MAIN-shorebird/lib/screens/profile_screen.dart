import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../models/pact_user_profile.dart';
import '../providers/profile_provider.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _imagePicker = ImagePicker();

  // Form controllers
  late TextEditingController _fullNameController;
  late TextEditingController _usernameController;
  late TextEditingController _phoneController;
  late TextEditingController _emailController;

  bool _isEditMode = false;
  XFile? _selectedImage;
  Uint8List? _selectedImageBytes;

  @override
  void initState() {
    super.initState();
    _fullNameController = TextEditingController();
    _usernameController = TextEditingController();
    _phoneController = TextEditingController();
    _emailController = TextEditingController();

    // Load profile on init
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(profileProvider.notifier).loadProfile();
    });
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    _usernameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  void _populateControllers(PACTUserProfile profile) {
    _fullNameController.text = profile.fullName ?? '';
    _usernameController.text = profile.username ?? '';
    _phoneController.text = profile.phone ?? '';
    _emailController.text = profile.email;
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final XFile? image = await _imagePicker.pickImage(
        source: source,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );

      if (image != null) {
        final bytes = await image.readAsBytes();
        setState(() {
          _selectedImage = image;
          _selectedImageBytes = bytes;
        });

        // Upload immediately
        await _uploadAvatar();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to pick image: $e')));
      }
    }
  }

  Future<void> _uploadAvatar() async {
    if (_selectedImage == null) return;

    try {
      await ref.read(profileProvider.notifier).uploadAvatar(_selectedImage!);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Avatar updated successfully')),
        );
        setState(() {
          _selectedImage = null;
          _selectedImageBytes = null;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to upload avatar: $e')));
      }
    }
  }

  void _showImageSourceDialog() {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera),
              title: const Text('Take Photo'),
              onTap: () {
                Navigator.pop(context);
                _pickImage(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Choose from Gallery'),
              onTap: () {
                Navigator.pop(context);
                _pickImage(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _saveProfile() async {
    if (!_formKey.currentState!.validate()) return;

    try {
      await ref
          .read(profileProvider.notifier)
          .updateProfile(
            fullName: _fullNameController.text.trim(),
            username: _usernameController.text.trim(),
            phone: _phoneController.text.trim(),
          );

      if (mounted) {
        setState(() {
          _isEditMode = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile updated successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to update profile: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final profileState = ref.watch(profileProvider);
    final profile = profileState.profile;

    // Populate controllers when profile is loaded
    if (profile != null && !_isEditMode) {
      if (_fullNameController.text.isEmpty && profile.fullName != null) {
        _fullNameController.text = profile.fullName!;
      }
      if (_usernameController.text.isEmpty && profile.username != null) {
        _usernameController.text = profile.username!;
      }
      if (_phoneController.text.isEmpty && profile.phone != null) {
        _phoneController.text = profile.phone!;
      }
      if (_emailController.text.isEmpty) {
        _emailController.text = profile.email;
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          if (profile != null && !profileState.isLoading)
            IconButton(
              icon: Icon(_isEditMode ? Icons.close : Icons.edit),
              onPressed: () {
                setState(() {
                  if (_isEditMode) {
                    // Cancel edit - reset controllers
                    _populateControllers(profile);
                    _isEditMode = false;
                  } else {
                    // Enter edit mode
                    _populateControllers(profile);
                    _isEditMode = true;
                  }
                });
              },
            ),
        ],
      ),
      body: profileState.isLoading && profile == null
          ? const Center(child: CircularProgressIndicator())
          : profileState.error != null && profile == null
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 64, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(
                    'Error: ${profileState.error}',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () =>
                        ref.read(profileProvider.notifier).loadProfile(),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            )
          : profile == null
          ? const Center(child: Text('No profile data'))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    // Avatar Section
                    Center(
                      child: Stack(
                        children: [
                          CircleAvatar(
                            radius: 60,
                            backgroundColor: Colors.grey[300],
                            backgroundImage: _selectedImageBytes != null
                                ? MemoryImage(_selectedImageBytes!)
                                : profile.hasAvatar
                                ? NetworkImage(profile.avatarUrl!)
                                : null,
                            child:
                                !profile.hasAvatar &&
                                    _selectedImageBytes == null
                                ? Text(
                                    profile.initials,
                                    style: const TextStyle(
                                      fontSize: 32,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  )
                                : null,
                          ),
                          Positioned(
                            bottom: 0,
                            right: 0,
                            child: CircleAvatar(
                              backgroundColor: Theme.of(context).primaryColor,
                              child: IconButton(
                                icon: const Icon(
                                  Icons.camera_alt,
                                  color: Colors.white,
                                ),
                                onPressed: _showImageSourceDialog,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Status Badges
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      alignment: WrapAlignment.center,
                      children: [
                        _buildBadge(
                          label: profile.roleDisplayName,
                          color: Colors.blue,
                          icon: Icons.badge,
                        ),
                        _buildBadge(
                          label: profile.status.toUpperCase(),
                          color: profile.isApproved
                              ? Colors.green
                              : Colors.orange,
                          icon: profile.isApproved
                              ? Icons.check_circle
                              : Icons.pending,
                        ),
                        _buildBadge(
                          label: profile.availability.displayName,
                          color: Color(
                            int.parse(
                                  profile.availability.colorHex.substring(1),
                                  radix: 16,
                                ) +
                                0xFF000000,
                          ),
                          icon: Icons.circle,
                        ),
                      ],
                    ),
                    const SizedBox(height: 32),

                    // Form Fields
                    _buildTextField(
                      controller: _fullNameController,
                      label: 'Full Name',
                      icon: Icons.person,
                      enabled: _isEditMode,
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'Full name is required';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),

                    _buildTextField(
                      controller: _usernameController,
                      label: 'Username',
                      icon: Icons.alternate_email,
                      enabled: _isEditMode,
                    ),
                    const SizedBox(height: 16),

                    _buildTextField(
                      controller: _emailController,
                      label: 'Email',
                      icon: Icons.email,
                      enabled: false, // Email is read-only
                    ),
                    const SizedBox(height: 16),

                    _buildTextField(
                      controller: _phoneController,
                      label: 'Phone',
                      icon: Icons.phone,
                      enabled: _isEditMode,
                      keyboardType: TextInputType.phone,
                    ),
                    const SizedBox(height: 24),

                    // Additional Info (Read-only)
                    if (profile.employeeId != null) ...[
                      _buildInfoRow('Employee ID', profile.employeeId!),
                      const SizedBox(height: 12),
                    ],

                    if (profile.hubId != null) ...[
                      _buildInfoRow('Hub ID', profile.hubId!),
                      const SizedBox(height: 12),
                    ],

                    if (profile.stateId != null) ...[
                      _buildInfoRow('State ID', profile.stateId!),
                      const SizedBox(height: 12),
                    ],

                    if (profile.localityId != null) ...[
                      _buildInfoRow('Locality ID', profile.localityId!),
                      const SizedBox(height: 12),
                    ],

                    _buildInfoRow(
                      'Member Since',
                      _formatDate(profile.createdAt),
                    ),

                    if (profile.lastActive != null) ...[
                      const SizedBox(height: 12),
                      _buildInfoRow(
                        'Last Active',
                        _formatDate(profile.lastActive!),
                      ),
                    ],

                    // Save Button
                    if (_isEditMode) ...[
                      const SizedBox(height: 32),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: profileState.isLoading
                              ? null
                              : _saveProfile,
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                          ),
                          child: profileState.isLoading
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Text('Save Changes'),
                        ),
                      ),
                    ],

                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildBadge({
    required String label,
    required Color color,
    required IconData icon,
  }) {
    return Chip(
      avatar: Icon(icon, size: 16, color: Colors.white),
      label: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
      backgroundColor: color,
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    required bool enabled,
    String? Function(String?)? validator,
    TextInputType? keyboardType,
  }) {
    return TextFormField(
      controller: controller,
      enabled: enabled,
      validator: validator,
      keyboardType: keyboardType,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: !enabled,
        fillColor: enabled ? null : Colors.grey[100],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 14)),
        Text(
          value,
          style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14),
        ),
      ],
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }
}
