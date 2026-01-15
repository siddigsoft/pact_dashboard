import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/user_availability.dart';
import '../providers/profile_provider.dart';

/// Online/Offline toggle widget for data collectors
/// Allows users to set their availability status
class OnlineOfflineToggle extends ConsumerStatefulWidget {
  final ToggleVariant variant;
  final bool mobileBottomOffset;

  const OnlineOfflineToggle({
    super.key,
    this.variant = ToggleVariant.uber,
    this.mobileBottomOffset = true,
  });

  @override
  ConsumerState<OnlineOfflineToggle> createState() =>
      _OnlineOfflineToggleState();
}

class _OnlineOfflineToggleState extends ConsumerState<OnlineOfflineToggle> {
  bool _isLoading = false;

  Future<void> _toggleAvailability() async {
    if (_isLoading) return;

    setState(() => _isLoading = true);

    try {
      final profile = ref.read(currentUserProfileProvider);
      if (profile == null) {
        throw Exception('User profile not found');
      }

      final currentAvailability = UserAvailability.fromString(
        profile.availability.name,
      );
      final newAvailability = currentAvailability == UserAvailability.online
          ? UserAvailability.offline
          : UserAvailability.online;

      // Update in database
      final supabase = Supabase.instance.client;
      final response = await supabase
          .from('profiles')
          .update({
            'availability': newAvailability.value,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', profile.id)
          .select()
          .maybeSingle();

      if (response == null) {
        throw Exception('Failed to update availability');
      }

      // Refresh profile provider
      ref.invalidate(currentUserProfileProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              newAvailability == UserAvailability.online
                  ? 'You are now Online - You can receive assignments'
                  : 'You are now Offline - You will not receive new assignments',
            ),
            backgroundColor: newAvailability == UserAvailability.online
                ? Colors.green
                : Colors.grey[700],
            duration: const Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update status: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(currentUserProfileProvider);

    // If profile is null, show the toggle in offline state (assume offline)
    final availability = profile != null
        ? UserAvailability.fromString(profile.availability.name)
        : UserAvailability.offline;
    final isOnline = availability == UserAvailability.online;

    // Only show for data collectors and coordinators if profile is loaded
    if (profile != null) {
      final role = (profile.role ?? '').toLowerCase();
      final isDataCollectorOrCoordinator = [
        'datacollector',
        'data collector',
        'coordinator',
        'enumerator',
      ].contains(role);

      if (!isDataCollectorOrCoordinator) return const SizedBox.shrink();
    }

    switch (widget.variant) {
      case ToggleVariant.uber:
        return _buildUberVariant(isOnline);
      case ToggleVariant.pill:
        return _buildPillVariant(isOnline);
      case ToggleVariant.minimal:
        return _buildMinimalVariant(isOnline);
    }
  }

  Widget _buildUberVariant(bool isOnline) {
    return Container(
      margin: widget.mobileBottomOffset
          ? const EdgeInsets.only(bottom: 16)
          : EdgeInsets.zero,
      child: Material(
        elevation: 8,
        borderRadius: BorderRadius.circular(28),
        child: InkWell(
          onTap: _isLoading ? null : _toggleAvailability,
          borderRadius: BorderRadius.circular(28),
          child: Container(
            height: 56,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(28),
              border: Border.all(
                color: isOnline ? Colors.green : Colors.grey[400]!,
                width: 2,
              ),
              color: isOnline ? Colors.green[50] : Colors.grey[50],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isOnline ? Colors.green : Colors.grey[400],
                  ),
                  child: Center(
                    child: _isLoading
                        ? SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                Colors.white,
                              ),
                            ),
                          )
                        : Container(
                            width: 12,
                            height: 12,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white,
                            ),
                          ),
                  ),
                ),
                const SizedBox(width: 12),
                Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isOnline ? 'Online' : 'Offline',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      isOnline
                          ? 'Available for assignments'
                          : 'Not receiving assignments',
                      style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPillVariant(bool isOnline) {
    return Material(
      elevation: 4,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: _isLoading ? null : _toggleAvailability,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          height: 40,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isOnline ? Colors.green : Colors.grey[400]!,
            ),
            color: isOnline ? Colors.green[50] : Colors.grey[50],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isOnline ? Colors.green : Colors.grey[400],
                ),
                child: Center(
                  child: _isLoading
                      ? const SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              Colors.white,
                            ),
                          ),
                        )
                      : Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.white,
                          ),
                        ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                isOnline ? 'Online' : 'Offline',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMinimalVariant(bool isOnline) {
    return Material(
      elevation: 2,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: _isLoading ? null : _toggleAvailability,
        customBorder: const CircleBorder(),
        child: Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isOnline ? Colors.green : Colors.grey[400],
          ),
          child: Center(
            child: _isLoading
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  )
                : Container(
                    width: 12,
                    height: 12,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

enum ToggleVariant { uber, pill, minimal }
