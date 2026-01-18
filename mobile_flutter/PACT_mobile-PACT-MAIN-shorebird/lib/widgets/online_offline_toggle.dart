import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user_availability.dart';
import '../providers/profile_provider.dart';

/// Online/Offline toggle widget for data collectors
/// Allows users to set their availability status
class OnlineOfflineToggle extends ConsumerStatefulWidget {
  final ToggleVariant variant;
  final bool mobileBottomOffset;

  const OnlineOfflineToggle({
    super.key,
    this.variant = ToggleVariant.pill,  // Default to pill for smaller size
    this.mobileBottomOffset = true,
  });

  @override
  ConsumerState<OnlineOfflineToggle> createState() =>
      _OnlineOfflineToggleState();
}

class _OnlineOfflineToggleState extends ConsumerState<OnlineOfflineToggle> {
  bool _isLoading = false;
  bool _isSyncing = false;  // Guard against concurrent syncs
  // Local override for immediate UI feedback when offline
  UserAvailability? _localAvailabilityOverride;

  static const String _pendingAvailabilityKey = 'pending_availability_change';
  static const String _localAvailabilityKey = 'local_availability_status';

  @override
  void initState() {
    super.initState();
    _loadLocalAvailability();
    _syncPendingAvailabilityChanges();
    // Listen for connectivity changes to sync when back online
    Connectivity().onConnectivityChanged.listen(_onConnectivityChanged);
  }

  void _onConnectivityChanged(List<ConnectivityResult> results) {
    // Check if we're now online
    if (!results.contains(ConnectivityResult.none)) {
      _syncPendingAvailabilityChanges();
    }
  }

  Future<void> _loadLocalAvailability() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final localStatus = prefs.getString(_localAvailabilityKey);
      if (localStatus != null && mounted) {
        setState(() {
          _localAvailabilityOverride = UserAvailability.fromString(localStatus);
        });
      }
    } catch (e) {
      debugPrint('[OnlineOfflineToggle] Error loading local availability: $e');
    }
  }

  Future<void> _syncPendingAvailabilityChanges() async {
    // Guard against concurrent syncs
    if (_isSyncing) return;
    _isSyncing = true;
    
    try {
      final connectivityResult = await Connectivity().checkConnectivity();
      final isOnline = !connectivityResult.contains(ConnectivityResult.none);
      if (!isOnline) return;

      final prefs = await SharedPreferences.getInstance();
      final pendingChange = prefs.getString(_pendingAvailabilityKey);
      if (pendingChange == null) return;

      final profile = ref.read(currentUserProfileProvider);
      if (profile == null) return;

      debugPrint('[OnlineOfflineToggle] Syncing pending availability: $pendingChange');

      final supabase = Supabase.instance.client;
      await supabase
          .from('profiles')
          .update({
            'availability': pendingChange,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', profile.id);

      // Clear pending change after successful sync
      await prefs.remove(_pendingAvailabilityKey);
      await prefs.remove(_localAvailabilityKey);
      
      if (mounted) {
        setState(() {
          _localAvailabilityOverride = null;
        });
      }
      
      // Refresh profile provider
      ref.invalidate(currentUserProfileProvider);
      
      debugPrint('[OnlineOfflineToggle] Pending availability synced successfully');
    } catch (e) {
      debugPrint('[OnlineOfflineToggle] Error syncing pending availability: $e');
    } finally {
      _isSyncing = false;
    }
  }

  Future<void> _toggleAvailability() async {
    if (_isLoading) return;

    setState(() => _isLoading = true);

    try {
      final profile = ref.read(currentUserProfileProvider);
      
      // Handle null profile gracefully - use cached local availability
      if (profile == null) {
        // Check if we have a local override we can toggle
        if (_localAvailabilityOverride != null) {
          final newAvailability = _localAvailabilityOverride == UserAvailability.online
              ? UserAvailability.offline
              : UserAvailability.online;
          
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(_pendingAvailabilityKey, newAvailability.value);
          await prefs.setString(_localAvailabilityKey, newAvailability.value);
          
          if (mounted) {
            setState(() {
              _localAvailabilityOverride = newAvailability;
              _isLoading = false;
            });
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(newAvailability == UserAvailability.online
                    ? 'Status set to Online (will sync when connected)'
                    : 'Status set to Offline (will sync when connected)'),
                backgroundColor: Colors.orange,
                duration: const Duration(seconds: 3),
              ),
            );
          }
          return;
        }
        
        // No profile and no local override - show friendly message
        if (mounted) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Please wait for profile to load or check your connection'),
              backgroundColor: Colors.orange,
              duration: Duration(seconds: 3),
            ),
          );
        }
        return;
      }

      // Use local override if available, otherwise use profile
      final currentAvailability = _localAvailabilityOverride ?? 
          UserAvailability.fromString(profile.availability.name);
      final newAvailability = currentAvailability == UserAvailability.online
          ? UserAvailability.offline
          : UserAvailability.online;

      // Check connectivity
      final connectivityResult = await Connectivity().checkConnectivity();
      final isOnline = !connectivityResult.contains(ConnectivityResult.none);

      if (isOnline) {
        // Online: Update in database directly
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

        // Clear any local override
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(_pendingAvailabilityKey);
        await prefs.remove(_localAvailabilityKey);
        
        if (mounted) {
          setState(() {
            _localAvailabilityOverride = null;
          });
        }

        // Refresh profile provider
        ref.invalidate(currentUserProfileProvider);
      } else {
        // Offline: Store locally and queue for later sync
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_pendingAvailabilityKey, newAvailability.value);
        await prefs.setString(_localAvailabilityKey, newAvailability.value);
        
        if (mounted) {
          setState(() {
            _localAvailabilityOverride = newAvailability;
          });
        }
        
        debugPrint('[OnlineOfflineToggle] Offline - queued availability change: ${newAvailability.value}');
      }

      if (mounted) {
        final message = isOnline
            ? (newAvailability == UserAvailability.online
                ? 'You are now Online - You can receive assignments'
                : 'You are now Offline - You will not receive new assignments')
            : (newAvailability == UserAvailability.online
                ? 'You are now Online (will sync when connected)'
                : 'You are now Offline (will sync when connected)');
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
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

    // Use local override if available (for offline mode), otherwise use profile
    final availability = _localAvailabilityOverride ?? 
        (profile != null
            ? UserAvailability.fromString(profile.availability.name)
            : UserAvailability.offline);
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
