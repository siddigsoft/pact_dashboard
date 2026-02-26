import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/call_state.dart';
import '../services/call_history_service.dart';
import '../services/webrtc_service.dart';

class MissedCallsScreen extends StatefulWidget {
  const MissedCallsScreen({Key? key}) : super(key: key);

  @override
  State<MissedCallsScreen> createState() => _MissedCallsScreenState();
}

class _MissedCallsScreenState extends State<MissedCallsScreen> {
  final CallHistoryService _callHistoryService = CallHistoryService();
  final WebRTCService _webrtcService = WebRTCService();
  List<CallHistoryEntry> _missedCalls = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadMissedCalls();
  }

  Future<void> _loadMissedCalls() async {
    setState(() => _isLoading = true);
    await _callHistoryService.initialize();
    setState(() {
      _missedCalls = _callHistoryService.getMissedCalls();
      _isLoading = false;
    });
  }

  Future<void> _callBack(CallHistoryEntry entry, {bool isVideo = false}) async {
    try {
      await _webrtcService.initiateCall(
        entry.remoteUserId,
        entry.remoteUserName,
        targetUserAvatar: entry.remoteUserAvatar,
        isAudioOnly: !isVideo,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Could not start call: $e'),
          backgroundColor: Colors.red.shade600,
        ),
      );
    }
  }

  Future<void> _deleteEntry(CallHistoryEntry entry) async {
    await _callHistoryService.deleteEntry(entry.id);
    setState(() {
      _missedCalls.removeWhere((e) => e.id == entry.id);
    });
  }

  String _formatTime(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays == 1) return 'Yesterday';
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        elevation: 0,
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        flexibleSpace: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF1565C0), Color(0xFF1976D2), Color(0xFF2196F3)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Missed Calls',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.w600,
            fontSize: 18,
          ),
        ),
        actions: [
          if (_missedCalls.isNotEmpty)
            TextButton(
              onPressed: () async {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: Text(
                      'Clear All',
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                    ),
                    content: Text(
                      'Remove all missed call records?',
                      style: GoogleFonts.poppins(),
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text('Cancel'),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        child: const Text(
                          'Clear',
                          style: TextStyle(color: Colors.red),
                        ),
                      ),
                    ],
                  ),
                );
                if (confirm == true) {
                  for (final e in List.from(_missedCalls)) {
                    await _callHistoryService.deleteEntry(e.id);
                  }
                  setState(() => _missedCalls.clear());
                }
              },
              child: Text(
                'Clear All',
                style: GoogleFonts.poppins(
                  color: Colors.white70,
                  fontSize: 13,
                ),
              ),
            ),
          const SizedBox(width: 4),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadMissedCalls,
              child: _missedCalls.isEmpty
                  ? _buildEmptyState()
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                      itemCount: _missedCalls.length,
                      itemBuilder: (context, index) {
                        return _buildCallTile(_missedCalls[index]);
                      },
                    ),
            ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: Colors.grey.shade100,
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.phone_missed_rounded,
              size: 40,
              color: Colors.grey.shade400,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'No Missed Calls',
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'You have no missed calls',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey.shade400,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCallTile(CallHistoryEntry entry) {
    final initial = entry.remoteUserName.isNotEmpty
        ? entry.remoteUserName[0].toUpperCase()
        : '?';

    return Dismissible(
      key: Key(entry.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        decoration: BoxDecoration(
          color: Colors.red.shade400,
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Icon(Icons.delete_outline, color: Colors.white, size: 24),
      ),
      onDismissed: (_) => _deleteEntry(entry),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          leading: Stack(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: [Colors.red.shade300, Colors.red.shade500],
                  ),
                ),
                child: entry.remoteUserAvatar != null
                    ? ClipOval(
                        child: Image.network(
                          entry.remoteUserAvatar!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Center(
                            child: Text(
                              initial,
                              style: GoogleFonts.poppins(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 18,
                              ),
                            ),
                          ),
                        ),
                      )
                    : Center(
                        child: Text(
                          initial,
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 18,
                          ),
                        ),
                      ),
              ),
              Positioned(
                bottom: 0,
                right: 0,
                child: Container(
                  width: 18,
                  height: 18,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 1.5),
                  ),
                  child: Icon(
                    entry.isVideoCall ? Icons.videocam_rounded : Icons.call_rounded,
                    size: 11,
                    color: Colors.red.shade400,
                  ),
                ),
              ),
            ],
          ),
          title: Text(
            entry.remoteUserName,
            style: GoogleFonts.poppins(
              fontWeight: FontWeight.w600,
              fontSize: 15,
              color: const Color(0xFF1A1A2E),
            ),
          ),
          subtitle: Row(
            children: [
              Icon(
                Icons.phone_missed_rounded,
                size: 14,
                color: Colors.red.shade400,
              ),
              const SizedBox(width: 4),
              Text(
                _formatTime(entry.startTime),
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: Colors.red.shade400,
                ),
              ),
              if (entry.isVideoCall) ...[
                const SizedBox(width: 8),
                Text(
                  '• Video',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.grey.shade500,
                  ),
                ),
              ],
            ],
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _callBackButton(
                icon: Icons.call_rounded,
                color: const Color(0xFF4CAF50),
                onTap: () => _callBack(entry, isVideo: false),
              ),
              const SizedBox(width: 8),
              _callBackButton(
                icon: Icons.videocam_rounded,
                color: const Color(0xFF1976D2),
                onTap: () => _callBack(entry, isVideo: true),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _callBackButton({
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 18, color: color),
      ),
    );
  }
}
