import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/custom_drawer_menu.dart';
import '../models/chat.dart';
import '../models/chat_participant.dart';
import '../models/chat_message.dart';
import '../services/chat_service.dart';
import 'user_selection_screen.dart';
import 'chat_screen.dart';

class ChatsScreen extends StatefulWidget {
  const ChatsScreen({super.key});

  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends State<ChatsScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final ChatService _chatService = ChatService();
  List<Chat> _chats = [];
  bool _isLoading = true;
  Map<String, int> _unreadCounts = {};
  Map<String, ChatMessage?> _lastMessages = {};

  String _fallbackLabel(String id) {
    final shortId = id.length > 8 ? id.substring(0, 8) : id;
    return 'User $shortId';
  }

  @override
  void initState() {
    super.initState();
    _loadChats();
  }

  Future<void> _loadChats() async {
    if (!mounted) return;

    setState(() => _isLoading = true);

    final cachedChats = await _chatService.getCachedUserChats();
    if (cachedChats.isNotEmpty && mounted) {
      setState(() {
        _chats = cachedChats;
        _unreadCounts = {
          for (final chat in cachedChats) chat.id: _unreadCounts[chat.id] ?? 0,
        };
        _isLoading = false;
      });
    }

    try {
      final chats = await _chatService.getUserChats();

      // Load unread counts and last messages for each chat
      final unreadCounts = <String, int>{};
      final lastMessages = <String, ChatMessage?>{};

      await Future.wait(
        chats.map((chat) async {
          final pair = await Future.wait([
            _chatService.getUnreadCount(chat.id),
            _chatService.getLastMessage(chat.id),
          ]);
          unreadCounts[chat.id] = pair[0] as int;
          lastMessages[chat.id] = pair[1] as ChatMessage?;
        }),
      );

      // Sort chats by most recent message activity
      chats.sort((a, b) {
        final dateA = lastMessages[a.id]?.createdAt ?? a.createdAt;
        final dateB = lastMessages[b.id]?.createdAt ?? b.createdAt;
        return dateB.compareTo(dateA); // Descending (newest first)
      });

      if (!mounted) return;
      setState(() {
        _chats = chats;
        _unreadCounts = unreadCounts;
        _lastMessages = lastMessages;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      if (_chats.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Unable to load chats right now.'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  Future<void> _startNewChat() async {
    final selectedUser = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (context) => const UserSelectionScreen()),
    );

    if (selectedUser != null && mounted) {
      final chat = await _chatService.createPrivateChat(selectedUser['id']);
      if (chat != null) {
        await _loadChats(); // Refresh the list
        if (mounted) {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => ChatScreen(chat: chat)),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      drawer: CustomDrawerMenu(
        currentUser: null, // Will be set by parent
        onClose: () => _scaffoldKey.currentState?.closeDrawer(),
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.primaryWhite,
              AppColors.backgroundGray.withOpacity(0.3),
            ],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              ReusableAppBar(
                title: 'Chats',
                scaffoldKey: _scaffoldKey,
                actions: [
                  IconButton(
                    icon: const Icon(Icons.add, color: Colors.white),
                    onPressed: _startNewChat,
                  ),
                ],
              ),
              Expanded(
                child: _isLoading
                    ? const Center(
                        child: CircularProgressIndicator(
                          color: AppColors.primaryOrange,
                        ),
                      )
                    : _chats.isEmpty
                    ? _buildEmptyState()
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(vertical: 0),
                        itemCount: _chats.length,
                        itemBuilder: (context, index) {
                          final chat = _chats[index];
                          final unreadCount = _unreadCounts[chat.id] ?? 0;
                          final lastMessage = _lastMessages[chat.id];

                          final participants = chat.participants;
                          final currentUserId = _chatService.getCurrentUserId();

                          String chatTitle = chat.name;
                          String chatSubtitle = '';

                          if (chat.chatType == 'private') {
                            String? displayName = chat.otherParticipantName;
                            String? counterpartId = chat.otherParticipantId;

                            if ((displayName == null || displayName.isEmpty) &&
                                counterpartId != null) {
                              ChatParticipant? participant;
                              for (final item in participants) {
                                if (item.userId == counterpartId) {
                                  participant = item;
                                  break;
                                }
                              }
                              displayName = participant?.userName;
                            }

                            if ((displayName == null || displayName.isEmpty) &&
                                counterpartId == null &&
                                participants.isNotEmpty) {
                              ChatParticipant? other;
                              for (final participant in participants) {
                                if (participant.userId != currentUserId) {
                                  other = participant;
                                  break;
                                }
                              }
                              other ??= participants.first;
                              counterpartId = other.userId;
                              displayName = other.userName;
                            }

                            if ((displayName == null || displayName.isEmpty) &&
                                chat.createdByName != null &&
                                chat.createdByName!.isNotEmpty &&
                                chat.createdBy != currentUserId) {
                              displayName = chat.createdByName;
                              counterpartId ??= chat.createdBy;
                            }

                            if ((displayName == null || displayName.isEmpty) &&
                                counterpartId != null) {
                              displayName = _fallbackLabel(counterpartId);
                            }

                            chatTitle = displayName ?? _fallbackLabel(chat.id);
                            chatSubtitle = 'Private Chat';
                          } else if (chat.chatType == 'group') {
                            chatSubtitle = '${participants.length} members';
                            if (chatTitle.isEmpty &&
                                chat.createdByName != null &&
                                chat.createdByName!.isNotEmpty) {
                              chatTitle = chat.createdByName!;
                            }
                          } else if (chat.createdByName != null &&
                              chat.createdByName!.isNotEmpty) {
                            chatTitle = chat.createdByName!;
                          }

                          if (chatTitle.isEmpty) {
                            chatTitle = _fallbackLabel(chat.id);
                          }

                          // Create dynamic message preview
                          String messagePreview =
                              chatSubtitle; // defaults to 'x members'
                          if (lastMessage != null) {
                            if (lastMessage.contentType == 'text') {
                              messagePreview = lastMessage.content ?? '';
                            } else if (lastMessage.contentType == 'image') {
                              messagePreview = '📸 Photo';
                            } else if (lastMessage.contentType == 'audio') {
                              messagePreview = '🎵 Voice message';
                            } else {
                              messagePreview = '📎 Attachment';
                            }
                          }

                          // Format timestamp
                          String timeString = '';
                          if (lastMessage != null) {
                            final now = DateTime.now();
                            final date = lastMessage.createdAt;
                            if (date.year == now.year &&
                                date.month == now.month &&
                                date.day == now.day) {
                              timeString =
                                  '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
                            } else if (date.year == now.year &&
                                date.month == now.month &&
                                now.day - date.day == 1) {
                              timeString = 'Yesterday';
                            } else {
                              timeString =
                                  '${date.day}/${date.month}/${date.year}';
                            }
                          }

                          return Column(
                                children: [
                                  Material(
                                    color: Colors.white,
                                    child: InkWell(
                                      onTap: () {
                                        Navigator.push(
                                          context,
                                          MaterialPageRoute(
                                            builder: (context) =>
                                                ChatScreen(chat: chat),
                                          ),
                                        ).then((_) => _loadChats());
                                      },
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 16,
                                          vertical: 12,
                                        ),
                                        child: Row(
                                          children: [
                                            // Avatar
                                            Container(
                                              width: 52,
                                              height: 52,
                                              decoration: BoxDecoration(
                                                color: Colors.grey.shade300,
                                                shape: BoxShape.circle,
                                              ),
                                              child: Center(
                                                child: Text(
                                                  chatTitle.isNotEmpty
                                                      ? chatTitle[0]
                                                            .toUpperCase()
                                                      : '?',
                                                  style: const TextStyle(
                                                    color: Colors.white,
                                                    fontWeight: FontWeight.bold,
                                                    fontSize: 22,
                                                  ),
                                                ),
                                              ),
                                            ),
                                            const SizedBox(width: 16),
                                            // Body
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  Row(
                                                    mainAxisAlignment:
                                                        MainAxisAlignment
                                                            .spaceBetween,
                                                    children: [
                                                      Expanded(
                                                        child: Text(
                                                          chatTitle,
                                                          style:
                                                              const TextStyle(
                                                                fontWeight:
                                                                    FontWeight
                                                                        .w600,
                                                                fontSize: 16,
                                                                color: Colors
                                                                    .black87,
                                                              ),
                                                          maxLines: 1,
                                                          overflow: TextOverflow
                                                              .ellipsis,
                                                        ),
                                                      ),
                                                      if (timeString.isNotEmpty)
                                                        Text(
                                                          timeString,
                                                          style: TextStyle(
                                                            fontSize: 12,
                                                            color:
                                                                unreadCount > 0
                                                                ? AppColors
                                                                      .primaryBlue
                                                                : Colors
                                                                      .grey
                                                                      .shade500,
                                                            fontWeight:
                                                                unreadCount > 0
                                                                ? FontWeight
                                                                      .w600
                                                                : FontWeight
                                                                      .normal,
                                                          ),
                                                        ),
                                                    ],
                                                  ),
                                                  const SizedBox(height: 4),
                                                  Row(
                                                    children: [
                                                      if (lastMessage
                                                              ?.senderId ==
                                                          currentUserId)
                                                        Padding(
                                                          padding:
                                                              const EdgeInsets.only(
                                                                right: 4,
                                                              ),
                                                          child: Icon(
                                                            Icons.done_all,
                                                            size: 16,
                                                            color: Colors
                                                                .grey
                                                                .shade400,
                                                          ),
                                                        ),
                                                      Expanded(
                                                        child: Text(
                                                          messagePreview,
                                                          style: TextStyle(
                                                            color: Colors
                                                                .grey
                                                                .shade600,
                                                            fontSize: 14,
                                                          ),
                                                          maxLines: 1,
                                                          overflow: TextOverflow
                                                              .ellipsis,
                                                        ),
                                                      ),
                                                      if (unreadCount > 0)
                                                        Container(
                                                          margin:
                                                              const EdgeInsets.only(
                                                                left: 8,
                                                              ),
                                                          padding:
                                                              const EdgeInsets.all(
                                                                6,
                                                              ),
                                                          decoration:
                                                              const BoxDecoration(
                                                                color: AppColors
                                                                    .primaryBlue,
                                                                shape: BoxShape
                                                                    .circle,
                                                              ),
                                                          child: Text(
                                                            unreadCount > 99
                                                                ? '99+'
                                                                : unreadCount
                                                                      .toString(),
                                                            style:
                                                                const TextStyle(
                                                                  color: Colors
                                                                      .white,
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .bold,
                                                                  fontSize: 10,
                                                                ),
                                                          ),
                                                        ),
                                                    ],
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                  if (index < _chats.length - 1)
                                    Divider(
                                      height: 1,
                                      indent: 84,
                                      color: Colors.grey.shade200,
                                    ),
                                ],
                              )
                              .animate()
                              .fadeIn(duration: 400.ms, delay: (index * 50).ms)
                              .slideX(begin: 0.2, end: 0);
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _startNewChat,
        backgroundColor: AppColors.primaryBlue,
        shape: const CircleBorder(),
        child: const Icon(Icons.chat, color: Colors.white),
      ).animate().scale(delay: 500.ms, duration: 400.ms),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppColors.primaryOrange,
                  AppColors.primaryOrange.withOpacity(0.8),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: AppColors.primaryOrange.withOpacity(0.3),
                  blurRadius: 12,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: const Icon(
              Icons.chat_bubble_outline,
              size: 80,
              color: Colors.white,
            ),
          ).animate().scale(duration: 600.ms, curve: Curves.elasticOut),
          const SizedBox(height: 24),
          Text(
            'No conversations yet',
            style: GoogleFonts.poppins(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: AppColors.textDark,
            ),
          ).animate().fadeIn(delay: 200.ms),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              'Start a new chat to connect with team members',
              style: GoogleFonts.poppins(
                fontSize: 16,
                color: AppColors.textLight,
              ),
              textAlign: TextAlign.center,
            ),
          ).animate().fadeIn(delay: 300.ms),
          const SizedBox(height: 24),
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppColors.primaryOrange,
                  AppColors.primaryOrange.withOpacity(0.8),
                ],
              ),
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primaryOrange.withOpacity(0.3),
                  blurRadius: 8,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: ElevatedButton.icon(
              onPressed: _startNewChat,
              icon: const Icon(Icons.add, color: Colors.white),
              label: Text(
                'Start New Chat',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.transparent,
                shadowColor: Colors.transparent,
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 12,
                ),
              ),
            ),
          ).animate().fadeIn(delay: 400.ms).slideY(begin: 0.3, end: 0),
        ],
      ),
    );
  }
}
