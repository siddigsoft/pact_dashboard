import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../services/favorites_service.dart';
import '../services/webrtc_service.dart';
import 'enhanced_call_screen.dart';

/// Quick call speed dial widget for favorite contacts
class QuickCallSpeedDial extends StatefulWidget {
  final String userId;
  final bool compact;

  const QuickCallSpeedDial({
    super.key,
    required this.userId,
    this.compact = false,
  });

  @override
  State<QuickCallSpeedDial> createState() => _QuickCallSpeedDialState();
}

class _QuickCallSpeedDialState extends State<QuickCallSpeedDial> {
  final FavoritesService _favoritesService = FavoritesService();
  final WebRTCService _webrtcService = WebRTCService();

  late Future<List<Map<String, dynamic>>> _favorites;

  @override
  void initState() {
    super.initState();
    _loadFavorites();
  }

  void _loadFavorites() {
    setState(() {
      _favorites = _favoritesService.getFavorites(widget.userId);
    });
  }

  Future<void> _quickCall(Map<String, dynamic> contact, bool videoCall) async {
    final success = await _webrtcService.initiateCall(
      targetUserId: contact['contact_id'],
      targetUserName: contact['contact_name'],
      isAudioOnly: !videoCall,
    );

    if (success && mounted) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => EnhancedCallScreen(
            remoteUserName: contact['contact_name'],
            remoteUserAvatar: contact['contact_avatar'],
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _favorites,
      builder: (context, snapshot) {
        if (!snapshot.hasData || snapshot.data!.isEmpty) {
          return SizedBox.shrink();
        }

        final favorites = snapshot.data!;

        if (widget.compact) {
          return _buildCompactView(favorites);
        } else {
          return _buildExpandedView(favorites);
        }
      },
    );
  }

  Widget _buildCompactView(List<Map<String, dynamic>> favorites) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Quick Dial',
            style: GoogleFonts.poppins(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Colors.grey[700],
            ),
          ),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: favorites.take(5).map((contact) {
                return Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: _buildQuickDialButton(contact),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildExpandedView(List<Map<String, dynamic>> favorites) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            'Favorite Contacts',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            mainAxisSpacing: 16,
            crossAxisSpacing: 12,
            childAspectRatio: 1,
          ),
          itemCount: favorites.length,
          itemBuilder: (context, index) {
            final contact = favorites[index];
            return _buildFavoriteContactCard(contact);
          },
        ),
      ],
    );
  }

  Widget _buildQuickDialButton(Map<String, dynamic> contact) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 4),
            ],
          ),
          child: CircleAvatar(
            radius: 28,
            backgroundImage: contact['contact_avatar'] != null
                ? NetworkImage(contact['contact_avatar'])
                : null,
            backgroundColor: AppColors.primaryBlue,
            child: contact['contact_avatar'] == null
                ? Icon(Icons.person, color: Colors.white, size: 24)
                : null,
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: 60,
          child: Text(
            contact['contact_name'],
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: GoogleFonts.poppins(
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            InkWell(
              onTap: () => _quickCall(contact, false),
              child: Icon(Icons.call, size: 16, color: Colors.green),
            ),
            const SizedBox(width: 8),
            InkWell(
              onTap: () => _quickCall(contact, true),
              child: Icon(
                Icons.videocam,
                size: 16,
                color: AppColors.primaryBlue,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildFavoriteContactCard(Map<String, dynamic> contact) {
    return InkWell(
      onTap: () => _quickCall(contact, false),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.grey[100],
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey[300]!),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              radius: 30,
              backgroundImage: contact['contact_avatar'] != null
                  ? NetworkImage(contact['contact_avatar'])
                  : null,
              backgroundColor: AppColors.primaryBlue,
              child: contact['contact_avatar'] == null
                  ? const Icon(Icons.person, color: Colors.white, size: 28)
                  : null,
            ),
            const SizedBox(height: 8),
            Text(
              contact['contact_name'],
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
