import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';
import '../services/call_history_service.dart';
import '../services/webrtc_service.dart';

class CallHistoryScreen extends StatefulWidget {
  const CallHistoryScreen({super.key});

  @override
  State<CallHistoryScreen> createState() => _CallHistoryScreenState();
}

class _CallHistoryScreenState extends State<CallHistoryScreen> {
  final CallHistoryService _callHistoryService = CallHistoryService();
  final WebRTCService _webrtcService = WebRTCService();
  final TextEditingController _searchController = TextEditingController();

  late Future<List<Map<String, dynamic>>> _callHistory;
  String _filterType = 'all';
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _loadCallHistory();
  }

  void _loadCallHistory() {
    setState(() {
      _callHistory = _callHistoryService.getCallHistory(
        userId: _webrtcService.userId ?? '',
        filterType: _filterType != 'all' ? _filterType : null,
      );
    });
  }

  void _performSearch(String query) {
    setState(() {
      _searchQuery = query;
      if (query.isEmpty) {
        _loadCallHistory();
      } else {
        _callHistory = _callHistoryService.searchCallHistory(
          userId: _webrtcService.userId ?? '',
          query: query,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(
          'Call History',
          style: GoogleFonts.poppins(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        backgroundColor: AppColors.primaryBlue,
        elevation: 0,
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Search bar
            Padding(
              padding: const EdgeInsets.all(16),
              child: TextField(
                controller: _searchController,
                onChanged: _performSearch,
                decoration: InputDecoration(
                  hintText: 'Search calls...',
                  prefixIcon: const Icon(Icons.search, color: Colors.grey),
                  suffixIcon: _searchQuery.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () {
                            _searchController.clear();
                            _performSearch('');
                          },
                        )
                      : null,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),

            // Filter chips
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  _buildFilterChip('All', 'all'),
                  const SizedBox(width: 8),
                  _buildFilterChip('Incoming', 'incoming'),
                  const SizedBox(width: 8),
                  _buildFilterChip('Outgoing', 'outgoing'),
                  const SizedBox(width: 8),
                  _buildFilterChip('Missed', 'missed'),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Call history list
            Expanded(
              child: FutureBuilder<List<Map<String, dynamic>>>(
                future: _callHistory,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return Center(
                      child: CircularProgressIndicator(
                        color: AppColors.primaryBlue,
                      ),
                    );
                  }

                  if (snapshot.hasError) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.error_outline,
                            size: 64,
                            color: Colors.grey,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Error loading calls',
                            style: GoogleFonts.poppins(
                              fontSize: 16,
                              color: Colors.grey[600],
                            ),
                          ),
                        ],
                      ),
                    );
                  }

                  final calls = snapshot.data ?? [];

                  if (calls.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.call_missed,
                            size: 64,
                            color: Colors.grey[300],
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'No calls yet',
                            style: GoogleFonts.poppins(
                              fontSize: 16,
                              color: Colors.grey[600],
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    );
                  }

                  return ListView.builder(
                    itemCount: calls.length,
                    itemBuilder: (context, index) {
                      final call = calls[index];
                      return _buildCallListItem(context, call);
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChip(String label, String value) {
    final isSelected = _filterType == value;
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (selected) {
        setState(() {
          _filterType = value;
          _loadCallHistory();
        });
      },
      backgroundColor: Colors.grey[200],
      selectedColor: AppColors.primaryBlue,
      labelStyle: GoogleFonts.poppins(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: isSelected ? Colors.white : Colors.black,
      ),
    );
  }

  Widget _buildCallListItem(BuildContext context, Map<String, dynamic> call) {
    final callType = call['call_type'] as String?;
    final status = call['status'] as String?;
    final callerName = call['caller_name'] ?? 'Unknown';
    final startedAt = DateTime.parse(call['started_at']);
    final durationSeconds = call['duration_seconds'] ?? 0;
    final qualityRating = call['quality_rating'] as int?;

    final icon = callType == 'incoming'
        ? Icons.call_received
        : callType == 'outgoing'
        ? Icons.call_made
        : Icons.call_missed;

    final iconColor = status == 'completed'
        ? Colors.green
        : status == 'missed'
        ? Colors.red
        : Colors.orange;

    return ListTile(
      leading: CircleAvatar(
        backgroundColor: iconColor.withOpacity(0.2),
        child: Icon(icon, color: iconColor),
      ),
      title: Text(
        callerName,
        style: GoogleFonts.poppins(fontSize: 16, fontWeight: FontWeight.w600),
      ),
      subtitle: Row(
        children: [
          Text(
            DateFormat('MMM d, yyyy • hh:mm a').format(startedAt),
            style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey),
          ),
          if (durationSeconds > 0) ...[
            const SizedBox(width: 8),
            Text(
              '• ${_formatDuration(durationSeconds)}',
              style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey),
            ),
          ],
        ],
      ),
      trailing: qualityRating != null
          ? _buildQualityBadge(qualityRating)
          : const Icon(Icons.chevron_right),
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => CallHistoryDetailsScreen(callHistory: call),
          ),
        );
      },
    );
  }

  Widget _buildQualityBadge(int rating) {
    final colors = [
      Colors.red,
      Colors.orange,
      Colors.yellow,
      Colors.lightGreen,
      Colors.green,
    ];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: colors[rating - 1].withOpacity(0.2),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        '★ $rating/5',
        style: GoogleFonts.poppins(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: colors[rating - 1],
        ),
      ),
    );
  }

  String _formatDuration(int seconds) {
    final hours = seconds ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    final secs = seconds % 60;

    if (hours > 0) {
      return '${hours}h ${minutes}m';
    } else if (minutes > 0) {
      return '${minutes}m ${secs}s';
    } else {
      return '${secs}s';
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }
}

/// Call History Details Screen
class CallHistoryDetailsScreen extends StatefulWidget {
  final Map<String, dynamic> callHistory;

  const CallHistoryDetailsScreen({super.key, required this.callHistory});

  @override
  State<CallHistoryDetailsScreen> createState() =>
      _CallHistoryDetailsScreenState();
}

class _CallHistoryDetailsScreenState extends State<CallHistoryDetailsScreen> {
  final CallHistoryService _callHistoryService = CallHistoryService();
  final TextEditingController _noteController = TextEditingController();
  late Future<List<Map<String, dynamic>>> _notes;

  @override
  void initState() {
    super.initState();
    _loadNotes();
  }

  void _loadNotes() async {
    // getCallNotes returns Future<String>
    final notes = await _callHistoryService.getCallNotes(
      widget.callHistory['id'],
    );
    if (mounted) {
      setState(() {
        _noteController.text = notes;
      });
    }
  }

  void _saveNote() async {
    if (_noteController.text.isEmpty) return;

    final success = await _callHistoryService.saveCallNote(
      callId: widget.callHistory['id'],
      notes: _noteController.text,
    );

    if (success && mounted) {
      _noteController.clear();
      _loadNotes();
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Note saved')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(
          'Call Details',
          style: GoogleFonts.poppins(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        backgroundColor: AppColors.primaryBlue,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Call details card
          Card(
            elevation: 2,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.callHistory['caller_name'] ?? 'Unknown',
                    style: GoogleFonts.poppins(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildDetailRow(
                    'Status',
                    widget.callHistory['status']?.toUpperCase() ?? 'N/A',
                  ),
                  _buildDetailRow(
                    'Type',
                    widget.callHistory['call_type']?.toUpperCase() ?? 'N/A',
                  ),
                  _buildDetailRow(
                    'Duration',
                    _formatDuration(
                      widget.callHistory['duration_seconds'] ?? 0,
                    ),
                  ),
                  if (widget.callHistory['latency_ms'] != null)
                    _buildDetailRow(
                      'Latency',
                      '${widget.callHistory['latency_ms']}ms',
                    ),
                  if (widget.callHistory['packet_loss'] != null)
                    _buildDetailRow(
                      'Packet Loss',
                      '${(widget.callHistory['packet_loss'] * 100).toStringAsFixed(2)}%',
                    ),
                  if (widget.callHistory['quality_rating'] != null)
                    _buildDetailRow(
                      'Quality',
                      _getQualityText(widget.callHistory['quality_rating']),
                    ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 24),

          // Notes section
          Text(
            'Notes',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),

          // Add note input
          TextField(
            controller: _noteController,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: 'Add a note about this call...',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              suffixIcon: IconButton(
                icon: const Icon(Icons.send),
                onPressed: _saveNote,
              ),
            ),
          ),

          const SizedBox(height: 16),

          // Display notes
          FutureBuilder<List<Map<String, dynamic>>>(
            future: _notes,
            builder: (context, snapshot) {
              if (!snapshot.hasData || snapshot.data!.isEmpty) {
                return Text(
                  'No notes yet',
                  style: GoogleFonts.poppins(fontSize: 14, color: Colors.grey),
                );
              }

              return Column(
                children: snapshot.data!
                    .map(
                      (note) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.grey[100],
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                note['content'],
                                style: GoogleFonts.poppins(fontSize: 14),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                DateFormat(
                                  'MMM d, yyyy • hh:mm a',
                                ).format(DateTime.parse(note['created_at'])),
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  color: Colors.grey[600],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    )
                    .toList(),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: GoogleFonts.poppins(fontSize: 14, color: Colors.grey[600]),
          ),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  String _formatDuration(int seconds) {
    final hours = seconds ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    final secs = seconds % 60;

    if (hours > 0) {
      return '${hours}h ${minutes}m ${secs}s';
    } else if (minutes > 0) {
      return '${minutes}m ${secs}s';
    } else {
      return '${secs}s';
    }
  }

  String _getQualityText(int rating) {
    switch (rating) {
      case 5:
        return 'Excellent ⭐⭐⭐⭐⭐';
      case 4:
        return 'Good ⭐⭐⭐⭐';
      case 3:
        return 'Fair ⭐⭐⭐';
      case 2:
        return 'Poor ⭐⭐';
      case 1:
        return 'Very Poor ⭐';
      default:
        return 'Unknown';
    }
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }
}
