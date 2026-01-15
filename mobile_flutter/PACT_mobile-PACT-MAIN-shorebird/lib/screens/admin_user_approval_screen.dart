import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/app_colors.dart';
import '../theme/app_design_system.dart';
import '../widgets/app_widgets.dart';
import '../services/auth_service.dart';
import '../models/database_models.dart';

class AdminUserApprovalScreen extends StatefulWidget {
  const AdminUserApprovalScreen({super.key});

  @override
  State<AdminUserApprovalScreen> createState() => _AdminUserApprovalScreenState();
}

class _AdminUserApprovalScreenState extends State<AdminUserApprovalScreen> {
  final AuthService _authService = AuthService();
  List<Profile> _pendingUsers = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadPendingUsers();
  }

  Future<void> _loadPendingUsers() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final response = await _authService.supabase
          .from('profiles')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', ascending: false);

      setState(() {
        _pendingUsers = response.map<Profile>((json) => Profile.fromJson(json)).toList();
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading pending users: $e');
      setState(() {
        _isLoading = false;
      });
      if (mounted) {
        AppSnackBar.show(
          context,
          message: 'Failed to load pending users',
          type: SnackBarType.error,
        );
      }
    }
  }

  Future<void> _approveUser(String userId, String userName) async {
    try {
      await _authService.approveUser(userId);
      await _loadPendingUsers(); // Refresh list

      if (mounted) {
        AppSnackBar.show(
          context,
          message: '$userName has been approved',
          type: SnackBarType.success,
        );
      }
    } catch (e) {
      debugPrint('Error approving user: $e');
      if (mounted) {
        AppSnackBar.show(
          context,
          message: 'Failed to approve user',
          type: SnackBarType.error,
        );
      }
    }
  }

  Future<void> _rejectUser(String userId, String userName) async {
    try {
      await _authService.supabase
          .from('profiles')
          .update({'status': 'rejected'})
          .eq('id', userId);

      await _loadPendingUsers(); // Refresh list

      if (mounted) {
        AppSnackBar.show(
          context,
          message: '$userName has been rejected',
          type: SnackBarType.warning,
        );
      }
    } catch (e) {
      debugPrint('Error rejecting user: $e');
      if (mounted) {
        AppSnackBar.show(
          context,
          message: 'Failed to reject user',
          type: SnackBarType.error,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Text(
          'Pending Approvals',
          style: AppTextStyles.headlineSmall.copyWith(
            color: AppColors.textPrimary,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _pendingUsers.isEmpty
              ? _buildEmptyState()
              : _buildUserList(),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.check_circle_outline,
            size: 64,
            color: AppColors.textSecondary,
          ),
          const SizedBox(height: 16),
          Text(
            'No pending approvals',
            style: AppTextStyles.bodyLarge.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'All users have been processed',
            style: AppTextStyles.bodyMedium.copyWith(
              color: AppColors.textTertiary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUserList() {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _pendingUsers.length,
      itemBuilder: (context, index) {
        final user = _pendingUsers[index];
        return _buildUserCard(user).animate().fadeIn(
              delay: Duration(milliseconds: index * 100),
              duration: const Duration(milliseconds: 300),
            );
      },
    );
  }

  Widget _buildUserCard(Profile user) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: AppColors.primary.withOpacity(0.1),
                  backgroundImage: user.avatarUrl != null
                      ? NetworkImage(user.avatarUrl!)
                      : null,
                  child: user.avatarUrl == null
                      ? Text(
                          user.fullName?.substring(0, 1).toUpperCase() ?? 'U',
                          style: AppTextStyles.headlineSmall.copyWith(
                            color: AppColors.primary,
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.fullName ?? 'Unknown User',
                        style: AppTextStyles.bodyLarge.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        user.email ?? '',
                        style: AppTextStyles.bodyMedium.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      ),
                      Text(
                        user.role,
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (user.phone != null || user.employeeId != null) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  if (user.phone != null) ...[
                    Icon(Icons.phone, size: 16, color: AppColors.textSecondary),
                    const SizedBox(width: 4),
                    Text(
                      user.phone!,
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                  if (user.employeeId != null) ...[
                    const SizedBox(width: 16),
                    Icon(Icons.badge, size: 16, color: AppColors.textSecondary),
                    const SizedBox(width: 4),
                    Text(
                      user.employeeId!,
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ],
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => _approveUser(user.id, user.fullName ?? 'User'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.success,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: const Text('Approve'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _rejectUser(user.id, user.fullName ?? 'User'),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: AppColors.error),
                      foregroundColor: AppColors.error,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: const Text('Reject'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}