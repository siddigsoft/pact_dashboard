import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/chat_service.dart';
import '../theme/app_colors.dart';

class UserSelectionScreen extends StatefulWidget {
  const UserSelectionScreen({super.key});

  @override
  State<UserSelectionScreen> createState() => _UserSelectionScreenState();
}

class _UserSelectionScreenState extends State<UserSelectionScreen> {
  final ChatService _chatService = ChatService();
  List<Map<String, dynamic>> _users = [];
  bool _isLoading = true;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  Future<void> _loadUsers() async {
    setState(() => _isLoading = true);
    final users = await _chatService.getAllUsers();
    setState(() {
      _users = users;
      _isLoading = false;
    });
  }

  List<Map<String, dynamic>> get _filteredUsers {
    if (_searchQuery.isEmpty) return _users;

    return _users.where((user) {
      final name = user['full_name']?.toString().toLowerCase() ?? '';
      final email = user['email']?.toString().toLowerCase() ?? '';
      final query = _searchQuery.toLowerCase();

      return name.contains(query) || email.contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundGray,
      appBar: AppBar(
        title: Text(
          'Select User',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w600,
            color: AppColors.textDark,
          ),
        ),
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          color: AppColors.textDark,
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search users...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide:
                      BorderSide(color: AppColors.textLight.withOpacity(0.3)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide:
                      BorderSide(color: AppColors.textLight.withOpacity(0.3)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.primaryOrange),
                ),
                filled: true,
                fillColor: Colors.white,
              ),
              onChanged: (value) => setState(() => _searchQuery = value),
            ),
          ),

          // User list
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _filteredUsers.isEmpty
                    ? _buildEmptyState()
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: _filteredUsers.length,
                        itemBuilder: (context, index) {
                          final user = _filteredUsers[index];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: AppColors.primaryOrange,
                                child: Text(
                                  user['full_name']
                                          ?.toString()
                                          .substring(0, 1)
                                          .toUpperCase() ??
                                      '?',
                                  style: GoogleFonts.poppins(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              title: Text(
                                user['full_name'] ?? 'Unknown User',
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.textDark,
                                ),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    user['email'] ?? '',
                                    style: GoogleFonts.poppins(
                                      color: AppColors.textLight,
                                    ),
                                  ),
                                  Text(
                                    'Role: ${user['role'] ?? 'Unknown'}',
                                    style: GoogleFonts.poppins(
                                      color: AppColors.textLight,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                              onTap: () => Navigator.pop(context, user),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.people_outline,
            size: 80,
            color: AppColors.textLight.withOpacity(0.5),
          ),
          const SizedBox(height: 16),
          Text(
            _searchQuery.isEmpty
                ? 'No users found'
                : 'No users match your search',
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: AppColors.textLight,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _searchQuery.isEmpty
                ? 'There are no other users in the system'
                : 'Try adjusting your search terms',
            style: GoogleFonts.poppins(
              color: AppColors.textLight,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
