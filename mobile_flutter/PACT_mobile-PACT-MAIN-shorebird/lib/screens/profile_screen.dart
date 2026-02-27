import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/pact_user_profile.dart';
import '../providers/profile_provider.dart';
import '../services/offline/offline_db.dart';
import '../services/offline/sync_manager.dart';
import '../theme/app_colors.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _imagePicker = ImagePicker();

  late TextEditingController _fullNameController;
  late TextEditingController _usernameController;
  late TextEditingController _phoneController;
  late TextEditingController _emailController;

  bool _isEditMode = false;
  XFile? _selectedImage;
  Uint8List? _selectedImageBytes;

  // Resolved names from lookup tables
  String? _hubName;
  String? _stateName;
  String? _localityName;
  List<Map<String, dynamic>> _classifications = [];
  bool _isLoadingLookups = false;

  // Sync status
  int _pendingSyncCount = 0;
  int _pendingSiteVisitsCount = 0;
  int _pendingRequestsCount = 0;
  bool _isLoadingSyncStatus = false;

  @override
  void initState() {
    super.initState();
    _fullNameController = TextEditingController();
    _usernameController = TextEditingController();
    _phoneController = TextEditingController();
    _emailController = TextEditingController();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(profileProvider.notifier).loadProfile();
      _loadSyncStatus();
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

  Future<void> _loadSyncStatus() async {
    setState(() => _isLoadingSyncStatus = true);

    try {
      final offlineDb = OfflineDb();
      final pendingSync = offlineDb.getPendingSyncActions(status: 'pending');
      final pendingSiteVisits = offlineDb.getPendingSiteVisits();

      setState(() {
        _pendingSyncCount = pendingSync.length;
        _pendingSiteVisitsCount = pendingSiteVisits.length;
        _pendingRequestsCount = pendingSync.length + pendingSiteVisits.length;
        _isLoadingSyncStatus = false;
      });
    } catch (e) {
      debugPrint('Error loading sync status: $e');
      setState(() => _isLoadingSyncStatus = false);
    }
  }

  /// Trigger SyncManager (site visits, reports), then refresh pending counts.
  Future<void> _triggerSync() async {
    if (_isLoadingSyncStatus) return;

    setState(() => _isLoadingSyncStatus = true);

    try {
      final syncManager = SyncManager();
      syncManager.setSupabaseClient(Supabase.instance.client);
      await syncManager.forceSync();
      await _loadSyncStatus();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Sync completed'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      debugPrint('Profile sync error: $e');
      await _loadSyncStatus();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Sync failed: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    }
  }

  Future<void> _loadLookupNames(PACTUserProfile profile) async {
    if (_isLoadingLookups) return;

    setState(() => _isLoadingLookups = true);

    try {
      final supabase = Supabase.instance.client;

      // Use direct name fields if available (some databases store names directly)
      if (profile.hubName != null && profile.hubName!.isNotEmpty) {
        _hubName = profile.hubName;
      }
      if (profile.stateName != null && profile.stateName!.isNotEmpty) {
        _stateName = profile.stateName;
      }
      if (profile.localityName != null && profile.localityName!.isNotEmpty) {
        _localityName = profile.localityName;
      }

      // If still no names and we have IDs that look like UUIDs, try lookup
      final uuidRegex = RegExp(
        r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
      );

      // Load hub name if not already set
      if (_hubName == null &&
          profile.hubId != null &&
          profile.hubId!.isNotEmpty) {
        if (uuidRegex.hasMatch(profile.hubId!)) {
          try {
            final hubResponse = await supabase
                .from('hubs')
                .select('name')
                .eq('id', profile.hubId!)
                .maybeSingle();
            if (hubResponse != null) {
              _hubName = hubResponse['name'] as String?;
            }
          } catch (e) {
            debugPrint('Error loading hub name: $e');
            // If lookup fails, use the ID as fallback (it might be the name)
            _hubName = profile.hubId;
          }
        } else {
          // Not a UUID, use it directly as the name
          _hubName = profile.hubId;
        }
      }

      // Load state name if not already set
      if (_stateName == null &&
          profile.stateId != null &&
          profile.stateId!.isNotEmpty) {
        if (uuidRegex.hasMatch(profile.stateId!)) {
          try {
            final stateResponse = await supabase
                .from('states')
                .select('name')
                .eq('id', profile.stateId!)
                .maybeSingle();
            if (stateResponse != null) {
              _stateName = stateResponse['name'] as String?;
            }
          } catch (e) {
            debugPrint('Error loading state name: $e');
            _stateName = profile.stateId;
          }
        } else {
          // Not a UUID, use it directly as the name
          _stateName = profile.stateId;
        }
      }

      // Load locality name if not already set
      if (_localityName == null &&
          profile.localityId != null &&
          profile.localityId!.isNotEmpty) {
        if (uuidRegex.hasMatch(profile.localityId!)) {
          try {
            final localityResponse = await supabase
                .from('localities')
                .select('name')
                .eq('id', profile.localityId!)
                .maybeSingle();
            if (localityResponse != null) {
              _localityName = localityResponse['name'] as String?;
            }
          } catch (e) {
            debugPrint('Error loading locality name: $e');
            _localityName = profile.localityId;
          }
        } else {
          // Not a UUID, use it directly as the name
          _localityName = profile.localityId;
        }
      }

      // Load classification history
      try {
        final classificationsResponse = await supabase
            .from('user_classifications')
            .select(
                'id, classification_level, role_scope, assigned_at, reason, is_current')
            .eq('user_id', profile.id)
            .order('assigned_at', ascending: false);

        _classifications =
            (classificationsResponse as List).cast<Map<String, dynamic>>();

        // Mark current: prefer is_current flag, else mark most-recent as current
        bool anyMarkedCurrent =
            _classifications.any((c) => c['is_current'] == true);
        if (!anyMarkedCurrent && _classifications.isNotEmpty) {
          _classifications[0] = {
            ..._classifications[0],
            'is_current': true,
          };
        }
      } catch (e) {
        debugPrint('Error loading classifications: $e');
      }

      if (mounted) {
        setState(() => _isLoadingLookups = false);
      }
    } catch (e) {
      debugPrint('Error loading lookup names: $e');
      if (mounted) {
        setState(() => _isLoadingLookups = false);
      }
    }
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

    // Load lookup names when profile is available
    if (profile != null &&
        !_isLoadingLookups &&
        _hubName == null &&
        _stateName == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _loadLookupNames(profile);
      });
    }

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
        title: Text(
          'Profile',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        backgroundColor: AppColors.primaryBlue,
        foregroundColor: Colors.white,
        actions: [
          if (profile != null && !profileState.isLoading)
            IconButton(
              icon: Icon(_isEditMode ? Icons.close : Icons.edit),
              onPressed: () {
                setState(() {
                  if (_isEditMode) {
                    _populateControllers(profile);
                    _isEditMode = false;
                  } else {
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
                    // Sync Status Banner
                    if (_pendingRequestsCount > 0) _buildSyncStatusBanner(),

                    // Avatar Section
                    Center(
                      child: Stack(
                        children: [
                          CircleAvatar(
                            radius: 60,
                            backgroundColor: AppColors.primaryBlue.withOpacity(
                              0.2,
                            ),
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
                                    style: GoogleFonts.poppins(
                                      fontSize: 32,
                                      fontWeight: FontWeight.bold,
                                      color: AppColors.primaryBlue,
                                    ),
                                  )
                                : null,
                          ),
                          Positioned(
                            bottom: 0,
                            right: 0,
                            child: CircleAvatar(
                              backgroundColor: AppColors.primaryOrange,
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
                          color: AppColors.primaryBlue,
                          icon: Icons.badge,
                        ),
                        _buildBadge(
                          label: profile.status.toUpperCase(),
                          color: profile.isApproved
                              ? AppColors.primaryGreen
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
                      enabled: false,
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

                    // Organization Info Section
                    _buildSection(
                      title: 'Organization',
                      icon: Icons.business,
                      color: AppColors.primaryBlue,
                      children: [
                        _buildInfoRow(
                          'Hub',
                          _isLoadingLookups
                              ? 'Loading...'
                              : (_hubName ??
                                    profile.hubName ??
                                    'Not assigned'),
                          icon: Icons.hub,
                        ),
                        const SizedBox(height: 12),
                        _buildInfoRow(
                          'State',
                          _isLoadingLookups
                              ? 'Loading...'
                              : (_stateName ??
                                    profile.stateName ??
                                    'Not assigned'),
                          icon: Icons.location_city,
                        ),
                        const SizedBox(height: 12),
                        _buildInfoRow(
                          'Locality',
                          _isLoadingLookups
                              ? 'Loading...'
                              : (_localityName ??
                                    profile.localityName ??
                                    'Not assigned'),
                          icon: Icons.location_on,
                        ),
                        const SizedBox(height: 12),
                        _buildInfoRow(
                          'Employee ID',
                          profile.employeeId ?? 'Not assigned',
                          icon: Icons.badge_outlined,
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Classifications Section — full history timeline
                    _buildClassificationHistory(profile),
                    const SizedBox(height: 16),

                    // Bank Account Section
                    _buildBankAccountSection(profile),
                    const SizedBox(height: 16),

                    // Timestamps Section
                    _buildSection(
                      title: 'Activity',
                      icon: Icons.access_time,
                      color: Colors.teal,
                      children: [
                        _buildInfoRow(
                          'Member Since',
                          _formatDate(profile.createdAt),
                          icon: Icons.calendar_today,
                        ),
                        if (profile.lastActive != null) ...[
                          const SizedBox(height: 12),
                          _buildInfoRow(
                            'Last Active',
                            _formatDate(profile.lastActive!),
                            icon: Icons.history,
                          ),
                        ],
                      ],
                    ),

                    // Save Button / bottom safe area padding
                    if (_isEditMode) ...[
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: profileState.isLoading
                              ? null
                              : _saveProfile,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primaryBlue,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: profileState.isLoading
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : Text(
                                  'Save Changes',
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 16,
                                  ),
                                ),
                        ),
                      ),
                    ],

                    SizedBox(
                        height: MediaQuery.of(context).padding.bottom + 24),
                  ],
                ),
              ),
            ),
    );
  }

  // ── Classification history timeline ─────────────────────────────────────────
  Widget _buildClassificationHistory(dynamic profile) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.orange.shade100),
        boxShadow: [
          BoxShadow(
            color: Colors.orange.withOpacity(0.06),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.primaryOrange.withOpacity(0.08),
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(12)),
            ),
            child: Row(
              children: [
                Icon(Icons.stars, color: AppColors.primaryOrange, size: 18),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Classifications',
                        style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            color: AppColors.primaryOrange)),
                    Text('التصنيفات',
                        style: GoogleFonts.poppins(
                            fontSize: 10,
                            color: AppColors.primaryOrange.withOpacity(0.8))),
                  ],
                ),
                const Spacer(),
                if (_classifications.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.primaryOrange.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text('${_classifications.length} records',
                        style: GoogleFonts.poppins(
                            fontSize: 10,
                            color: AppColors.primaryOrange,
                            fontWeight: FontWeight.w600)),
                  ),
              ],
            ),
          ),

          // Timeline body
          if (_classifications.isEmpty)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _buildInfoRow('Classification',
                      profile.classification?.level?.toUpperCase() ??
                          'Not assigned',
                      icon: Icons.grade),
                  if (profile.classification?.roleScope != null) ...[
                    const SizedBox(height: 8),
                    _buildInfoRow('Scope', profile.classification!.roleScope,
                        icon: Icons.work),
                  ],
                ],
              ),
            )
          else
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(
                children: List.generate(_classifications.length, (i) {
                  final c = _classifications[i];
                  final isCurrent = c['is_current'] == true;
                  final level =
                      (c['classification_level'] as String? ?? '').trim();
                  final scope = (c['role_scope'] as String? ?? '').trim();
                  final reason = (c['reason'] as String?)?.trim();
                  final assignedAt = c['assigned_at'] as String?;
                  final isLast = i == _classifications.length - 1;

                  return IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Timeline spine
                        SizedBox(
                          width: 28,
                          child: Column(
                            children: [
                              // Circle dot
                              Container(
                                width: isCurrent ? 14 : 10,
                                height: isCurrent ? 14 : 10,
                                margin: EdgeInsets.only(
                                    top: isCurrent ? 3 : 5),
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: isCurrent
                                      ? AppColors.primaryOrange
                                      : Colors.grey.shade300,
                                  border: isCurrent
                                      ? Border.all(
                                          color: AppColors.primaryOrange
                                              .withOpacity(0.3),
                                          width: 3)
                                      : null,
                                  boxShadow: isCurrent
                                      ? [
                                          BoxShadow(
                                            color: AppColors.primaryOrange
                                                .withOpacity(0.35),
                                            blurRadius: 6,
                                          )
                                        ]
                                      : null,
                                ),
                              ),
                              // Vertical line to next item
                              if (!isLast)
                                Expanded(
                                  child: Container(
                                    width: 2,
                                    margin: const EdgeInsets.only(top: 4),
                                    color: Colors.grey.shade200,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 10),

                        // Card content
                        Expanded(
                          child: Container(
                            margin: EdgeInsets.only(
                                bottom: isLast ? 0 : 10),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: isCurrent
                                  ? AppColors.primaryOrange
                                      .withOpacity(0.07)
                                  : Colors.grey.shade50,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: isCurrent
                                    ? AppColors.primaryOrange
                                        .withOpacity(0.35)
                                    : Colors.grey.shade200,
                                width: isCurrent ? 1.5 : 1,
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    // Level badge
                                    Container(
                                      padding:
                                          const EdgeInsets.symmetric(
                                              horizontal: 8,
                                              vertical: 3),
                                      decoration: BoxDecoration(
                                        color: isCurrent
                                            ? AppColors.primaryOrange
                                            : Colors.grey.shade400,
                                        borderRadius:
                                            BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        level.toUpperCase(),
                                        style: GoogleFonts.poppins(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w700,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ),
                                    if (isCurrent) ...[
                                      const SizedBox(width: 6),
                                      Container(
                                        padding:
                                            const EdgeInsets.symmetric(
                                                horizontal: 6,
                                                vertical: 2),
                                        decoration: BoxDecoration(
                                          color: Colors.green.shade600,
                                          borderRadius:
                                              BorderRadius.circular(5),
                                        ),
                                        child: Text(
                                          'Current / الحالي',
                                          style: GoogleFonts.poppins(
                                              fontSize: 9,
                                              color: Colors.white,
                                              fontWeight:
                                                  FontWeight.w600),
                                        ),
                                      ),
                                    ],
                                    const Spacer(),
                                    if (assignedAt != null &&
                                        DateTime.tryParse(assignedAt) != null)
                                      Text(
                                        _formatDate(
                                            DateTime.parse(assignedAt)),
                                        style: GoogleFonts.poppins(
                                            fontSize: 10,
                                            color: Colors.grey.shade500),
                                      ),
                                  ],
                                ),
                                if (scope.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Row(children: [
                                    Icon(Icons.work_outline,
                                        size: 11,
                                        color: Colors.grey.shade500),
                                    const SizedBox(width: 3),
                                    Text(scope,
                                        style: GoogleFonts.poppins(
                                            fontSize: 11,
                                            color: Colors.grey.shade600)),
                                  ]),
                                ],
                                if (reason != null &&
                                    reason.isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: isCurrent
                                          ? AppColors.primaryOrange
                                              .withOpacity(0.1)
                                          : Colors.blue.shade50,
                                      borderRadius:
                                          BorderRadius.circular(6),
                                    ),
                                    child: Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Icon(Icons.comment_outlined,
                                            size: 11,
                                            color: isCurrent
                                                ? AppColors.primaryOrange
                                                : Colors.blue.shade600),
                                        const SizedBox(width: 4),
                                        Expanded(
                                          child: Text(
                                            reason,
                                            style: GoogleFonts.poppins(
                                              fontSize: 10,
                                              color: isCurrent
                                                  ? AppColors
                                                      .primaryOrange
                                                  : Colors.blue.shade700,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              ),
            ),
        ],
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
            icon: _isLoadingSyncStatus
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.orange[700],
                    ),
                  )
                : Icon(Icons.refresh, color: Colors.orange[700]),
            onPressed: _isLoadingSyncStatus ? null : _triggerSync,
            tooltip: 'Sync now',
          ),
        ],
      ),
    );
  }

  Widget _buildSection({
    required String title,
    required IconData icon,
    required Color color,
    required List<Widget> children,
  }) {
    if (children.isEmpty) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
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
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
              ),
            ),
            child: Row(
              children: [
                Icon(icon, color: color, size: 20),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    color: color,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(children: children),
          ),
        ],
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
        style: GoogleFonts.poppins(color: Colors.white, fontSize: 12),
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
      style: GoogleFonts.poppins(),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: GoogleFonts.poppins(color: AppColors.textLight),
        prefixIcon: Icon(icon, color: AppColors.primaryBlue),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: !enabled,
        fillColor: enabled ? null : Colors.grey[100],
      ),
    );
  }

  Widget _buildBankAccountSection(PACTUserProfile profile) {
    final bankAccount = profile.bankAccount;
    final hasAccount = bankAccount != null &&
        (bankAccount.accountNumber?.isNotEmpty ?? false);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: hasAccount
            ? Colors.green.withOpacity(0.05)
            : Colors.orange.withOpacity(0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: hasAccount
              ? Colors.green.withOpacity(0.3)
              : Colors.orange.withOpacity(0.4),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.account_balance,
                color: hasAccount ? Colors.green : Colors.orange,
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Bank Account / الحساب البنكي',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: hasAccount ? Colors.green[700] : Colors.orange[700],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              // Add / Edit button
              GestureDetector(
                onTap: () => _showBankAccountSheet(profile),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.primaryBlue.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.primaryBlue.withOpacity(0.3)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        hasAccount ? Icons.edit : Icons.add,
                        size: 13,
                        color: AppColors.primaryBlue,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        hasAccount ? 'Edit / تعديل' : 'Add / إضافة',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primaryBlue,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (hasAccount) ...[
            _buildInfoRow(
              'Account Name',
              bankAccount.accountName?.isNotEmpty == true ? bankAccount.accountName! : '-',
              icon: Icons.person_outline,
            ),
            const SizedBox(height: 8),
            _buildInfoRow(
              'Account Number',
              bankAccount.accountNumber!,
              icon: Icons.credit_card,
            ),
            if (bankAccount.bankName?.isNotEmpty ?? false) ...[
              const SizedBox(height: 8),
              _buildInfoRow(
                'Bank Name',
                bankAccount.bankName!,
                icon: Icons.account_balance_outlined,
              ),
            ],
            if (bankAccount.branchCode?.isNotEmpty ?? false) ...[
              const SizedBox(height: 8),
              _buildInfoRow(
                'Branch Code',
                bankAccount.branchCode!,
                icon: Icons.location_city,
              ),
            ],
          ] else
            Text(
              'A verified bank account is required to request transportation advances and withdrawals.\n'
              'يرجى إضافة حساب بنكي لطلب السلف وعمليات السحب.',
              style: GoogleFonts.poppins(
                fontSize: 12,
                color: Colors.orange[800],
              ),
            ),
        ],
      ),
    );
  }

  void _showBankAccountSheet(PACTUserProfile profile) {
    final existing = profile.bankAccount;
    final accountNameCtrl = TextEditingController(text: existing?.accountName ?? '');
    final accountNumberCtrl = TextEditingController(text: existing?.accountNumber ?? '');
    final bankNameCtrl = TextEditingController(text: existing?.bankName ?? '');
    final branchCodeCtrl = TextEditingController(text: existing?.branchCode ?? '');
    final sheetFormKey = GlobalKey<FormState>();
    bool isSaving = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            final mq = MediaQuery.of(ctx);
            return Padding(
              padding: EdgeInsets.only(
                  bottom: mq.viewInsets.bottom),
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                ),
                padding: EdgeInsets.fromLTRB(
                    20, 16, 20, 28 + mq.viewPadding.bottom),
                child: Form(
                  key: sheetFormKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Handle bar
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          margin: const EdgeInsets.only(bottom: 16),
                          decoration: BoxDecoration(
                            color: Colors.grey[300],
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      // Title
                      Row(
                        children: [
                          const Icon(Icons.account_balance, color: AppColors.primaryBlue, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            existing?.accountNumber?.isNotEmpty == true
                                ? 'Edit Bank Account / تعديل الحساب'
                                : 'Add Bank Account / إضافة حساب بنكي',
                            style: GoogleFonts.poppins(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      // Bank Name (required)
                      TextFormField(
                        controller: bankNameCtrl,
                        style: GoogleFonts.poppins(),
                        decoration: InputDecoration(
                          labelText: 'Bank Name / اسم البنك *',
                          labelStyle: GoogleFonts.poppins(color: Colors.grey[600]),
                          prefixIcon: const Icon(Icons.account_balance_outlined),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        validator: (v) =>
                            (v == null || v.trim().isEmpty) ? 'Bank name is required' : null,
                      ),
                      const SizedBox(height: 14),
                      // Account Number (required)
                      TextFormField(
                        controller: accountNumberCtrl,
                        style: GoogleFonts.poppins(),
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          labelText: 'Account Number / رقم الحساب *',
                          labelStyle: GoogleFonts.poppins(color: Colors.grey[600]),
                          prefixIcon: const Icon(Icons.credit_card),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) return 'Account number is required';
                          if (v.trim().length < 8) return 'Must be at least 8 digits';
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      // Account Name (optional)
                      TextFormField(
                        controller: accountNameCtrl,
                        style: GoogleFonts.poppins(),
                        decoration: InputDecoration(
                          labelText: 'Account Holder Name / اسم صاحب الحساب',
                          labelStyle: GoogleFonts.poppins(color: Colors.grey[600]),
                          prefixIcon: const Icon(Icons.person_outline),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                      const SizedBox(height: 14),
                      // Branch Code (optional)
                      TextFormField(
                        controller: branchCodeCtrl,
                        style: GoogleFonts.poppins(),
                        decoration: InputDecoration(
                          labelText: 'Branch Code / رمز الفرع (optional)',
                          labelStyle: GoogleFonts.poppins(color: Colors.grey[600]),
                          prefixIcon: const Icon(Icons.location_city),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                      const SizedBox(height: 24),
                      // Save button
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: isSaving
                              ? null
                              : () async {
                                  if (!sheetFormKey.currentState!.validate()) return;
                                  setSheetState(() => isSaving = true);
                                  try {
                                    await ref
                                        .read(profileProvider.notifier)
                                        .updateProfile(
                                          bankAccount: BankAccount(
                                            bankName: bankNameCtrl.text.trim(),
                                            accountNumber: accountNumberCtrl.text.trim(),
                                            accountName: accountNameCtrl.text.trim().isEmpty
                                                ? null
                                                : accountNameCtrl.text.trim(),
                                            branchCode: branchCodeCtrl.text.trim().isEmpty
                                                ? null
                                                : branchCodeCtrl.text.trim(),
                                          ),
                                        );
                                    if (ctx.mounted) Navigator.of(ctx).pop();
                                    if (mounted) {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(
                                          content: Text('Bank account saved / تم حفظ الحساب البنكي'),
                                          backgroundColor: Colors.green,
                                        ),
                                      );
                                    }
                                  } catch (e) {
                                    setSheetState(() => isSaving = false);
                                    if (ctx.mounted) {
                                      ScaffoldMessenger.of(ctx).showSnackBar(
                                        SnackBar(
                                          content: Text('Failed to save: $e'),
                                          backgroundColor: Colors.red,
                                        ),
                                      );
                                    }
                                  }
                                },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primaryBlue,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: isSaving
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : Text(
                                  'Save / حفظ',
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 15,
                                  ),
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildInfoRow(String label, String value, {IconData? icon}) {
    return Row(
      children: [
        if (icon != null) ...[
          Icon(icon, size: 18, color: AppColors.textLight),
          const SizedBox(width: 8),
        ],
        Text(
          label,
          style: GoogleFonts.poppins(color: AppColors.textLight, fontSize: 13),
        ),
        const Spacer(),
        Flexible(
          child: Text(
            value,
            style: GoogleFonts.poppins(
              fontWeight: FontWeight.w500,
              fontSize: 13,
              color: AppColors.textDark,
            ),
            textAlign: TextAlign.end,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }
}
