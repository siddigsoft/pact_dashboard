import 'dart:async';
import 'dart:math' as math;
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:any_link_preview/any_link_preview.dart';

import 'package:path_provider/path_provider.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:record/record.dart';
import 'package:uuid/uuid.dart';
import '../models/chat.dart';
import '../models/chat_message.dart';
import '../models/chat_participant.dart';
import '../models/chat_contact.dart';
import '../services/chat_service.dart';
import '../services/chat_contact_service.dart';
import '../services/chat_metadata_service.dart';
import '../services/agora_call_service.dart';
import '../services/analytics_service.dart';
import '../screens/agora_call_screen.dart';
import '../screens/contact_info_screen.dart';
import '../theme/app_colors.dart';
import '../utils/error_handler.dart';
import '../widgets/standard_back_button.dart';

class ChatScreen extends StatefulWidget {
  final Chat chat;

  const ChatScreen({super.key, required this.chat});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final ChatService _chatService = ChatService();
  final ChatContactService _contactService = ChatContactService();
  final TextEditingController _messageController = TextEditingController();
  final FocusNode _messageFocusNode = FocusNode();
  final ScrollController _scrollController = ScrollController();
  final ImagePicker _imagePicker = ImagePicker();
  final AudioPlayer _audioPlayer = AudioPlayer();
  final AudioRecorder _audioRecorder = AudioRecorder();
  List<ChatMessage> _messages = [];
  bool _isLoading = true;
  bool _isSending = false;
  bool _isRecording = false;
  bool _isUploadingFile = false;
  bool _isKeyboardVisible = false;
  String? _recordingPath;
  Duration _recordingDuration = Duration.zero;
  Timer? _recordingTimer;
  String? _currentUserId;
  List<ChatParticipant> _participants = [];
  bool _participantsLoaded = false;
  ChatContact? _chatContact;
  String? _contactUserId;
  RealtimeChannel? _messageChannel;
  ChatMessage? _replyingTo;
  Color _currentWallpaper = const Color(0xFFEAE2D8);
  String? _wallpaperImagePath; // Store path to wallpaper image
  bool _isOtherUserTyping = false;
  bool _amITyping = false;
  Timer? _typingDebounceTimer;
  final Set<String> _selectedMessageIds = {};

  @override
  void initState() {
    super.initState();
    _currentUserId = Supabase.instance.client.auth.currentUser?.id;
    _loadWallpaperColor();
    _loadMessages();
    _loadParticipants();
    _loadContactInfo();
    _markMessagesAsRead();
    _subscribeToMessages();
    _messageController.addListener(_onMessageTextChanged);

    // Listen to keyboard visibility
    _messageFocusNode.addListener(_onFocusChange);

    // Auto-dismiss keyboard on scroll
    _scrollController.addListener(_onScrollActivity);
  }

  void _onMessageTextChanged() {
    if (mounted) {
      setState(() {});
    }

    final isCurrentlyTyping = _messageController.text.trim().isNotEmpty;
    if (_amITyping != isCurrentlyTyping) {
      _amITyping = isCurrentlyTyping;
      _messageChannel?.sendBroadcastMessage(
        event: 'typing',
        payload: {'user_id': _currentUserId, 'is_typing': _amITyping},
      );
    }

    _typingDebounceTimer?.cancel();
    if (_amITyping) {
      _typingDebounceTimer = Timer(const Duration(seconds: 3), () {
        if (!mounted) return;
        _amITyping = false;
        _messageChannel?.sendBroadcastMessage(
          event: 'typing',
          payload: {'user_id': _currentUserId, 'is_typing': false},
        );
      });
    }
  }

  /// Handle focus node changes to detect keyboard visibility
  void _onFocusChange() {
    if (mounted) {
      setState(() {
        _isKeyboardVisible = _messageFocusNode.hasFocus;
      });

      // Scroll to bottom when keyboard shows
      if (_isKeyboardVisible) {
        Future.delayed(const Duration(milliseconds: 300), () {
          if (mounted && _scrollController.hasClients) {
            _scrollController.animateTo(
              _scrollController.position.maxScrollExtent,
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut,
            );
          }
        });
      }
    }
  }

  /// Auto-dismiss keyboard when scrolling
  void _onScrollActivity() {
    if (_messageFocusNode.hasFocus) {
      // Only unfocus if user is actively scrolling
      if (_scrollController.position.isScrollingNotifier.value) {
        FocusScope.of(context).unfocus();
      }
    }
  }

  Future<void> _loadWallpaperColor() async {
    final prefs = await SharedPreferences.getInstance();
    // Load image wallpaper if exists
    final imagePath = prefs.getString('chat_wallpaper_image_${widget.chat.id}');
    if (imagePath != null &&
        imagePath.isNotEmpty &&
        File(imagePath).existsSync()) {
      if (mounted) setState(() => _wallpaperImagePath = imagePath);
      return;
    }
    // Load color wallpaper
    final colorVal = prefs.getInt('chat_wallpaper_${widget.chat.id}');
    if (colorVal != null) {
      if (mounted) setState(() => _currentWallpaper = Color(colorVal));
    }
  }

  Future<void> _pickWallpaperImage() async {
    try {
      final XFile? pickedFile = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
      );
      if (pickedFile != null) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(
          'chat_wallpaper_image_${widget.chat.id}',
          pickedFile.path,
        );
        if (mounted) {
          setState(() => _wallpaperImagePath = pickedFile.path);
          Navigator.pop(context);
        }
      }
    } catch (e) {
      debugPrint('Error picking wallpaper image: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to pick image: $e')));
      }
    }
  }

  Future<void> _clearWallpaperImage() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('chat_wallpaper_image_${widget.chat.id}');
      if (mounted) {
        setState(() => _wallpaperImagePath = null);
      }
    } catch (e) {
      debugPrint('Error clearing wallpaper image: $e');
    }
  }

  @override
  @override
  void dispose() {
    _typingDebounceTimer?.cancel();
    _messageChannel?.unsubscribe();
    _messageController.removeListener(_onMessageTextChanged);
    _messageController.dispose();
    _messageFocusNode.removeListener(_onFocusChange);
    _messageFocusNode.dispose();
    _scrollController.removeListener(_onScrollActivity);
    _scrollController.dispose();
    _recordingTimer?.cancel();
    _audioPlayer.dispose();
    _audioRecorder.dispose();
    super.dispose();
  }

  Future<void> _loadMessages() async {
    if (widget.chat.disappearingTimer != null &&
        widget.chat.disappearingTimer! > 0) {
      await _chatService.pruneExpiredMessages(
        widget.chat.id,
        widget.chat.disappearingTimer!,
      );
    }
    final messages = await _chatService.getChatMessages(widget.chat.id);

    setState(() {
      _messages =
          messages; // Messages already ordered by created_at ascending (oldest first)
      _isLoading = false;
    });

    // Scroll to bottom after loading
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollToBottom();
    });
  }

  /// Subscribe to realtime messages for this chat
  void _subscribeToMessages() {
    _messageChannel = Supabase.instance.client
        .channel('chat_messages:${widget.chat.id}')
        .onBroadcast(
          event: 'typing',
          callback: (payload) {
            final userId = payload['user_id'];
            final isTyping = payload['is_typing'] == true;
            if (userId != _currentUserId && mounted) {
              setState(() => _isOtherUserTyping = isTyping);
            }
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'chat_messages',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'chat_id',
            value: widget.chat.id,
          ),
          callback: (payload) {
            if (payload.eventType == PostgresChangeEvent.insert) {
              final newMessage = ChatMessage.fromJson(payload.newRecord);
              if (!_messages.any((m) => m.id == newMessage.id)) {
                setState(() => _messages.add(newMessage));
                WidgetsBinding.instance.addPostFrameCallback(
                  (_) => _scrollToBottom(),
                );
                if (newMessage.senderId != _currentUserId) {
                  _markMessagesAsRead();
                }
              }
            } else if (payload.eventType == PostgresChangeEvent.update) {
              final updatedMessage = ChatMessage.fromJson(payload.newRecord);
              final index = _messages.indexWhere(
                (m) => m.id == updatedMessage.id,
              );
              if (index != -1 && mounted) {
                setState(() => _messages[index] = updatedMessage);
              }
            }
          },
        )
        .subscribe();
  }

  Future<void> _loadParticipants() async {
    final participants = await _chatService.getChatParticipants(widget.chat.id);
    // Debug: print participants loaded
    // ignore: avoid_print
    print('_loadParticipants for ${widget.chat.id}: $participants');

    final updatedParticipants = List<ChatParticipant>.from(participants);

    if (widget.chat.otherParticipantId != null &&
        !updatedParticipants.any(
          (participant) => participant.userId == widget.chat.otherParticipantId,
        )) {
      updatedParticipants.add(
        ChatParticipant(
          chatId: widget.chat.id,
          userId: widget.chat.otherParticipantId!,
          userName: widget.chat.otherParticipantName,
          joinedAt: DateTime.now(),
        ),
      );
    }

    setState(() {
      _participants = updatedParticipants;
      _participantsLoaded = true;
    });

    // Get the contact user ID if this is a private chat
    if (widget.chat.chatType == 'private' && _currentUserId != null) {
      final searchParticipants = updatedParticipants.isNotEmpty
          ? updatedParticipants
          : participants;

      final otherParticipant = searchParticipants.firstWhere(
        (p) => p.userId != _currentUserId,
        orElse: () => searchParticipants.isNotEmpty
            ? searchParticipants.first
            : ChatParticipant(
                chatId: widget.chat.id,
                userId: widget.chat.otherParticipantId ?? '',
                userName: widget.chat.otherParticipantName ?? 'Unknown',
                joinedAt: DateTime.now(),
              ),
      );
      widget.chat.otherParticipantId ??= otherParticipant.userId.isNotEmpty
          ? otherParticipant.userId
          : widget.chat.otherParticipantId;
      if (otherParticipant.userName != null &&
          otherParticipant.userName!.isNotEmpty) {
        widget.chat.otherParticipantName ??= otherParticipant.userName;
      }
      _contactUserId = otherParticipant.userId;
    }
  }

  // Load contact information from chat_contacts table
  Future<void> _loadContactInfo() async {
    if (_currentUserId == null || widget.chat.chatType != 'private') return;

    // Wait for participants to load first to get the contact user ID
    await Future.delayed(const Duration(milliseconds: 100));

    if (_contactUserId == null || _contactUserId!.isEmpty) return;

    try {
      final contact = await _contactService.getContact(
        _currentUserId!,
        _contactUserId!,
      );

      // If contact doesn't exist, create it with default name
      if (contact == null && _contactUserId!.isNotEmpty) {
        final defaultName = await _contactService.fetchUserProfileName(
          _contactUserId!,
        );
        final newContact = await _contactService.saveContact(
          userId: _currentUserId!,
          contactUserId: _contactUserId!,
          defaultName: defaultName,
        );
        setState(() {
          _chatContact = newContact;
        });
      } else if (contact != null) {
        setState(() {
          _chatContact = contact;
        });
      }
    } catch (e) {
      print('Error loading contact info: $e');
    }
  }

  // Get sender name from participants list
  String _getSenderName(String senderId) {
    if (senderId == _currentUserId) {
      return 'You';
    }

    ChatParticipant? participant;
    for (final item in _participants) {
      if (item.userId == senderId) {
        participant = item;
        break;
      }
    }

    final candidateName = participant?.userName;
    if (candidateName != null && candidateName.isNotEmpty) {
      return candidateName;
    }

    if (widget.chat.otherParticipantId == senderId &&
        widget.chat.otherParticipantName != null &&
        widget.chat.otherParticipantName!.isNotEmpty) {
      return widget.chat.otherParticipantName!;
    }

    final shortId = senderId.length > 8 ? senderId.substring(0, 8) : senderId;
    return 'User $shortId';
  }

  Future<void> _markMessagesAsRead() async {
    await _chatService.markMessagesAsRead(widget.chat.id);

    // Clear unread count via ChatMetadataService
    try {
      await ChatMetadataService.clearUnreadCount(widget.chat.id);
    } catch (e) {
      debugPrint('Error clearing unread count: $e');
    }

    // Update local messages to reflect read status
    setState(() {
      for (var message in _messages) {
        if (message.senderId != _currentUserId && message.status != 'read') {
          message.status = 'read';
        }
      }
    });
  }

  Future<void> _sendMessage() async {
    final content = _messageController.text.trim();
    if (content.isEmpty || _isSending) return;

    setState(() => _isSending = true);

    Map<String, dynamic>? metadata;
    if (_replyingTo != null) {
      metadata = {
        'reply_to': {
          'id': _replyingTo!.id,
          'senderId': _replyingTo!.senderId,
          'senderName': _getSenderName(_replyingTo!.senderId),
          'content': _replyingTo!.content,
          'contentType': _replyingTo!.contentType,
        },
      };
    }

    try {
      final message = await _chatService.sendMessage(
        widget.chat.id,
        content,
        metadata: metadata,
      );
      if (message != null) {
        setState(() {
          _messages.add(message);
          _replyingTo = null; // Clear reply state
        });

        // Track message in ChatMetadataService
        try {
          await ChatMetadataService.setLastMessage(widget.chat.id, content);
        } catch (e) {
          debugPrint('Error tracking message: $e');
        }

        _messageController.clear();
        _scrollToBottom();
      }
    } catch (e) {
      if (mounted) {
        context.showError(e, onRetry: _sendMessage);
      }
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  Future<void> _showAttachmentOptions() async {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Share',
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _buildAttachmentOption(
                    icon: Icons.camera_alt,
                    label: 'Camera',
                    color: Colors.pink,
                    onTap: () {
                      Navigator.pop(context);
                      _pickImageFromCamera();
                    },
                  ),
                  _buildAttachmentOption(
                    icon: Icons.photo,
                    label: 'Gallery',
                    color: Colors.purple,
                    onTap: () {
                      Navigator.pop(context);
                      _pickImageFromGallery();
                    },
                  ),
                  _buildAttachmentOption(
                    icon: Icons.insert_drive_file,
                    label: 'Document',
                    color: Colors.blue,
                    onTap: () {
                      Navigator.pop(context);
                      _pickDocument();
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAttachmentOption({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 28),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey[700]),
          ),
        ],
      ),
    );
  }

  Future<void> _pickImageFromCamera() async {
    try {
      final status = await Permission.camera.request();
      if (status.isDenied) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Camera permission is required')),
          );
        }
        return;
      }

      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.camera,
        imageQuality: 70,
      );

      if (image != null) {
        await _uploadFile(File(image.path), 'image');
      }
    } catch (e) {
      debugPrint('Error picking image from camera: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to capture image: $e')));
      }
    }
  }

  Future<void> _pickImageFromGallery() async {
    try {
      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 70,
      );

      if (image != null) {
        await _uploadFile(File(image.path), 'image');
      }
    } catch (e) {
      debugPrint('Error picking image from gallery: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to select image: $e')));
      }
    }
  }

  Future<void> _pickDocument() async {
    // Document picking is currently disabled - use image picker instead
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please use gallery or camera to share files'),
        ),
      );
    }
  }

  Future<void> _uploadFile(File file, String fileType) async {
    setState(() => _isUploadingFile = true);

    try {
      final fileName =
          '${DateTime.now().millisecondsSinceEpoch}_${file.path.split('/').last}';
      final storagePath = 'chat_files/${widget.chat.id}/$fileName';

      final bytes = await file.readAsBytes();

      await Supabase.instance.client.storage
          .from('chat-attachments')
          .uploadBinary(storagePath, bytes);

      final url = await Supabase.instance.client.storage
          .from('chat-attachments')
          .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

      String messageContent;
      if (fileType == 'image') {
        messageContent = '[Image] $url';
      } else if (fileType == 'audio') {
        messageContent = '[Voice Message] $url';
      } else {
        messageContent = '[Document] ${file.path.split('/').last}\n$url';
      }

      final message = await _chatService.sendMessage(
        widget.chat.id,
        messageContent,
      );
      if (message != null) {
        setState(() {
          _messages.add(message);
        });
        _scrollToBottom();
        // Log media sharing event
        AnalyticsService.logEvent(
          'media_shared',
          parameters: {
            'chat_id': widget.chat.id,
            'message_type': fileType,
            'file_name': fileName,
            'file_size_bytes': bytes.length,
            'timestamp': message.createdAt.toIso8601String(),
          },
        );
      }
    } catch (e) {
      debugPrint('Error uploading file: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to upload file: $e')));
        // Log media share failure
        AnalyticsService.logEvent(
          'media_share_failed',
          parameters: {
            'chat_id': widget.chat.id,
            'message_type': fileType,
            'error': e.toString(),
          },
        );
      }
    } finally {
      setState(() => _isUploadingFile = false);
    }
  }

  Future<void> _startRecording() async {
    try {
      // Check microphone permission
      final micPermission = await Permission.microphone.request();
      if (!micPermission.isGranted) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Microphone permission is required to record voice messages',
              ),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }

      // Check if recorder can record
      final hasPermission = await _audioRecorder.hasPermission();
      if (!hasPermission) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Unable to access microphone'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      // Web doesn't support reliable voice recording due to blob URL limitations
      if (kIsWeb) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Voice messages work best on mobile. Use the native app or send text/files instead.',
              ),
              backgroundColor: Colors.orange,
              duration: Duration(seconds: 4),
            ),
          );
        }
        return;
      }

      // On native platforms, prepare file path
      final directory = await getTemporaryDirectory();
      final fileName = 'voice_${const Uuid().v4()}.m4a';
      final recordingPath = '${directory.path}/$fileName';
      _recordingPath = recordingPath;

      // Start recording with AAC encoder
      await _audioRecorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 128000,
          sampleRate: 44100,
        ),
        path: recordingPath,
      );

      setState(() {
        _isRecording = true;
        _recordingDuration = Duration.zero;
      });

      // Start duration timer
      _recordingTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (mounted) {
          setState(() {
            _recordingDuration = Duration(seconds: timer.tick);
          });
        }
      });

      debugPrint('[ChatScreen] Voice recording started: $_recordingPath');
    } catch (e) {
      debugPrint('[ChatScreen] Error starting recording: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to start recording: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _stopRecording() async {
    try {
      _recordingTimer?.cancel();

      // Never upload on web - web recording not supported
      if (kIsWeb) {
        if (mounted) {
          setState(() {
            _isRecording = false;
            _recordingPath = null;
            _recordingDuration = Duration.zero;
          });
        }
        return;
      }

      if (!_isRecording || _recordingPath == null) {
        if (mounted) setState(() => _isRecording = false);
        return;
      }

      // Capture duration before resetting
      final recordedDuration = _recordingDuration;

      // Stop recording and get the path/data
      final recordedData = await _audioRecorder.stop();

      if (recordedData != null) {
        debugPrint('[ChatScreen] Recording stopped, uploading...');

        // Store duration temporarily for upload
        _recordingDuration = recordedDuration;

        // Upload the voice message with the actual recorded data
        await _uploadVoiceMessage(recordedData);
      }

      if (mounted) {
        setState(() {
          _isRecording = false;
          _recordingPath = null;
          _recordingDuration = Duration.zero;
        });
      }
    } catch (e) {
      debugPrint('[ChatScreen] Error stopping recording: $e');
      if (mounted) {
        setState(() => _isRecording = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to save recording: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _uploadVoiceMessage(dynamic recordedData) async {
    try {
      Uint8List bytes = Uint8List(0);
      String nativeFilePath = '';

      // Never upload on web - not supported
      if (kIsWeb) {
        // On web, recordedData can be a blob URL, base64 string, or bytes
        if (recordedData is Uint8List) {
          bytes = recordedData;
        } else if (recordedData is String) {
          String dataString = recordedData;

          // Check if it's a blob URL (blob:...)
          if (dataString.startsWith('blob:')) {
            // For blob URLs, we cannot directly access the data from Dart
            // Use the blob URL directly as a placeholder or skip web recording
            throw Exception(
              'Web blob recording requires browser integration. Please use native recording.',
            );
          }

          // Check if it's a data URL with base64
          if (dataString.contains('base64,')) {
            dataString = dataString.replaceAll(
              RegExp(r'^data:audio/[^;]*;base64,'),
              '',
            );
            try {
              bytes = base64Decode(dataString);
            } catch (e) {
              throw Exception('Invalid base64 audio data: $e');
            }
          } else {
            // Try to treat as base64 anyway
            try {
              bytes = base64Decode(dataString);
            } catch (e) {
              throw Exception(
                'Invalid audio data format. Expected base64 or data URL: $e',
              );
            }
          }
        } else if (recordedData is List) {
          bytes = Uint8List.fromList(List<int>.from(recordedData));
        } else {
          throw Exception(
            'Unexpected recorded data type: ${recordedData.runtimeType}',
          );
        }
      } else {
        // On native platforms, recordedData is the file path
        nativeFilePath = recordedData as String;
        if (nativeFilePath.isEmpty) {
          throw Exception('Failed to get recorded audio data');
        }
        final file = File(nativeFilePath);
        if (!await file.exists()) {
          throw Exception('Recording file not found at: $nativeFilePath');
        }
        bytes = await file.readAsBytes();
      }

      // Validate we have audio data
      if (bytes.isEmpty) {
        throw Exception('No audio data recorded');
      }

      final fileName = 'voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      final storagePath = 'chat_audio/${widget.chat.id}/$fileName';

      // Upload to Supabase Storage using the same bucket as other attachments
      await Supabase.instance.client.storage
          .from('chat-attachments')
          .uploadBinary(
            storagePath,
            bytes,
            fileOptions: const FileOptions(contentType: 'audio/mp4'),
          );

      // Get signed URL (same approach as existing file uploads)
      final signedUrl = await Supabase.instance.client.storage
          .from('chat-attachments')
          .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year

      // Send as audio message - encode URL and metadata in content as JSON
      final durationSeconds = _recordingDuration.inSeconds;
      final audioContent = jsonEncode({
        'url': signedUrl,
        'duration': durationSeconds,
        'fileName': fileName,
      });

      await _chatService.sendMessage(
        widget.chat.id,
        audioContent,
        contentType: 'audio',
      );

      // Track voice message in ChatMetadataService
      try {
        await ChatMetadataService.setLastMessage(
          widget.chat.id,
          '🎙️ Voice message',
        );
      } catch (e) {
        debugPrint('Error tracking voice message: $e');
      }

      // Delete temp file
      if (nativeFilePath.isNotEmpty) {
        try {
          final file = File(nativeFilePath);
          if (await file.exists()) {
            await file.delete();
            debugPrint('[ChatScreen] Temp file deleted: $nativeFilePath');
          }
        } catch (e) {
          debugPrint('[ChatScreen] Failed to delete temp file: $e');
        }
      }

      debugPrint('[ChatScreen] Voice message uploaded successfully');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Voice message sent'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      debugPrint('[ChatScreen] Error uploading voice message: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to send voice message: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  Future<void> _cancelRecording() async {
    try {
      _recordingTimer?.cancel();

      if (_recordingPath != null && !kIsWeb) {
        final file = File(_recordingPath!);
        if (await file.exists()) {
          await file.delete();
        }
      }

      setState(() {
        _isRecording = false;
        _recordingPath = null;
        _recordingDuration = Duration.zero;
      });
    } catch (e) {
      debugPrint('Error canceling recording: $e');
      setState(() => _isRecording = false);
    }
  }

  String _formatDuration(Duration duration) {
    String twoDigits(int n) => n.toString().padLeft(2, '0');
    final minutes = twoDigits(duration.inMinutes.remainder(60));
    final seconds = twoDigits(duration.inSeconds.remainder(60));
    return '$minutes:$seconds';
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  String _getChatTitle() {
    if (widget.chat.chatType == 'private') {
      // Use contact's custom name if available
      if (_chatContact != null) {
        return _chatContact!.displayName;
      }

      if (widget.chat.otherParticipantName != null &&
          widget.chat.otherParticipantName!.isNotEmpty) {
        return widget.chat.otherParticipantName!;
      }

      // Otherwise fall back to participant name
      if (!_participantsLoaded || _participants.isEmpty) {
        return 'Loading...';
      }

      String fallbackFromId(String id) {
        final shortId = id.length > 8 ? id.substring(0, 8) : id;
        return 'User $shortId';
      }

      ChatParticipant otherParticipant;

      if (_participants.length == 1) {
        otherParticipant = _participants.first;
      } else {
        ChatParticipant? found;
        if (_currentUserId != null) {
          found = _participants.firstWhere(
            (p) => p.userId != _currentUserId,
            orElse: () => _participants.first,
          );

          if (found.userId == _currentUserId && _participants.length > 1) {
            final currentIndex = _participants.indexWhere(
              (p) => p.userId == _currentUserId,
            );
            final otherIndex = currentIndex == 0 ? 1 : 0;
            found = _participants[otherIndex];
          }
        } else {
          found = _participants.length > 1
              ? _participants[1]
              : _participants.first;
        }

        otherParticipant = found;
      }

      if (otherParticipant.userName != null &&
          otherParticipant.userName!.isNotEmpty) {
        return otherParticipant.userName!;
      }

      final candidateId = otherParticipant.userId.isNotEmpty
          ? otherParticipant.userId
          : (widget.chat.otherParticipantId ?? widget.chat.id);

      return fallbackFromId(candidateId);
    } else {
      // For group chats, show the chat name
      return widget.chat.name;
    }
  }

  // Initiate audio or video call
  Future<void> _initiateCall({required bool isAudioOnly}) async {
    debugPrint('[ChatScreen Call] ═══ CALL INITIATION START ═══');
    debugPrint('[ChatScreen Call] isAudioOnly=$isAudioOnly');

    if (widget.chat.otherParticipantId == null) {
      debugPrint('[ChatScreen Call] ✗ BLOCKED: No participant');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Cannot initiate call: No participant found'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return;
    }
    debugPrint(
      '[ChatScreen Call] ✓ Participant: ${widget.chat.otherParticipantId}',
    );

    try {
      final targetUserId = widget.chat.otherParticipantId!;
      final targetUserName = _getChatTitle();
      final agoraService = AgoraCallService();

      debugPrint('[ChatScreen Call] Target: $targetUserName ($targetUserId)');

      if (!agoraService.isReady) {
        debugPrint('[ChatScreen Call] ✗ BLOCKED: Service not ready');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Call service not ready. Please try again in a moment.',
              ),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }
      debugPrint('[ChatScreen Call] ✓ Service ready');

      if (agoraService.isInCall) {
        debugPrint('[ChatScreen Call] ✗ BLOCKED: Already in call');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('You are already in a call'),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }
      debugPrint('[ChatScreen Call] ✓ Not in call');

      // Show loading indicator
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                ),
                const SizedBox(width: 16),
                Text(
                  '${isAudioOnly ? 'Calling' : 'Video calling'} $targetUserName...',
                ),
              ],
            ),
            duration: const Duration(seconds: 45),
          ),
        );
      }

      debugPrint('[ChatScreen Call] → Calling agoraService.startCall()...');
      final result = await agoraService.startCall(
        remoteUserId: targetUserId,
        remoteUserName: targetUserName,
        audioOnly: isAudioOnly,
      );

      debugPrint(
        '[ChatScreen Call] ← Result: success=${result.success}, channel=${result.channelName}, error=${result.error}',
      );

      if (result.success && result.channelName != null && mounted) {
        debugPrint(
          '[ChatScreen Call] ✓ SUCCESS - Navigating to AgoraCallScreen',
        );
        ScaffoldMessenger.of(context).clearSnackBars();
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => AgoraCallScreen(
              channelName: result.channelName!,
              remoteUserId: targetUserId,
              remoteUserName: targetUserName,
              isAudioOnly: isAudioOnly,
              isOutgoing: true,
            ),
          ),
        );
      } else if (!result.success && mounted) {
        debugPrint('[ChatScreen Call] ✗ FAILED: ${result.error}');
        ScaffoldMessenger.of(context).clearSnackBars();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result.error ?? 'User is busy or unavailable'),
            backgroundColor: Colors.red,
          ),
        );
      } else {
        debugPrint('[ChatScreen Call] ✗ FAILED: Not mounted or no channel');
      }
    } catch (e, st) {
      debugPrint('[ChatScreen Call] ✗ EXCEPTION: $e');
      debugPrint('[ChatScreen Call] Stack: $st');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to initiate call: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  // Show dialog to edit contact name
  Future<void> _editContactName() async {
    if (_currentUserId == null || _contactUserId == null) return;

    final TextEditingController nameController = TextEditingController(
      text: _chatContact?.customName ?? '',
    );

    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          'Edit Contact Name',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        content: TextField(
          controller: nameController,
          decoration: InputDecoration(
            hintText: 'Enter custom name',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancel', style: GoogleFonts.poppins()),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context, nameController.text.trim());
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(
              'Save',
              style: GoogleFonts.poppins(color: Colors.white),
            ),
          ),
        ],
      ),
    );

    if (result != null && result.isNotEmpty) {
      try {
        final updatedContact = await _contactService.updateContactName(
          userId: _currentUserId!,
          contactUserId: _contactUserId!,
          customName: result,
          defaultName: _chatContact?.defaultName,
        );

        setState(() {
          _chatContact = updatedContact;
        });

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Contact name updated to "$result"'),
              backgroundColor: AppColors.success,
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to update contact name: $e'),
              backgroundColor: AppColors.error,
            ),
          );
        }
      }
    }

    nameController.dispose();
  }

  // Confirm and delete the entire chat
  Future<void> _confirmDeleteChat() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          'Delete Chat',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        content: Text(
          'Are you sure you want to delete this entire chat? This action cannot be undone.',
          style: GoogleFonts.poppins(),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text('Cancel', style: GoogleFonts.poppins()),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(
              'Delete',
              style: GoogleFonts.poppins(color: Colors.white),
            ),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await _deleteChat();
    }
  }

  // Delete the chat and navigate back
  Future<void> _deleteChat() async {
    try {
      await _chatService.deleteChat(widget.chat.id);

      // Also delete the contact if it exists
      if (_currentUserId != null && _contactUserId != null) {
        await _contactService.deleteContact(_currentUserId!, _contactUserId!);
      }

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Chat deleted successfully'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to delete chat: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  void _showWallpaperPicker() {
    final List<Map<String, dynamic>> predefinedWallpapers = [
      {'name': 'Default (Beige)', 'color': const Color(0xFFEAE2D8)},
      {'name': 'Dark Mode', 'color': const Color(0xFF0D1418)},
      {'name': 'Soft Blue', 'color': const Color(0xFFD9EEFB)},
      {'name': 'WhatsApp Green', 'color': const Color(0xFFD3EBCD)},
      {'name': 'Evening Purple', 'color': const Color(0xFFE3DCF1)},
      {'name': 'Solid Grey', 'color': const Color(0xFFE5E5E5)},
    ];

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return Container(
          padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
          height: _wallpaperImagePath != null ? 420 : 380,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Select Background',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (_wallpaperImagePath != null)
                    TextButton.icon(
                      onPressed: _clearWallpaperImage,
                      icon: const Icon(Icons.close),
                      label: const Text('Clear'),
                      style: TextButton.styleFrom(foregroundColor: Colors.red),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              // Upload photo button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _pickWallpaperImage,
                  icon: const Icon(Icons.image),
                  label: const Text('Upload Photo from Phone'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryBlue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Or choose a color:',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: GridView.builder(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                  ),
                  itemCount: predefinedWallpapers.length,
                  itemBuilder: (context, index) {
                    final wallpaper = predefinedWallpapers[index];
                    final color = wallpaper['color'] as Color;
                    final isSelected =
                        _wallpaperImagePath == null &&
                        _currentWallpaper.value == color.value;

                    return GestureDetector(
                      onTap: () async {
                        final prefs = await SharedPreferences.getInstance();
                        // Clear image wallpaper if selecting color
                        await prefs.remove(
                          'chat_wallpaper_image_${widget.chat.id}',
                        );
                        await prefs.setInt(
                          'chat_wallpaper_${widget.chat.id}',
                          color.value,
                        );
                        if (mounted) {
                          setState(() {
                            _currentWallpaper = color;
                            _wallpaperImagePath = null;
                          });
                          Navigator.pop(context);
                        }
                      },
                      child: Container(
                        decoration: BoxDecoration(
                          color: color,
                          borderRadius: BorderRadius.circular(12),
                          border: isSelected
                              ? Border.all(
                                  color: AppColors.primaryBlue,
                                  width: 3,
                                )
                              : Border.all(
                                  color: Colors.grey.shade300,
                                  width: 1,
                                ),
                        ),
                        child: isSelected
                            ? const Center(
                                child: Icon(
                                  Icons.check_circle,
                                  color: AppColors.primaryBlue,
                                ),
                              )
                            : null,
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final chatTitle = _getChatTitle();
    final initial = chatTitle.isNotEmpty ? chatTitle[0].toUpperCase() : 'U';

    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: _selectedMessageIds.isNotEmpty
          ? AppBar(
              backgroundColor: AppColors.primaryBlue,
              leading: IconButton(
                icon: const Icon(Icons.arrow_back, color: Colors.white),
                onPressed: () => setState(() => _selectedMessageIds.clear()),
              ),
              title: Text(
                '${_selectedMessageIds.length}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              actions: [
                IconButton(
                  icon: const Icon(Icons.reply, color: Colors.white),
                  onPressed: _selectedMessageIds.length == 1
                      ? () {
                          final msg = _messages.firstWhere(
                            (m) => m.id == _selectedMessageIds.first,
                          );
                          setState(() => _selectedMessageIds.clear());
                          _handleSwipeToReply(msg);
                        }
                      : null,
                ),
                IconButton(
                  icon: const Icon(Icons.copy, color: Colors.white),
                  onPressed: () {
                    final text = _messages
                        .where((m) => _selectedMessageIds.contains(m.id))
                        .map((m) => m.content ?? '')
                        .where((c) => c.isNotEmpty)
                        .join('\n\n');
                    if (text.isNotEmpty) {
                      Clipboard.setData(ClipboardData(text: text));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Copied to clipboard')),
                      );
                    }
                    setState(() => _selectedMessageIds.clear());
                  },
                ),
                IconButton(
                  icon: const Icon(Icons.delete, color: Colors.white),
                  onPressed: () => _confirmBulkDeleteMessages(),
                ),
                IconButton(
                  icon: const Icon(Icons.forward, color: Colors.white),
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Forwarding incoming soon')),
                    );
                    setState(() => _selectedMessageIds.clear());
                  },
                ),
              ],
            )
          : AppBar(
              backgroundColor: AppColors.primaryBlue,
              iconTheme: const IconThemeData(color: Colors.white),
              leading: const StandardBackButton(),
              titleSpacing: 0,
              title: GestureDetector(
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) =>
                          ContactInfoScreen(chat: widget.chat),
                    ),
                  );
                },
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          colors: [
                            Colors.orange.shade400,
                            Colors.deepOrange.shade400,
                          ],
                        ),
                        border: Border.all(
                          color: Colors.white.withOpacity(0.3),
                          width: 2,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          initial,
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            chatTitle,
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                              fontSize: 16,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            widget.chat.chatType == 'private'
                                ? 'Tap for contact info'
                                : 'Group Chat',
                            style: GoogleFonts.poppins(
                              color: Colors.white70,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                if (widget.chat.chatType == 'private' &&
                    widget.chat.otherParticipantId != null) ...[
                  IconButton(
                    icon: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.15),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.videocam_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
                    ),
                    onPressed: () => _initiateCall(isAudioOnly: false),
                    tooltip: 'Video call',
                  ),
                  IconButton(
                    icon: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.15),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.call_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
                    ),
                    onPressed: () => _initiateCall(isAudioOnly: true),
                    tooltip: 'Audio call',
                  ),
                ],
                PopupMenuButton<String>(
                  icon: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.more_vert,
                      color: Colors.white,
                      size: 20,
                    ),
                  ),
                  color: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  onSelected: (value) {
                    switch (value) {
                      case 'edit':
                        _editContactName();
                        break;
                      case 'delete':
                        _confirmDeleteChat();
                        break;
                      case 'search':
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Search in chat coming soon'),
                          ),
                        );
                        break;
                      case 'wallpaper':
                        _showWallpaperPicker();
                        break;
                    }
                  },
                  itemBuilder: (context) => [
                    if (widget.chat.chatType == 'private')
                      PopupMenuItem(
                        value: 'edit',
                        child: Row(
                          children: [
                            Icon(
                              Icons.edit_rounded,
                              color: Colors.grey[700],
                              size: 20,
                            ),
                            const SizedBox(width: 12),
                            const Text('Edit contact name'),
                          ],
                        ),
                      ),
                    PopupMenuItem(
                      value: 'search',
                      child: Row(
                        children: [
                          Icon(
                            Icons.search_rounded,
                            color: Colors.grey[700],
                            size: 20,
                          ),
                          const SizedBox(width: 12),
                          const Text('Search in chat'),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'wallpaper',
                      child: Row(
                        children: [
                          Icon(
                            Icons.wallpaper_rounded,
                            color: Colors.grey[700],
                            size: 20,
                          ),
                          const SizedBox(width: 12),
                          const Text('Wallpaper'),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'delete',
                      child: Row(
                        children: [
                          const Icon(
                            Icons.delete_outline_rounded,
                            color: Colors.red,
                            size: 20,
                          ),
                          const SizedBox(width: 12),
                          const Text(
                            'Delete chat',
                            style: TextStyle(color: Colors.red),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 4),
              ],
            ),
      body: Container(
        decoration:
            _wallpaperImagePath != null &&
                File(_wallpaperImagePath!).existsSync()
            ? BoxDecoration(
                image: DecorationImage(
                  image: FileImage(File(_wallpaperImagePath!)),
                  fit: BoxFit.cover,
                ),
              )
            : BoxDecoration(color: _currentWallpaper),
        child: Column(
          children: [
            // Messages list
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _messages.isEmpty
                  ? _buildEmptyState()
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      itemCount: _messages.length,
                      itemBuilder: (context, index) {
                        final message = _messages[index];
                        final isCurrentUser =
                            message.senderId == _currentUserId;

                        return _buildMessageBubble(message, isCurrentUser);
                      },
                    ),
            ),

            // Message input
            _isUploadingFile
                ? Container(
                    padding: const EdgeInsets.all(16),
                    color: Colors.white,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          'Uploading file...',
                          style: GoogleFonts.poppins(color: Colors.grey[600]),
                        ),
                      ],
                    ),
                  )
                : _isRecording
                ? _buildRecordingUI()
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _buildTypingIndicator(),
                      _buildReplyPreview(),
                      _buildMessageInputUI(),
                    ],
                  ),
          ],
        ),
      ),
    );
  }

  Widget _buildTypingIndicator() {
    if (!_isOtherUserTyping) return const SizedBox.shrink();
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
      alignment: Alignment.centerLeft,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
                width: 8,
                height: 8,
                margin: const EdgeInsets.only(right: 8),
                decoration: const BoxDecoration(
                  color: AppColors.primaryBlue,
                  shape: BoxShape.circle,
                ),
              )
              .animate(onPlay: (c) => c.repeat())
              .fadeIn(duration: 400.ms)
              .fadeOut(duration: 400.ms),
          Text(
            '${widget.chat.chatType == 'private' ? _getChatTitle() : 'Someone'} is typing...',
            style: GoogleFonts.poppins(
              color: Colors.grey.shade600,
              fontSize: 12,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecordingUI() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: const Border(
          top: BorderSide(color: Color(0xFFE0E0E0), width: 1),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.shade200,
            blurRadius: 4,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.delete, color: Colors.red),
            onPressed: _cancelRecording,
            tooltip: 'Cancel recording',
          ),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Row(
                children: [
                  Container(
                        width: 12,
                        height: 12,
                        decoration: const BoxDecoration(
                          color: Colors.red,
                          shape: BoxShape.circle,
                        ),
                      )
                      .animate(onPlay: (c) => c.repeat())
                      .fadeIn(duration: 500.ms)
                      .fadeOut(duration: 500.ms),
                  const SizedBox(width: 12),
                  Text(
                    'Recording ${_formatDuration(_recordingDuration)}',
                    style: GoogleFonts.poppins(
                      color: Colors.red.shade700,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF4CAF50), Color(0xFF66BB6A)],
              ),
              shape: BoxShape.circle,
            ),
            child: IconButton(
              icon: const Icon(Icons.send, color: Colors.white),
              onPressed: _stopRecording,
              tooltip: 'Send voice message',
            ),
          ),
        ],
      ),
    );
  }

  void _handleSwipeToReply(ChatMessage message) {
    setState(() {
      _replyingTo = message;
    });
  }

  Widget _buildReplyPreview() {
    if (_replyingTo == null) return const SizedBox.shrink();
    final senderName = _getSenderName(_replyingTo!.senderId);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: Colors.transparent,
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.9),
                borderRadius: BorderRadius.circular(12),
                border: const Border(
                  left: BorderSide(color: AppColors.primaryBlue, width: 4),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    senderName,
                    style: const TextStyle(
                      color: AppColors.primaryBlue,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _replyingTo!.content ?? '',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.black54, fontSize: 13),
                  ),
                ],
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close, color: Colors.grey),
            onPressed: () => setState(() => _replyingTo = null),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageInputUI() {
    return Container(
      color: Colors.transparent,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: SafeArea(
        bottom: true,
        top: false,
        left: false,
        right: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.05),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    IconButton(
                      icon: const Icon(
                        Icons.emoji_emotions_outlined,
                        color: Colors.grey,
                      ),
                      onPressed: _showEmojiPicker,
                      padding: const EdgeInsets.all(12),
                      constraints: const BoxConstraints(),
                    ),
                    Expanded(
                      child: TextField(
                        controller: _messageController,
                        focusNode: _messageFocusNode,
                        autofocus: false,
                        enabled: true,
                        keyboardType: TextInputType.multiline,
                        keyboardAppearance: Brightness.light,
                        showCursor: true,
                        onTap: () {
                          debugPrint(
                            '[ChatScreen] TextField tapped - showing keyboard',
                          );
                          FocusScope.of(
                            context,
                          ).requestFocus(_messageFocusNode);
                        },
                        decoration: const InputDecoration(
                          hintText: 'Message',
                          border: InputBorder.none,
                          contentPadding: EdgeInsets.symmetric(vertical: 12),
                          isCollapsed: true,
                        ),
                        minLines: 1,
                        maxLines: 5,
                        textInputAction: TextInputAction.send,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.attach_file, color: Colors.grey),
                      onPressed: _showAttachmentOptions,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 12,
                      ),
                      constraints: const BoxConstraints(),
                    ),
                    if (_messageController.text.trim().isEmpty)
                      IconButton(
                        icon: const Icon(Icons.camera_alt, color: Colors.grey),
                        onPressed: _pickImageFromCamera,
                        padding: const EdgeInsets.only(
                          right: 12,
                          top: 12,
                          bottom: 12,
                        ),
                        constraints: const BoxConstraints(),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              decoration: BoxDecoration(
                color: AppColors.primaryBlue,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.1),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: _messageController.text.trim().isEmpty && !kIsWeb
                  ? GestureDetector(
                      onLongPressStart: (_) => _startRecording(),
                      onLongPressEnd: (_) => _stopRecording(),
                      onTap: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Hold to record voice message'),
                            duration: Duration(seconds: 2),
                          ),
                        );
                      },
                      child: const Padding(
                        padding: EdgeInsets.all(12.0),
                        child: Icon(Icons.mic, color: Colors.white, size: 24),
                      ),
                    )
                  : IconButton(
                      icon: _isSending
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  Colors.white,
                                ),
                              ),
                            )
                          : const Icon(
                              Icons.send,
                              color: Colors.white,
                              size: 20,
                            ),
                      padding: const EdgeInsets.all(12),
                      constraints: const BoxConstraints(),
                      onPressed: _isSending ? null : _sendMessage,
                    ),
            ),
          ],
        ),
      ),
    );
  }

  void _insertEmoji(String emoji) {
    final currentText = _messageController.text;
    final selection = _messageController.selection;
    final hasValidSelection =
        selection.start >= 0 &&
        selection.end >= 0 &&
        selection.start <= selection.end &&
        selection.end <= currentText.length;

    if (!hasValidSelection) {
      final updated = '$currentText$emoji';
      _messageController.value = TextEditingValue(
        text: updated,
        selection: TextSelection.collapsed(offset: updated.length),
      );
      return;
    }

    final start = selection.start;
    final end = selection.end;
    final updated = currentText.replaceRange(start, end, emoji);
    final newOffset = start + emoji.length;

    _messageController.value = TextEditingValue(
      text: updated,
      selection: TextSelection.collapsed(offset: newOffset),
    );
  }

  void _showEmojiPicker() {
    final emojis = <String>[
      '😀',
      '😁',
      '😂',
      '🤣',
      '😊',
      '😍',
      '😘',
      '😉',
      '😎',
      '🤔',
      '😢',
      '😭',
      '😡',
      '👍',
      '👏',
      '🙏',
      '🔥',
      '❤️',
      '💔',
      '🎉',
      '✅',
      '👌',
      '🤝',
      '💪',
    ];

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Select Emoji',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 220,
                  child: GridView.builder(
                    itemCount: emojis.length,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 6,
                          crossAxisSpacing: 8,
                          mainAxisSpacing: 8,
                        ),
                    itemBuilder: (context, index) {
                      final emoji = emojis[index];
                      return InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: () {
                          _insertEmoji(emoji);
                          Navigator.pop(sheetContext);
                          FocusScope.of(context).requestFocus(_messageFocusNode);
                        },
                        child: Center(
                          child: Text(
                            emoji,
                            style: const TextStyle(fontSize: 26),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildMessageContent(ChatMessage message, bool isCurrentUser) {
    final content = message.content ?? '';
    final textColor = Colors.black87;

    // Check contentType first for proper message type detection
    if (message.contentType == 'audio') {
      // Audio messages are stored as JSON with url, duration, fileName
      try {
        final audioData = jsonDecode(content);
        final url = audioData['url'] as String? ?? '';
        if (url.isNotEmpty) {
          return _buildVoiceMessagePlayer(url, isCurrentUser);
        }
      } catch (e) {
        debugPrint('Error parsing audio message: $e');
        // Fall through to legacy format check
      }
    }

    if (content.startsWith('[Image]')) {
      final url = content.replaceFirst('[Image] ', '');
      return GestureDetector(
        onTap: () => _showFullImage(url),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            url,
            width: 200,
            height: 200,
            fit: BoxFit.cover,
            loadingBuilder: (context, child, progress) {
              if (progress == null) return child;
              return Container(
                width: 200,
                height: 200,
                color: Colors.grey[200],
                child: const Center(child: CircularProgressIndicator()),
              );
            },
            errorBuilder: (context, error, stack) {
              return Container(
                width: 200,
                height: 100,
                color: Colors.grey[200],
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.broken_image, color: Colors.grey[500]),
                    const SizedBox(height: 4),
                    Text(
                      'Image unavailable',
                      style: TextStyle(color: Colors.grey[500], fontSize: 12),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      );
    } else if (content.startsWith('[Voice Message]')) {
      // Legacy format support
      final url = content.replaceFirst('[Voice Message] ', '');
      return _buildVoiceMessagePlayer(url, isCurrentUser);
    } else if (content.startsWith('[Document]')) {
      final parts = content.replaceFirst('[Document] ', '').split('\n');
      final fileName = parts.isNotEmpty ? parts[0] : 'Document';
      final url = parts.length > 1 ? parts[1] : '';
      return GestureDetector(
        onTap: () => _openDocument(url, fileName),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isCurrentUser
                ? Colors.white.withOpacity(0.2)
                : Colors.grey[100],
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.insert_drive_file,
                color: isCurrentUser ? Colors.white : Colors.blue,
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  fileName,
                  style: TextStyle(
                    color: textColor,
                    fontWeight: FontWeight.w500,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      );
    }

    final urlRegex = RegExp(r"(https?:\/\/[^\s]+)", caseSensitive: false);
    final hasUrl = urlRegex.hasMatch(content);
    String? firstUrl;
    if (hasUrl) {
      firstUrl = urlRegex.firstMatch(content)?.group(0);
    }

    if (hasUrl && firstUrl != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (content != firstUrl)
            Padding(
              padding: const EdgeInsets.only(bottom: 6.0),
              child: Text(
                content,
                style: TextStyle(color: textColor, fontSize: 16),
              ),
            ),
          AnyLinkPreview(
            link: firstUrl,
            displayDirection: UIDirection.uiDirectionVertical,
            bodyMaxLines: 3,
            bodyTextOverflow: TextOverflow.ellipsis,
            titleStyle: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 14,
              color: Colors.black87,
            ),
            bodyStyle: const TextStyle(color: Colors.black54, fontSize: 12),
            errorWidget: Container(
              color: Colors.grey.shade200,
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  const Icon(Icons.link),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      firstUrl,
                      style: const TextStyle(color: Colors.blue),
                    ),
                  ),
                ],
              ),
            ),
            errorImage: "https://via.placeholder.com/150",
            backgroundColor: isCurrentUser
                ? const Color(0xFFC7F1C1)
                : Colors.grey.shade100,
            borderRadius: 8,
            boxShadow: [
              BoxShadow(blurRadius: 2, color: Colors.black.withOpacity(0.05)),
            ],
          ),
        ],
      );
    }

    return Text(content, style: TextStyle(color: textColor, fontSize: 16));
  }

  Widget _buildVoiceMessagePlayer(String url, bool isCurrentUser) {
    return _VoiceMessagePlayer(
      key: ValueKey(url),
      url: url,
      isCurrentUser: isCurrentUser,
    );
  }

  void _showFullImage(String url) {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.transparent,
        child: GestureDetector(
          onTap: () => Navigator.pop(context),
          child: InteractiveViewer(
            child: Image.network(
              url,
              fit: BoxFit.contain,
              errorBuilder: (context, error, stack) {
                return Container(
                  color: Colors.black,
                  child: const Center(
                    child: Text(
                      'Failed to load image',
                      style: TextStyle(color: Colors.white),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openDocument(String url, String fileName) async {
    if (url.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Document URL not available')),
      );
      return;
    }

    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('Cannot open: $fileName')));
        }
      }
    } catch (e) {
      debugPrint('Error opening document: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to open: $fileName')));
      }
    }
  }

  Widget _buildMessageBubble(ChatMessage message, bool isCurrentUser) {
    final senderName = _getSenderName(message.senderId);
    final isSelected = _selectedMessageIds.contains(message.id);

    // WhatsApp bubble colors (Modern Web/iOS)
    final bubbleColor = isSelected
        ? const Color(0xFFE1F5FE)
        : (isCurrentUser ? const Color(0xFFD9FDD3) : Colors.white);

    Widget bubbleWidget = Align(
      alignment: isCurrentUser ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: () {
          if (_selectedMessageIds.isEmpty) {
            setState(() => _selectedMessageIds.add(message.id));
          } else {
            _showMessageOptions(message, isCurrentUser);
          }
        },
        onTap: () {
          if (_selectedMessageIds.isNotEmpty) {
            setState(() {
              if (_selectedMessageIds.contains(message.id)) {
                _selectedMessageIds.remove(message.id);
              } else {
                _selectedMessageIds.add(message.id);
              }
            });
          }
        },
        child: Container(
          margin: EdgeInsets.only(
            bottom: 4,
            top: 2,
            left: isCurrentUser ? 0 : 8,
            right: isCurrentUser ? 8 : 0,
          ),
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.75,
          ),
          padding: EdgeInsets.only(
            left: message.contentType == 'audio' ? 4 : 10,
            right: message.contentType == 'audio' ? 4 : 10,
            top: 6,
            bottom: message.contentType == 'audio' ? 4 : 8,
          ),
          decoration: BoxDecoration(
            color: bubbleColor,
            borderRadius: BorderRadius.only(
              topLeft: isCurrentUser
                  ? const Radius.circular(12)
                  : const Radius.circular(0),
              topRight: isCurrentUser
                  ? const Radius.circular(0)
                  : const Radius.circular(12),
              bottomLeft: const Radius.circular(12),
              bottomRight: const Radius.circular(12),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.08),
                blurRadius: 1,
                offset: const Offset(0, 1),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!isCurrentUser && widget.chat.chatType == 'group')
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(
                    senderName,
                    style: TextStyle(
                      color: Colors.blue.shade700,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              if (message.metadata != null &&
                  message.metadata!['reply_to'] != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: isCurrentUser
                        ? Colors.white.withOpacity(0.5)
                        : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(8),
                    border: const Border(
                      left: BorderSide(color: AppColors.primaryBlue, width: 4),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        message.metadata!['reply_to']['senderName'] ?? '',
                        style: const TextStyle(
                          color: AppColors.primaryBlue,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        message.metadata!['reply_to']['content'] ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.black54,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              Wrap(
                alignment: WrapAlignment.end,
                crossAxisAlignment: WrapCrossAlignment.end,
                children: [
                  _buildMessageContent(message, isCurrentUser),
                  Padding(
                    padding: EdgeInsets.only(
                      left: 8.0,
                      top: message.contentType == 'audio' ? 0 : 4.0,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _formatMessageTime(message.createdAt),
                          style: TextStyle(
                            color: Colors.grey.shade600,
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        if (isCurrentUser)
                          Padding(
                            padding: const EdgeInsets.only(left: 8.0),
                            child: Tooltip(
                              message: message.status == 'read'
                                  ? 'Read'
                                  : message.status == 'delivered'
                                  ? 'Delivered'
                                  : 'Sent',
                              child: Icon(
                                message.status == 'read' ||
                                        message.status == 'delivered'
                                    ? Icons.done_all
                                    : Icons.done,
                                size: 18,
                                weight: 600,
                                color: message.status == 'read'
                                    ? const Color(0xFF007AFF) // Blue - read
                                    : message.status == 'delivered'
                                    ? Colors
                                          .grey
                                          .shade500 // Light gray - delivered
                                    : Colors
                                          .grey
                                          .shade400, // Lighter gray - sent
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              _buildReactions(message),
            ],
          ),
        ),
      ).animate().fadeIn(duration: 300.ms),
    );

    return Dismissible(
      key: Key('reply_${message.id}'),
      direction: DismissDirection.startToEnd,
      background: Container(
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.only(left: 20),
        child: const Icon(Icons.reply, color: Colors.grey),
      ),
      confirmDismiss: (direction) async {
        _handleSwipeToReply(message);
        return false; // False snaps it back visually
      },
      child: bubbleWidget,
    );
  }

  Widget _buildReactions(ChatMessage message) {
    if (message.metadata == null || message.metadata!['reactions'] == null) {
      return const SizedBox.shrink();
    }

    final reactions = Map<String, dynamic>.from(message.metadata!['reactions']);
    if (reactions.isEmpty) return const SizedBox.shrink();

    final counts = <String, int>{};
    for (final emoji in reactions.values) {
      counts[emoji.toString()] = (counts[emoji.toString()] ?? 0) + 1;
    }

    return Container(
      margin: const EdgeInsets.only(top: 2),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade300),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 2,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: counts.entries.map((e) {
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: Text(
              '${e.key} ${e.value > 1 ? e.value : ""}'.trim(),
              style: const TextStyle(fontSize: 12),
            ),
          );
        }).toList(),
      ),
    );
  }

  Future<void> _toggleReaction(ChatMessage message, String emoji) async {
    final currentUserId = _currentUserId;
    if (currentUserId == null) return;

    final metadata = Map<String, dynamic>.from(message.metadata ?? {});
    final reactions = Map<String, dynamic>.from(metadata['reactions'] ?? {});

    if (reactions[currentUserId] == emoji) {
      reactions.remove(currentUserId);
    } else {
      reactions[currentUserId] = emoji;
    }
    metadata['reactions'] = reactions;

    setState(() => message.metadata = metadata);
    await _chatService.updateMessageMetadata(message.id, metadata);
  }

  void _showMessageOptions(ChatMessage message, bool isCurrentUser) {
    final List<String> emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Container(
          margin: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(color: Colors.grey.shade200),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: emojis.map((emoji) {
                    return GestureDetector(
                      onTap: () {
                        Navigator.pop(context);
                        _toggleReaction(message, emoji);
                      },
                      child: Text(emoji, style: const TextStyle(fontSize: 28)),
                    );
                  }).toList(),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.reply, color: Colors.blue),
                title: Text('Reply', style: GoogleFonts.poppins()),
                onTap: () {
                  Navigator.pop(context);
                  _handleSwipeToReply(message);
                },
              ),
              if (message.content != null && message.content!.isNotEmpty)
                ListTile(
                  leading: const Icon(Icons.copy, color: Colors.grey),
                  title: Text('Copy', style: GoogleFonts.poppins()),
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: message.content!));
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Copied to clipboard')),
                    );
                  },
                ),
              if (isCurrentUser)
                ListTile(
                  leading: const Icon(Icons.delete, color: Colors.red),
                  title: Text(
                    'Delete',
                    style: GoogleFonts.poppins(color: Colors.red),
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    _confirmDeleteMessage(message);
                  },
                ),
            ],
          ),
        );
      },
    );
  }

  // Confirm and delete multiple messages
  Future<void> _confirmBulkDeleteMessages() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          'Delete Messages',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        content: Text(
          'Delete ${_selectedMessageIds.length} messages?',
          style: GoogleFonts.poppins(),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text('Cancel', style: GoogleFonts.poppins()),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            child: Text(
              'Delete',
              style: GoogleFonts.poppins(color: Colors.white),
            ),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      final idsToDelete = _selectedMessageIds.toList();
      setState(() => _selectedMessageIds.clear());

      // Update UI optimistically
      setState(() {
        _messages.removeWhere((m) => idsToDelete.contains(m.id));
      });

      for (var id in idsToDelete) {
        try {
          await _chatService.deleteMessage(id);
        } catch (e) {
          /* ignore individual fails broadly */
        }
      }
    }
  }

  // Confirm and delete a single message
  Future<void> _confirmDeleteMessage(ChatMessage message) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          'Delete Message',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        content: Text(
          'Are you sure you want to delete this message?',
          style: GoogleFonts.poppins(),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text('Cancel', style: GoogleFonts.poppins()),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(
              'Delete',
              style: GoogleFonts.poppins(color: Colors.white),
            ),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await _deleteMessage(message);
    }
  }

  // Delete a single message
  Future<void> _deleteMessage(ChatMessage message) async {
    try {
      await _chatService.deleteMessage(message.id);

      setState(() {
        _messages.removeWhere((m) => m.id == message.id);
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Message deleted'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to delete message: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [
                  Color(0xFFFF9800), // Orange
                  Color(0xFFFFB74D), // Light orange
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFFF9800).withOpacity(0.3),
                  blurRadius: 12,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: const Icon(
              Icons.chat_bubble_outline,
              size: 60,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'No messages yet',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Color(0xFF263238),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Start the conversation!',
            style: TextStyle(
              fontSize: 16,
              color: const Color(0xFF263238).withOpacity(0.7),
            ),
          ),
        ],
      ),
    );
  }

  String _formatMessageTime(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);

    if (difference.inDays == 0) {
      return '${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
    } else if (difference.inDays == 1) {
      return 'Yesterday';
    } else if (difference.inDays < 7) {
      return '${difference.inDays} days ago';
    } else {
      return '${dateTime.day}/${dateTime.month}/${dateTime.year}';
    }
  }
}

class _VoiceMessagePlayer extends StatefulWidget {
  final String url;
  final bool isCurrentUser;

  const _VoiceMessagePlayer({
    super.key,
    required this.url,
    required this.isCurrentUser,
  });

  @override
  State<_VoiceMessagePlayer> createState() => _VoiceMessagePlayerState();
}

class _VoiceMessagePlayerState extends State<_VoiceMessagePlayer> {
  late AudioPlayer _audioPlayer;
  bool _isPlaying = false;
  Duration _position = Duration.zero;
  Duration _duration = const Duration(seconds: 30);
  StreamSubscription<Duration>? _positionSub;
  StreamSubscription<Duration>? _durationSub;
  StreamSubscription<PlayerState>? _stateSub;
  late List<double> _dummyAmplitudes;

  @override
  void initState() {
    super.initState();
    _audioPlayer = AudioPlayer();
    _setupListeners();
    _generateDummyWaveform();
  }

  void _generateDummyWaveform() {
    final random = math.Random(widget.url.hashCode);
    _dummyAmplitudes = List.generate(40, (index) {
      final normalized = index / 40;
      final bell = math.sin(normalized * math.pi);
      final noise = random.nextDouble() * 0.5 + 0.5;
      return (bell * noise * 0.8 + 0.2).clamp(0.1, 1.0);
    });
  }

  void _setupListeners() {
    _positionSub = _audioPlayer.onPositionChanged.listen((pos) {
      if (mounted) setState(() => _position = pos);
    });
    _durationSub = _audioPlayer.onDurationChanged.listen((dur) {
      if (mounted) setState(() => _duration = dur);
    });
    _stateSub = _audioPlayer.onPlayerStateChanged.listen((state) {
      if (mounted) {
        setState(() {
          _isPlaying = state == PlayerState.playing;
        });
      }
    });
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _durationSub?.cancel();
    _stateSub?.cancel();
    _audioPlayer.dispose();
    super.dispose();
  }

  Future<void> _togglePlay() async {
    try {
      if (_isPlaying) {
        await _audioPlayer.pause();
      } else {
        await _audioPlayer.play(UrlSource(widget.url));
      }
    } catch (e) {
      debugPrint('Error toggling audio playback: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final progress = _duration.inMilliseconds > 0
        ? _position.inMilliseconds / _duration.inMilliseconds
        : 0.0;

    // WhatsApp voice message UI
    return Container(
      width: 240, // Fixed comfortable width for voice notes
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          GestureDetector(
            onTap: _togglePlay,
            child: Icon(
              _isPlaying ? Icons.pause_circle_filled : Icons.play_circle_fill,
              color: widget.isCurrentUser
                  ? const Color(0xFF5BA794)
                  : Colors.grey.shade400,
              size: 42,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  height: 24,
                  width: double.infinity,
                  child: CustomPaint(
                    painter: _WaveformPainter(
                      amplitudes: _dummyAmplitudes,
                      progress: progress.clamp(0.0, 1.0),
                      playedColor: widget.isCurrentUser
                          ? const Color(0xFF5BA794)
                          : Colors.grey.shade400,
                      unplayedColor: widget.isCurrentUser
                          ? const Color(0xFF90C1A3).withOpacity(0.5)
                          : Colors.grey.shade300,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _isPlaying
                          ? _formatDur(_position)
                          : _formatDur(_duration),
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.grey.shade600,
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
    );
  }

  String _formatDur(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}

class _WaveformPainter extends CustomPainter {
  final List<double> amplitudes;
  final double progress;
  final Color playedColor;
  final Color unplayedColor;

  _WaveformPainter({
    required this.amplitudes,
    required this.progress,
    required this.playedColor,
    required this.unplayedColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (amplitudes.isEmpty) return;

    final paint = Paint()
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.fill;

    final totalBars = amplitudes.length;
    final spacing = 2.0;

    // Calculate dynamic bar width based on available space
    final availableWidth = size.width - (spacing * (totalBars - 1));
    final barWidth = availableWidth / totalBars;
    paint.strokeWidth = barWidth > 3.0
        ? 3.0
        : (barWidth < 1.0 ? 1.0 : barWidth);

    for (int i = 0; i < totalBars; i++) {
      final x = i * (paint.strokeWidth + spacing);
      final isPlayed = (i / totalBars) <= progress;

      paint.color = isPlayed ? playedColor : unplayedColor;

      final barHeight = (amplitudes[i] * size.height).clamp(2.0, size.height);
      final yOffset = (size.height - barHeight) / 2;

      canvas.drawLine(
        Offset(x, yOffset),
        Offset(x, yOffset + barHeight),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _WaveformPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.amplitudes != amplitudes ||
        oldDelegate.playedColor != playedColor ||
        oldDelegate.unplayedColor != unplayedColor;
  }
}
