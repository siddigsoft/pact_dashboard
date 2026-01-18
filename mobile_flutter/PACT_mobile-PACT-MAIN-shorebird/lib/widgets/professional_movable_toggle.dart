import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../models/user_availability.dart';
import '../providers/profile_provider.dart';

enum CornerPosition { topLeft, topRight, bottomLeft, bottomRight }

class ProfessionalMovableToggle extends ConsumerStatefulWidget {
  final bool showByDefault;
  
  const ProfessionalMovableToggle({
    super.key,
    this.showByDefault = true,
  });

  @override
  ConsumerState<ProfessionalMovableToggle> createState() => _ProfessionalMovableToggleState();
}

class _ProfessionalMovableToggleState extends ConsumerState<ProfessionalMovableToggle> 
    with SingleTickerProviderStateMixin {
  bool _isVisible = true;
  bool _isExpanded = true;
  bool _isLoading = false;
  bool _isSyncing = false;
  bool _isDragging = false;
  CornerPosition _cornerPosition = CornerPosition.bottomLeft;
  UserAvailability? _localAvailabilityOverride;
  
  late AnimationController _animationController;
  late Animation<double> _scaleAnimation;
  
  Offset _dragOffset = Offset.zero;
  
  static const String _positionKey = 'professional_toggle_corner';
  static const String _visibilityKey = 'professional_toggle_visible';
  static const String _expandedKey = 'professional_toggle_expanded';
  static const String _pendingAvailabilityKey = 'pending_availability_change';
  static const String _localAvailabilityKey = 'local_availability_status';
  
  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 200),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOutBack),
    );
    _loadPreferences();
    _loadLocalAvailability();
    _syncPendingAvailabilityChanges();
    Connectivity().onConnectivityChanged.listen(_onConnectivityChanged);
    _animationController.forward();
  }
  
  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }
  
  void _onConnectivityChanged(List<ConnectivityResult> results) {
    if (!results.contains(ConnectivityResult.none)) {
      _syncPendingAvailabilityChanges();
    }
  }
  
  Future<void> _loadPreferences() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cornerIndex = prefs.getInt(_positionKey) ?? 2;
      final visible = prefs.getBool(_visibilityKey) ?? widget.showByDefault;
      final expanded = prefs.getBool(_expandedKey) ?? true;
      
      if (mounted) {
        setState(() {
          _cornerPosition = CornerPosition.values[cornerIndex.clamp(0, 3)];
          _isVisible = visible;
          _isExpanded = expanded;
        });
      }
    } catch (e) {
      debugPrint('[ProfessionalMovableToggle] Error loading preferences: $e');
    }
  }
  
  Future<void> _savePreferences() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_positionKey, _cornerPosition.index);
      await prefs.setBool(_visibilityKey, _isVisible);
      await prefs.setBool(_expandedKey, _isExpanded);
    } catch (e) {
      debugPrint('[ProfessionalMovableToggle] Error saving preferences: $e');
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
      debugPrint('[ProfessionalMovableToggle] Error loading local availability: $e');
    }
  }

  Future<void> _syncPendingAvailabilityChanges() async {
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

      final supabase = Supabase.instance.client;
      await supabase
          .from('profiles')
          .update({
            'availability': pendingChange,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', profile.id);

      await prefs.remove(_pendingAvailabilityKey);
      await prefs.remove(_localAvailabilityKey);
      
      if (mounted) {
        setState(() => _localAvailabilityOverride = null);
      }
      
      ref.invalidate(currentUserProfileProvider);
    } catch (e) {
      debugPrint('[ProfessionalMovableToggle] Error syncing: $e');
    } finally {
      _isSyncing = false;
    }
  }

  Future<void> _toggleAvailability() async {
    if (_isLoading) return;
    setState(() => _isLoading = true);

    try {
      final profile = ref.read(currentUserProfileProvider);
      if (profile == null) throw Exception('User profile not found');

      final currentAvailability = _localAvailabilityOverride ?? 
          UserAvailability.fromString(profile.availability.name);
      final newAvailability = currentAvailability == UserAvailability.online
          ? UserAvailability.offline
          : UserAvailability.online;

      final connectivityResult = await Connectivity().checkConnectivity();
      final isOnline = !connectivityResult.contains(ConnectivityResult.none);

      if (isOnline) {
        final supabase = Supabase.instance.client;
        await supabase
            .from('profiles')
            .update({
              'availability': newAvailability.value,
              'updated_at': DateTime.now().toIso8601String(),
            })
            .eq('id', profile.id)
            .select()
            .maybeSingle();

        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(_pendingAvailabilityKey);
        await prefs.remove(_localAvailabilityKey);
        
        if (mounted) setState(() => _localAvailabilityOverride = null);
        ref.invalidate(currentUserProfileProvider);
      } else {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_pendingAvailabilityKey, newAvailability.value);
        await prefs.setString(_localAvailabilityKey, newAvailability.value);
        
        if (mounted) setState(() => _localAvailabilityOverride = newAvailability);
      }

      if (mounted) {
        final message = newAvailability == UserAvailability.online
            ? 'You are now Online'
            : 'You are now Offline';
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                Icon(
                  newAvailability == UserAvailability.online 
                      ? Icons.wifi : Icons.wifi_off,
                  color: Colors.white,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Text(message),
              ],
            ),
            backgroundColor: newAvailability == UserAvailability.online
                ? const Color(0xFF10B981)
                : const Color(0xFF6B7280),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            margin: const EdgeInsets.all(16),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }
  
  CornerPosition _findNearestCorner(Offset position, Size screenSize) {
    final corners = {
      CornerPosition.topLeft: const Offset(0, 0),
      CornerPosition.topRight: Offset(screenSize.width, 0),
      CornerPosition.bottomLeft: Offset(0, screenSize.height),
      CornerPosition.bottomRight: Offset(screenSize.width, screenSize.height),
    };
    
    CornerPosition nearest = CornerPosition.bottomLeft;
    double minDistance = double.infinity;
    
    corners.forEach((corner, offset) {
      final distance = (position - offset).distance;
      if (distance < minDistance) {
        minDistance = distance;
        nearest = corner;
      }
    });
    
    return nearest;
  }
  
  Offset _getCornerOffset(CornerPosition corner, Size screenSize, Size widgetSize) {
    const padding = 16.0;
    const bottomNavHeight = 80.0;
    const topSafeArea = 100.0;
    
    switch (corner) {
      case CornerPosition.topLeft:
        return Offset(padding, topSafeArea);
      case CornerPosition.topRight:
        return Offset(screenSize.width - widgetSize.width - padding, topSafeArea);
      case CornerPosition.bottomLeft:
        return Offset(padding, screenSize.height - widgetSize.height - bottomNavHeight);
      case CornerPosition.bottomRight:
        return Offset(
          screenSize.width - widgetSize.width - padding,
          screenSize.height - widgetSize.height - bottomNavHeight,
        );
    }
  }
  
  void _hideToggle() {
    setState(() => _isVisible = false);
    _savePreferences();
    
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Row(
          children: [
            Icon(Icons.visibility_off, color: Colors.white, size: 18),
            SizedBox(width: 8),
            Expanded(child: Text('Status toggle hidden. Tap the indicator to show again.')),
          ],
        ),
        backgroundColor: const Color(0xFF374151),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        margin: const EdgeInsets.all(16),
        duration: const Duration(seconds: 4),
        action: SnackBarAction(
          label: 'UNDO',
          textColor: const Color(0xFF60A5FA),
          onPressed: () {
            setState(() => _isVisible = true);
            _savePreferences();
          },
        ),
      ),
    );
  }
  
  void _showToggle() {
    setState(() => _isVisible = true);
    _savePreferences();
    _animationController.reset();
    _animationController.forward();
  }
  
  void _toggleExpanded() {
    setState(() => _isExpanded = !_isExpanded);
    _savePreferences();
    
    if (!_isExpanded) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Row(
            children: [
              Icon(Icons.touch_app, color: Colors.white, size: 18),
              SizedBox(width: 8),
              Expanded(child: Text('Double-tap to expand, long-press for options')),
            ],
          ),
          backgroundColor: const Color(0xFF374151),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          margin: const EdgeInsets.all(16),
          duration: const Duration(seconds: 3),
        ),
      );
    }
  }
  
  void _showMinimizedMenu(BuildContext context, Color primaryColor) {
    final RenderBox? box = context.findRenderObject() as RenderBox?;
    if (box == null) return;
    
    final Offset position = box.localToGlobal(Offset.zero);
    
    showMenu<String>(
      context: context,
      position: RelativeRect.fromLTRB(
        position.dx,
        position.dy - 200,
        position.dx + 100,
        position.dy,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      items: [
        PopupMenuItem(
          value: 'expand',
          child: Row(
            children: [
              Icon(Icons.open_in_full, size: 18, color: primaryColor),
              const SizedBox(width: 12),
              const Text('Expand'),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'hide',
          child: Row(
            children: [
              Icon(Icons.visibility_off, size: 18, color: Colors.grey[700]),
              const SizedBox(width: 12),
              const Text('Hide'),
            ],
          ),
        ),
        const PopupMenuDivider(),
        PopupMenuItem(
          enabled: false,
          height: 32,
          child: Text(
            'Move to corner',
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey[500],
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        PopupMenuItem(
          value: 'move_tl',
          child: Row(
            children: [
              Icon(Icons.north_west, size: 18, 
                color: _cornerPosition == CornerPosition.topLeft 
                    ? primaryColor : Colors.grey[700]),
              const SizedBox(width: 12),
              Text('Top Left',
                style: TextStyle(
                  color: _cornerPosition == CornerPosition.topLeft 
                      ? primaryColor : null)),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'move_tr',
          child: Row(
            children: [
              Icon(Icons.north_east, size: 18,
                color: _cornerPosition == CornerPosition.topRight 
                    ? primaryColor : Colors.grey[700]),
              const SizedBox(width: 12),
              Text('Top Right',
                style: TextStyle(
                  color: _cornerPosition == CornerPosition.topRight 
                      ? primaryColor : null)),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'move_bl',
          child: Row(
            children: [
              Icon(Icons.south_west, size: 18,
                color: _cornerPosition == CornerPosition.bottomLeft 
                    ? primaryColor : Colors.grey[700]),
              const SizedBox(width: 12),
              Text('Bottom Left',
                style: TextStyle(
                  color: _cornerPosition == CornerPosition.bottomLeft 
                      ? primaryColor : null)),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'move_br',
          child: Row(
            children: [
              Icon(Icons.south_east, size: 18,
                color: _cornerPosition == CornerPosition.bottomRight 
                    ? primaryColor : Colors.grey[700]),
              const SizedBox(width: 12),
              Text('Bottom Right',
                style: TextStyle(
                  color: _cornerPosition == CornerPosition.bottomRight 
                      ? primaryColor : null)),
            ],
          ),
        ),
      ],
    ).then((value) {
      if (value == null) return;
      switch (value) {
        case 'expand':
          _toggleExpanded();
          break;
        case 'hide':
          _hideToggle();
          break;
        case 'move_tl':
          setState(() => _cornerPosition = CornerPosition.topLeft);
          _savePreferences();
          break;
        case 'move_tr':
          setState(() => _cornerPosition = CornerPosition.topRight);
          _savePreferences();
          break;
        case 'move_bl':
          setState(() => _cornerPosition = CornerPosition.bottomLeft);
          _savePreferences();
          break;
        case 'move_br':
          setState(() => _cornerPosition = CornerPosition.bottomRight);
          _savePreferences();
          break;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(currentUserProfileProvider);
    
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
    
    final availability = _localAvailabilityOverride ?? 
        (profile != null
            ? UserAvailability.fromString(profile.availability.name)
            : UserAvailability.offline);
    final isOnline = availability == UserAvailability.online;
    
    return LayoutBuilder(
      builder: (context, constraints) {
        final screenSize = Size(constraints.maxWidth, constraints.maxHeight);
        final widgetSize = _isExpanded ? const Size(160, 50) : const Size(50, 50);
        
        final baseOffset = _getCornerOffset(_cornerPosition, screenSize, widgetSize);
        final currentOffset = _isDragging 
            ? baseOffset + _dragOffset 
            : baseOffset;
        
        return Stack(
          children: [
            if (!_isVisible)
              AnimatedPositioned(
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOutCubic,
                left: _cornerPosition == CornerPosition.topLeft || 
                      _cornerPosition == CornerPosition.bottomLeft ? 8 : null,
                right: _cornerPosition == CornerPosition.topRight || 
                       _cornerPosition == CornerPosition.bottomRight ? 8 : null,
                top: _cornerPosition == CornerPosition.topLeft || 
                     _cornerPosition == CornerPosition.topRight ? 100 : null,
                bottom: _cornerPosition == CornerPosition.bottomLeft || 
                        _cornerPosition == CornerPosition.bottomRight ? 90 : null,
                child: GestureDetector(
                  onTap: _showToggle,
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isOnline 
                          ? const Color(0xFF10B981).withOpacity(0.9)
                          : const Color(0xFF6B7280).withOpacity(0.9),
                      boxShadow: [
                        BoxShadow(
                          color: (isOnline ? const Color(0xFF10B981) : const Color(0xFF6B7280))
                              .withOpacity(0.4),
                          blurRadius: 8,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                    child: Center(
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white.withOpacity(0.9),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            if (_isVisible)
              AnimatedPositioned(
                duration: _isDragging 
                    ? Duration.zero 
                    : const Duration(milliseconds: 300),
                curve: Curves.easeOutCubic,
                left: currentOffset.dx,
                top: currentOffset.dy,
                child: ScaleTransition(
                  scale: _scaleAnimation,
                  child: GestureDetector(
                    onPanStart: (_) => setState(() {
                      _isDragging = true;
                      _dragOffset = Offset.zero;
                    }),
                    onPanUpdate: (details) {
                      setState(() {
                        _dragOffset += details.delta;
                      });
                    },
                    onPanEnd: (_) {
                      final finalPosition = baseOffset + _dragOffset;
                      final newCorner = _findNearestCorner(
                        finalPosition + Offset(widgetSize.width / 2, widgetSize.height / 2),
                        screenSize,
                      );
                      
                      setState(() {
                        _isDragging = false;
                        _dragOffset = Offset.zero;
                        _cornerPosition = newCorner;
                      });
                      _savePreferences();
                    },
                    child: _buildToggleWidget(isOnline),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
  
  Widget _buildToggleWidget(bool isOnline) {
    final primaryColor = isOnline 
        ? const Color(0xFF10B981) 
        : const Color(0xFF6B7280);
    final backgroundColor = isOnline
        ? const Color(0xFF10B981).withOpacity(0.15)
        : const Color(0xFF6B7280).withOpacity(0.15);
    
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutCubic,
      height: 50,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(25),
        color: Colors.white,
        border: Border.all(
          color: primaryColor.withOpacity(0.3),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: primaryColor.withOpacity(0.2),
            blurRadius: 16,
            spreadRadius: 0,
            offset: const Offset(0, 4),
          ),
          BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 8,
            spreadRadius: 0,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(25),
        child: Material(
          color: Colors.transparent,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              GestureDetector(
                onTap: _isLoading ? null : _toggleAvailability,
                onDoubleTap: !_isExpanded ? _toggleExpanded : null,
                onLongPress: !_isExpanded ? () => _showMinimizedMenu(context, primaryColor) : null,
                child: Container(
                  padding: EdgeInsets.symmetric(
                    horizontal: _isExpanded ? 12 : 10,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: backgroundColor,
                    borderRadius: _isExpanded 
                        ? const BorderRadius.horizontal(left: Radius.circular(25))
                        : BorderRadius.circular(25),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: primaryColor,
                          boxShadow: [
                            BoxShadow(
                              color: primaryColor.withOpacity(0.4),
                              blurRadius: 8,
                              spreadRadius: 0,
                            ),
                          ],
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
                              : Icon(
                                  isOnline ? Icons.wifi : Icons.wifi_off,
                                  size: 16,
                                  color: Colors.white,
                                ),
                        ),
                      ),
                      if (_isExpanded) ...[
                        const SizedBox(width: 10),
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              isOnline ? 'Online' : 'Offline',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: primaryColor,
                                letterSpacing: -0.2,
                              ),
                            ),
                            Text(
                              isOnline ? 'Tap to go offline' : 'Tap to go online',
                              style: TextStyle(
                                fontSize: 9,
                                color: Colors.grey[500],
                                letterSpacing: -0.1,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              if (_isExpanded) ...[
                Container(
                  width: 1,
                  height: 30,
                  color: Colors.grey[200],
                ),
                PopupMenuButton<String>(
                  icon: Icon(
                    Icons.more_vert,
                    size: 18,
                    color: Colors.grey[600],
                  ),
                  padding: EdgeInsets.zero,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  offset: const Offset(0, -120),
                  onSelected: (value) {
                    switch (value) {
                      case 'minimize':
                        _toggleExpanded();
                        break;
                      case 'hide':
                        _hideToggle();
                        break;
                      case 'move_tl':
                        setState(() => _cornerPosition = CornerPosition.topLeft);
                        _savePreferences();
                        break;
                      case 'move_tr':
                        setState(() => _cornerPosition = CornerPosition.topRight);
                        _savePreferences();
                        break;
                      case 'move_bl':
                        setState(() => _cornerPosition = CornerPosition.bottomLeft);
                        _savePreferences();
                        break;
                      case 'move_br':
                        setState(() => _cornerPosition = CornerPosition.bottomRight);
                        _savePreferences();
                        break;
                    }
                  },
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      value: 'minimize',
                      child: Row(
                        children: [
                          Icon(Icons.minimize, size: 18, color: Colors.grey[700]),
                          const SizedBox(width: 12),
                          const Text('Minimize'),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'hide',
                      child: Row(
                        children: [
                          Icon(Icons.visibility_off, size: 18, color: Colors.grey[700]),
                          const SizedBox(width: 12),
                          const Text('Hide'),
                        ],
                      ),
                    ),
                    const PopupMenuDivider(),
                    PopupMenuItem(
                      enabled: false,
                      height: 32,
                      child: Text(
                        'Move to corner',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey[500],
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    PopupMenuItem(
                      value: 'move_tl',
                      child: Row(
                        children: [
                          Icon(
                            Icons.north_west,
                            size: 18,
                            color: _cornerPosition == CornerPosition.topLeft 
                                ? const Color(0xFF10B981) 
                                : Colors.grey[700],
                          ),
                          const SizedBox(width: 12),
                          Text(
                            'Top Left',
                            style: TextStyle(
                              color: _cornerPosition == CornerPosition.topLeft 
                                  ? const Color(0xFF10B981) 
                                  : null,
                            ),
                          ),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'move_tr',
                      child: Row(
                        children: [
                          Icon(
                            Icons.north_east,
                            size: 18,
                            color: _cornerPosition == CornerPosition.topRight 
                                ? const Color(0xFF10B981) 
                                : Colors.grey[700],
                          ),
                          const SizedBox(width: 12),
                          Text(
                            'Top Right',
                            style: TextStyle(
                              color: _cornerPosition == CornerPosition.topRight 
                                  ? const Color(0xFF10B981) 
                                  : null,
                            ),
                          ),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'move_bl',
                      child: Row(
                        children: [
                          Icon(
                            Icons.south_west,
                            size: 18,
                            color: _cornerPosition == CornerPosition.bottomLeft 
                                ? const Color(0xFF10B981) 
                                : Colors.grey[700],
                          ),
                          const SizedBox(width: 12),
                          Text(
                            'Bottom Left',
                            style: TextStyle(
                              color: _cornerPosition == CornerPosition.bottomLeft 
                                  ? const Color(0xFF10B981) 
                                  : null,
                            ),
                          ),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'move_br',
                      child: Row(
                        children: [
                          Icon(
                            Icons.south_east,
                            size: 18,
                            color: _cornerPosition == CornerPosition.bottomRight 
                                ? const Color(0xFF10B981) 
                                : Colors.grey[700],
                          ),
                          const SizedBox(width: 12),
                          Text(
                            'Bottom Right',
                            style: TextStyle(
                              color: _cornerPosition == CornerPosition.bottomRight 
                                  ? const Color(0xFF10B981) 
                                  : null,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
