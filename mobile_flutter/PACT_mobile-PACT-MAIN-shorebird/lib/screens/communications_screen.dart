// lib/screens/communications_screen.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../theme/app_colors.dart';
import '../services/presence_service.dart';
import '../services/webrtc_service.dart';
import '../services/chat_service.dart';
import '../widgets/incoming_call_overlay.dart';
import '../models/call_state.dart';
import 'call_screen.dart';

class CommunicationsScreen extends StatefulWidget {
  const CommunicationsScreen({super.key});

  @override
  State<CommunicationsScreen> createState() => _CommunicationsScreenState();
}

class _CommunicationsScreenState extends State<CommunicationsScreen>
    with SingleTickerProviderStateMixin {
  final PresenceService _presenceService = PresenceService();
  final WebRTCService _webrtcService = WebRTCService();
  final ChatService _chatService = ChatService();
  final TextEditingController _searchController = TextEditingController();

  late TabController _tabController;
  StreamSubscription? _allUsersSubscription;
  StreamSubscription? _onlineUsersSubscription;
  StreamSubscription? _errorSubscription;

  List<UserPresence> _allUsers = [];
  List<UserPresence> _filteredUsers = [];
  bool _isLoading = true;
  bool _isOnline = true;
  String _searchQuery = '';
  int _selectedTabIndex = 0;

  final List<String> _tabs = ['All', 'Online', 'Coordinators', 'Data Collectors', 'Admins'];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: _tabs.length, vsync: this);
    _tabController.addListener(_onTabChanged);
    _checkConnectivity();
    _loadUsers();
    _subscribeToPresence();
    _subscribeToErrors();
    // Reset any stuck call states when entering the screen
    _resetStuckCallState();
  }
  
  Future<void> _resetStuckCallState() async {
    try {
      await _webrtcService.forceResetIfNotInActiveCall();
    } catch (e) {
      debugPrint('[CommunicationsScreen] Error resetting call state: $e');
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    _allUsersSubscription?.cancel();
    _onlineUsersSubscription?.cancel();
    _errorSubscription?.cancel();
    super.dispose();
  }

  void _subscribeToErrors() {
    _errorSubscription = _webrtcService.errorStream.listen((error) {
      if (mounted) {
        _showMessage(error, isError: true);
      }
    });
  }

  Future<void> _checkConnectivity() async {
    final result = await Connectivity().checkConnectivity();
    setState(() {
      _isOnline = !result.contains(ConnectivityResult.none);
    });
  }

  void _onTabChanged() {
    if (_tabController.indexIsChanging) {
      setState(() {
        _selectedTabIndex = _tabController.index;
      });
      _filterUsers();
    }
  }

  Future<void> _loadUsers() async {
    setState(() => _isLoading = true);
    
    try {
      await _presenceService.fetchAllUsers();
      _allUsers = _presenceService.getAllUsersList();
      _filterUsers();
    } catch (e) {
      debugPrint('[CommunicationsScreen] Error loading users: $e');
    }
    
    setState(() => _isLoading = false);
  }

  void _subscribeToPresence() {
    _allUsersSubscription = _presenceService.allUsersStream.listen((users) {
      if (mounted) {
        setState(() {
          _allUsers = users.where((u) => u.odId != _presenceService.currentUserId).toList();
        });
        _filterUsers();
      }
    });

    _onlineUsersSubscription = _presenceService.onlineUsersStream.listen((_) {
      if (mounted) {
        _filterUsers();
      }
    });
  }

  void _filterUsers() {
    List<UserPresence> filtered = List.from(_allUsers);

    // Filter by tab
    switch (_selectedTabIndex) {
      case 1: // Online
        filtered = filtered.where((u) => u.isOnline).toList();
        break;
      case 2: // Coordinators
        filtered = filtered.where((u) => 
            u.role?.toLowerCase() == 'coordinator' || 
            u.role?.toLowerCase() == 'hub coordinator').toList();
        break;
      case 3: // Data Collectors
        filtered = filtered.where((u) => 
            u.role?.toLowerCase() == 'data collector' || 
            u.role?.toLowerCase() == 'enumerator').toList();
        break;
      case 4: // Admins
        filtered = filtered.where((u) => 
            u.role?.toLowerCase() == 'admin' || 
            u.role?.toLowerCase() == 'super admin').toList();
        break;
    }

    // Filter by search query
    if (_searchQuery.isNotEmpty) {
      final lowerQuery = _searchQuery.toLowerCase();
      filtered = filtered.where((u) =>
          u.userName.toLowerCase().contains(lowerQuery) ||
          (u.role?.toLowerCase().contains(lowerQuery) ?? false) ||
          (u.email?.toLowerCase().contains(lowerQuery) ?? false)).toList();
    }

    // Sort: online users first, then alphabetically
    filtered.sort((a, b) {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return a.userName.compareTo(b.userName);
    });

    setState(() {
      _filteredUsers = filtered;
    });
  }

  void _onSearchChanged(String query) {
    _searchQuery = query;
    _filterUsers();
  }

  Future<void> _initiateCall(UserPresence user) async {
    if (!_isOnline) {
      _showOfflineMessage('Calls require an internet connection');
      return;
    }

    if (user.isInCall) {
      _showMessage('${user.userName} is currently in another call', isError: true);
      return;
    }

    // Check if already in a call
    if (_webrtcService.callState.isInCall) {
      _showMessage('You are already in a call', isError: true);
      return;
    }

    HapticFeedback.mediumImpact();
    
    final success = await _webrtcService.initiateCall(
      user.odId,
      user.userName,
      targetUserAvatar: user.userAvatar,
      isAudioOnly: true,
    );

    if (success && mounted) {
      // Navigate to call screen
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (context) => CallScreen(
            remoteUserName: user.userName,
            remoteUserAvatar: user.userAvatar,
          ),
        ),
      );
    } else if (!success && mounted) {
      final callState = _webrtcService.callState;
      String message = 'Could not start call. Please try again.';
      if (callState.status == CallStatus.busy) {
        message = '${user.userName} is busy on another call';
      }
      _showMessage(message, isError: true);
    }
  }

  Future<void> _initiateChat(UserPresence user) async {
    HapticFeedback.lightImpact();
    
    // Check if user is authenticated
    final currentUserId = _chatService.getCurrentUserId();
    if (currentUserId == null) {
      debugPrint('[CommunicationsScreen] User not authenticated for chat');
      _showMessage('Please log in again to start a chat.', isError: true);
      return;
    }
    
    if (!_isOnline) {
      _showOfflineMessage('Starting new chats requires an internet connection');
      return;
    }
    
    try {
      debugPrint('[CommunicationsScreen] Initiating chat with user: ${user.odId}');
      // Find or create chat with user
      final chat = await _chatService.findOrCreateDirectChat(user.odId);
      
      if (chat != null && mounted) {
        debugPrint('[CommunicationsScreen] Chat created/found: ${chat.id}');
        Navigator.pushNamed(context, '/chat', arguments: chat);
      } else {
        debugPrint('[CommunicationsScreen] Chat returned null for user: ${user.odId}');
        _showMessage('Could not open chat. Please try again.', isError: true);
      }
    } catch (e) {
      debugPrint('[CommunicationsScreen] Error initiating chat: $e');
      _showMessage('Could not open chat: ${e.toString().split('\n').first}', isError: true);
    }
  }

  void _showMessage(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : AppColors.accentGreen,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  void _showOfflineMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.wifi_off, color: Colors.white, size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: const Color(0xFF6B7280),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundGray,
      appBar: _buildAppBar(),
      body: Column(
        children: [
          _buildSearchBar(),
          _buildTabBar(),
          _buildOnlineIndicator(),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: AppColors.primaryOrange))
                : _buildUsersList(),
          ),
        ],
      ),
    );
  }

  PreferredSizeWidget _buildAppBar() {
    final onlineCount = _allUsers.where((u) => u.isOnline).length;
    
    return AppBar(
      backgroundColor: AppColors.primaryBlue,
      elevation: 0,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back, color: Colors.white),
        onPressed: () => Navigator.pop(context),
      ),
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Communications',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          Text(
            '$onlineCount online of ${_allUsers.length} users',
            style: GoogleFonts.poppins(
              color: Colors.white.withOpacity(0.8),
              fontSize: 12,
            ),
          ),
        ],
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.refresh, color: Colors.white),
          onPressed: _loadUsers,
          tooltip: 'Refresh',
        ),
      ],
    );
  }

  Widget _buildSearchBar() {
    return Container(
      padding: const EdgeInsets.all(16),
      color: AppColors.primaryBlue.withOpacity(0.1),
      child: TextField(
        controller: _searchController,
        onChanged: _onSearchChanged,
        decoration: InputDecoration(
          hintText: 'Search users by name, role, or email...',
          hintStyle: GoogleFonts.poppins(color: Colors.grey[500], fontSize: 14),
          prefixIcon: const Icon(Icons.search, color: AppColors.primaryBlue),
          suffixIcon: _searchQuery.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear, color: Colors.grey),
                  onPressed: () {
                    _searchController.clear();
                    _onSearchChanged('');
                  },
                )
              : null,
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
        style: GoogleFonts.poppins(fontSize: 14),
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      color: Colors.white,
      child: TabBar(
        controller: _tabController,
        isScrollable: true,
        labelColor: AppColors.primaryBlue,
        unselectedLabelColor: Colors.grey[600],
        indicatorColor: AppColors.primaryBlue,
        indicatorWeight: 3,
        labelStyle: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 13),
        unselectedLabelStyle: GoogleFonts.poppins(fontWeight: FontWeight.w500, fontSize: 13),
        tabs: _tabs.map((tab) {
          int count = 0;
          switch (tab) {
            case 'All':
              count = _allUsers.length;
              break;
            case 'Online':
              count = _allUsers.where((u) => u.isOnline).length;
              break;
            case 'Coordinators':
              count = _allUsers.where((u) => 
                  u.role?.toLowerCase() == 'coordinator' || 
                  u.role?.toLowerCase() == 'hub coordinator').length;
              break;
            case 'Data Collectors':
              count = _allUsers.where((u) => 
                  u.role?.toLowerCase() == 'data collector' || 
                  u.role?.toLowerCase() == 'enumerator').length;
              break;
            case 'Admins':
              count = _allUsers.where((u) => 
                  u.role?.toLowerCase() == 'admin' || 
                  u.role?.toLowerCase() == 'super admin').length;
              break;
          }
          return Tab(text: '$tab ($count)');
        }).toList(),
      ),
    );
  }

  Widget _buildOnlineIndicator() {
    if (_isOnline) return const SizedBox.shrink();
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: Colors.orange.withOpacity(0.1),
      child: Row(
        children: [
          const Icon(Icons.wifi_off, color: Colors.orange, size: 18),
          const SizedBox(width: 8),
          Text(
            'Offline - Showing cached users',
            style: GoogleFonts.poppins(
              color: Colors.orange[800],
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUsersList() {
    if (_filteredUsers.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              _searchQuery.isNotEmpty ? Icons.search_off : Icons.people_outline,
              size: 64,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 16),
            Text(
              _searchQuery.isNotEmpty
                  ? 'No users found for "$_searchQuery"'
                  : 'No users in this category',
              style: GoogleFonts.poppins(
                color: Colors.grey[600],
                fontSize: 16,
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadUsers,
      color: AppColors.primaryOrange,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: _filteredUsers.length,
        itemBuilder: (context, index) {
          final user = _filteredUsers[index];
          return _buildUserCard(user);
        },
      ),
    );
  }

  Widget _buildUserCard(UserPresence user) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => _showUserActions(user),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                // Avatar with online indicator
                Stack(
                  children: [
                    CircleAvatar(
                      radius: 24,
                      backgroundColor: AppColors.primaryBlue.withOpacity(0.1),
                      backgroundImage: user.userAvatar != null
                          ? NetworkImage(user.userAvatar!)
                          : null,
                      child: user.userAvatar == null
                          ? Text(
                              user.userName.isNotEmpty
                                  ? user.userName[0].toUpperCase()
                                  : '?',
                              style: GoogleFonts.poppins(
                                color: AppColors.primaryBlue,
                                fontWeight: FontWeight.w600,
                                fontSize: 18,
                              ),
                            )
                          : null,
                    ),
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: Container(
                        width: 14,
                        height: 14,
                        decoration: BoxDecoration(
                          color: user.isOnline
                              ? (user.isInCall ? Colors.orange : AppColors.primaryGreen)
                              : Colors.grey,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 12),
                
                // User info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              user.userName,
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w600,
                                fontSize: 15,
                                color: AppColors.textDark,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (user.isInCall)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.orange.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                'In Call',
                                style: GoogleFonts.poppins(
                                  color: Colors.orange,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        user.role ?? 'User',
                        style: GoogleFonts.poppins(
                          color: Colors.grey[600],
                          fontSize: 12,
                        ),
                      ),
                      if (user.isOnline)
                        Text(
                          'Online now',
                          style: GoogleFonts.poppins(
                            color: AppColors.primaryGreen,
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                          ),
                        )
                      else if (user.lastSeen != null)
                        Text(
                          'Last seen ${_formatLastSeen(user.lastSeen!)}',
                          style: GoogleFonts.poppins(
                            color: Colors.grey[500],
                            fontSize: 11,
                          ),
                        ),
                    ],
                  ),
                ),
                
                // Action buttons
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Message button
                    IconButton(
                      icon: const Icon(Icons.chat_bubble_outline),
                      color: AppColors.primaryBlue,
                      iconSize: 22,
                      onPressed: () => _initiateChat(user),
                      tooltip: 'Message',
                    ),
                    // Call button
                    IconButton(
                      icon: Icon(
                        Icons.call,
                        color: user.isInCall
                            ? Colors.grey
                            : (_isOnline ? AppColors.primaryGreen : Colors.grey),
                      ),
                      iconSize: 22,
                      onPressed: user.isInCall || !_isOnline
                          ? null
                          : () => _initiateCall(user),
                      tooltip: user.isInCall ? 'User is busy' : 'Call',
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

  void _showUserActions(UserPresence user) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              
              // User header
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Stack(
                      children: [
                        CircleAvatar(
                          radius: 30,
                          backgroundColor: AppColors.primaryBlue.withOpacity(0.1),
                          backgroundImage: user.userAvatar != null
                              ? NetworkImage(user.userAvatar!)
                              : null,
                          child: user.userAvatar == null
                              ? Text(
                                  user.userName.isNotEmpty
                                      ? user.userName[0].toUpperCase()
                                      : '?',
                                  style: GoogleFonts.poppins(
                                    color: AppColors.primaryBlue,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 24,
                                  ),
                                )
                              : null,
                        ),
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            width: 16,
                            height: 16,
                            decoration: BoxDecoration(
                              color: user.isOnline
                                  ? (user.isInCall ? Colors.orange : AppColors.primaryGreen)
                                  : Colors.grey,
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 2),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user.userName,
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w600,
                              fontSize: 18,
                            ),
                          ),
                          Text(
                            user.role ?? 'User',
                            style: GoogleFonts.poppins(
                              color: Colors.grey[600],
                              fontSize: 14,
                            ),
                          ),
                          Row(
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: user.isOnline
                                      ? (user.isInCall ? Colors.orange : AppColors.primaryGreen)
                                      : Colors.grey,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                user.isOnline
                                    ? (user.isInCall ? 'In a call' : 'Online')
                                    : 'Offline',
                                style: GoogleFonts.poppins(
                                  color: user.isOnline
                                      ? (user.isInCall ? Colors.orange : AppColors.primaryGreen)
                                      : Colors.grey,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
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
              
              const Divider(height: 1),
              
              // Actions
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.primaryBlue.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.chat_bubble_outline, color: AppColors.primaryBlue),
                ),
                title: Text('Send Message', style: GoogleFonts.poppins(fontWeight: FontWeight.w500)),
                subtitle: Text('Start a chat conversation', style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey)),
                onTap: () {
                  Navigator.pop(context);
                  _initiateChat(user);
                },
              ),
              
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: (user.isInCall || !_isOnline)
                        ? Colors.grey.withOpacity(0.1)
                        : AppColors.primaryGreen.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.call,
                    color: (user.isInCall || !_isOnline) ? Colors.grey : AppColors.primaryGreen,
                  ),
                ),
                title: Text(
                  'Voice Call',
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w500,
                    color: (user.isInCall || !_isOnline) ? Colors.grey : null,
                  ),
                ),
                subtitle: Text(
                  user.isInCall
                      ? 'User is currently in a call'
                      : (!_isOnline ? 'Requires internet connection' : 'Start an in-app call'),
                  style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey),
                ),
                onTap: (user.isInCall || !_isOnline)
                    ? null
                    : () {
                        Navigator.pop(context);
                        _initiateCall(user);
                      },
              ),
              
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  String _formatLastSeen(DateTime lastSeen) {
    final now = DateTime.now();
    final diff = now.difference(lastSeen);
    
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${lastSeen.day}/${lastSeen.month}';
  }
}
