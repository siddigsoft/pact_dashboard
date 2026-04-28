# Feature Integration Checklist

> Complete these steps in order to integrate all new communication features into the app.

## Phase 1: Infrastructure Setup (5-10 minutes)

### Step 1.1: Initialize Hive Boxes in main.dart
- [ ] Add imports for new services:
  ```dart
  import 'lib/services/user_preferences_service.dart';
  import 'lib/services/chat_metadata_service.dart';
  import 'lib/services/last_call_service.dart';
  import 'lib/services/voice_message_service.dart';
  ```

- [ ] In `main()` after `Hive.initFlutter()`, add:
  ```dart
  // Initialize all preference and metadata boxes
  await UserPreferencesService.initializeBoxes();
  await ChatMetadataService.initializeBoxes();
  await LastCallService.initializeBoxes();
  ```

### Step 1.2: Verify All New Files Exist
- [ ] `lib/services/user_preferences_service.dart`
- [ ] `lib/services/chat_metadata_service.dart`
- [ ] `lib/services/last_call_service.dart`
- [ ] `lib/services/voice_message_service.dart`
- [ ] `lib/widgets/enhanced_contact_tile.dart`
- [ ] `lib/widgets/enhanced_chat_tile.dart`
- [ ] `lib/widgets/voice_message_widget.dart`
- [ ] `lib/widgets/dnd_widgets.dart`
- [ ] `lib/widgets/chat_notification_settings.dart`
- [ ] `lib/widgets/call_statistics_widget.dart`

## Phase 2: CallContactsScreen Enhancement (15-20 minutes)

### Step 2.1: Load Favorites on Init
- [ ] In `_CallContactsScreenState.initState()`, add:
  ```dart
  _loadFavorites();
  ```

- [ ] Create method:
  ```dart
  Future<void> _loadFavorites() async {
    List<String> favs = await UserPreferencesService.getFavoriteContacts();
    setState(() => _favoriteIds = favs.toSet());
  }
  ```

### Step 2.2: Load Last Call Info
- [ ] Modify contact tile builder to fetch last call:
  ```dart
  FutureBuilder<LastCallInfo?>(
    future: LastCallService.getLastCall(contact.id),
    builder: (context, snapshot) {
      return EnhancedContactTile(
        // ... existing properties
        lastCallTime: snapshot.data?.callTime,
        lastCallType: snapshot.data?.callType,
      );
    },
  )
  ```

### Step 2.3: Update Contact Tile
- [ ] Replace current contact card building with:
  ```dart
  EnhancedContactTile(
    id: contact.id,
    name: contact.name,
    email: contact.email,
    avatarUrl: contact.photo,
    role: contact.role,
    isOnline: _onlineUserIds.contains(contact.id),
    initials: contact.initials,
    onAudioCall: () => onAudioCall(contact),
    onVideoCall: () => onVideoCall(contact),
    isArabic: isArabic,
    lastCallTime: lastCallInfo?.callTime,
    lastCallType: lastCallInfo?.callType,
    isFavorite: _favoriteIds.contains(contact.id),
    onToggleFavorite: () => _toggleFavorite(contact.id),
  )
  ```

### Step 2.4: Add Sort Method for Favorites
- [ ] Create method to show favorites first:
  ```dart
  void _sortContacts(List<Contact> contacts) {
    contacts.sort((a, b) {
      final aFav = _favoriteIds.contains(a.id) ? 0 : 1;
      final bFav = _favoriteIds.contains(b.id) ? 0 : 1;
      return aFav.compareTo(bFav);
    });
  }
  ```

### Step 2.5: Implement Toggle Favorite
- [ ] Add method:
  ```dart
  Future<void> _toggleFavorite(String contactId) async {
    final newStatus = await UserPreferencesService.toggleFavorite(contactId);
    setState(() {
      if (newStatus) {
        _favoriteIds.add(contactId);
      } else {
        _favoriteIds.remove(contactId);
      }
    });
  }
  ```

## Phase 3: ChatListScreen Enhancement (20-25 minutes)

### Step 3.1: Load Chat Metadata on Init
- [ ] In `_ChatListScreenState.initState()`, add:
  ```dart
  _loadChatMetadata();
  ```

- [ ] Create method:
  ```dart
  Future<void> _loadChatMetadata() async {
    final metadata = await ChatMetadataService.getAllChatMetadata();
    setState(() => _chatMetadata = metadata);
    
    final pinned = await UserPreferencesService.getPinnedChats();
    setState(() => _pinnedChats = pinned.toSet());
    
    // Load muted chats
    for (var chat in chats) {
      final isMuted = await UserPreferencesService.isChatMuted(chat.id);
      if (isMuted) _mutedChats.add(chat.id);
    }
  }
  ```

### Step 3.2: Update Chat Tile Display
- [ ] Replace current chat card with:
  ```dart
  EnhancedChatTile(
    chatId: chat.id,
    participantName: chat.participantName,
    participantImage: chat.participantImage,
    lastMessage: _chatMetadata[chat.id]?.lastMessage ?? chat.lastMessage,
    lastMessageTime: _chatMetadata[chat.id]?.lastMessageTime ?? chat.lastMessageTime,
    unreadCount: _chatMetadata[chat.id]?.unreadCount ?? 0,
    isMuted: _mutedChats.contains(chat.id),
    isPinned: _pinnedChats.contains(chat.id),
    isArabic: isArabic,
    onTap: () => _openChat(chat),
    onTogglePin: () => _togglePin(chat.id),
    onToggleMute: () => _toggleMute(chat.id),
  )
  ```

### Step 3.3: Implement Pin Toggle
- [ ] Add method:
  ```dart
  Future<void> _togglePin(String chatId) async {
    final newStatus = await UserPreferencesService.togglePinnedChat(chatId);
    setState(() {
      if (newStatus) {
        _pinnedChats.add(chatId);
      } else {
        _pinnedChats.remove(chatId);
      }
    });
  }
  ```

### Step 3.4: Implement Mute Toggle
- [ ] Add method:
  ```dart
  Future<void> _toggleMute(String chatId) async {
    final isMuted = await UserPreferencesService.isChatMuted(chatId);
    if (isMuted) {
      await UserPreferencesService.unmuteChat(chatId);
      setState(() => _mutedChats.remove(chatId));
    } else {
      await UserPreferencesService.muteChat(chatId);
      setState(() => _mutedChats.add(chatId));
    }
  }
  ```

### Step 3.5: Sort Chats with Pinned First
- [ ] Modify chat list sorting:
  ```dart
  void _sortChats(List<Chat> chats) {
    chats.sort((a, b) {
      final aPinned = _pinnedChats.contains(a.id) ? 0 : 1;
      final bPinned = _pinnedChats.contains(b.id) ? 0 : 1;
      if (aPinned != bPinned) return aPinned.compareTo(bPinned);
      return b.lastMessageTime.compareTo(a.lastMessageTime);
    });
  }
  ```

### Step 3.6: Add DND Status to Header
- [ ] In ChatListScreen AppBar, add:
  ```dart
  title: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    mainAxisSize: MainAxisSize.min,
    children: [
      const Text('Messages'),
      DNDStatusIndicator(isCompact: true),
    ],
  )
  ```

## Phase 4: ChatScreen Enhancement (20-25 minutes)

### Step 4.1: Add Voice Message Recording
- [ ] In message input area, add:
  ```dart
  bool _isRecording = false;

  Future<void> _toggleRecording() async {
    if (!_isRecording) {
      String? path = await VoiceMessageService.startRecording();
      if (path != null) {
        setState(() => _isRecording = true);
      }
    } else {
      VoiceMessage? msg = await VoiceMessageService.stopRecording();
      setState(() => _isRecording = false);
      
      if (msg != null) {
        await _sendVoiceMessage(msg);
      }
    }
  }

  Future<void> _sendVoiceMessage(VoiceMessage msg) async {
    // Send message with type 'voice'
    await ChatService.sendMessage(
      chatId: widget.chatId,
      content: msg.filePath,
      type: 'voice',
      metadata: {
        'duration': msg.duration,
        'fileName': msg.fileName,
      },
    );
  }
  ```

### Step 4.2: Add Voice Message Button
- [ ] Add to message input row:
  ```dart
  ElevatedButton.icon(
    onPressed: _toggleRecording,
    icon: Icon(_isRecording ? Icons.stop : Icons.mic),
    label: Text(_isRecording ? 'Recording...' : 'Voice'),
    style: ElevatedButton.styleFrom(
      backgroundColor: _isRecording ? Colors.red : AppColors.primaryBlue,
    ),
  )
  ```

### Step 4.3: Display Voice Messages
- [ ] In message display builder, add:
  ```dart
  if (message.type == 'voice') {
    VoiceMessageWidget(
      filePath: message.content,
      fileName: message.metadata?['fileName'] ?? 'Voice message',
      createdAt: message.timestamp,
      duration: message.metadata?['duration'] ?? 0,
      isOutgoing: message.senderId == currentUserId,
    )
  }
  ```

### Step 4.4: Update Last Message on Send
- [ ] After message send, update metadata:
  ```dart
  await ChatMetadataService.setLastMessage(
    widget.chatId,
    messageContent,
  );
  await ChatMetadataService.setLastMessageTime(
    widget.chatId,
    DateTime.now(),
  );
  ```

### Step 4.5: Clear Unread on Open
- [ ] In ChatScreen init:
  ```dart
  @override
  void initState() {
    super.initState();
    ChatMetadataService.clearUnreadCount(widget.chatId);
  }
  ```

### Step 4.6: Add Notification Settings Button
- [ ] Add to ChatScreen AppBar actions:
  ```dart
  actions: [
    ChatNotificationBadge(
      chatId: widget.chatId,
      chatName: widget.participantName,
      showLabel: true,
    ),
    // ... other actions
  ]
  ```

## Phase 5: CommunicationsScreen Enhancement (10-15 minutes)

### Step 5.1: Add DND Toggle to Toolbar
- [ ] In CommunicationsScreen AppBar, add action:
  ```dart
  actions: [
    DNDToggleButton(isCompact: true),
    // ... existing actions
  ]
  ```

### Step 5.2: Show DND Status in Header
- [ ] Add indicator:
  ```dart
  appBar: AppBar(
    title: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Communications'),
        DNDStatusIndicator(isCompact: true),
      ],
    ),
  )
  ```

### Step 5.3: Add Call Statistics Tab (Optional)
- [ ] Add tab to CallHistoryScreen:
  ```dart
  TabBar(
    tabs: [
      const Tab(text: 'Contacts'),
      const Tab(text: 'History'),
      const Tab(text: 'Statistics'),
    ],
  )
  ```

- [ ] In TabBarView, add:
  ```dart
  FutureBuilder<List<CallRecord>>(
    future: _getCallRecords(),
    builder: (context, snapshot) {
      if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
      return CallStatisticsWidget(callRecords: snapshot.data!);
    },
  )
  ```

## Phase 6: Message Reception Handler (10-15 minutes)

### Step 6.1: Update Message Received Handler
- [ ] In your message reception listener (e.g., Supabase RealtimeChannel):
  ```dart
  onMessage: (payload) async {
    final message = parseMessage(payload);
    
    // Update metadata
    if (!await UserPreferencesService.isChatMuted(message.chatId)) {
      await ChatMetadataService.incrementUnreadCount(message.chatId);
      
      // Show notification (your notification service)
      showNotification(message);
    }
    
    // Update last message
    await ChatMetadataService.setLastMessage(
      message.chatId,
      message.content,
    );
    await ChatMetadataService.setLastMessageTime(
      message.chatId,
      message.timestamp,
    );
  }
  ```

### Step 6.2: Respect DND Mode in Notifications
- [ ] Update notification logic:
  ```dart
  Future<void> _showNotification(Message message) async {
    // Check if DND is enabled
    final isDND = await UserPreferencesService.isDNDEnabled();
    if (isDND) return; // Don't show notification
    
    // Check if chat is muted
    final isMuted = await UserPreferencesService.isChatMuted(message.chatId);
    if (isMuted) return;
    
    // Show notification
    // ... your notification code
  }
  ```

## Phase 7: Call History Integration (10-15 minutes)

### Step 7.1: Log Last Call on Call End
- [ ] After call ends, log it:
  ```dart
  Future<void> _onCallEnd(String contactId, String callType) async {
    await LastCallService.setLastCall(
      contactId,
      callType, // 'incoming', 'outgoing', 'missed'
      DateTime.now(),
    );
  }
  ```

### Step 7.2: Record Call Statistics
- [ ] Build call history from your call records:
  ```dart
  List<CallRecord> buildCallRecords(List<CallHistory> history) {
    return history.map((call) => CallRecord(
      contactId: call.contactId,
      contactName: call.contactName,
      type: call.type,
      timestamp: call.timestamp,
      duration: call.duration,
    )).toList();
  }
  ```

## Verification Checklist

### Does it compile?
- [ ] No errors in main.dart
- [ ] All imports resolve
- [ ] All new widgets import correctly

### Does it run?
- [ ] App starts without crash
- [ ] CallContactsScreen shows contacts with enhanced tiles
- [ ] ChatListScreen shows chats with preview, unread badge
- [ ] Can favorite a contact
- [ ] Can pin/mute a chat
- [ ] Can toggle DND

### Do features work?
- [ ] Favorites persist across app restart
- [ ] Pinned chats stay on top
- [ ] Unread count increases on new message
- [ ] Voice recording works
- [ ] DND hides notifications
- [ ] Per-chat notification settings save

### Performance
- [ ] Chats load smoothly (< 2 seconds for 50 chats)
- [ ] Contacts load smoothly (< 2 seconds for 100 contacts)
- [ ] No lag when scrolling

## Troubleshooting

### "Box not found" error
- Ensure `initializeBoxes()` called in main.dart before app run
- Check Hive box names match in services and init

### Features not persisting
- Verify Hive boxes are open beforemigration operations
- Check file permissions in app documents directory
- Clear app cache and reinstall

### Voice messages not working
- Verify `record` package installed (`flutter pub get`)
- Check RECORD_AUDIO permission in AndroidManifest.xml
- Test on device (not just emulator)

### Unread count not showing
- Ensure ChatMetadataService.incrementUnreadCount called on new message
- Check that ChatMetadataService.clearUnreadCount called on chat open
- Verify message reception handler implemented

---

## Time Estimate

- Phase 1: 5-10 min ✅
- Phase 2: 15-20 min ✅
- Phase 3: 20-25 min ✅
- Phase 4: 20-25 min ✅
- Phase 5: 10-15 min ✅
- Phase 6: 10-15 min ✅
- Phase 7: 10-15 min ✅

**Total: 90-125 minutes (1.5-2 hours)**

---

## Success Criteria

✅ All 10 features implemented and working
✅ No compilation errors
✅ App runs smoothly
✅ Features persist across app restart
✅ No performance degradation
✅ All edge cases handled gracefully
