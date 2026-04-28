# Quick Integration Guide - Copy & Paste Code Snippets

## 🚀 Quick Start

### 1. Update main.dart with all services

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'services/crash_analytics_service.dart';
import 'services/memory_management_service.dart';
import 'theme/theme_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize Firebase
  await Firebase.initializeApp();
  
  // Initialize Crashlytics
  await CrashAnalyticsService().initialize(
    enableDevLogging: true,
    onInitComplete: () {
      debugPrint('[App] Crashlytics ready');
    },
  );
  
  // Start memory monitoring
  final memoryService = MemoryManagementService();
  memoryService.startMonitoring();
  
  runApp(const ProviderScope(child: PACT_APP()));
}

class PACT_APP extends ConsumerWidget {
  const PACT_APP({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    
    return MaterialApp(
      title: 'PACT',
      themeMode: themeMode,
      theme: AppLightTheme.build(),
      darkTheme: AppDarkTheme.build(),
      home: HomeScreen(),
    );
  }
}
```

---

## 🎯 Feature Integration Snippets

### Chat List Screen with All Features

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../widgets/empty_state_widget.dart';
import '../services/image_caching_service.dart';
import '../services/share_service.dart';
import '../services/pagination_service.dart';

class ChatListScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chatsState = ref.watch(chatsPaginationProvider);
    
    return Scaffold(
      appBar: AppBar(
        title: Text('Chats'),
        actions: [
          IconButton(
            icon: Icon(Icons.settings),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => SettingsScreen()),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.read(chatsPaginationProvider.notifier).refresh();
        },
        child: PaginatedListView<Chat>(
          state: chatsState,
          itemBuilder: (context, index) {
            final chat = chatsState.items[index];
            return GestureDetector(
              onLongPress: () => _showChatOptions(context, ref, chat),
              child: ListTile(
                leading: ImageCachingService.buildCachedAvatar(
                  imageUrl: chat.avatarUrl ?? '',
                  fallbackInitials: chat.name.substring(0, 2),
                  size: 48,
                  online: chat.isOnline,
                ),
                title: Text(chat.name),
                subtitle: Text(chat.lastMessage ?? 'No messages'),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ChatScreen(chatId: chat.id),
                  ),
                ),
              ),
            );
          },
          onLoadMore: () {
            ref.read(chatsPaginationProvider.notifier).loadNextPage();
          },
          emptyBuilder: (_) => EmptyStateTemplates.noChats(
            context,
            onStartChat: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => StartChatScreen()),
            ),
          ),
          loadingBuilder: (_) => EmptyStateTemplates.loading(context),
        ),
      ),
    );
  }

  void _showChatOptions(BuildContext context, WidgetRef ref, Chat chat) {
    showModalBottomSheet(
      context: context,
      builder: (context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: Icon(Icons.share),
            title: Text('Share'),
            onTap: () async {
              Navigator.pop(context);
              await ShareService.shareConversation(chat.id);
            },
          ),
          ListTile(
            leading: Icon(Icons.delete),
            title: Text('Delete'),
            onTap: () => Navigator.pop(context),
          ),
        ],
      ),
    );
  }
}
```

### Chat Screen with Image Caching & Keyboard Handling

```dart
import 'package:flutter/material.dart';
import '../services/image_caching_service.dart';
import '../services/share_service.dart';

class ChatScreen extends StatefulWidget {
  final String chatId;

  const ChatScreen({required this.chatId});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  late TextEditingController _messageController;
  late FocusNode _messageFocusNode;
  late ScrollController _scrollController;
  bool _isKeyboardVisible = false;

  @override
  void initState() {
    super.initState();
    _messageController = TextEditingController();
    _messageFocusNode = FocusNode();
    _scrollController = ScrollController();
    
    _messageFocusNode.addListener(_onFocusChange);
    _scrollController.addListener(_onScrollActivity);
  }

  void _onFocusChange() {
    final isKeyboardVisible = _messageFocusNode.hasFocus;
    if (isKeyboardVisible && !_isKeyboardVisible) {
      _isKeyboardVisible = true;
      _scrollToBottom();
    } else if (!isKeyboardVisible && _isKeyboardVisible) {
      _isKeyboardVisible = false;
    }
  }

  void _onScrollActivity() {
    if (_scrollController.offset > 0 && _isKeyboardVisible) {
      FocusScope.of(context).unfocus();
    }
  }

  void _scrollToBottom() {
    Future.delayed(Duration(milliseconds: 300), () {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Chat')),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              itemCount: messages.length,
              itemBuilder: (context, index) {
                final message = messages[index];
                return GestureDetector(
                  onLongPress: () => _showMessageOptions(message),
                  child: Padding(
                    padding: EdgeInsets.all(8),
                    child: message.hasImage
                        ? ImageCachingService.buildCachedMessageImage(
                            imageUrl: message.imageUrl!,
                            width: 200,
                            height: 200,
                            onTap: () => _openFullImage(message.imageUrl!),
                          )
                        : Text(message.content),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: MediaQuery.of(context).viewInsets,
            child: TextField(
              controller: _messageController,
              focusNode: _messageFocusNode,
              decoration: InputDecoration(
                hintText: 'Type a message...',
                suffixIcon: IconButton(
                  icon: Icon(Icons.send),
                  onPressed: _sendMessage,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _sendMessage() async {
    final text = _messageController.text;
    if (text.isEmpty) return;

    _messageController.clear();
    // Send message logic
  }

  void _showMessageOptions(Message message) {
    showModalBottomSheet(
      context: context,
      builder: (context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: Icon(Icons.share),
            title: Text('Share'),
            onTap: () async {
              Navigator.pop(context);
              await ShareService.shareMessage(message.content);
            },
          ),
          ListTile(
            leading: Icon(Icons.delete),
            title: Text('Delete'),
            onTap: () => Navigator.pop(context),
          ),
        ],
      ),
    );
  }

  void _openFullImage(String url) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => FullScreenImageView(imageUrl: url),
      ),
    );
  }

  @override
  void dispose() {
    _messageController.dispose();
    _messageFocusNode.dispose();
    _scrollController.dispose();
    super.dispose();
  }
}
```

### Settings Screen with Theme & Cache Clearing

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/theme_provider.dart';
import '../services/image_caching_service.dart';
import '../services/memory_management_service.dart';

class SettingsScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    final memoryService = MemoryManagementService();

    return Scaffold(
      appBar: AppBar(title: Text('Settings')),
      body: ListView(
        children: [
          // Theme section
          ListTile(
            title: Text('Dark Mode'),
            trailing: Switch(
              value: themeMode == ThemeMode.dark,
              onChanged: (value) {
                ref.read(themeModeProvider.notifier).setThemeMode(
                  value ? ThemeMode.dark : ThemeMode.light,
                );
              },
            ),
          ),
          Divider(),
          
          // Cache management
          ListTile(
            title: Text('Clear Image Cache'),
            subtitle: Text('Frees up storage space'),
            onTap: () async {
              await ImageCachingService.clearCache();
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Cache cleared')),
              );
            },
          ),
          
          // Memory stats
          ListTile(
            title: Text('Memory Usage'),
            subtitle: FutureBuilder<double>(
              future: memoryService.getMemoryUsagePercent(),
              builder: (context, snapshot) {
                if (snapshot.hasData) {
                  return Text('${snapshot.data!.toStringAsFixed(1)}%');
                }
                return Text('--');
              },
            ),
          ),
        ],
      ),
    );
  }
}
```

### Contact Picker Screen

```dart
import 'package:flutter/material.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import '../services/contact_integration_service.dart';
import '../widgets/empty_state_widget.dart';

class ContactPickerScreen extends StatefulWidget {
  @override
  State<ContactPickerScreen> createState() => _ContactPickerScreenState();
}

class _ContactPickerScreenState extends State<ContactPickerScreen> {
  late ContactIntegrationService _contactService;
  List<Contact> _contacts = [];
  List<Contact> _filteredContacts = [];

  @override
  void initState() {
    super.initState();
    _contactService = ContactIntegrationService();
    _loadContacts();
  }

  void _loadContacts() async {
    final contacts = await _contactService.getContacts();
    setState(() {
      _contacts = contacts;
      _filteredContacts = contacts;
    });
  }

  void _searchContacts(String query) async {
    if (query.isEmpty) {
      setState(() => _filteredContacts = _contacts);
      return;
    }

    final results = await _contactService.searchContacts(query);
    setState(() => _filteredContacts = results);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          decoration: InputDecoration(
            hintText: 'Search contacts...',
            border: InputBorder.none,
          ),
          onChanged: _searchContacts,
        ),
      ),
      body: _filteredContacts.isEmpty
          ? EmptyStateTemplates.noContacts(context)
          : ListView.builder(
              itemCount: _filteredContacts.length,
              itemBuilder: (context, index) {
                final contact = _filteredContacts[index];
                final phone = ContactIntegrationService.getPrimaryPhoneNumber(contact);
                
                return ListTile(
                  title: Text(contact.displayName),
                  subtitle: Text(phone ?? 'No phone number'),
                  onTap: () => Navigator.pop(context, contact),
                );
              },
            ),
    );
  }
}
```

### Memory Monitoring Widget

```dart
import 'package:flutter/material.dart';
import '../services/memory_management_service.dart';

class MemoryMonitoringWidget extends StatefulWidget {
  @override
  State<MemoryMonitoringWidget> createState() => _MemoryMonitoringWidgetState();
}

class _MemoryMonitoringWidgetState extends State<MemoryMonitoringWidget> {
  final _memoryService = MemoryManagementService();

  @override
  void initState() {
    super.initState();
    _memoryService.onMemoryWarning((warning) {
      String message = '';
      if (warning == MemoryWarning.critical) {
        message = 'Critical memory usage - app may become unstable';
      } else if (warning == MemoryWarning.high) {
        message = 'High memory usage - consider closing other apps';
      }
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<MemoryMetrics?>(
      future: _memoryService.getMemoryMetrics(),
      builder: (context, snapshot) {
        if (snapshot.hasData && snapshot.data != null) {
          final metrics = snapshot.data!;
          return Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Memory Usage: ${metrics.usagePercent.toStringAsFixed(1)}%'),
                  LinearProgressIndicator(
                    value: metrics.usagePercent / 100,
                  ),
                ],
              ),
            ),
          );
        }
        return SizedBox.shrink();
      },
    );
  }

  @override
  void dispose() {
    _memoryService.dispose();
    super.dispose();
  }
}
```

### Error Boundary Wrapper

```dart
import 'package:flutter/material.dart';
import '../services/crash_analytics_service.dart';

void main() {
  runApp(
    ErrorHandlingWrapper.withErrorBoundary(
      child: MyApp(),
      onError: () {
        debugPrint('Error occurred in app');
      },
    ),
  );
}

// Or wrap specific screens
class ProtectedScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ErrorHandlingWrapper.withErrorBoundary(
      child: MyScreen(),
      showErrorUI: true,
    );
  }
}

// Or wrap API calls
Future<void> loadData() async {
  await ErrorHandlingWrapper.executeAsync(
    operation: () => fetchFromAPI(),
    operationName: 'load_data',
    onError: () {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load data')),
      );
    },
  );
}
```

---

## 🎨 Using Platform Helpers

```dart
import '../utils/platform_helper.dart';

class PlatformSpecificScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Platform button
        PlatformHelper.buildPlatformButton(
          context,
          'Press me',
          () => print('Pressed'),
        ),
        
        // Platform dialog
        ElevatedButton(
          onPressed: () => PlatformHelper.showPlatformDialog(
            context,
            title: 'Confirm Action',
            content: 'Are you sure?',
            actions: {
              'Cancel': () => Navigator.pop(context),
              'OK': () {
                Navigator.pop(context);
                print('Confirmed');
              },
            },
          ),
          child: Text('Show Dialog'),
        ),
        
        // Platform switch
        PlatformHelper.buildPlatformSwitch(
          context,
          value: true,
          onChanged: (value) => print(value),
        ),
        
        // Platform text field
        PlatformHelper.buildPlatformTextField(
          context,
          hintText: 'Enter text',
          onChanged: (value) => print(value),
        ),
      ],
    );
  }
}
```

---

## ✨ Using Animations

```dart
import '../widgets/gesture_animations.dart';

class AnimatedScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Animated button
        GestureAnimations.scaleOnTap(
          onTap: () => print('Tapped'),
          child: ElevatedButton(
            onPressed: () {},
            child: Text('Tap me'),
          ),
        ),
        
        // Shimmer loading
        GestureAnimations.shimmerLoading(width: 200, height: 20),
        
        // Staggered list
        ListView.builder(
          itemCount: 10,
          itemBuilder: (context, index) {
            return GestureAnimations.staggeredListItem(
              index: index,
              child: ListTile(title: Text('Item $index')),
            );
          },
        ),
      ],
    );
  }
}
```

---

## 🔗 Dependencies Summary

All required dependencies are already in your `pubspec.yaml`:
- ✅ `flutter_contacts`
- ✅ `cached_network_image`
- ✅ `flutter_animate`
- ✅ `flutter_riverpod`
- ✅ `firebase_crashlytics`
- ✅ `share_plus`
- ✅ `flutter_secure_storage`

No additional packages needed!

---

**Copy these snippets into your screens and customize as needed.**
