import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/custom_drawer_menu.dart';
import '../services/agora_call_service.dart';
import 'agora_call_screen.dart';
import 'dart:async';

class FieldTeamMapScreen extends StatefulWidget {
  const FieldTeamMapScreen({super.key});

  @override
  State<FieldTeamMapScreen> createState() => _FieldTeamMapScreenState();
}

class _FieldTeamMapScreenState extends State<FieldTeamMapScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final MapController _mapController = MapController();

  bool _isLoading = true;
  bool _hasAccess = false;
  String? _userRole;
  List<Map<String, dynamic>> _teamMembers = [];
  Map<String, dynamic>? _selectedMember;
  String _statusFilter = 'all';
  Timer? _refreshTimer;
  String _currentLocale = 'en';

  @override
  void initState() {
    super.initState();
    _checkAccessAndLoad();
  }

  Future<void> _checkAccessAndLoad() async {
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) {
      if (mounted) {
        Navigator.pop(context);
      }
      return;
    }

    try {
      final response = await Supabase.instance.client
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle();

      final role = response?['role']?.toString().toLowerCase() ?? '';
      final allowedRoles = ['admin', 'super_admin', 'superadmin', 'ict'];

      if (mounted) {
        setState(() {
          _userRole = role;
          _hasAccess = allowedRoles.contains(role);
          if (!_hasAccess) {
            _isLoading = false;
          }
        });

        if (_hasAccess) {
          _loadTeamLocations();
          _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
            _loadTeamLocations();
          });
        }
      }
    } catch (e) {
      debugPrint('Error checking access: $e');
      if (mounted) {
        setState(() {
          _hasAccess = false;
          _isLoading = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadTeamLocations() async {
    try {
      // Note: Database uses state_id, hub_id, location (jsonb), and status columns
      // location column stores lat/lng as JSON: {lat: number, lng: number, timestamp: string}
      final response = await Supabase.instance.client
          .from('profiles')
          .select(
            'id, full_name, email, role, avatar_url, location, state_id, hub_id, status, location_sharing',
          )
          .not('status', 'eq', 'pending')
          .not('role', 'eq', 'admin')
          .not('role', 'eq', 'super_admin');

      if (mounted) {
        setState(() {
          _teamMembers = List<Map<String, dynamic>>.from(response as List);
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading team locations: $e');
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  List<Map<String, dynamic>> get _filteredMembers {
    if (_statusFilter == 'all') return _teamMembers;

    final now = DateTime.now();
    return _teamMembers.where((member) {
      final lastUpdate = member['last_location_updated'] != null
          ? DateTime.parse(member['last_location_updated'])
          : null;

      if (_statusFilter == 'online') {
        return lastUpdate != null && now.difference(lastUpdate).inMinutes < 15;
      } else if (_statusFilter == 'offline') {
        return lastUpdate == null || now.difference(lastUpdate).inMinutes >= 15;
      }
      return true;
    }).toList();
  }

  Color _getMemberStatusColor(Map<String, dynamic> member) {
    final lastUpdate = member['last_location_updated'] != null
        ? DateTime.parse(member['last_location_updated'])
        : null;

    if (lastUpdate == null) return Colors.grey;

    final minutesAgo = DateTime.now().difference(lastUpdate).inMinutes;
    if (minutesAgo < 15) return Colors.green;
    if (minutesAgo < 60) return Colors.orange;
    return Colors.red;
  }

  String _getMemberStatus(Map<String, dynamic> member, bool isArabic) {
    final lastUpdate = member['last_location_updated'] != null
        ? DateTime.parse(member['last_location_updated'])
        : null;

    if (lastUpdate == null) {
      return isArabic ? 'غير متوفر' : 'No location';
    }

    final minutesAgo = DateTime.now().difference(lastUpdate).inMinutes;
    if (minutesAgo < 15) return isArabic ? 'متصل الآن' : 'Online now';
    if (minutesAgo < 60) return isArabic ? 'نشط مؤخراً' : 'Recently active';

    final hoursAgo = minutesAgo ~/ 60;
    if (hoursAgo < 24) {
      return isArabic ? 'منذ $hoursAgo ساعة' : '${hoursAgo}h ago';
    }

    final daysAgo = hoursAgo ~/ 24;
    return isArabic ? 'منذ $daysAgo يوم' : '${daysAgo}d ago';
  }

  void _toggleLanguage() {
    setState(() {
      _currentLocale = _currentLocale == 'en' ? 'ar' : 'en';
    });
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = _currentLocale == 'ar';

    if (!_hasAccess && !_isLoading) {
      return Scaffold(
        appBar: AppBar(
          backgroundColor: AppColors.primaryBlue,
          title: Text(
            isArabic ? 'غير مصرح' : 'Access Denied',
            style: GoogleFonts.poppins(color: Colors.white),
          ),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
        ),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.lock_outline, size: 80, color: Colors.grey[400]),
              const SizedBox(height: 16),
              Text(
                isArabic
                    ? 'ليس لديك صلاحية الوصول لهذه الصفحة'
                    : 'You do not have permission to access this page',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  color: Colors.grey[600],
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                child: Text(isArabic ? 'العودة' : 'Go Back'),
              ),
            ],
          ),
        ),
      );
    }

    return Directionality(
      textDirection: isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: AppColors.backgroundGray,
        drawer: CustomDrawerMenu(
          currentUser: Supabase.instance.client.auth.currentUser,
          onClose: () => _scaffoldKey.currentState?.closeDrawer(),
        ),
        appBar: AppBar(
          backgroundColor: AppColors.primaryBlue,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.menu, color: Colors.white),
            onPressed: () => _scaffoldKey.currentState?.openDrawer(),
          ),
          title: Text(
            isArabic ? 'خريطة الفريق الميداني' : 'Field Team Map',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh, color: Colors.white),
              onPressed: _loadTeamLocations,
            ),
            TextButton.icon(
              onPressed: _toggleLanguage,
              icon: const Icon(Icons.language, color: Colors.white, size: 20),
              label: Text(
                isArabic ? 'EN' : 'عربي',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        body: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : SafeArea(
                top: false,
                child: Column(
                  children: [
                    _buildFilterBar(isArabic),
                    Expanded(
                      child: Stack(
                        children: [
                          _buildMap(),
                          if (_selectedMember != null)
                            Positioned(
                              bottom: 16,
                              left: 16,
                              right: 16,
                              child: _buildMemberCard(
                                _selectedMember!,
                                isArabic,
                              ),
                            ),
                          Positioned(
                            top: 16,
                            right: 16,
                            child: _buildStatsCard(isArabic),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _buildFilterBar(bool isArabic) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: Colors.white,
      child: Row(
        children: [
          _buildFilterChip(isArabic ? 'الكل' : 'All', 'all', isArabic),
          const SizedBox(width: 8),
          _buildFilterChip(
            isArabic ? 'متصل' : 'Online',
            'online',
            isArabic,
            color: Colors.green,
          ),
          const SizedBox(width: 8),
          _buildFilterChip(
            isArabic ? 'غير متصل' : 'Offline',
            'offline',
            isArabic,
            color: Colors.grey,
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(
    String label,
    String value,
    bool isArabic, {
    Color? color,
  }) {
    final isSelected = _statusFilter == value;
    return FilterChip(
      label: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (color != null) ...[
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
          ],
          Text(label),
        ],
      ),
      selected: isSelected,
      onSelected: (_) {
        setState(() => _statusFilter = value);
      },
      selectedColor: AppColors.primaryBlue.withValues(alpha: 0.2),
      checkmarkColor: AppColors.primaryBlue,
    );
  }

  Widget _buildStatsCard(bool isArabic) {
    final onlineCount = _teamMembers.where((m) {
      final lastUpdate = m['last_location_updated'] != null
          ? DateTime.parse(m['last_location_updated'])
          : null;
      return lastUpdate != null &&
          DateTime.now().difference(lastUpdate).inMinutes < 15;
    }).length;

    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              isArabic ? 'إحصائيات الفريق' : 'Team Stats',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.bold,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(
                    color: Colors.green,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  isArabic ? '$onlineCount متصل' : '$onlineCount Online',
                  style: GoogleFonts.poppins(fontSize: 11),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(
                    color: Colors.grey,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  isArabic
                      ? '${_teamMembers.length - onlineCount} غير متصل'
                      : '${_teamMembers.length - onlineCount} Offline',
                  style: GoogleFonts.poppins(fontSize: 11),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMap() {
    final membersWithLocation = _filteredMembers.where((m) {
      return m['last_location_lat'] != null && m['last_location_lng'] != null;
    }).toList();

    return FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        initialCenter: const LatLng(15.5007, 32.5599),
        initialZoom: 6,
        onTap: (_, _) {
          setState(() => _selectedMember = null);
        },
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.pact.mobile',
        ),
        MarkerLayer(
          markers: membersWithLocation.map((member) {
            final lat = (member['last_location_lat'] as num).toDouble();
            final lng = (member['last_location_lng'] as num).toDouble();
            final statusColor = _getMemberStatusColor(member);
            final initials = (member['full_name'] as String? ?? 'U')
                .split(' ')
                .map((w) => w.isNotEmpty ? w[0] : '')
                .take(2)
                .join()
                .toUpperCase();

            return Marker(
              point: LatLng(lat, lng),
              width: 50,
              height: 50,
              child: GestureDetector(
                onTap: () {
                  setState(() => _selectedMember = member);
                  _mapController.move(LatLng(lat, lng), 12);
                },
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.3),
                        shape: BoxShape.circle,
                      ),
                    ),
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(color: statusColor, width: 3),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.2),
                            blurRadius: 4,
                          ),
                        ],
                      ),
                      child: member['avatar_url'] != null
                          ? ClipOval(
                              child: Image.network(
                                member['avatar_url'],
                                fit: BoxFit.cover,
                                errorBuilder: (_, _, _) => Center(
                                  child: Text(
                                    initials,
                                    style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 12,
                                      color: statusColor,
                                    ),
                                  ),
                                ),
                              ),
                            )
                          : Center(
                              child: Text(
                                initials,
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                  color: statusColor,
                                ),
                              ),
                            ),
                    ),
                  ],
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildMemberCard(Map<String, dynamic> member, bool isArabic) {
    final statusColor = _getMemberStatusColor(member);
    final status = _getMemberStatus(member, isArabic);

    return Card(
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: statusColor.withValues(alpha: 0.2),
                  backgroundImage: member['avatar_url'] != null
                      ? NetworkImage(member['avatar_url'])
                      : null,
                  child: member['avatar_url'] == null
                      ? Text(
                          (member['full_name'] as String? ?? 'U')[0]
                              .toUpperCase(),
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.bold,
                            fontSize: 20,
                            color: statusColor,
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        member['full_name'] ?? 'Unknown',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        _getRoleLabel(member['role'] as String?, isArabic),
                        style: GoogleFonts.poppins(
                          color: Colors.grey[600],
                          fontSize: 13,
                        ),
                      ),
                      Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: statusColor,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            status,
                            style: GoogleFonts.poppins(
                              color: statusColor,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => setState(() => _selectedMember = null),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            if (member['state'] != null || member['hub'] != null) ...[
              const Divider(height: 24),
              Row(
                children: [
                  if (member['state'] != null) ...[
                    Icon(Icons.location_on, size: 16, color: Colors.grey[600]),
                    const SizedBox(width: 4),
                    Text(
                      member['state'],
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                    const SizedBox(width: 16),
                  ],
                  if (member['hub'] != null) ...[
                    Icon(Icons.business, size: 16, color: Colors.grey[600]),
                    const SizedBox(width: 4),
                    Text(
                      member['hub'],
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ],
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () => _initiateCall(member),
                    icon: const Icon(Icons.call, size: 18),
                    label: Text(isArabic ? 'اتصال' : 'Call'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primaryGreen,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _openChat(member),
                    icon: const Icon(Icons.chat, size: 18),
                    label: Text(isArabic ? 'رسالة' : 'Message'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primaryBlue,
                      side: BorderSide(color: AppColors.primaryBlue),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _getRoleLabel(String? role, bool isArabic) {
    switch (role) {
      case 'data_collector':
        return isArabic ? 'جامع بيانات' : 'Data Collector';
      case 'field_coordinator':
        return isArabic ? 'منسق ميداني' : 'Field Coordinator';
      case 'hub_coordinator':
        return isArabic ? 'منسق المركز' : 'Hub Coordinator';
      case 'state_coordinator':
        return isArabic ? 'منسق الولاية' : 'State Coordinator';
      default:
        return role ?? (isArabic ? 'عضو فريق' : 'Team Member');
    }
  }

  Future<void> _initiateCall(Map<String, dynamic> member) async {
    final currentUser = Supabase.instance.client.auth.currentUser;
    if (currentUser == null) return;

    try {
      final agoraService = AgoraCallService();
      if (!agoraService.isReady) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Call service not ready. Try again in a moment.'),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }
      if (agoraService.isInCall) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('You are already in a call'),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }

      final result = await agoraService.startCall(
        remoteUserId: member['id'],
        remoteUserName: member['full_name'] ?? 'Team Member',
        remoteUserAvatar: member['avatar_url'],
        audioOnly: true,
      );

      if (result.success && result.channelName != null && mounted) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => AgoraCallScreen(
              channelName: result.channelName!,
              remoteUserId: member['id'],
              remoteUserName: member['full_name'] ?? 'Team Member',
              remoteUserAvatar: member['avatar_url'],
              isAudioOnly: true,
              isOutgoing: true,
            ),
          ),
        );
      } else if (!result.success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result.error ?? 'Call failed'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Call failed: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _openChat(Map<String, dynamic> member) async {
    Navigator.pushNamed(
      context,
      '/communications',
      arguments: {'userId': member['id'], 'userName': member['full_name']},
    );
  }
}
