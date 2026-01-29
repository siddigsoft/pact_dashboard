// lib/screens/chat_screen.dart

import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';

import 'package:path_provider/path_provider.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:record/record.dart';
import 'package:uuid/uuid.dart';
import '../models/chat.dart';
import '../models/chat_message.dart';
import '../models/chat_participant.dart';
import '../models/chat_contact.dart';
import '../services/chat_service.dart';
import '../services/chat_contact_service.dart';
import '../services/webrtc_service.dart';
import '../screens/call_screen.dart';
import '../theme/app_colors.dart';
import '../utils/error_handler.dart';

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
  final ScrollController _scrollController = ScrollController();
  final ImagePicker _imagePicker = ImagePicker();
  final AudioPlayer _audioPlayer = AudioPlayer();
  final AudioRecorder _audioRecorder = AudioRecorder();
  List<ChatMessage> _messages = [];
  bool _isLoading = true;
  bool _isSending = false;
  bool _isRecording = false;
  bool _isUploadingFile = false;
  String? _recordingPath;
  Duration _recordingDuration = Duration.zero;
  Timer? _recordingTimer;
  String? _currentUserId;
  List<ChatParticipant> _participants = [];
  bool _participantsLoaded = false;
  ChatContact? _chatContact;
  String? _contactUserId;
  RealtimeChannel? _messageChannel;

  @override
  void initState() {
    super.initState();
    _currentUserId = Supabase.instance.client.auth.currentUser?.id;
    _loadMessages();
    _loadParticipants();
    _loadContactInfo();
    _markMessagesAsRead();
    _subscribeToMessages();
    _messageController.addListener(_onMessageTextChanged);
  }

  void _onMessageTextChanged() {
    if (mounted) {
      setState(() {});
    }
  }

  @override
  void dispose() {
    _messageChannel?.unsubscribe();
    _messageController.removeListener(_onMessageTextChanged);
    _messageController.dispose();
    _scrollController.dispose();
    _recordingTimer?.cancel();
    _audioPlayer.dispose();
    _audioRecorder.dispose();
    super.dispose();
  }

  Future<void> _loadMessages() async {
    final messages = await _chatService.getChatMessages(widget.chat.id);

    setState(() {
      _messages = messages; // Messages already ordered by created_at ascending (oldest first)
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
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'chat_messages',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'chat_id',
            value: widget.chat.id,
          ),
          callback: (payload) {
            final newMessage = ChatMessage.fromJson(payload.newRecord);
            // Only add if not already in list (avoid duplicates from own sent messages)
            if (!_messages.any((m) => m.id == newMessage.id)) {
              setState(() {
                _messages.add(newMessage);
              });
              // Scroll to bottom when new message arrives
              WidgetsBinding.instance.addPostFrameCallback((_) {
                _scrollToBottom();
              });
              // Mark as read if from other user
              if (newMessage.senderId != _currentUserId) {
                _markMessagesAsRead();
              }
            }
          },
        )
        .subscribe();
  }

  Future<void> _loadParticipants() async {
  final participants =
    await _chatService.getChatParticipants(widget.chat.id);
    // Debug: print participants loaded
    // ignore: avoid_print
    print('_loadParticipants for ${widget.chat.id}: $participants');

    final updatedParticipants = List<ChatParticipant>.from(participants);

    if (widget.chat.otherParticipantId != null &&
        !updatedParticipants.any(
          (participant) =>
              participant.userId == widget.chat.otherParticipantId,
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
      final contact =
          await _contactService.getContact(_currentUserId!, _contactUserId!);

      // If contact doesn't exist, create it with default name
      if (contact == null && _contactUserId!.isNotEmpty) {
        final defaultName =
            await _contactService.fetchUserProfileName(_contactUserId!);
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
  }

  Future<void> _sendMessage() async {
    final content = _messageController.text.trim();
    if (content.isEmpty || _isSending) return;

    setState(() => _isSending = true);

    try {
      final message = await _chatService.sendMessage(widget.chat.id, content);
      if (message != null) {
        setState(() {
          _messages.add(message);
        });
        _messageController.clear();
        _scrollToBottom();
      }
    } catch (e) {
      if (mounted) {
        context.showError(e, onRetry: _sendMessage);
      }
    } finally {
      setState(() => _isSending = false);
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
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: Colors.grey[700],
            ),
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to capture image: $e')),
        );
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to select image: $e')),
        );
      }
    }
  }

  Future<void> _pickDocument() async {
    // Document picking is currently disabled - use image picker instead
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please use gallery or camera to share files')),
      );
    }
  }

  Future<void> _uploadFile(File file, String fileType) async {
    setState(() => _isUploadingFile = true);

    try {
      final fileName = '${DateTime.now().millisecondsSinceEpoch}_${file.path.split('/').last}';
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

      final message = await _chatService.sendMessage(widget.chat.id, messageContent);
      if (message != null) {
        setState(() {
          _messages.add(message);
        });
        _scrollToBottom();
      }
    } catch (e) {
      debugPrint('Error uploading file: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to upload file: $e')),
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
              content: Text('Microphone permission is required to record voice messages'),
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

      // Get temp directory for recording
      final directory = await getTemporaryDirectory();
      final fileName = 'voice_${const Uuid().v4()}.m4a';
      _recordingPath = '${directory.path}/$fileName';

      // Start recording with AAC encoder
      await _audioRecorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 128000,
          sampleRate: 44100,
        ),
        path: _recordingPath!,
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
      
      if (!_isRecording || _recordingPath == null) {
        if (mounted) setState(() => _isRecording = false);
        return;
      }

      // Capture duration before resetting
      final recordedDuration = _recordingDuration;
      
      // Stop recording and get the path
      final path = await _audioRecorder.stop();
      
      if (path != null && path.isNotEmpty) {
        debugPrint('[ChatScreen] Recording stopped, uploading: $path');
        
        // Store duration temporarily for upload
        _recordingDuration = recordedDuration;
        
        // Upload the voice message
        await _uploadVoiceMessage(path);
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
  
  Future<void> _uploadVoiceMessage(String filePath) async {
    try {
      setState(() => _isSending = true);
      
      final file = File(filePath);
      if (!await file.exists()) {
        throw Exception('Recording file not found');
      }
      
      final bytes = await file.readAsBytes();
      final fileName = 'voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      final storagePath = 'chat_audio/${widget.chat.id}/$fileName';
      
      // Upload to Supabase Storage using the same bucket as other attachments
      await Supabase.instance.client.storage
          .from('chat-attachments')
          .uploadBinary(storagePath, bytes, fileOptions: const FileOptions(contentType: 'audio/mp4'));
      
      // Get signed URL (same approach as existing file uploads)
      final signedUrl = await Supabase.instance.client.storage
          .from('chat-attachments')
          .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year
      
      // Send as audio message
      final durationSeconds = _recordingDuration.inSeconds;
      final metadata = {
        'duration': durationSeconds,
        'mimeType': 'audio/mp4',
        'fileName': fileName,
        'storagePath': storagePath,
      };
      
      await _chatService.sendMessage(
        chatId: widget.chat.id,
        content: 'Voice message (${_formatDuration(_recordingDuration)})',
        messageType: 'audio',
        attachmentUrl: signedUrl,
        metadata: metadata,
      );
      
      // Delete temp file
      try {
        await file.delete();
      } catch (e) {
        debugPrint('[ChatScreen] Failed to delete temp file: $e');
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

      if (_recordingPath != null) {
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
            final currentIndex =
                _participants.indexWhere((p) => p.userId == _currentUserId);
            final otherIndex = currentIndex == 0 ? 1 : 0;
            found = _participants[otherIndex];
          }
        } else {
          found =
              _participants.length > 1 ? _participants[1] : _participants.first;
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
      return widget.chat.name ?? 'Group Chat';
    }
  }

  // Initiate audio or video call
  Future<void> _initiateCall({required bool isAudioOnly}) async {
    if (widget.chat.otherParticipantId == null) {
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

    try {
      final targetUserId = widget.chat.otherParticipantId!;
      final targetUserName = _getChatTitle();
      
      // Check if WebRTC service is initialized
      final webrtcService = WebRTCService();
      
      // Initiate the call
      final success = await webrtcService.initiateCall(
        targetUserId,
        targetUserName,
        isAudioOnly: isAudioOnly,
      );

      if (success && mounted) {
        // Navigate to call screen
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => CallScreen(
              remoteUserName: targetUserName,
            ),
          ),
        );
      } else if (!success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('User is busy or unavailable'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } catch (e) {
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
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
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
            child:
                Text('Save', style: GoogleFonts.poppins(color: Colors.white)),
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
            child:
                Text('Delete', style: GoogleFonts.poppins(color: Colors.white)),
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

  @override
  Widget build(BuildContext context) {
    final chatTitle = _getChatTitle();
    final initial = chatTitle.isNotEmpty ? chatTitle[0].toUpperCase() : 'U';
    
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        elevation: 0,
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        systemOverlayStyle: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light,
        ),
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
        titleSpacing: 0,
        title: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: [Colors.orange.shade400, Colors.deepOrange.shade400],
                ),
                border: Border.all(color: Colors.white.withOpacity(0.3), width: 2),
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
                    widget.chat.chatType == 'private' ? 'Tap for contact info' : 'Group Chat',
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
        actions: [
          if (widget.chat.chatType == 'private' && widget.chat.otherParticipantId != null) ...[
            IconButton(
              icon: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.videocam_rounded, color: Colors.white, size: 20),
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
                child: const Icon(Icons.call_rounded, color: Colors.white, size: 20),
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
              child: const Icon(Icons.more_vert, color: Colors.white, size: 20),
            ),
            color: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
                    const SnackBar(content: Text('Search in chat coming soon')),
                  );
                  break;
              }
            },
            itemBuilder: (context) => [
              if (widget.chat.chatType == 'private')
                PopupMenuItem(
                  value: 'edit',
                  child: Row(
                    children: [
                      Icon(Icons.edit_rounded, color: Colors.grey[700], size: 20),
                      const SizedBox(width: 12),
                      const Text('Edit contact name'),
                    ],
                  ),
                ),
              PopupMenuItem(
                value: 'search',
                child: Row(
                  children: [
                    Icon(Icons.search_rounded, color: Colors.grey[700], size: 20),
                    const SizedBox(width: 12),
                    const Text('Search in chat'),
                  ],
                ),
              ),
              PopupMenuItem(
                value: 'delete',
                child: Row(
                  children: [
                    const Icon(Icons.delete_outline_rounded, color: Colors.red, size: 20),
                    const SizedBox(width: 12),
                    const Text('Delete chat', style: TextStyle(color: Colors.red)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: Column(
        children: [
          // Messages list
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                    ? _buildEmptyState()
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(16),
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
                  : _buildMessageInputUI(),
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
                  ).animate(onPlay: (c) => c.repeat())
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

  Widget _buildMessageInputUI() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
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
      child: SafeArea(
        child: Row(
          children: [
            IconButton(
              icon: const Icon(Icons.attach_file, color: Color(0xFFFF9800)),
              onPressed: _showAttachmentOptions,
              tooltip: 'Attach file',
            ),
            Expanded(
              child: TextField(
                controller: _messageController,
                decoration: InputDecoration(
                  hintText: 'Type a message...',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: const Color(0xFFF8F9FA),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                ),
                maxLines: null,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _sendMessage(),
              ),
            ),
            const SizedBox(width: 4),
            _messageController.text.trim().isEmpty
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
                    child: Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFFFF9800), Color(0xFFFFB74D)],
                        ),
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFFFF9800).withOpacity(0.3),
                            blurRadius: 6,
                            offset: const Offset(0, 3),
                          ),
                        ],
                      ),
                      child: const Icon(Icons.mic, color: Colors.white),
                    ),
                  )
                : Container(
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFFFF9800), Color(0xFFFFB74D)],
                      ),
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFFFF9800).withOpacity(0.3),
                          blurRadius: 6,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: IconButton(
                      icon: _isSending
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor:
                                    AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : const Icon(Icons.send, color: Colors.white),
                      onPressed: _isSending ? null : _sendMessage,
                    ),
                  ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageContent(ChatMessage message, bool isCurrentUser) {
    final content = message.content ?? '';
    final textColor = isCurrentUser ? Colors.white : const Color(0xFF263238);

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
                    Text('Image unavailable', style: TextStyle(color: Colors.grey[500], fontSize: 12)),
                  ],
                ),
              );
            },
          ),
        ),
      );
    } else if (content.startsWith('[Voice Message]')) {
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
            color: isCurrentUser ? Colors.white.withOpacity(0.2) : Colors.grey[100],
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.insert_drive_file, color: isCurrentUser ? Colors.white : Colors.blue),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  fileName,
                  style: TextStyle(color: textColor, fontWeight: FontWeight.w500),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Text(
      content,
      style: TextStyle(color: textColor, fontSize: 16),
    );
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
                    child: Text('Failed to load image', style: TextStyle(color: Colors.white)),
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
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Cannot open: $fileName')),
          );
        }
      }
    } catch (e) {
      debugPrint('Error opening document: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to open: $fileName')),
        );
      }
    }
  }

  Widget _buildMessageBubble(ChatMessage message, bool isCurrentUser) {
    final senderName = _getSenderName(message.senderId);

    return Align(
      alignment: isCurrentUser ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: () => _confirmDeleteMessage(message),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.75,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            gradient: isCurrentUser
                ? const LinearGradient(
                    colors: [
                      Color(0xFFFF9800), // Orange
                      Color(0xFFFFB74D), // Light orange
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  )
                : null,
            color: isCurrentUser ? null : Colors.white,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(16),
              topRight: const Radius.circular(16),
              bottomLeft: isCurrentUser
                  ? const Radius.circular(16)
                  : const Radius.circular(4),
              bottomRight: isCurrentUser
                  ? const Radius.circular(4)
                  : const Radius.circular(16),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.grey.shade200,
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
            border: isCurrentUser
                ? null
                : Border.all(
                    color: const Color(0xFFFF9800).withOpacity(0.1),
                    width: 1,
                  ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Show sender name for group chats or non-current user
              if (!isCurrentUser || widget.chat.chatType == 'group')
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    senderName,
                    style: TextStyle(
                      color: isCurrentUser
                          ? Colors.white.withOpacity(0.9)
                          : const Color(0xFF1976D2), // Deep blue
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              _buildMessageContent(message, isCurrentUser),
              const SizedBox(height: 4),
              Text(
                _formatMessageTime(message.createdAt),
                style: TextStyle(
                  color: isCurrentUser
                      ? Colors.white.withOpacity(0.7)
                      : const Color(0xFF263238).withOpacity(0.6),
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ).animate().fadeIn(duration: 300.ms),
    );
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
            child:
                Text('Delete', style: GoogleFonts.poppins(color: Colors.white)),
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

  @override
  void initState() {
    super.initState();
    _audioPlayer = AudioPlayer();
    _setupListeners();
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

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          GestureDetector(
            onTap: _togglePlay,
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: widget.isCurrentUser
                    ? Colors.white.withOpacity(0.3)
                    : const Color(0xFFFF9800),
                shape: BoxShape.circle,
              ),
              child: Icon(
                _isPlaying ? Icons.pause : Icons.play_arrow,
                color: Colors.white,
                size: 20,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: LinearProgressIndicator(
                    value: progress.clamp(0.0, 1.0),
                    backgroundColor: widget.isCurrentUser
                        ? Colors.white.withOpacity(0.3)
                        : Colors.grey[300],
                    valueColor: AlwaysStoppedAnimation<Color>(
                      widget.isCurrentUser ? Colors.white : const Color(0xFFFF9800),
                    ),
                    minHeight: 4,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${_formatDur(_position)} / ${_formatDur(_duration)}',
                  style: TextStyle(
                    fontSize: 10,
                    color: widget.isCurrentUser
                        ? Colors.white.withOpacity(0.7)
                        : Colors.grey[500],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Icon(
            Icons.mic,
            size: 16,
            color: widget.isCurrentUser
                ? Colors.white.withOpacity(0.7)
                : Colors.grey[500],
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
