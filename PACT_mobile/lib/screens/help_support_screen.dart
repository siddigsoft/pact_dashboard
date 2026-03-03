import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/help_models.dart';
import '../services/help_service.dart';
import '../theme/app_colors.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/reusable_app_bar.dart';
import '../services/agora_call_service.dart';
import 'communications_screen.dart';
import 'agora_call_screen.dart';
import 'notification_test_screen.dart';

class HelpSupportScreen extends StatefulWidget {
  const HelpSupportScreen({super.key});

  @override
  State<HelpSupportScreen> createState() => _HelpSupportScreenState();
}

class _HelpSupportScreenState extends State<HelpSupportScreen>
    with SingleTickerProviderStateMixin {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final TextEditingController _searchController = TextEditingController();
  late TabController _tabController;

  String _currentLocale = 'en';
  List<HelpArticle> _searchResults = [];
  bool _isSearching = false;
  List<SupportContact> _supportContacts = [];
  bool _loadingContacts = false;

  List<Map<String, dynamic>> _ictAdminUsers = [];
  bool _loadingIctUsers = false;
  String? _selectedRecipientId;

  // Field operations support
  List<Map<String, dynamic>> _fieldSupervisors = [];
  bool _loadingFieldSupervisors = false;
  String? _currentUserHubId;
  String? _currentUserStateId;
  String? _currentUserLocalityId;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadSupportContacts();
    _loadIctAdminUsers();
    _loadCurrentUserLocation();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadSupportContacts() async {
    setState(() => _loadingContacts = true);
    try {
      final response = await Supabase.instance.client
          .from('support_contacts')
          .select()
          .eq('is_active', true)
          .order('sort_order', ascending: true);

      if (mounted) {
        setState(() {
          _supportContacts = (response as List)
              .map((e) => SupportContact.fromJson(e))
              .toList();
          _loadingContacts = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading support contacts: $e');
      if (mounted) {
        setState(() => _loadingContacts = false);
      }
    }
  }

  Future<void> _loadIctAdminUsers() async {
    setState(() => _loadingIctUsers = true);
    try {
      final response = await Supabase.instance.client
          .from('profiles')
          .select('id, full_name, email, role, phone, avatar_url, availability')
          .inFilter('role', ['admin', 'super_admin', 'ict', 'fom'])
          .order('full_name', ascending: true);

      if (mounted) {
        setState(() {
          _ictAdminUsers = List<Map<String, dynamic>>.from(response as List);
          _loadingIctUsers = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading ICT/Admin users: $e');
      if (mounted) {
        setState(() => _loadingIctUsers = false);
      }
    }
  }

  Future<void> _loadCurrentUserLocation() async {
    try {
      final currentUser = Supabase.instance.client.auth.currentUser;
      if (currentUser == null) return;

      final response = await Supabase.instance.client
          .from('profiles')
          .select('hub_id, state_id, locality_id, hub, state, locality')
          .eq('id', currentUser.id)
          .maybeSingle();

      if (response != null && mounted) {
        setState(() {
          _currentUserHubId = response['hub_id'] ?? response['hub'];
          _currentUserStateId = response['state_id'] ?? response['state'];
          _currentUserLocalityId =
              response['locality_id'] ?? response['locality'];
        });
        // Load field supervisors after getting current user's location
        _loadFieldSupervisors();
      }
    } catch (e) {
      debugPrint('Error loading current user location: $e');
    }
  }

  Future<void> _loadFieldSupervisors() async {
    if (_currentUserHubId == null && _currentUserStateId == null) {
      debugPrint('No hub or state ID available for field supervisors query');
      return;
    }

    setState(() => _loadingFieldSupervisors = true);
    try {
      // Build query to find supervisors, coordinators, FOM in same hub or state
      var query = Supabase.instance.client
          .from('profiles')
          .select(
            'id, full_name, email, role, phone, avatar_url, availability, hub_id, state_id, hub, state',
          )
          .inFilter('role', [
            'supervisor',
            'coordinator',
            'fom',
            'projectManager',
            'admin',
          ]);

      final response = await query.order('full_name', ascending: true);

      // Filter to same hub or state
      final filteredList = (response as List).where((user) {
        final userHubId = user['hub_id'] ?? user['hub'];
        final userStateId = user['state_id'] ?? user['state'];

        // Match by hub first, then by state
        if (_currentUserHubId != null && userHubId == _currentUserHubId) {
          return true;
        }
        if (_currentUserStateId != null && userStateId == _currentUserStateId) {
          return true;
        }
        return false;
      }).toList();

      if (mounted) {
        setState(() {
          _fieldSupervisors = List<Map<String, dynamic>>.from(filteredList);
          _loadingFieldSupervisors = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading field supervisors: $e');
      if (mounted) {
        setState(() => _loadingFieldSupervisors = false);
      }
    }
  }

  void _toggleLanguage() {
    setState(() {
      _currentLocale = _currentLocale == 'en' ? 'ar' : 'en';
    });
  }

  void _onSearchChanged(String query) {
    setState(() {
      if (query.isEmpty) {
        _isSearching = false;
        _searchResults = [];
      } else {
        _isSearching = true;
        _searchResults = HelpService.searchArticles(query);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = _currentLocale == 'ar';

    return Directionality(
      textDirection: isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: AppColors.backgroundGray,
        drawer: CustomDrawerMenu(
          currentUser: Supabase.instance.client.auth.currentUser,
          onClose: () => _scaffoldKey.currentState?.closeDrawer(),
        ),
        body: SafeArea(
          top: false,
          child: Column(
            children: [
              ReusableAppBar(
                title: isArabic ? 'المساعدة والدعم' : 'Help & Support',
                scaffoldKey: _scaffoldKey,
                actions: [
                  TextButton.icon(
                    onPressed: _toggleLanguage,
                    icon: const Icon(
                      Icons.language,
                      color: Colors.white,
                      size: 20,
                    ),
                    label: Text(
                      isArabic ? 'EN' : 'عربي',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              _buildSearchBar(isArabic),
              _buildTabBar(isArabic),
              Expanded(
                child: _isSearching
                    ? _buildSearchResults(isArabic)
                    : TabBarView(
                        controller: _tabController,
                        children: [
                          _buildGettingStartedTab(isArabic),
                          _buildTroubleshootingTab(isArabic),
                          _buildFieldOperationsTab(isArabic),
                          _buildContactSupportTab(isArabic),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSearchBar(bool isArabic) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: TextField(
        controller: _searchController,
        textDirection: isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
        decoration: InputDecoration(
          hintText: isArabic
              ? 'ابحث في مقالات المساعدة...'
              : 'Search help articles...',
          prefixIcon: const Icon(Icons.search),
          suffixIcon: _searchController.text.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () {
                    _searchController.clear();
                    _onSearchChanged('');
                  },
                )
              : null,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.grey.shade300),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.grey.shade300),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: AppColors.primaryBlue, width: 2),
          ),
          filled: true,
          fillColor: Colors.grey.shade50,
        ),
        onChanged: _onSearchChanged,
      ),
    );
  }

  Widget _buildTabBar(bool isArabic) {
    return Container(
      color: Colors.white,
      child: TabBar(
        controller: _tabController,
        isScrollable: true,
        labelColor: AppColors.primaryBlue,
        unselectedLabelColor: Colors.grey,
        indicatorColor: AppColors.primaryBlue,
        indicatorWeight: 3,
        labelStyle: GoogleFonts.poppins(
          fontWeight: FontWeight.w600,
          fontSize: 13,
        ),
        unselectedLabelStyle: GoogleFonts.poppins(fontSize: 13),
        tabs: [
          Tab(
            icon: const Icon(Icons.play_circle_outline, size: 20),
            text: isArabic ? 'البداية' : 'Getting Started',
          ),
          Tab(
            icon: const Icon(Icons.build_outlined, size: 20),
            text: isArabic ? 'استكشاف الأخطاء' : 'Troubleshooting',
          ),
          Tab(
            icon: const Icon(Icons.location_on_outlined, size: 20),
            text: isArabic ? 'العمليات الميدانية' : 'Field Operations',
          ),
          Tab(
            icon: const Icon(Icons.support_agent, size: 20),
            text: isArabic ? 'اتصل بالدعم' : 'Contact Support',
          ),
        ],
      ),
    );
  }

  Widget _buildSearchResults(bool isArabic) {
    if (_searchResults.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search_off, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              isArabic ? 'لا توجد نتائج' : 'No results found',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              isArabic
                  ? 'جرب مصطلحات بحث مختلفة'
                  : 'Try different search terms',
              style: GoogleFonts.poppins(color: Colors.grey[500]),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _searchResults.length,
      itemBuilder: (context, index) {
        return _buildArticleCard(_searchResults[index], isArabic);
      },
    );
  }

  Widget _buildGettingStartedTab(bool isArabic) {
    final category = HelpService.helpCategories.firstWhere(
      (c) => c.id == 'getting_started',
      orElse: () => HelpCategory(
        id: 'getting_started',
        title: 'Getting Started',
        titleAr: 'البداية',
        description: 'Learn the basics',
        descriptionAr: 'تعلم الأساسيات',
        articles: [],
      ),
    );

    return _buildCategoryContent(category, isArabic, [
      _buildQuickStartCard(isArabic),
    ]);
  }

  Widget _buildQuickStartCard(bool isArabic) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.primaryBlue,
            AppColors.primaryBlue.withValues(alpha: 0.8),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.rocket_launch,
                  color: Colors.white,
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  isArabic ? 'دليل البداية السريعة' : 'Quick Start Guide',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _buildQuickStartStep(
            '1',
            isArabic ? 'تسجيل الدخول بحسابك' : 'Login with your account',
            isArabic,
          ),
          _buildQuickStartStep(
            '2',
            isArabic ? 'تفعيل خدمات الموقع' : 'Enable location services',
            isArabic,
          ),
          _buildQuickStartStep(
            '3',
            isArabic
                ? 'المطالبة بأول زيارة ميدانية'
                : 'Claim your first site visit',
            isArabic,
          ),
          _buildQuickStartStep(
            '4',
            isArabic
                ? 'إكمال وتقديم تقريرك'
                : 'Complete and submit your report',
            isArabic,
          ),
        ],
      ),
    );
  }

  Widget _buildQuickStartStep(String number, String text, bool isArabic) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                number,
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.poppins(
                color: Colors.white.withValues(alpha: 0.95),
                fontSize: 14,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTroubleshootingTab(bool isArabic) {
    final category = HelpService.helpCategories.firstWhere(
      (c) => c.id == 'troubleshooting',
      orElse: () => HelpCategory(
        id: 'troubleshooting',
        title: 'Troubleshooting',
        titleAr: 'استكشاف الأخطاء',
        description: 'Common issues and solutions',
        descriptionAr: 'المشاكل الشائعة وحلولها',
        articles: [],
      ),
    );

    return _buildCategoryContent(category, isArabic, [
      _buildCommonErrorsSection(isArabic),
    ]);
  }

  Widget _buildCommonErrorsSection(bool isArabic) {
    final errors = HelpService.commonErrors.values.take(5).toList();

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.orange.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.orange.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.orange.shade700),
              const SizedBox(width: 8),
              Text(
                isArabic ? 'أخطاء شائعة' : 'Common Errors',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: Colors.orange.shade800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...errors.map((error) => _buildErrorItem(error, isArabic)),
        ],
      ),
    );
  }

  Widget _buildErrorItem(ErrorMessage error, bool isArabic) {
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      title: Text(
        error.getError(_currentLocale),
        style: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 14),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                error.getMeaning(_currentLocale),
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  color: Colors.grey[700],
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.lightbulb_outline,
                      color: Colors.green.shade700,
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        error.getSolution(_currentLocale),
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: Colors.green.shade800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildFieldOperationsTab(bool isArabic) {
    final category = HelpService.helpCategories.firstWhere(
      (c) => c.id == 'field_operations',
      orElse: () => HelpCategory(
        id: 'field_operations',
        title: 'Field Operations',
        titleAr: 'العمليات الميدانية',
        description: 'Site visits and data collection',
        descriptionAr: 'الزيارات الميدانية وجمع البيانات',
        articles: [],
      ),
    );

    return _buildCategoryContent(category, isArabic, [
      _buildFieldOperationsGuide(isArabic),
    ]);
  }

  Widget _buildFieldOperationsGuide(bool isArabic) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primaryGreen.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.primaryGreen.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.map_outlined, color: AppColors.primaryGreen),
              const SizedBox(width: 8),
              Text(
                isArabic ? 'دليل العمليات الميدانية' : 'Field Operations Guide',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: AppColors.primaryGreen,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _buildGuideStep(
            Icons.add_location_alt,
            isArabic ? 'المطالبة بموقع' : 'Claim a Site',
            isArabic
                ? 'اختر موقعًا من قائمة المواقع المتاحة وقم بالمطالبة به'
                : 'Select a site from available sites list and claim it',
          ),
          _buildGuideStep(
            Icons.play_arrow,
            isArabic ? 'بدء الزيارة' : 'Start Visit',
            isArabic
                ? 'عند الوصول للموقع، اضغط على بدء الزيارة لتسجيل موقع GPS'
                : 'When you arrive, tap Start Visit to record GPS location',
          ),
          _buildGuideStep(
            Icons.camera_alt,
            isArabic ? 'جمع البيانات' : 'Collect Data',
            isArabic
                ? 'التقط الصور وأكمل النماذج المطلوبة'
                : 'Take photos and complete required forms',
          ),
          _buildGuideStep(
            Icons.check_circle,
            isArabic ? 'إكمال الزيارة' : 'Complete Visit',
            isArabic
                ? 'أرسل تقريرك وقم بتوقيع إتمام الزيارة'
                : 'Submit your report and sign off on the visit',
          ),
        ],
      ),
    );
  }

  Widget _buildGuideStep(IconData icon, String title, String description) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.primaryGreen.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: AppColors.primaryGreen, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                Text(
                  description,
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContactSupportTab(bool isArabic) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildBusinessHoursCard(isArabic),
          const SizedBox(height: 16),
          _buildEmergencyContactCard(isArabic),
          const SizedBox(height: 24),
          // Field Operations Support Section
          _buildFieldOperationsSupportSection(isArabic),
          const SizedBox(height: 24),
          // ICT & Admin Support Section
          _buildIctSupportSection(isArabic),
          const SizedBox(height: 24),
          Text(
            isArabic ? 'فريق الدعم' : 'Support Team',
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),
          if (_loadingContacts)
            const Center(child: CircularProgressIndicator())
          else if (_supportContacts.isEmpty)
            _buildDefaultContacts(isArabic)
          else
            ..._supportContacts.map(
              (contact) => _buildContactCard(contact, isArabic),
            ),
          const SizedBox(height: 24),
          _buildReportBugCard(isArabic),
          const SizedBox(height: 16),
          _buildNotificationTestCard(isArabic),
        ],
      ),
    );
  }

  Widget _buildFieldOperationsSupportSection(bool isArabic) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [Colors.orange.shade600, Colors.orange.shade400],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(16),
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.groups,
                    color: Colors.white,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isArabic
                            ? 'دعم العمليات الميدانية'
                            : 'Field Operations Support',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        isArabic
                            ? 'المشرفين والمنسقين في منطقتك'
                            : 'Supervisors & coordinators in your area',
                        style: GoogleFonts.poppins(
                          color: Colors.white.withValues(alpha: 0.9),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: _loadingFieldSupervisors
                ? const Center(child: CircularProgressIndicator())
                : _fieldSupervisors.isEmpty
                ? _buildNoFieldSupervisorsMessage(isArabic)
                : Column(
                    children: _fieldSupervisors
                        .map(
                          (user) => _buildFieldSupportUserCard(user, isArabic),
                        )
                        .toList(),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildNoFieldSupervisorsMessage(bool isArabic) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(Icons.info_outline, color: Colors.grey.shade500, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              isArabic
                  ? 'لا يوجد مشرفين متاحين في منطقتك حالياً'
                  : 'No supervisors available in your area currently',
              style: GoogleFonts.poppins(
                color: Colors.grey.shade600,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFieldSupportUserCard(Map<String, dynamic> user, bool isArabic) {
    final isOnline =
        user['availability'] == 'online' || user['availability'] == 'available';
    final avatarUrl = user['avatar_url'] as String?;
    final fullName = user['full_name'] as String? ?? 'Unknown';
    final role = user['role'] as String? ?? '';
    final phone = user['phone'] as String?;
    final email = user['email'] as String?;
    final userId = user['id'] as String;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          Stack(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: Colors.orange.shade100,
                backgroundImage: avatarUrl != null
                    ? NetworkImage(avatarUrl)
                    : null,
                child: avatarUrl == null
                    ? Text(
                        fullName.isNotEmpty ? fullName[0].toUpperCase() : '?',
                        style: GoogleFonts.poppins(
                          color: Colors.orange.shade700,
                          fontWeight: FontWeight.bold,
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
                    color: isOnline ? Colors.green : Colors.grey.shade400,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  fullName,
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                Text(
                  _getFieldRoleLabel(role, isArabic),
                  style: GoogleFonts.poppins(
                    color: Colors.grey.shade600,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          // In-app call button
          IconButton(
            onPressed: () => _initiateInAppCall(userId, fullName),
            icon: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.primaryGreen.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                Icons.video_call,
                color: AppColors.primaryGreen,
                size: 18,
              ),
            ),
            tooltip: isArabic ? 'مكالمة داخلية' : 'In-app Call',
          ),
          // Phone call button
          if (phone != null)
            IconButton(
              onPressed: () => _launchPhone(phone),
              icon: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.blue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.phone, color: Colors.blue, size: 18),
              ),
              tooltip: isArabic ? 'اتصال هاتفي' : 'Phone Call',
            ),
          // Message button
          IconButton(
            onPressed: () => _openMessaging(userId, fullName),
            icon: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.purple.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.message, color: Colors.purple, size: 18),
            ),
            tooltip: isArabic ? 'رسالة' : 'Message',
          ),
        ],
      ),
    );
  }

  String _getFieldRoleLabel(String role, bool isArabic) {
    switch (role.toLowerCase()) {
      case 'supervisor':
        return isArabic ? 'مشرف' : 'Supervisor';
      case 'coordinator':
        return isArabic ? 'منسق' : 'Coordinator';
      case 'fom':
        return isArabic
            ? 'مدير العمليات الميدانية'
            : 'Field Operations Manager';
      case 'projectmanager':
        return isArabic ? 'مدير المشروع' : 'Project Manager';
      case 'admin':
        return isArabic ? 'مدير' : 'Admin';
      default:
        return isArabic ? 'دعم' : 'Support';
    }
  }

  Future<void> _initiateInAppCall(String userId, String userName) async {
    final agoraService = AgoraCallService();
    final currentUser = Supabase.instance.client.auth.currentUser;

    if (currentUser == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _currentLocale == 'ar' ? 'يجب تسجيل الدخول' : 'Please login first',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    try {
      if (!agoraService.isReady) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                _currentLocale == 'ar'
                    ? 'خدمة المكالمات غير جاهزة'
                    : 'Call service not ready. Try again.',
              ),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }

      if (agoraService.isInCall) {
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

      final result = await agoraService.startCall(
        remoteUserId: userId,
        remoteUserName: userName,
        audioOnly: false,
      );

      if (result.success && result.channelName != null && mounted) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => AgoraCallScreen(
              channelName: result.channelName!,
              remoteUserId: userId,
              remoteUserName: userName,
              isAudioOnly: false,
              isOutgoing: true,
            ),
          ),
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result.error ??
                  (_currentLocale == 'ar'
                      ? 'فشل بدء المكالمة'
                      : 'Failed to start call'),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _currentLocale == 'ar' ? 'فشل الاتصال: $e' : 'Call failed: $e',
          ),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _openMessaging(String userId, String userName) async {
    // Navigate to communications screen to send message
    Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const CommunicationsScreen()),
    );

    // Show hint about who to message
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          _currentLocale == 'ar'
              ? 'ابحث عن $userName لإرسال رسالة'
              : 'Search for $userName to send a message',
        ),
        backgroundColor: AppColors.primaryBlue,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  Widget _buildIctSupportSection(bool isArabic) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppColors.primaryBlue,
                  AppColors.primaryBlue.withValues(alpha: 0.8),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(16),
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.headset_mic,
                    color: Colors.white,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isArabic
                            ? 'فريق الدعم التقني والإداري'
                            : 'ICT & Admin Support Team',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        isArabic
                            ? 'للمشاكل التقنية والإدارية'
                            : 'For technical and administrative issues',
                        style: GoogleFonts.poppins(
                          color: Colors.white.withValues(alpha: 0.9),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: _loadingIctUsers
                ? const Center(child: CircularProgressIndicator())
                : _ictAdminUsers.isEmpty
                ? _buildNoIctUsersMessage(isArabic)
                : Column(
                    children: _ictAdminUsers
                        .map((user) => _buildIctSupportUserCard(user, isArabic))
                        .toList(),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildNoIctUsersMessage(bool isArabic) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(Icons.info_outline, color: Colors.grey.shade500, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              isArabic
                  ? 'لا يوجد فريق دعم تقني متاح حالياً'
                  : 'No ICT support team available currently',
              style: GoogleFonts.poppins(
                color: Colors.grey.shade600,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildIctSupportUserCard(Map<String, dynamic> user, bool isArabic) {
    final isOnline =
        user['availability'] == 'online' || user['availability'] == 'available';
    final avatarUrl = user['avatar_url'] as String?;
    final fullName = user['full_name'] as String? ?? 'Unknown';
    final role = user['role'] as String? ?? '';
    final phone = user['phone'] as String?;
    final email = user['email'] as String?;
    final userId = user['id'] as String;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Stack(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: AppColors.primaryBlue.withValues(
                      alpha: 0.1,
                    ),
                    backgroundImage: avatarUrl != null
                        ? NetworkImage(avatarUrl)
                        : null,
                    child: avatarUrl == null
                        ? Text(
                            fullName.isNotEmpty
                                ? fullName[0].toUpperCase()
                                : '?',
                            style: GoogleFonts.poppins(
                              color: AppColors.primaryBlue,
                              fontWeight: FontWeight.bold,
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
                        color: isOnline ? Colors.green : Colors.grey.shade400,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      fullName,
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      _getRoleLabel(role, isArabic),
                      style: GoogleFonts.poppins(
                        color: Colors.grey.shade600,
                        fontSize: 12,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _buildCompactActionButton(
                icon: Icons.video_call,
                color: AppColors.primaryGreen,
                label: isArabic ? 'مكالمة' : 'Call',
                onPressed: () => _initiateInAppCall(userId, fullName),
              ),
              if (phone != null)
                _buildCompactActionButton(
                  icon: Icons.phone,
                  color: Colors.blue,
                  label: isArabic ? 'هاتف' : 'Phone',
                  onPressed: () => _launchPhone(phone),
                ),
              if (email != null)
                _buildCompactActionButton(
                  icon: Icons.email,
                  color: Colors.orange,
                  label: isArabic ? 'بريد' : 'Email',
                  onPressed: () => _launchEmail(email),
                ),
              _buildCompactActionButton(
                icon: Icons.message,
                color: Colors.purple,
                label: isArabic ? 'رسالة' : 'Chat',
                onPressed: () => _openMessaging(userId, fullName),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCompactActionButton({
    required IconData icon,
    required Color color,
    required String label,
    required VoidCallback onPressed,
  }) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(height: 2),
            Text(
              label,
              style: GoogleFonts.poppins(
                color: color,
                fontSize: 10,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBusinessHoursCard(bool isArabic) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.primaryBlue,
            AppColors.primaryBlue.withValues(alpha: 0.8),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.access_time, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isArabic ? 'ساعات العمل' : 'Business Hours',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    isArabic
                        ? '24/7 - متاح على مدار الساعة'
                        : '24/7 - Available Around the Clock',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  isArabic
                      ? 'نحن هنا لمساعدتك في أي وقت'
                      : 'We are here to help you anytime',
                  style: GoogleFonts.poppins(
                    color: Colors.white.withValues(alpha: 0.9),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmergencyContactCard(bool isArabic) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.red.shade600, Colors.red.shade400],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.emergency,
                    color: Colors.white,
                    size: 28,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isArabic ? 'الدعم الطارئ' : 'Emergency Support',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        isArabic
                            ? 'للمشاكل العاجلة في الميدان'
                            : 'For urgent field issues',
                        style: GoogleFonts.poppins(
                          color: Colors.white.withValues(alpha: 0.9),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Row(
              children: [
                Expanded(
                  child: _buildEmergencyButton(
                    icon: Icons.phone,
                    label: isArabic ? 'اتصال هاتفي' : 'Phone Call',
                    onPressed: _initiateEmergencyPhoneCall,
                    isArabic: isArabic,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildEmergencyButton(
                    icon: Icons.video_call,
                    label: isArabic ? 'مكالمة داخلية' : 'In-App Call',
                    onPressed: _initiateEmergencyInAppCall,
                    isArabic: isArabic,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildEmergencyButton(
                    icon: Icons.message,
                    label: isArabic ? 'رسالة' : 'Message',
                    onPressed: _initiateEmergencyMessage,
                    isArabic: isArabic,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmergencyButton({
    required IconData icon,
    required String label,
    required VoidCallback onPressed,
    required bool isArabic,
  }) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white, size: 22),
            const SizedBox(height: 4),
            Text(
              label,
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.w500,
              ),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  String _getRoleLabel(String? role, bool isArabic) {
    switch (role) {
      case 'super_admin':
        return isArabic ? 'مدير عام' : 'Super Admin';
      case 'admin':
        return isArabic ? 'مدير' : 'Admin';
      case 'ict':
        return isArabic ? 'تقنية المعلومات' : 'ICT';
      default:
        return isArabic ? 'دعم' : 'Support';
    }
  }

  Future<void> _sendEmailToSelected(bool isArabic) async {
    if (_selectedRecipientId == null) return;

    List<String> emails = [];

    if (_selectedRecipientId == 'all') {
      emails = _ictAdminUsers
          .where((u) => u['email'] != null)
          .map((u) => u['email'] as String)
          .toList();
    } else {
      final user = _ictAdminUsers.firstWhere(
        (u) => u['id'] == _selectedRecipientId,
        orElse: () => {},
      );
      if (user.isNotEmpty && user['email'] != null) {
        emails.add(user['email'] as String);
      }
    }

    if (emails.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isArabic
                ? 'لم يتم العثور على بريد إلكتروني'
                : 'No email address found',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final uri = Uri.parse(
      'mailto:${emails.join(',')}?subject=${Uri.encodeComponent(isArabic ? 'طلب دعم' : 'Support Request')}',
    );
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _initiateDirectCall(String userId) async {
    final user = _ictAdminUsers.firstWhere(
      (u) => u['id'] == userId,
      orElse: () => {},
    );

    if (user.isEmpty) return;

    final agoraService = AgoraCallService();
    final currentUser = Supabase.instance.client.auth.currentUser;
    final userName = user['full_name'] ?? 'Support';

    if (currentUser == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _currentLocale == 'ar' ? 'يجب تسجيل الدخول' : 'Please login first',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    try {
      final result = await agoraService.startCall(
        remoteUserId: userId,
        remoteUserName: userName,
        audioOnly: true,
      );

      if (result.success && result.channelName != null && mounted) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => AgoraCallScreen(
              channelName: result.channelName!,
              remoteUserId: userId,
              remoteUserName: userName,
              isAudioOnly: true,
              isOutgoing: true,
            ),
          ),
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result.error ??
                  (_currentLocale == 'ar' ? 'فشل الاتصال' : 'Call failed'),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _currentLocale == 'ar' ? 'فشل الاتصال: $e' : 'Call failed: $e',
          ),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _initiateEmergencyCall() async {
    _initiateEmergencyPhoneCall();
  }

  Future<void> _initiateEmergencyPhoneCall() async {
    // Priority: Field supervisors > ICT/Admin users > Support contacts
    if (_fieldSupervisors.isNotEmpty) {
      final supervisor = _fieldSupervisors.firstWhere(
        (u) => u['phone'] != null,
        orElse: () => _fieldSupervisors.first,
      );
      if (supervisor['phone'] != null) {
        await _launchPhone(supervisor['phone'] as String);
        return;
      }
    }

    if (_ictAdminUsers.isNotEmpty) {
      final firstAdmin = _ictAdminUsers.firstWhere(
        (u) => u['phone'] != null,
        orElse: () => _ictAdminUsers.first,
      );
      if (firstAdmin['phone'] != null) {
        await _launchPhone(firstAdmin['phone'] as String);
        return;
      }
    }

    if (_supportContacts.isNotEmpty) {
      final emergencyContact = _supportContacts.firstWhere(
        (c) => c.phone != null,
        orElse: () => _supportContacts.first,
      );
      if (emergencyContact.phone != null) {
        await _launchPhone(emergencyContact.phone!);
        return;
      }
    }

    // No phone number available - show error
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          _currentLocale == 'ar'
              ? 'لا يوجد رقم هاتف طوارئ متاح'
              : 'No emergency phone number available',
        ),
        backgroundColor: Colors.red,
      ),
    );
  }

  Future<void> _initiateEmergencyInAppCall() async {
    // Priority: Field supervisors > ICT/Admin users
    String? userId;
    String? userName;

    if (_fieldSupervisors.isNotEmpty) {
      // Find first online supervisor, or fallback to first supervisor
      final onlineSupervisor = _fieldSupervisors.firstWhere(
        (u) =>
            u['availability'] == 'online' || u['availability'] == 'available',
        orElse: () => _fieldSupervisors.first,
      );
      userId = onlineSupervisor['id'] as String?;
      userName = onlineSupervisor['full_name'] as String? ?? 'Supervisor';
    } else if (_ictAdminUsers.isNotEmpty) {
      final onlineAdmin = _ictAdminUsers.firstWhere(
        (u) =>
            u['availability'] == 'online' || u['availability'] == 'available',
        orElse: () => _ictAdminUsers.first,
      );
      userId = onlineAdmin['id'] as String?;
      userName = onlineAdmin['full_name'] as String? ?? 'Support';
    }

    if (userId != null && userName != null) {
      await _initiateInAppCall(userId, userName);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _currentLocale == 'ar'
                ? 'لا يوجد جهة اتصال طوارئ متاحة'
                : 'No emergency contact available',
          ),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _initiateEmergencyMessage() async {
    // Navigate to communications screen for emergency messaging
    if (_fieldSupervisors.isNotEmpty) {
      final supervisor = _fieldSupervisors.first;
      final userName = supervisor['full_name'] as String? ?? 'Supervisor';
      _openMessaging(supervisor['id'] as String, userName);
    } else if (_ictAdminUsers.isNotEmpty) {
      final admin = _ictAdminUsers.first;
      final userName = admin['full_name'] as String? ?? 'Support';
      _openMessaging(admin['id'] as String, userName);
    } else {
      // Just navigate to communications
      Navigator.push(
        context,
        MaterialPageRoute(builder: (context) => const CommunicationsScreen()),
      );
    }
  }

  Widget _buildDefaultContacts(bool isArabic) {
    return Column(
      children: [
        _buildContactCard(
          SupportContact(
            id: '1',
            name: 'Technical Support',
            nameAr: 'الدعم الفني',
            role: 'IT Support Team',
            roleAr: 'فريق الدعم التقني',
            email: 'support@pact.org',
          ),
          isArabic,
        ),
        _buildContactCard(
          SupportContact(
            id: '2',
            name: 'Field Coordinator',
            nameAr: 'منسق الميدان',
            role: 'Operations Team',
            roleAr: 'فريق العمليات',
            email: 'field@pact.org',
          ),
          isArabic,
        ),
      ],
    );
  }

  Widget _buildContactCard(SupportContact contact, bool isArabic) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: AppColors.primaryBlue.withValues(alpha: 0.1),
              backgroundImage: contact.avatarUrl != null
                  ? NetworkImage(contact.avatarUrl!)
                  : null,
              child: contact.avatarUrl == null
                  ? Text(
                      contact.getName(_currentLocale).isNotEmpty
                          ? contact.getName(_currentLocale)[0].toUpperCase()
                          : '?',
                      style: GoogleFonts.poppins(
                        color: AppColors.primaryBlue,
                        fontWeight: FontWeight.bold,
                        fontSize: 20,
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    contact.getName(_currentLocale),
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                    ),
                  ),
                  Text(
                    contact.getRole(_currentLocale),
                    style: GoogleFonts.poppins(
                      color: Colors.grey[600],
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            if (contact.phone != null)
              IconButton(
                onPressed: () => _launchPhone(contact.phone!),
                icon: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.primaryGreen.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.phone,
                    color: AppColors.primaryGreen,
                    size: 20,
                  ),
                ),
              ),
            if (contact.email != null)
              IconButton(
                onPressed: () => _launchEmail(contact.email!),
                icon: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.primaryBlue.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.email,
                    color: AppColors.primaryBlue,
                    size: 20,
                  ),
                ),
              ),
            if (contact.whatsapp != null)
              IconButton(
                onPressed: () => _launchWhatsApp(contact.whatsapp!),
                icon: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.green.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.chat, color: Colors.green, size: 20),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildReportBugCard(bool isArabic) {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.purple.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Icon(Icons.bug_report, color: Colors.purple),
        ),
        title: Text(
          isArabic ? 'الإبلاغ عن مشكلة' : 'Report a Problem',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          isArabic ? 'ساعدنا في تحسين التطبيق' : 'Help us improve the app',
          style: GoogleFonts.poppins(fontSize: 12),
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => _showReportBugDialog(isArabic),
      ),
    );
  }

  Widget _buildNotificationTestCard(bool isArabic) {
    return Card(
      color: Colors.purple.shade50,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.purple.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Icon(Icons.notifications_active, color: Colors.purple),
        ),
        title: Text(
          isArabic ? '🧪 اختبار الإشعارات' : '🧪 Test Notifications',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          isArabic
              ? '[للاختبار فقط] اختبار الإشعارات ثنائية اللغة'
              : '[TESTING ONLY] Test bilingual notifications',
          style: GoogleFonts.poppins(fontSize: 12),
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => NotificationTestScreen()),
          );
        },
      ),
    );
  }

  Widget _buildCategoryContent(
    HelpCategory category,
    bool isArabic,
    List<Widget> headerWidgets,
  ) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ...headerWidgets,
          if (category.articles.isNotEmpty) ...[
            Text(
              isArabic ? 'المقالات' : 'Articles',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            ...category.articles.map(
              (article) => _buildArticleCard(article, isArabic),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildArticleCard(HelpArticle article, bool isArabic) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: AppColors.primaryBlue.withValues(alpha: 0.1),
          child: Icon(
            Icons.article_outlined,
            color: AppColors.primaryBlue,
            size: 20,
          ),
        ),
        title: Text(
          article.getTitle(_currentLocale),
          style: GoogleFonts.poppins(fontWeight: FontWeight.w500),
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => _showArticleDialog(article, isArabic),
      ),
    );
  }

  void _showArticleDialog(HelpArticle article, bool isArabic) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        maxChildSize: 0.95,
        minChildSize: 0.5,
        expand: false,
        builder: (context, scrollController) {
          return Directionality(
            textDirection: isArabic
                ? ui.TextDirection.rtl
                : ui.TextDirection.ltr,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.grey[300],
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    article.getTitle(_currentLocale),
                    style: GoogleFonts.poppins(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: SingleChildScrollView(
                      controller: scrollController,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            article.getContent(_currentLocale),
                            style: GoogleFonts.poppins(
                              fontSize: 14,
                              height: 1.6,
                            ),
                          ),
                          if (article.getSolution(_currentLocale) != null) ...[
                            const SizedBox(height: 20),
                            Container(
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: AppColors.primaryGreen.withValues(
                                  alpha: 0.1,
                                ),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(
                                    Icons.lightbulb_outline,
                                    color: AppColors.primaryGreen,
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          isArabic ? 'الحل' : 'Solution',
                                          style: GoogleFonts.poppins(
                                            fontWeight: FontWeight.bold,
                                            color: AppColors.primaryGreen,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          article.getSolution(_currentLocale)!,
                                          style: GoogleFonts.poppins(
                                            fontSize: 13,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _showReportBugDialog(bool isArabic) {
    final stepsController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => Directionality(
        textDirection: isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
        child: AlertDialog(
          title: Text(isArabic ? 'الإبلاغ عن مشكلة' : 'Report a Problem'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: stepsController,
                  maxLines: 5,
                  decoration: InputDecoration(
                    labelText: isArabic ? 'صف المشكلة' : 'Describe the problem',
                    hintText: isArabic
                        ? 'ما الذي حدث؟ ما الخطوات التي أدت للمشكلة؟'
                        : 'What happened? What steps led to the problem?',
                    border: const OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(isArabic ? 'إلغاء' : 'Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      isArabic ? 'تم إرسال التقرير' : 'Report submitted',
                    ),
                    backgroundColor: AppColors.primaryGreen,
                  ),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
              ),
              child: Text(
                isArabic ? 'إرسال' : 'Submit',
                style: const TextStyle(color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _launchPhone(String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _launchEmail(String email) async {
    final uri = Uri.parse('mailto:$email');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _launchWhatsApp(String phone) async {
    final uri = Uri.parse('https://wa.me/$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
