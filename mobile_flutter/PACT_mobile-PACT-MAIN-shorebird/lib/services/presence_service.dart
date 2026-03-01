// lib/services/presence_service.dart

import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// User presence data model
class UserPresence {
  final String odId;
  final String userName;
  final String? userAvatar;
  final String? role;
  final String? phone;
  final String? email;
  final String? state;
  final String? hub;
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
    this.state,
    this.hub,
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
    String? state,
    String? hub,
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
      state: state ?? this.state,
      hub: hub ?? this.hub,
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
    'state': state,
    'hub': hub,
    'is_online': isOnline,
    'in_call': isInCall,
    'last_seen': lastSeen?.toIso8601String(),
    'call_id': currentCallId,
  };

  factory UserPresence.fromJson(Map<String, dynamic> json) {
    return UserPresence(
      odId: json['user_id'] as String? ?? json['id'] as String? ?? '',
      userName:
          json['user_name'] as String? ??
          json['full_name'] as String? ??
          'Unknown',
      userAvatar:
          json['user_avatar'] as String? ?? json['avatar_url'] as String?,
      role: json['role'] as String?,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      state: json['state'] as String?,
      hub: json['hub'] as String?,
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
  int _heartbeatCount = 0;

  String? _currentUserId;
  String? _currentUserName;
  String? _currentUserAvatar;
  String? _currentUserRole;

  final Map<String, UserPresence> _onlineUsers = {};
  List<UserPresence> _allUsers = [];

  final _onlineUsersController =
      StreamController<Map<String, UserPresence>>.broadcast();
  Stream<Map<String, UserPresence>> get onlineUsersStream =>
      _onlineUsersController.stream;

  final _allUsersController = StreamController<List<UserPresence>>.broadcast();
  Stream<List<UserPresence>> get allUsersStream => _allUsersController.stream;

  final _userStatusController = StreamController<UserPresence>.broadcast();
  Stream<UserPresence> get userStatusStream => _userStatusController.stream;

  bool _isInitialized = false;
  bool _presenceChannelReady = false;

  bool get isInitialized => _isInitialized;
  bool get isPresenceChannelReady => _presenceChannelReady;
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
        _allUsers = cached
            .map((item) {
              if (item is Map) {
                return UserPresence.fromJson(Map<String, dynamic>.from(item));
              }
              return null;
            })
            .whereType<UserPresence>()
            .toList();

        _allUsersController.add(_allUsers);
        debugPrint('[PresenceService] Loaded ${_allUsers.length} cached users');
      }
    } catch (e) {
      debugPrint('[PresenceService] Error loading cached users: $e');
    }
  }

  /// Public method to load cached users (for offline mode)
  Future<void> loadCachedUsers() async {
    await _loadCachedUsers();
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

      // Get current user ID - use auth directly if not initialized yet
      final currentUserId = _currentUserId ?? _supabase.auth.currentUser?.id;

      // Build query - fetch all users with proper filtering
      // Note: Database uses state_id and hub_id columns (not state/hub)
      var query = _supabase
          .from('profiles')
          .select(
            'id, full_name, avatar_url, role, phone, email, state_id, hub_id, updated_at, status',
          );

      // Only exclude current user if we have a valid ID
      if (currentUserId != null && currentUserId.isNotEmpty) {
        query = query.neq('id', currentUserId);
      }

      final response = await query.order('full_name');

      debugPrint(
        '[PresenceService] Fetched ${(response as List).length} profiles from database',
      );

      _allUsers = response
          .map((item) {
            final map = item;
            final odId = map['id'] as String? ?? '';

            return UserPresence(
              odId: odId,
              userName: map['full_name'] as String? ?? 'Unknown',
              userAvatar: map['avatar_url'] as String?,
              role: map['role'] as String?,
              phone: map['phone'] as String?,
              email: map['email'] as String?,
              state: map['state_id'] as String?,
              hub: map['hub_id'] as String?,
              isOnline: _onlineUsers.containsKey(odId),
              isInCall: _onlineUsers[odId]?.isInCall ?? false,
            );
          })
          .where((u) => u.odId.isNotEmpty)
          .toList();

      await _cacheUsers(_allUsers);
      _allUsersController.add(_allUsers);

      debugPrint('[PresenceService] Loaded ${_allUsers.length} users');
      return _allUsers;
    } catch (e) {
      debugPrint('[PresenceService] Error fetching users: $e');
      return _allUsers;
    }
  }

  Future<void> _setupPresenceChannel() async {
    try {
      _presenceChannelReady = false;
      _presenceChannel?.unsubscribe();

      _presenceChannel = _supabase.channel(
        _presenceChannelName,
        opts: const RealtimeChannelConfig(self: true),
      );

      _presenceChannel!
          .onPresenceSync((payload) {
            _handlePresenceSync();
          })
          .onPresenceJoin((payload) {
            _handlePresenceJoin(payload);
          })
          .onPresenceLeave((payload) {
            _handlePresenceLeave(payload);
          });

      _presenceChannel!.subscribe((status, [error]) async {
        if (status == RealtimeSubscribeStatus.subscribed) {
          _presenceChannelReady = true;
          await _trackPresence();
          debugPrint('[PresenceService] Presence channel ready');
        } else if (status == RealtimeSubscribeStatus.closed ||
            status == RealtimeSubscribeStatus.timedOut) {
          _presenceChannelReady = false;
          debugPrint('[PresenceService] Presence channel closed/timed out');
        }
        if (error != null) {
          _presenceChannelReady = false;
          debugPrint('[PresenceService] Presence channel error: $error');
        }
      });
    } catch (e) {
      _presenceChannelReady = false;
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
      if (presences == null || presences.isEmpty) {
        debugPrint('[PresenceService] No presence state available');
        return;
      }

      _onlineUsers.clear();

      // presenceState() returns List<SinglePresenceState> in supabase_flutter 2.10.x
      // Each SinglePresenceState has presenceRef and presences list
      for (final singleState in presences) {
        // singleState.presences is a List<Presence>
        for (final presence in singleState.presences) {
          final data = presence.payload;
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
      }

      debugPrint(
        '[PresenceService] Synced ${_onlineUsers.length} online users',
      );
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

          _userStatusController.add(
            UserPresence(
              odId: odId,
              userName: data['user_name'] as String? ?? 'Unknown',
              isOnline: false,
              lastSeen: DateTime.now(),
            ),
          );
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
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((
      results,
    ) async {
      if (!results.contains(ConnectivityResult.none)) {
        await _setupPresenceChannel();
        await fetchAllUsers();
      }
    });
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatCount = 0;
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) async {
      final connectivity = await Connectivity().checkConnectivity();
      if (connectivity.contains(ConnectivityResult.none)) return;

      await _trackPresence();

      // Write last_activity to profiles every 5 minutes (every 10th tick).
      // This makes mobile users visible as "online" on the web Staff Directory
      // even though mobile uses a different Realtime channel than the web app.
      _heartbeatCount++;
      if (_heartbeatCount % 10 == 1) {
        // tick 1, 11, 21 … → immediately on connect, then every 5 min
        await _writeLastActivityToProfile();
      }
    });
    // Write immediately on start so the user appears online right away
    _writeLastActivityToProfile();
  }

  Future<void> _writeLastActivityToProfile() async {
    if (_currentUserId == null) return;
    try {
      // Detect device type
      String deviceLabel = 'Android';
      if (!kIsWeb) {
        if (Platform.isIOS) deviceLabel = 'iOS';
        else if (Platform.isAndroid) deviceLabel = 'Android';
        else if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) deviceLabel = 'Desktop';
      }

      // Get app version
      String? version;
      try {
        final info = await PackageInfo.fromPlatform();
        version = '${info.version}+${info.buildNumber}';
      } catch (_) {}

      await _supabase.from('profiles').update({
        'last_activity': DateTime.now().toUtc().toIso8601String(),
        'device_info':   deviceLabel,
        if (version != null) 'app_version': version,
      }).eq('id', _currentUserId!);
      debugPrint('[PresenceService] Wrote last_activity/$deviceLabel/$version to profiles');
    } catch (e) {
      debugPrint('[PresenceService] Failed to write activity to profiles: $e');
    }
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
        .where(
          (u) =>
              u.role?.toLowerCase() == role.toLowerCase() &&
              u.odId != _currentUserId,
        )
        .toList();
  }

  List<UserPresence> searchUsers(String query) {
    if (query.isEmpty) return getAllUsersList();
    final lowerQuery = query.toLowerCase();
    return _allUsers
        .where(
          (u) =>
              u.odId != _currentUserId &&
              (u.userName.toLowerCase().contains(lowerQuery) ||
                  (u.role?.toLowerCase().contains(lowerQuery) ?? false) ||
                  (u.email?.toLowerCase().contains(lowerQuery) ?? false)),
        )
        .toList();
  }

  int get onlineUsersCount => _onlineUsers.length;
  int get totalUsersCount => _allUsers.length;

  /// Get current user's presence info (for WebRTC initialization)
  UserPresence? getCurrentUserPresence() {
    if (_currentUserId == null) return null;

    return UserPresence(
      odId: _currentUserId!,
      userName: _currentUserName ?? 'User',
      userAvatar: _currentUserAvatar,
      role: _currentUserRole,
      isOnline: true,
      isInCall: false,
    );
  }

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
