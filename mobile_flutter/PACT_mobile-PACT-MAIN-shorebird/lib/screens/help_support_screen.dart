import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/help_models.dart';
import '../services/help_service.dart';
import '../theme/app_colors.dart';
import '../widgets/custom_drawer_menu.dart';

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

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadSupportContacts();
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
      textDirection: isArabic ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: AppColors.backgroundGray,
        drawer: CustomDrawerMenu(
          currentUser: Supabase.instance.client.auth.currentUser,
          onClose: () => _scaffoldKey.currentState?.closeDrawer(),
        ),
        appBar: AppBar(
          backgroundColor: AppColors.primaryBlue,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.menu, color: Colors.white),
            onPressed: () => _scaffoldKey.currentState?.openDrawer(),
          ),
          title: Text(
            isArabic ? 'المساعدة والدعم' : 'Help & Support',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          actions: [
            TextButton.icon(
              onPressed: _toggleLanguage,
              icon: const Icon(Icons.language, color: Colors.white, size: 20),
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
        body: Column(
          children: [
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
    );
  }

  Widget _buildSearchBar(bool isArabic) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: TextField(
        controller: _searchController,
        textDirection: isArabic ? TextDirection.rtl : TextDirection.ltr,
        decoration: InputDecoration(
          hintText: isArabic ? 'ابحث في مقالات المساعدة...' : 'Search help articles...',
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
        labelStyle: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 13),
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
              isArabic ? 'جرب مصطلحات بحث مختلفة' : 'Try different search terms',
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
          colors: [AppColors.primaryBlue, AppColors.primaryBlue.withOpacity(0.8)],
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
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.rocket_launch, color: Colors.white, size: 24),
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
          _buildQuickStartStep('1', isArabic ? 'تسجيل الدخول بحسابك' : 'Login with your account', isArabic),
          _buildQuickStartStep('2', isArabic ? 'تفعيل خدمات الموقع' : 'Enable location services', isArabic),
          _buildQuickStartStep('3', isArabic ? 'المطالبة بأول زيارة ميدانية' : 'Claim your first site visit', isArabic),
          _buildQuickStartStep('4', isArabic ? 'إكمال وتقديم تقريرك' : 'Complete and submit your report', isArabic),
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
              color: Colors.white.withOpacity(0.2),
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
                color: Colors.white.withOpacity(0.95),
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
        style: GoogleFonts.poppins(
          fontWeight: FontWeight.w600,
          fontSize: 14,
        ),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                error.getMeaning(_currentLocale),
                style: GoogleFonts.poppins(fontSize: 13, color: Colors.grey[700]),
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
                    Icon(Icons.lightbulb_outline, color: Colors.green.shade700, size: 18),
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
        color: AppColors.primaryGreen.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.primaryGreen.withOpacity(0.3)),
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
              color: AppColors.primaryGreen.withOpacity(0.15),
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
          _buildEmergencyContactCard(isArabic),
          const SizedBox(height: 16),
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
            ..._supportContacts.map((contact) => _buildContactCard(contact, isArabic)),
          const SizedBox(height: 24),
          _buildReportBugCard(isArabic),
        ],
      ),
    );
  }

  Widget _buildEmergencyContactCard(bool isArabic) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.red.shade600, Colors.red.shade400],
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
              color: Colors.white.withOpacity(0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.emergency, color: Colors.white, size: 28),
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
                  isArabic ? 'للمشاكل العاجلة في الميدان' : 'For urgent field issues',
                  style: GoogleFonts.poppins(
                    color: Colors.white.withOpacity(0.9),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: () => _launchPhone('+249123456789'),
            icon: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(Icons.phone, color: Colors.red.shade600),
            ),
          ),
        ],
      ),
    );
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
            phone: '+249123456789',
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
            phone: '+249987654321',
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
              backgroundColor: AppColors.primaryBlue.withOpacity(0.1),
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
                    color: AppColors.primaryGreen.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(Icons.phone, color: AppColors.primaryGreen, size: 20),
                ),
              ),
            if (contact.email != null)
              IconButton(
                onPressed: () => _launchEmail(contact.email!),
                icon: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.primaryBlue.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(Icons.email, color: AppColors.primaryBlue, size: 20),
                ),
              ),
            if (contact.whatsapp != null)
              IconButton(
                onPressed: () => _launchWhatsApp(contact.whatsapp!),
                icon: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.green.withOpacity(0.1),
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
            color: Colors.purple.withOpacity(0.1),
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
            ...category.articles.map((article) => _buildArticleCard(article, isArabic)),
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
          backgroundColor: AppColors.primaryBlue.withOpacity(0.1),
          child: Icon(Icons.article_outlined, color: AppColors.primaryBlue, size: 20),
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
            textDirection: isArabic ? TextDirection.rtl : TextDirection.ltr,
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
                                color: AppColors.primaryGreen.withOpacity(0.1),
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
                                      crossAxisAlignment: CrossAxisAlignment.start,
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
                                          style: GoogleFonts.poppins(fontSize: 13),
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
        textDirection: isArabic ? TextDirection.rtl : TextDirection.ltr,
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
                    labelText: isArabic
                        ? 'صف المشكلة'
                        : 'Describe the problem',
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
