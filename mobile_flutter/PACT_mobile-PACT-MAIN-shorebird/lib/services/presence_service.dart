// lib/services/presence_service.dart

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:hive_flutter/hive_flutter.dart';

/// User presence data model
class UserPresence {
  final String odId;
  final String userName;
  final String? userAvatar;
  final String? role;
  final String? phone;
  final String? email;
  final bool isOnline;
  final bool isInCall;
  final DateTime? lastSeen;
  final String? currentCallId;

  UserPresence({
    required String odId,
    required this.userName,
    this.userAvatar,
    this.role,
    this.phone,
    this.email,
    this.isOnline = false,
    this.isInCall = false,
    this.lastSeen,
    this.currentCallId,
  }) : odId = odId;

  UserPresence copyWith({
    String? odId,
    String? userName,
    String? userAvatar,
    String? role,
    String? phone,
    String? email,
    bool? isOnline,
    bool? isInCall,
    DateTime? lastSeen,
    String? currentCallId,
  }) {
    return UserPresence(
      odId: odId ?? this.odId,
      userName: userName ?? this.userName,
      userAvatar: userAvatar ?? this.userAvatar,
      role: role ?? this.role,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      isOnline: isOnline ?? this.isOnline,
      isInCall: isInCall ?? this.isInCall,
      lastSeen: lastSeen ?? this.lastSeen,
      currentCallId: currentCallId ?? this.currentCallId,
    );
  }

  Map<String, dynamic> toJson() => {
    'user_id': odId,
    'user_name': userName,
    'user_avatar': userAvatar,
    'role': role,
    'phone': phone,
    'email': email,
    'is_online': isOnline,
    'in_call': isInCall,
    'last_seen': lastSeen?.toIso8601String(),
    'call_id': currentCallId,
  };

  factory UserPresence.fromJson(Map<String, dynamic> json) {
    return UserPresence(
      odId: json['user_id'] as String? ?? json['id'] as String? ?? '',
      userName: json['user_name'] as String? ?? json['full_name'] as String? ?? 'Unknown',
      userAvatar: json['user_avatar'] as String? ?? json['avatar_url'] as String?,
      role: json['role'] as String?,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      isOnline: json['is_online'] as bool? ?? false,
      isInCall: json['in_call'] as bool? ?? false,
      lastSeen: json['last_seen'] != null 
          ? DateTime.tryParse(json['last_seen'] as String) 
          : null,
      currentCallId: json['call_id'] as String?,
    );
  }
}

/// Service to track user presence and online status
class PresenceService {
  static final PresenceService _instance = PresenceService._internal();
  factory PresenceService() => _instance;
  PresenceService._internal();

  final SupabaseClient _supabase = Supabase.instance.client;
  
  // Use the same channel as WebRTCService for unified presence
  static const String _presenceChannelName = 'user-call-presence';
  static const String _usersCacheBoxName = 'pact_users_cache';
  
  RealtimeChannel? _presenceChannel;
  Timer? _heartbeatTimer;
  StreamSubscription? _connectivitySubscription;
  
  String? _currentUserId;
  String? _currentUserName;
  String? _currentUserAvatar;
  String? _currentUserRole;
  
  final Map<String, UserPresence> _onlineUsers = {};
  List<UserPresence> _allUsers = [];
  
  final _onlineUsersController = StreamController<Map<String, UserPresence>>.broadcast();
  Stream<Map<String, UserPresence>> get onlineUsersStream => _onlineUsersController.stream;
  
  final _allUsersController = StreamController<List<UserPresence>>.broadcast();
  Stream<List<UserPresence>> get allUsersStream => _allUsersController.stream;
  
  final _userStatusController = StreamController<UserPresence>.broadcast();
  Stream<UserPresence> get userStatusStream => _userStatusController.stream;

  bool _isInitialized = false;
  bool get isInitialized => _isInitialized;
  String? get currentUserId => _currentUserId;

  Future<void> initialize({
    required String odId,
    required String userName,
    String? userAvatar,
    String? userRole,
  }) async {
    if (_isInitialized && _currentUserId == odId) {
      debugPrint('[PresenceService] Already initialized for user $odId');
      return;
    }

    _currentUserId = odId;
    _currentUserName = userName;
    _currentUserAvatar = userAvatar;
    _currentUserRole = userRole;

    await _loadCachedUsers();
    await fetchAllUsers();
    await _setupPresenceChannel();
    _startHeartbeat();
    _setupConnectivityListener();
    
    _isInitialized = true;
    debugPrint('[PresenceService] Initialized for user $userName');
  }

  Future<void> _loadCachedUsers() async {
    try {
      final box = await Hive.openBox(_usersCacheBoxName);
      final cached = box.get('users');
      if (cached != null && cached is List) {
        _allUsers = cached.map((item) {
          if (item is Map) {
            return UserPresence.fromJson(Map<String, dynamic>.from(item));
          }
          return null;
        }).whereType<UserPresence>().toList();
        
        _allUsersController.add(_allUsers);
        debugPrint('[PresenceService] Loaded ${_allUsers.length} cached users');
      }
    } catch (e) {
      debugPrint('[PresenceService] Error loading cached users: $e');
    }
  }

  Future<void> _cacheUsers(List<UserPresence> users) async {
    try {
      final box = await Hive.openBox(_usersCacheBoxName);
      await box.put('users', users.map((u) => u.toJson()).toList());
      await box.put('cached_at', DateTime.now().toIso8601String());
    } catch (e) {
      debugPrint('[PresenceService] Error caching users: $e');
    }
  }

  Future<List<UserPresence>> fetchAllUsers() async {
    try {
      final connectivity = await Connectivity().checkConnectivity();
      if (connectivity.contains(ConnectivityResult.none)) {
        debugPrint('[PresenceService] Offline - using cached users');
        return _allUsers;
      }

      final response = await _supabase
          .from('profiles')
          .select('id, full_name, avatar_url, role, phone, email, updated_at')
          .eq('status', 'approved')
          .order('full_name');

      _allUsers = (response as List).map((item) {
        final map = item as Map<String, dynamic>;
        final odId = map['id'] as String? ?? '';
        return UserPresence(
          odId: odId,
          userName: map['full_name'] as String? ?? 'Unknown',
          userAvatar: map['avatar_url'] as String?,
          role: map['role'] as String?,
          phone: map['phone'] as String?,
          email: map['email'] as String?,
          isOnline: _onlineUsers.containsKey(odId),
          isInCall: _onlineUsers[odId]?.isInCall ?? false,
        );
      }).where((u) => u.odId.isNotEmpty).toList();

      await _cacheUsers(_allUsers);
      _allUsersController.add(_allUsers);
      
      debugPrint('[PresenceService] Fetched ${_allUsers.length} users');
      return _allUsers;
    } catch (e) {
      debugPrint('[PresenceService] Error fetching users: $e');
      return _allUsers;
    }
  }

  Future<void> _setupPresenceChannel() async {
    try {
      _presenceChannel?.unsubscribe();
      
      _presenceChannel = _supabase.channel(
        _presenceChannelName,
        opts: const RealtimeChannelConfig(self: true),
      );

      _presenceChannel!.onPresenceSync((payload) {
        _handlePresenceSync();
      }).onPresenceJoin((payload) {
        _handlePresenceJoin(payload);
      }).onPresenceLeave((payload) {
        _handlePresenceLeave(payload);
      });

      await _presenceChannel!.subscribe((status, [error]) async {
        if (status == RealtimeSubscribeStatus.subscribed) {
          await _trackPresence();
          debugPrint('[PresenceService] Subscribed to presence channel');
        }
      });
    } catch (e) {
      debugPrint('[PresenceService] Error setting up presence channel: $e');
    }
  }

  Future<void> _trackPresence({bool inCall = false, String? callId}) async {
    if (_presenceChannel == null || _currentUserId == null) return;

    try {
      await _presenceChannel!.track({
        'user_id': _currentUserId,
        'user_name': _currentUserName,
        'user_avatar': _currentUserAvatar,
        'role': _currentUserRole,
        'is_online': true,
        'in_call': inCall,
        'call_id': callId,
        'last_seen': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      debugPrint('[PresenceService] Error tracking presence: $e');
    }
  }

  void _handlePresenceSync() {
    try {
      final presences = _presenceChannel?.presenceState();
      if (presences == null || presences.isEmpty) return;

      _onlineUsers.clear();
      
      // presenceState() returns List<SinglePresenceState>
      // SinglePresenceState is Map<String, dynamic>
      for (final presence in presences) {
        final data = presence as Map<String, dynamic>;
        final odId = data['user_id'] as String?;
        if (odId == null || odId.isEmpty) continue;

        _onlineUsers[odId] = UserPresence(
          odId: odId,
          userName: data['user_name'] as String? ?? 'Unknown',
          userAvatar: data['user_avatar'] as String?,
          role: data['role'] as String?,
          isOnline: true,
          isInCall: data['in_call'] as bool? ?? false,
          lastSeen: DateTime.tryParse(data['last_seen'] as String? ?? ''),
          currentCallId: data['call_id'] as String?,
        );
      }

      _updateAllUsersOnlineStatus();
      _onlineUsersController.add(Map.from(_onlineUsers));
    } catch (e) {
      debugPrint('[PresenceService] Error handling presence sync: $e');
    }
  }

  void _updateAllUsersOnlineStatus() {
    _allUsers = _allUsers.map((user) {
      final onlineUser = _onlineUsers[user.odId];
      if (onlineUser != null) {
        return user.copyWith(
          isOnline: true,
          isInCall: onlineUser.isInCall,
          lastSeen: onlineUser.lastSeen,
          currentCallId: onlineUser.currentCallId,
        );
      }
      return user.copyWith(isOnline: false, isInCall: false);
    }).toList();
    
    _allUsersController.add(_allUsers);
  }

  void _handlePresenceJoin(RealtimePresenceJoinPayload payload) {
    try {
      for (final presence in payload.newPresences) {
        final data = presence.payload;
        final odId = data['user_id'] as String?;
        if (odId == null || odId.isEmpty) continue;

        final userPresence = UserPresence(
          odId: odId,
          userName: data['user_name'] as String? ?? 'Unknown',
          userAvatar: data['user_avatar'] as String?,
          role: data['role'] as String?,
          isOnline: true,
          isInCall: data['in_call'] as bool? ?? false,
          lastSeen: DateTime.now(),
          currentCallId: data['call_id'] as String?,
        );

        _onlineUsers[odId] = userPresence;
        _userStatusController.add(userPresence);
      }
      
      _updateAllUsersOnlineStatus();
      _onlineUsersController.add(Map.from(_onlineUsers));
    } catch (e) {
      debugPrint('[PresenceService] Error handling presence join: $e');
    }
  }

  void _handlePresenceLeave(RealtimePresenceLeavePayload payload) {
    try {
      for (final presence in payload.leftPresences) {
        final data = presence.payload;
        final odId = data['user_id'] as String?;
        if (odId != null && odId.isNotEmpty) {
          _onlineUsers.remove(odId);
          
          _userStatusController.add(UserPresence(
            odId: odId,
            userName: data['user_name'] as String? ?? 'Unknown',
            isOnline: false,
            lastSeen: DateTime.now(),
          ));
        }
      }
      
      _updateAllUsersOnlineStatus();
      _onlineUsersController.add(Map.from(_onlineUsers));
    } catch (e) {
      debugPrint('[PresenceService] Error handling presence leave: $e');
    }
  }

  void _setupConnectivityListener() {
    _connectivitySubscription?.cancel();
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((results) async {
      if (!results.contains(ConnectivityResult.none)) {
        await _setupPresenceChannel();
        await fetchAllUsers();
      }
    });
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) async {
      final connectivity = await Connectivity().checkConnectivity();
      if (!connectivity.contains(ConnectivityResult.none)) {
        await _trackPresence();
      }
    });
  }

  Future<void> updateCallStatus({required bool inCall, String? callId}) async {
    await _trackPresence(inCall: inCall, callId: callId);
  }

  bool isUserOnline(String odId) => _onlineUsers.containsKey(odId);
  bool isUserInCall(String odId) => _onlineUsers[odId]?.isInCall ?? false;
  UserPresence? getOnlineUser(String odId) => _onlineUsers[odId];

  UserPresence? getUserById(String odId) {
    try {
      return _allUsers.firstWhere((u) => u.odId == odId);
    } catch (e) {
      return _onlineUsers[odId];
    }
  }

  List<UserPresence> getOnlineUsersList() {
    return _onlineUsers.values.where((u) => u.odId != _currentUserId).toList();
  }

  List<UserPresence> getAllUsersList() {
    return _allUsers.where((u) => u.odId != _currentUserId).toList();
  }

  List<UserPresence> getUsersByRole(String role) {
    return _allUsers
        .where((u) => u.role?.toLowerCase() == role.toLowerCase() && u.odId != _currentUserId)
        .toList();
  }

  List<UserPresence> searchUsers(String query) {
    if (query.isEmpty) return getAllUsersList();
    final lowerQuery = query.toLowerCase();
    return _allUsers
        .where((u) => 
            u.odId != _currentUserId &&
            (u.userName.toLowerCase().contains(lowerQuery) ||
             (u.role?.toLowerCase().contains(lowerQuery) ?? false) ||
             (u.email?.toLowerCase().contains(lowerQuery) ?? false)))
        .toList();
  }

  int get onlineUsersCount => _onlineUsers.length;
  int get totalUsersCount => _allUsers.length;

  void dispose() {
    _heartbeatTimer?.cancel();
    _connectivitySubscription?.cancel();
    _presenceChannel?.unsubscribe();
    if (!_onlineUsersController.isClosed) _onlineUsersController.close();
    if (!_allUsersController.isClosed) _allUsersController.close();
    if (!_userStatusController.isClosed) _userStatusController.close();
    _isInitialized = false;
    debugPrint('[PresenceService] Disposed');
  }
}
