import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../theme/app_colors.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/app_widgets.dart';
import '../services/help_enhancements_service.dart';
import '../services/analytics_service.dart';
import 'support_ticket_detail_screen.dart';

class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen>
    with SingleTickerProviderStateMixin {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final _subjectController = TextEditingController();
  final _messageController = TextEditingController();
  late TabController _tabController;
  final HelpEnhancementsService _helpService = HelpEnhancementsService();

  List<SupportTicket> _tickets = [];
  bool _isLoading = true;
  bool _isSubmitting = false;
  String _selectedCategory = 'general';
  String _selectedPriority = 'medium';

  final List<Map<String, dynamic>> _categories = [
    {'value': 'general', 'label': 'General', 'icon': Icons.help_outline},
    {
      'value': 'technical',
      'label': 'Technical Issue',
      'icon': Icons.bug_report,
    },
    {'value': 'account', 'label': 'Account', 'icon': Icons.person},
    {'value': 'data', 'label': 'Data/Sync', 'icon': Icons.sync},
    {'value': 'feature', 'label': 'Feature Request', 'icon': Icons.lightbulb},
  ];

  final List<Map<String, dynamic>> _priorities = [
    {'value': 'low', 'label': 'Low', 'color': Colors.green},
    {'value': 'medium', 'label': 'Medium', 'color': Colors.orange},
    {'value': 'high', 'label': 'High', 'color': Colors.red},
  ];

  @override
  void initState() {
    super.initState();
    // Log screen view for analytics
    AnalyticsService.logScreenView('SupportScreen');
    _tabController = TabController(length: 2, vsync: this);
    _loadTickets();
  }

  @override
  void dispose() {
    _subjectController.dispose();
    _messageController.dispose();
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadTickets() async {
    try {
      final tickets = await _helpService.getMyTickets();
      if (mounted) {
        setState(() {
          _tickets = tickets;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading tickets: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
          _tickets = [];
        });
        AppSnackBar.show(
          context,
          message: 'Failed to load tickets. Pull to refresh.',
          type: SnackBarType.error,
        );
      }
    }
  }

  Future<void> _submitTicket() async {
    if (_subjectController.text.isEmpty || _messageController.text.isEmpty) {
      AppSnackBar.show(
        context,
        message: 'Please fill in both subject and message',
        type: SnackBarType.warning,
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final ticket = await _helpService.createTicket(
        subject: _subjectController.text,
        description: _messageController.text,
        category: _selectedCategory,
        priority: _selectedPriority,
      );

      _subjectController.clear();
      _messageController.clear();
      setState(() {
        _selectedCategory = 'general';
        _selectedPriority = 'medium';
      });

      AppSnackBar.show(
        context,
        message: 'Support ticket submitted successfully!',
        type: SnackBarType.success,
      );

      await _loadTickets();
      _tabController.animateTo(1);
      if (mounted && ticket != null) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) =>
                SupportTicketDetailScreen(ticketId: ticket.id),
          ),
        );
      }
    } catch (e) {
      debugPrint('Error submitting ticket: $e');
      AppSnackBar.show(
        context,
        message: 'Failed to submit ticket: $e',
        type: SnackBarType.error,
      );
    } finally {
      setState(() => _isSubmitting = false);
    }
  }

  Future<void> _sendEmail() async {
    if (_subjectController.text.isEmpty || _messageController.text.isEmpty) {
      AppSnackBar.show(
        context,
        message: 'Please fill in both subject and message',
        type: SnackBarType.warning,
      );
      return;
    }

    // Get app info for the email
    PackageInfo packageInfo = await PackageInfo.fromPlatform();

    final String formattedBody =
        '''
PACT Mobile Support Request
===========================

Hello Francis,

A user has submitted a support request through the PACT Mobile app.

SUBJECT: ${_subjectController.text}

MESSAGE:
${_messageController.text}

---
APP INFORMATION:
• App Version: ${packageInfo.version} (${packageInfo.buildNumber})
• Package Name: ${packageInfo.packageName}
• App Name: ${packageInfo.appName}
• Platform: ${Theme.of(context).platform == TargetPlatform.android
            ? 'Android'
            : Theme.of(context).platform == TargetPlatform.iOS
            ? 'iOS'
            : 'Unknown'}

TIMESTAMP: ${DateTime.now().toString()}

---
This email was generated automatically from the PACT Mobile app.
Please respond to the user directly if needed.

Best regards,
PACT Mobile Support System
''';

    final Uri emailLaunchUri = Uri(
      scheme: 'mailto',
      path: 'francis.b.kaz@gmail.com',
      queryParameters: {
        'subject': '[PACT Mobile Support] ${_subjectController.text}',
        'body': formattedBody,
      },
    );

    try {
      if (await canLaunchUrl(emailLaunchUri)) {
        await launchUrl(emailLaunchUri);
        AppSnackBar.show(
          context,
          message: 'Email client opened successfully',
          type: SnackBarType.success,
        );
      } else {
        AppSnackBar.show(
          context,
          message:
              'No email app found. Please send email to francis.b.kaz@gmail.com',
          type: SnackBarType.error,
        );
      }
    } catch (e) {
      AppSnackBar.show(
        context,
        message:
            'Unable to open email app. Please send email to francis.b.kaz@gmail.com',
        type: SnackBarType.error,
      );
    }
  }

  Future<void> _makePhoneCall() async {
    final Uri phoneUri = Uri(scheme: 'tel', path: '+211912345678');
    try {
      if (await canLaunchUrl(phoneUri)) {
        await launchUrl(phoneUri);
      } else {
        AppSnackBar.show(
          context,
          message: 'Unable to make phone call',
          type: SnackBarType.error,
        );
      }
    } catch (e) {
      AppSnackBar.show(
        context,
        message: 'Unable to make phone call',
        type: SnackBarType.error,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      drawer: CustomDrawerMenu(
        currentUser: null,
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
              ReusableAppBar(title: 'Support', scaffoldKey: _scaffoldKey),
              // Tab bar
              Container(
                margin: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: Colors.grey.shade200,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: TabBar(
                  controller: _tabController,
                  indicator: BoxDecoration(
                    color: AppColors.primaryBlue,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  labelColor: Colors.white,
                  unselectedLabelColor: AppColors.textDark,
                  labelStyle: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                  tabs: const [
                    Tab(text: 'New Ticket'),
                    Tab(text: 'My Tickets'),
                  ],
                ),
              ),
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [_buildNewTicketTab(), _buildMyTicketsTab()],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMyTicketsTab() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_tickets.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.inbox_rounded, size: 80, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              'No tickets yet',
              style: GoogleFonts.poppins(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: AppColors.textDark,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Submit a support request to get help',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: AppColors.textLight,
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadTickets,
      child: ListView.builder(
        padding: const EdgeInsets.all(20),
        itemCount: _tickets.length,
        itemBuilder: (context, index) {
          final ticket = _tickets[index];
          return _buildTicketCard(ticket);
        },
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'open':
        return Colors.blue;
      case 'in_progress':
      case 'waiting':
        return Colors.orange;
      case 'resolved':
        return Colors.green;
      case 'closed':
        return Colors.grey;
      default:
        return Colors.blue;
    }
  }

  Color _priorityColor(String priority) {
    switch (priority) {
      case 'high':
      case 'urgent':
        return Colors.red;
      case 'medium':
        return Colors.orange;
      case 'low':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  Widget _buildTicketCard(SupportTicket ticket) {
    return InkWell(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) =>
                SupportTicketDetailScreen(ticketId: ticket.id),
          ),
        );
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    ticket.subject,
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textDark,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: _statusColor(ticket.status).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    ticket.status.replaceAll('_', ' ').toUpperCase(),
                    style: GoogleFonts.poppins(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: _statusColor(ticket.status),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              ticket.description,
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: AppColors.textLight,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: _priorityColor(ticket.priority).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.flag,
                        size: 12,
                        color: _priorityColor(ticket.priority),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        ticket.priority.toUpperCase(),
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: _priorityColor(ticket.priority),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    ticket.category,
                    style: GoogleFonts.poppins(
                      fontSize: 10,
                      color: Colors.grey.shade700,
                    ),
                  ),
                ),
                const Spacer(),
                Text(
                  _formatDate(ticket.createdAt),
                  style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);

    if (diff.inDays == 0) {
      if (diff.inHours == 0) {
        return '${diff.inMinutes}m ago';
      }
      return '${diff.inHours}h ago';
    } else if (diff.inDays < 7) {
      return '${diff.inDays}d ago';
    } else {
      return '${date.day}/${date.month}/${date.year}';
    }
  }

  Widget _buildNewTicketTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Submit a Support Request',
            style: GoogleFonts.poppins(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: AppColors.textDark,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Describe your issue and we\'ll get back to you',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: AppColors.textLight,
            ),
          ),
          const SizedBox(height: 24),

          // Category Selection
          Text(
            'Category',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.textDark,
            ),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _categories.map((cat) {
                final isSelected = _selectedCategory == cat['value'];
                return GestureDetector(
                  onTap: () => setState(() => _selectedCategory = cat['value']),
                  child: Container(
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: isSelected ? AppColors.primaryBlue : Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: isSelected
                            ? AppColors.primaryBlue
                            : Colors.grey.shade300,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          cat['icon'],
                          size: 16,
                          color: isSelected ? Colors.white : AppColors.textDark,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          cat['label'],
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: isSelected
                                ? Colors.white
                                : AppColors.textDark,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 20),

          // Priority Selection
          Text(
            'Priority',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.textDark,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: _priorities.map((p) {
              final isSelected = _selectedPriority == p['value'];
              return Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _selectedPriority = p['value']),
                  child: Container(
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? (p['color'] as Color).withOpacity(0.15)
                          : Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected ? p['color'] : Colors.grey.shade300,
                        width: isSelected ? 2 : 1,
                      ),
                    ),
                    child: Column(
                      children: [
                        Icon(Icons.flag, color: p['color'], size: 20),
                        const SizedBox(height: 4),
                        Text(
                          p['label'],
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            fontWeight: isSelected
                                ? FontWeight.w600
                                : FontWeight.w500,
                            color: p['color'],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),

          // Subject
          Text(
            'Subject',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.textDark,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _subjectController,
            decoration: InputDecoration(
              hintText: 'Brief description of your issue',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Description
          Text(
            'Description',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.textDark,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _messageController,
            maxLines: 5,
            decoration: InputDecoration(
              hintText: 'Describe your issue in detail...',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Submit Button
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton(
              onPressed: _isSubmitting ? null : _submitTicket,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _isSubmitting
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : Text(
                      'Submit Ticket',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 32),

          // Contact Info
          _buildContactInfo(),
        ],
      ),
    );
  }

  Widget _buildContactInfo() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.blue.shade100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.info_outline, color: AppColors.primaryBlue),
              const SizedBox(width: 8),
              Text(
                'Need immediate help?',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primaryBlue,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'For urgent issues, you can also reach us at:',
            style: GoogleFonts.poppins(fontSize: 13, color: AppColors.textDark),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.email, size: 16, color: Colors.grey),
              const SizedBox(width: 8),
              Text(
                'francis.b.kaz@gmail.com',
                style: GoogleFonts.poppins(fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Icon(Icons.phone, size: 16, color: Colors.grey),
              const SizedBox(width: 8),
              Text(
                '+211 912 345 678',
                style: GoogleFonts.poppins(fontSize: 13),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildContactCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required String description,
    required String? buttonText,
    required VoidCallback onTap,
  }) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.primaryOrange.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: AppColors.primaryOrange, size: 24),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textDark,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          color: AppColors.textLight,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              description,
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: AppColors.textLight,
              ),
            ),
            if (buttonText != null) ...[
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: onTap,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryOrange,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: Text(buttonText),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildFAQItem(String title, String description) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.check_circle_rounded,
            color: AppColors.primaryOrange,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textDark,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  description,
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    color: AppColors.textLight,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
