import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_colors.dart';
import '../widgets/custom_drawer_menu.dart';

class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({super.key});

  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen>
    with SingleTickerProviderStateMixin {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  late TabController _tabController;

  bool _isLoading = true;
  List<Map<String, dynamic>> _documents = [];
  String _searchQuery = '';
  String _selectedCategory = 'all';
  String _currentLocale = 'en';

  final List<String> _categories = [
    'all',
    'mmp_file',
    'cost_receipt',
    'federal_permit',
    'state_permit',
    'local_permit',
    'site_visit_photo',
    'transaction_receipt',
    'report',
    'other',
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadDocuments();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadDocuments() async {
    setState(() => _isLoading = true);

    try {
      final List<Map<String, dynamic>> allDocs = [];
      final Set<String> seenIds = {};

      // Try to fetch from document_index first (persistent index)
      try {
        final indexedDocs = await Supabase.instance.client
            .from('document_index')
            .select('*')
            .order('uploaded_at', ascending: false)
            .limit(100);
        
        for (var doc in (indexedDocs ?? [])) {
          final docId = 'idx-${doc['id']}';
          if (seenIds.contains(docId)) continue;
          seenIds.add(docId);
          
          allDocs.add({
            'id': docId,
            'fileName': doc['file_name'] ?? 'Document',
            'fileUrl': doc['file_url'],
            'category': doc['category'] ?? 'other',
            'uploadedAt': doc['uploaded_at'],
            'state': doc['state'],
            'locality': doc['locality'],
            'status': doc['status'],
          });
        }
        debugPrint('Loaded ${indexedDocs?.length ?? 0} documents from index');
      } catch (e) {
        debugPrint('document_index table may not exist: $e');
      }

      // Fetch MMP files
      try {
        final mmpFiles = await Supabase.instance.client
            .from('mmp_files')
            .select('id, name, original_filename, file_url, created_at, project_name')
            .order('created_at', ascending: false)
            .limit(50);
        
        for (var doc in (mmpFiles ?? [])) {
          final docId = 'mmp-${doc['id']}';
          if (seenIds.contains(docId)) continue;
          seenIds.add(docId);
          
          allDocs.add({
            'id': docId,
            'fileName': doc['original_filename'] ?? doc['name'] ?? 'MMP File',
            'fileUrl': doc['file_url'],
            'category': 'mmp_file',
            'uploadedAt': doc['created_at'],
            'projectName': doc['project_name'],
          });
        }
        debugPrint('Loaded ${mmpFiles?.length ?? 0} MMP files');
      } catch (e) {
        debugPrint('Error loading MMP files: $e');
      }

      // Fetch cost receipts
      try {
        final costReceipts = await Supabase.instance.client
            .from('cost_submissions')
            .select('id, cost_type, receipt_url, created_at, amount, status')
            .not('receipt_url', 'is', null)
            .order('created_at', ascending: false)
            .limit(50);
        
        for (var doc in (costReceipts ?? [])) {
          final docId = 'cost-${doc['id']}';
          if (seenIds.contains(docId)) continue;
          seenIds.add(docId);
          
          allDocs.add({
            'id': docId,
            'fileName': '${doc['cost_type'] ?? 'Receipt'} - ${doc['amount']} SDG',
            'fileUrl': doc['receipt_url'],
            'category': 'cost_receipt',
            'uploadedAt': doc['created_at'],
            'status': doc['status'],
          });
        }
        debugPrint('Loaded ${costReceipts?.length ?? 0} cost receipts');
      } catch (e) {
        debugPrint('Error loading cost receipts: $e');
      }

      // Sort by date (newest first)
      allDocs.sort((a, b) {
        final dateA = DateTime.tryParse(a['uploadedAt']?.toString() ?? '') ?? DateTime(1970);
        final dateB = DateTime.tryParse(b['uploadedAt']?.toString() ?? '') ?? DateTime(1970);
        return dateB.compareTo(dateA);
      });

      if (mounted) {
        setState(() {
          _documents = allDocs;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading documents: $e');
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _toggleLanguage() {
    setState(() {
      _currentLocale = _currentLocale == 'en' ? 'ar' : 'en';
    });
  }

  List<Map<String, dynamic>> get _filteredDocuments {
    return _documents.where((doc) {
      final matchesSearch = _searchQuery.isEmpty ||
          (doc['fileName']?.toString().toLowerCase().contains(_searchQuery.toLowerCase()) ?? false) ||
          (doc['state']?.toString().toLowerCase().contains(_searchQuery.toLowerCase()) ?? false) ||
          (doc['locality']?.toString().toLowerCase().contains(_searchQuery.toLowerCase()) ?? false);
      
      final matchesCategory = _selectedCategory == 'all' || doc['category'] == _selectedCategory;
      
      return matchesSearch && matchesCategory;
    }).toList();
  }

  String _getCategoryLabel(String category) {
    final isArabic = _currentLocale == 'ar';
    switch (category) {
      case 'all':
        return isArabic ? 'الكل' : 'All';
      case 'mmp_file':
        return isArabic ? 'ملفات MMP' : 'MMP Files';
      case 'federal_permit':
        return isArabic ? 'تصريح فيدرالي' : 'Federal Permit';
      case 'state_permit':
        return isArabic ? 'تصريح ولائي' : 'State Permit';
      case 'local_permit':
        return isArabic ? 'تصريح محلي' : 'Local Permit';
      case 'cost_receipt':
        return isArabic ? 'إيصال تكلفة' : 'Cost Receipt';
      case 'transaction_receipt':
        return isArabic ? 'إيصال معاملة' : 'Transaction';
      case 'site_visit_photo':
        return isArabic ? 'صورة زيارة' : 'Site Photo';
      case 'report':
        return isArabic ? 'تقرير' : 'Report';
      case 'other':
        return isArabic ? 'أخرى' : 'Other';
      default:
        return category;
    }
  }

  IconData _getCategoryIcon(String category) {
    switch (category) {
      case 'mmp_file':
        return Icons.table_chart;
      case 'federal_permit':
      case 'state_permit':
      case 'local_permit':
        return Icons.security;
      case 'cost_receipt':
        return Icons.receipt_long;
      case 'transaction_receipt':
        return Icons.account_balance_wallet;
      case 'site_visit_photo':
        return Icons.photo_camera;
      case 'report':
        return Icons.description;
      case 'other':
        return Icons.folder_open;
      default:
        return Icons.insert_drive_file;
    }
  }

  Color _getCategoryColor(String category) {
    switch (category) {
      case 'mmp_file':
        return Colors.blue;
      case 'federal_permit':
        return Colors.purple;
      case 'state_permit':
        return Colors.indigo;
      case 'local_permit':
        return Colors.deepPurple;
      case 'cost_receipt':
        return Colors.green;
      case 'transaction_receipt':
        return Colors.teal;
      case 'site_visit_photo':
        return Colors.cyan;
      case 'report':
        return Colors.amber;
      case 'other':
        return Colors.blueGrey;
      default:
        return Colors.grey;
    }
  }

  Future<void> _openDocument(String? url) async {
    if (url == null || url.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_currentLocale == 'ar' ? 'الملف غير متاح' : 'File not available'),
          backgroundColor: Colors.orange,
        ),
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
            SnackBar(
              content: Text(_currentLocale == 'ar' ? 'تعذر فتح الملف' : 'Could not open file'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      debugPrint('Error opening document: $e');
    }
  }

  String _formatDate(String? dateStr) {
    if (dateStr == null) return '-';
    try {
      final date = DateTime.parse(dateStr);
      return DateFormat('MMM dd, yyyy').format(date);
    } catch (e) {
      return dateStr;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = _currentLocale == 'ar';
    final filteredDocs = _filteredDocuments;

    return Directionality(
      textDirection: isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
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
            isArabic ? 'المستندات' : 'Documents',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh, color: Colors.white),
              onPressed: _loadDocuments,
            ),
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
        body: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  _buildSearchBar(isArabic),
                  _buildCategoryFilter(isArabic),
                  _buildStatsRow(isArabic),
                  Expanded(
                    child: filteredDocs.isEmpty
                        ? _buildEmptyState(isArabic)
                        : _buildDocumentsList(filteredDocs, isArabic),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildSearchBar(bool isArabic) {
    return Container(
      padding: const EdgeInsets.all(16),
      child: TextField(
        onChanged: (value) => setState(() => _searchQuery = value),
        decoration: InputDecoration(
          hintText: isArabic ? 'بحث في المستندات...' : 'Search documents...',
          hintStyle: GoogleFonts.poppins(color: Colors.grey[500]),
          prefixIcon: Icon(Icons.search, color: Colors.grey[500]),
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        ),
      ),
    );
  }

  Widget _buildCategoryFilter(bool isArabic) {
    return SizedBox(
      height: 44,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _categories.length,
        itemBuilder: (context, index) {
          final category = _categories[index];
          final isSelected = _selectedCategory == category;
          
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              label: Text(_getCategoryLabel(category)),
              selected: isSelected,
              onSelected: (selected) {
                setState(() => _selectedCategory = selected ? category : 'all');
              },
              backgroundColor: Colors.white,
              selectedColor: AppColors.primaryBlue.withOpacity(0.2),
              labelStyle: GoogleFonts.poppins(
                color: isSelected ? AppColors.primaryBlue : Colors.grey[700],
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                fontSize: 12,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
                side: BorderSide(
                  color: isSelected ? AppColors.primaryBlue : Colors.grey[300]!,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildStatsRow(bool isArabic) {
    final filteredCount = _filteredDocuments.length;
    final totalCount = _documents.length;

    return Container(
      padding: const EdgeInsets.all(16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            isArabic
                ? 'عرض $filteredCount من $totalCount مستند'
                : 'Showing $filteredCount of $totalCount documents',
            style: GoogleFonts.poppins(
              color: Colors.grey[600],
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(bool isArabic) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.folder_open, size: 80, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            isArabic ? 'لا توجد مستندات' : 'No documents found',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            isArabic
                ? 'جرب تغيير معايير البحث'
                : 'Try adjusting your search criteria',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDocumentsList(List<Map<String, dynamic>> documents, bool isArabic) {
    return RefreshIndicator(
      onRefresh: _loadDocuments,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: documents.length,
        itemBuilder: (context, index) {
          final doc = documents[index];
          return _buildDocumentCard(doc, isArabic);
        },
      ),
    );
  }

  Widget _buildDocumentCard(Map<String, dynamic> doc, bool isArabic) {
    final category = doc['category'] ?? 'other';
    final categoryColor = _getCategoryColor(category);
    final categoryIcon = _getCategoryIcon(category);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: () => _openDocument(doc['fileUrl']),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: categoryColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(categoryIcon, color: categoryColor, size: 24),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      doc['fileName'] ?? '-',
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: categoryColor.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            _getCategoryLabel(category),
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: categoryColor,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Icon(Icons.access_time, size: 12, color: Colors.grey[500]),
                        const SizedBox(width: 4),
                        Text(
                          _formatDate(doc['uploadedAt']),
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ),
                    if (doc['state'] != null || doc['locality'] != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Row(
                          children: [
                            Icon(Icons.location_on, size: 12, color: Colors.grey[500]),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                '${doc['locality'] ?? ''} ${doc['state'] ?? ''}'.trim(),
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: Colors.grey[600],
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              Column(
                children: [
                  IconButton(
                    icon: Icon(Icons.visibility, color: AppColors.primaryBlue),
                    onPressed: () => _openDocument(doc['fileUrl']),
                  ),
                  IconButton(
                    icon: Icon(Icons.download, color: Colors.grey[600]),
                    onPressed: () => _openDocument(doc['fileUrl']),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
