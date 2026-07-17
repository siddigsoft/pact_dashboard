import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/chat.dart';
import '../services/chat_service.dart';
import '../theme/app_colors.dart';
import '../widgets/reusable_app_bar.dart';

class ContactInfoScreen extends StatefulWidget {
  final Chat chat;

  const ContactInfoScreen({super.key, required this.chat});

  @override
  State<ContactInfoScreen> createState() => _ContactInfoScreenState();
}

class _ContactInfoScreenState extends State<ContactInfoScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ChatService _chatService = ChatService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _mediaMessages = [];
  List<Map<String, dynamic>> _docMessages = [];
  List<Map<String, dynamic>> _linkMessages = [];

  // Disappearing messages state will go here later

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadHistoricalMedia();
  }

  Future<void> _showDisappearingMessagesDialog() async {
    final int? result = await showDialog<int>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Disappearing messages'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: const Text('Off'),
                leading: Radio<int>(
                  value: 0,
                  groupValue: widget.chat.disappearingTimer ?? 0,
                  onChanged: (val) => Navigator.pop(context, val),
                ),
                onTap: () => Navigator.pop(context, 0),
              ),
              ListTile(
                title: const Text('24 Hours'),
                leading: Radio<int>(
                  value: 24,
                  groupValue: widget.chat.disappearingTimer ?? 0,
                  onChanged: (val) => Navigator.pop(context, val),
                ),
                onTap: () => Navigator.pop(context, 24),
              ),
              ListTile(
                title: const Text('7 Days'),
                leading: Radio<int>(
                  value: 168,
                  groupValue: widget.chat.disappearingTimer ?? 0,
                  onChanged: (val) => Navigator.pop(context, val),
                ),
                onTap: () => Navigator.pop(context, 168),
              ),
            ],
          ),
        );
      },
    );

    if (result != null && result != widget.chat.disappearingTimer) {
      await _chatService.updateDisappearingTimer(widget.chat.id, result);
      setState(() {
        widget.chat.disappearingTimer = result;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result == 0
                  ? 'Disappearing messages turned off'
                  : 'Timer set to ${result == 24 ? "24 Hours" : "7 Days"}',
            ),
          ),
        );
      }
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadHistoricalMedia() async {
    try {
      final response = await Supabase.instance.client
          .from('chat_messages')
          .select()
          .eq('chat_id', widget.chat.id)
          .order('created_at', ascending: false);

      final messages = List<Map<String, dynamic>>.from(response);

      final media = <Map<String, dynamic>>[];
      final docs = <Map<String, dynamic>>[];
      final links = <Map<String, dynamic>>[];

      final urlRegex = RegExp(
        r'(https?://(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?://(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})',
        caseSensitive: false,
      );

      for (var msg in messages) {
        final type = msg['content_type'];
        final content = msg['content']?.toString() ?? '';

        if (type == 'image' || type == 'video') {
          media.add(msg);
        } else if (type == 'file' || type == 'document') {
          docs.add(msg);
        }

        // Detect links in text messages
        if (type == 'text' && urlRegex.hasMatch(content)) {
          links.add(msg);
        }
      }

      if (mounted) {
        setState(() {
          _mediaMessages = media;
          _docMessages = docs;
          _linkMessages = links;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  String _getChatTitle() {
    if (widget.chat.chatType == 'private') {
      return widget.chat.otherParticipantName ??
          'User ${widget.chat.id.substring(0, 8)}';
    }
    return widget.chat.name.isNotEmpty ? widget.chat.name : 'Group Chat';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: _getChatTitle(),
              showBackButton: true,
            ),
            Expanded(
              child: CustomScrollView(
                slivers: [
                  SliverToBoxAdapter(
                    child: Container(
                      color: AppColors.primaryBlue,
                      height: 150,
                      child: Center(
                        child: Icon(
                          widget.chat.chatType == 'group'
                              ? Icons.group
                              : Icons.person,
                          size: 80,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
          SliverToBoxAdapter(
            child: Container(
              color: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _buildActionIcon(Icons.call, 'Audio'),
                  _buildActionIcon(Icons.videocam, 'Video'),
                  _buildActionIcon(Icons.search, 'Search'),
                ],
              ),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 12)),

          // Disappearing Messages Toggle
          SliverToBoxAdapter(
            child: Container(
              color: Colors.white,
              child: ListTile(
                leading: const Icon(Icons.timer, color: AppColors.primaryBlue),
                title: const Text('Disappearing messages'),
                subtitle: Text(
                  widget.chat.disappearingTimer != null &&
                          widget.chat.disappearingTimer! > 0
                      ? widget.chat.disappearingTimer == 24
                            ? "24 Hours"
                            : "7 Days"
                      : 'Off',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: _showDisappearingMessagesDialog,
              ),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 12)),

          // Media / Links / Docs Section
          SliverToBoxAdapter(
            child: Container(
              color: Colors.white,
              child: Column(
                children: [
                  TabBar(
                    controller: _tabController,
                    labelColor: const Color(0xFF075E54),
                    unselectedLabelColor: Colors.grey,
                    indicatorColor: const Color(0xFF075E54),
                    tabs: const [
                      Tab(text: 'Media'),
                      Tab(text: 'Docs'),
                      Tab(text: 'Links'),
                    ],
                  ),
                  SizedBox(
                    height: 300, // Fixed height for now
                    child: TabBarView(
                      controller: _tabController,
                      children: [
                        _buildMediaGrid(),
                        _buildDocsList(),
                        _buildLinksList(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionIcon(IconData icon, String label) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: AppColors.primaryBlue, size: 28),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(
            color: AppColors.primaryBlue,
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  Widget _buildMediaGrid() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (_mediaMessages.isEmpty) {
      return Center(
        child: Text(
          'No media found',
          style: TextStyle(color: Colors.grey[600]),
        ),
      );
    }
    return GridView.builder(
      padding: const EdgeInsets.all(4),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 4,
        mainAxisSpacing: 4,
      ),
      itemCount: _mediaMessages.length,
      itemBuilder: (context, index) {
        final msg = _mediaMessages[index];
        final fileUrl = msg['file_url']?.toString();
        if (fileUrl != null && fileUrl.isNotEmpty) {
          return Image.network(
            fileUrl,
            fit: BoxFit.cover,
            errorBuilder: (c, e, s) => Container(
              color: Colors.grey[400],
              child: const Icon(Icons.broken_image),
            ),
          );
        }
        return Container(
          color: Colors.grey[300],
          child: const Icon(Icons.videocam),
        );
      },
    );
  }

  Widget _buildDocsList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (_docMessages.isEmpty) {
      return Center(
        child: Text(
          'No documents found',
          style: TextStyle(color: Colors.grey[600]),
        ),
      );
    }
    return ListView.builder(
      itemCount: _docMessages.length,
      itemBuilder: (context, index) {
        final msg = _docMessages[index];
        return ListTile(
          leading: const Icon(Icons.insert_drive_file, color: Colors.orange),
          title: Text(
            msg['file_name'] ?? 'Document',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: Text(
            msg['created_at'] != null
                ? msg['created_at'].toString().substring(0, 10)
                : '',
          ),
        );
      },
    );
  }

  Widget _buildLinksList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (_linkMessages.isEmpty) {
      return Center(
        child: Text(
          'No links found',
          style: TextStyle(color: Colors.grey[600]),
        ),
      );
    }
    return ListView.builder(
      itemCount: _linkMessages.length,
      itemBuilder: (context, index) {
        final msg = _linkMessages[index];
        return ListTile(
          leading: const Icon(Icons.link, color: Colors.blue),
          title: Text(
            msg['content'] ?? 'Link',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        );
      },
    );
  }
}
