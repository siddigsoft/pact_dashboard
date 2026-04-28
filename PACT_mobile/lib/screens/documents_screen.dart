import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
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
  String _selectedMonth = 'all';
  String _selectedState = 'all';
  String _currentLocale = 'en';

  // User info for role-based filtering
  String? _currentUserId;
  String? _currentUserRole;
  String? _currentUserState;
  List<String> _currentUserHubs = [];

  // Sorting
  String _sortField = 'uploadedAt'; // uploadedAt, fileName, category
  bool _sortAscending = false;

  // Pagination
  int _displayedCount = 50;
  final int _pageSize = 50;

  // Available filters
  List<String> _availableMonths = [];
  List<String> _availableStates = [];

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
    _siteVisitCache = {};
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
      // First, fetch current user's role and information
      await _loadCurrentUserInfo();

      final List<Map<String, dynamic>> allDocs = [];
      final Set<String> seenIds = {};
      final Set<String> monthsSet = {};
      final Set<String> statesSet = {};
      int indexCounter = 1;

      // Helper to add month bucket
      String? getMonthBucket(String? dateStr) {
        if (dateStr == null) return null;
        try {
          final date = DateTime.parse(dateStr);
          return DateFormat('yyyy-MM').format(date);
        } catch (e) {
          return null;
        }
      }

      // Fetch MMP files from mmp_files table
      try {
        final mmpFiles = await Supabase.instance.client
            .from('mmp_files')
            .select(
              'id, name, original_filename, file_url, created_at, file_path',
            )
            .order('created_at', ascending: false)
            .limit(100);

        for (var doc in (mmpFiles ?? [])) {
          final docId = 'mmp-${doc['id']}';
          if (seenIds.contains(docId)) continue;
          seenIds.add(docId);

          final monthBucket = getMonthBucket(doc['created_at']);
          if (monthBucket != null) monthsSet.add(monthBucket);

          allDocs.add({
            'id': docId,
            'indexNo': indexCounter++,
            'fileName': doc['original_filename'] ?? doc['name'] ?? 'MMP File',
            'fileUrl': doc['file_url'] ?? doc['file_path'],
            'category': 'mmp_file',
            'uploadedAt': doc['created_at'],
            'monthBucket': monthBucket,
          });
        }
        debugPrint('Loaded ${mmpFiles.length ?? 0} MMP files');
      } catch (e) {
        debugPrint('Error loading MMP files: $e');
      }

      // Fetch cost receipts from cost_submissions (matches React code)
      try {
        final costReceipts = await Supabase.instance.client
            .from('cost_submissions')
            .select(
              'id, receipt_url, receipt_filename, amount, created_at, status, site_visit_id, documents, project_id, submitted_by',
            )
            .eq('status', 'approved')
            .order('created_at', ascending: false);

        // Fetch submitter profiles to get state_id and hub_id
        final submitterIds = <String>{};
        final submitterProfiles = <String, Map<String, dynamic>>{};

        for (var doc in (costReceipts ?? [])) {
          final submitterId = doc['submitted_by'] as String?;
          if (submitterId != null) {
            submitterIds.add(submitterId);
          }
        }

        // Fetch profiles for all submitters
        if (submitterIds.isNotEmpty) {
          final profiles = await Supabase.instance.client
              .from('profiles')
              .select('id, state_id, hub_id')
              .inFilter('id', submitterIds.toList());

          for (var profile in profiles) {
            submitterProfiles[profile['id'] as String] = profile;
          }
        }

        for (var doc in (costReceipts ?? [])) {
          final monthBucket = getMonthBucket(doc['created_at']);
          if (monthBucket != null) monthsSet.add(monthBucket);

          final submitterId = doc['submitted_by'] as String?;
          String? submitterStateId;
          String? submitterHubId;

          // Get submitter's state and hub
          if (submitterId != null) {
            final submitterProfile = submitterProfiles[submitterId];
            if (submitterProfile != null) {
              submitterStateId = submitterProfile['state_id'] as String?;
              submitterHubId = submitterProfile['hub_id'] as String?;
            }
          }

          // Add main receipt if exists
          if (doc['receipt_url'] != null) {
            final docId = 'cost-${doc['id']}';
            if (!seenIds.contains(docId)) {
              seenIds.add(docId);

              final amount = doc['amount'] ?? 0;
              final fileName =
                  doc['receipt_filename'] ??
                  'Receipt - ${amount > 0 ? "SDG $amount" : "Cost Submission"}';

              allDocs.add({
                'id': docId,
                'indexNo': indexCounter++,
                'fileName': fileName,
                'fileUrl': doc['receipt_url'],
                'category': 'cost_receipt',
                'uploadedAt': doc['created_at'],
                'status': 'approved',
                'verified': true,
                'siteVisitId': doc['site_visit_id'],
                'projectId': doc['project_id'],
                'monthBucket': monthBucket,
                'sourceType': 'cost',
                'dataCollectorId': submitterId,
                'creatorStateId': submitterStateId,
                'creatorHubId': submitterHubId,
              });
            }
          }

          // Add any additional documents from the documents JSON field (only if approved)
          if (doc['documents'] is List && doc['status'] == 'approved') {
            for (var i = 0; i < (doc['documents'] as List).length; i++) {
              final suppDoc = doc['documents'][i];
              if (suppDoc is Map &&
                  (suppDoc['fileUrl'] != null || suppDoc['url'] != null)) {
                final suppId = 'cost-doc-${doc['id']}-$i';
                if (!seenIds.contains(suppId)) {
                  seenIds.add(suppId);

                  final docMonth = getMonthBucket(
                    suppDoc['uploadedAt'] ?? doc['created_at'],
                  );
                  if (docMonth != null) monthsSet.add(docMonth);

                  allDocs.add({
                    'id': suppId,
                    'indexNo': indexCounter++,
                    'fileName':
                        suppDoc['fileName'] ??
                        suppDoc['name'] ??
                        'Cost Document ${i + 1}',
                    'fileUrl': suppDoc['fileUrl'] ?? suppDoc['url'],
                    'category': 'cost_receipt',
                    'uploadedAt': suppDoc['uploadedAt'] ?? doc['created_at'],
                    'status': 'approved',
                    'verified': true,
                    'siteVisitId': doc['site_visit_id'],
                    'projectId': doc['project_id'],
                    'monthBucket': docMonth,
                    'sourceType': 'cost',
                    'dataCollectorId': submitterId,
                    'creatorStateId': submitterStateId,
                    'creatorHubId': submitterHubId,
                  });
                }
              }
            }
          }
        }
        debugPrint(
          'Loaded ${costReceipts.length ?? 0} approved cost submissions',
        );
      } catch (e) {
        debugPrint('Error loading cost receipts: $e');
      }

      // Fetch site visit photos from database table
      debugPrint('Loading site visit photos...');
      try {
        final reportPhotos = await Supabase.instance.client
            .from('report_photos')
            .select(
              'id, photo_url, created_at, report_id, storage_path, reports(id, created_by, visit_reports(id, user_id, device_id, created_at, site_visit_id)), site_visit_id',
            )
            .isFilter('deleted_at', null)
            .order('created_at', ascending: false);

        // Fetch creator profiles to get state_id and hub_id for each photo
        final creatorIds = <String>{};
        final creatorProfiles = <String, Map<String, dynamic>>{};

        for (var photo in reportPhotos) {
          if (photo['reports'] is Map) {
            final reports = photo['reports'] as Map<String, dynamic>;
            final creatorId = reports['created_by'] as String?;
            if (creatorId != null) {
              creatorIds.add(creatorId);
            }
          }
        }

        // Fetch profiles for all creators
        if (creatorIds.isNotEmpty) {
          final profiles = await Supabase.instance.client
              .from('profiles')
              .select('id, state_id, hub_id')
              .inFilter('id', creatorIds.toList());

          for (var profile in profiles) {
            creatorProfiles[profile['id'] as String] = profile;
          }
        }

        for (var photo in reportPhotos) {
          if (photo['photo_url'] == null) continue;

          final photoId = 'photo-${photo['id']}';
          if (!seenIds.contains(photoId)) {
            seenIds.add(photoId);

            final monthBucket = getMonthBucket(photo['created_at']);
            if (monthBucket != null) monthsSet.add(monthBucket);

            // Extract filename from storage_path or photo_url
            String fileName = 'Site Visit Photo';
            if (photo['storage_path'] != null) {
              fileName = (photo['storage_path'] as String).split('/').last;
            } else if (photo['photo_url'] != null) {
              fileName = (photo['photo_url'] as String).split('/').last;
            }

            // Extract metadata
            String? dataCollectorId;
            String? deviceId;
            String? siteVisitId = photo['site_visit_id'] as String?;
            String? creatorStateId;
            String? creatorHubId;

            if (photo['reports'] is Map && photo['reports'] != null) {
              final reports = photo['reports'] as Map<String, dynamic>;
              dataCollectorId = reports['created_by'] as String?;

              // Get creator's state and hub
              if (dataCollectorId != null) {
                final creatorProfile = creatorProfiles[dataCollectorId];
                if (creatorProfile != null) {
                  creatorStateId = creatorProfile['state_id'] as String?;
                  creatorHubId = creatorProfile['hub_id'] as String?;
                }
              }

              if (reports['visit_reports'] is List &&
                  (reports['visit_reports'] as List).isNotEmpty) {
                final visitReport = (reports['visit_reports'] as List).first;
                if (visitReport is Map) {
                  deviceId = visitReport['device_id'] as String?;
                  siteVisitId =
                      visitReport['site_visit_id'] as String? ?? siteVisitId;
                }
              }
            }

            allDocs.add({
              'id': photoId,
              'indexNo': indexCounter++,
              'fileName': fileName,
              'fileUrl': photo['photo_url'],
              'category': 'site_visit_photo',
              'uploadedAt':
                  photo['created_at'] ?? DateTime.now().toIso8601String(),
              'reportId': photo['report_id'],
              'monthBucket': monthBucket,
              'status': 'verified',
              'verified': true,
              'sourceType': 'report',
              'siteVisitId': siteVisitId,
              'dataCollectorId': dataCollectorId,
              'deviceId': deviceId,
              'creatorStateId': creatorStateId,
              'creatorHubId': creatorHubId,
            });
          }
        }

        debugPrint('Loaded ${reportPhotos.length} site visit photos');
      } catch (e) {
        debugPrint(
          'Site visit photos table error: $e - trying storage bucket fallback...',
        );

        // Fallback: Try to list photos from Supabase storage bucket
        try {
          int photoCount = 0;
          final storageList = await Supabase.instance.client.storage
              .from('site-visit-media')
              .list();

          debugPrint(
            'Storage bucket has ${storageList.length} top-level items',
          );

          // Try direct listing first (in case files are at root)
          for (var item in storageList) {
            if (item.name.endsWith('.jpg') ||
                item.name.endsWith('.jpeg') ||
                item.name.endsWith('.png') ||
                item.name.endsWith('.webp')) {
              final photoId = 'storage-photo-${item.id ?? item.name}';
              if (!seenIds.contains(photoId)) {
                seenIds.add(photoId);

                final photoUrl = Supabase.instance.client.storage
                    .from('site-visit-media')
                    .getPublicUrl(item.name);

                final uploadedAt = item.createdAt ?? item.updatedAt;
                final monthBucket = uploadedAt != null
                    ? getMonthBucket(uploadedAt)
                    : null;
                if (monthBucket != null) monthsSet.add(monthBucket);

                allDocs.add({
                  'id': photoId,
                  'indexNo': indexCounter++,
                  'fileName': item.name,
                  'fileUrl': photoUrl,
                  'category': 'site_visit_photo',
                  'uploadedAt': uploadedAt ?? DateTime.now().toIso8601String(),
                  'monthBucket': monthBucket,
                });
                photoCount++;
              }
            }
          }

          // List nested folders (userId/siteVisitId/photoType structure)
          for (var folder in storageList) {
            if (folder.name.isEmpty || folder.name.contains('.')) continue;

            try {
              final subItems = await Supabase.instance.client.storage
                  .from('site-visit-media')
                  .list(path: folder.name);

              debugPrint('Folder ${folder.name} has ${subItems.length} items');

              for (var subItem in subItems) {
                if (subItem.name.isEmpty) continue;

                // Check if it's a direct file
                if (subItem.name.endsWith('.jpg') ||
                    subItem.name.endsWith('.jpeg') ||
                    subItem.name.endsWith('.png') ||
                    subItem.name.endsWith('.webp')) {
                  final photoId = 'storage-photo-${subItem.id ?? subItem.name}';
                  if (!seenIds.contains(photoId)) {
                    seenIds.add(photoId);

                    final photoUrl = Supabase.instance.client.storage
                        .from('site-visit-media')
                        .getPublicUrl('${folder.name}/${subItem.name}');

                    final uploadedAt = subItem.createdAt ?? subItem.updatedAt;
                    final monthBucket = uploadedAt != null
                        ? getMonthBucket(uploadedAt)
                        : null;
                    if (monthBucket != null) monthsSet.add(monthBucket);

                    allDocs.add({
                      'id': photoId,
                      'indexNo': indexCounter++,
                      'fileName': subItem.name,
                      'fileUrl': photoUrl,
                      'category': 'site_visit_photo',
                      'uploadedAt':
                          uploadedAt ?? DateTime.now().toIso8601String(),
                      'monthBucket': monthBucket,
                    });
                    photoCount++;
                  }
                } else {
                  // It's another folder, go deeper
                  try {
                    final deepItems = await Supabase.instance.client.storage
                        .from('site-visit-media')
                        .list(path: '${folder.name}/${subItem.name}');

                    for (var photo in deepItems) {
                      if (photo.name.isEmpty) continue;
                      if (photo.name.endsWith('.jpg') ||
                          photo.name.endsWith('.jpeg') ||
                          photo.name.endsWith('.png') ||
                          photo.name.endsWith('.webp')) {
                        final photoId =
                            'storage-photo-${photo.id ?? photo.name}';
                        if (!seenIds.contains(photoId)) {
                          seenIds.add(photoId);

                          final photoUrl = Supabase.instance.client.storage
                              .from('site-visit-media')
                              .getPublicUrl(
                                '${folder.name}/${subItem.name}/${photo.name}',
                              );

                          final uploadedAt = photo.createdAt ?? photo.updatedAt;
                          final monthBucket = uploadedAt != null
                              ? getMonthBucket(uploadedAt)
                              : null;
                          if (monthBucket != null) monthsSet.add(monthBucket);

                          allDocs.add({
                            'id': photoId,
                            'indexNo': indexCounter++,
                            'fileName': photo.name,
                            'fileUrl': photoUrl,
                            'category': 'site_visit_photo',
                            'uploadedAt':
                                uploadedAt ?? DateTime.now().toIso8601String(),
                            'monthBucket': monthBucket,
                          });
                          photoCount++;
                        }
                      }
                    }
                  } catch (e) {
                    debugPrint(
                      'Error listing deep folder ${folder.name}/${subItem.name}: $e',
                    );
                  }
                }
              }
            } catch (e) {
              debugPrint('Error listing folder ${folder.name}: $e');
            }
          }
          debugPrint('Loaded $photoCount photos from storage bucket');
        } catch (storageError) {
          debugPrint('Could not access storage bucket: $storageError');
        }
      }

      // Fetch permits from mmp_files permits field
      try {
        final mmpWithPermits = await Supabase.instance.client
            .from('mmp_files')
            .select('id, name, permits, created_at')
            .not('permits', 'is', null)
            .order('created_at', ascending: false)
            .limit(50);

        for (var mmp in (mmpWithPermits ?? [])) {
          final monthBucket = getMonthBucket(mmp['created_at']);
          final permits = mmp['permits'];

          if (permits != null && permits is Map) {
            // Federal permits
            if (permits['documents'] is List) {
              for (var i = 0; i < (permits['documents'] as List).length; i++) {
                final doc = permits['documents'][i];
                if (doc == null || doc is! Map) continue;
                final permitId = '${mmp['id']}-fed-$i';
                if (!seenIds.contains(permitId) && doc['fileUrl'] != null) {
                  seenIds.add(permitId);
                  final docMonth =
                      getMonthBucket(doc['uploadedAt']?.toString()) ??
                      monthBucket;
                  if (docMonth != null) monthsSet.add(docMonth);
                  allDocs.add({
                    'id': permitId,
                    'indexNo': indexCounter++,
                    'fileName': doc['fileName'] ?? 'Federal Permit',
                    'fileUrl': doc['fileUrl'],
                    'category': 'federal_permit',
                    'uploadedAt': doc['uploadedAt'] ?? mmp['created_at'],
                    'status': doc['validated'] == true ? 'verified' : 'pending',
                    'monthBucket': docMonth,
                  });
                }
              }
            }

            // State permits
            if (permits['statePermits'] is List) {
              for (var sp in permits['statePermits']) {
                if (sp == null || sp is! Map) continue;
                final stateName = sp['stateName'];
                if (stateName != null) statesSet.add(stateName);

                if (sp['documents'] is List) {
                  for (var i = 0; i < (sp['documents'] as List).length; i++) {
                    final doc = sp['documents'][i];
                    if (doc == null || doc is! Map) continue;
                    final permitId = '${mmp['id']}-state-$stateName-$i';
                    if (!seenIds.contains(permitId) && doc['fileUrl'] != null) {
                      seenIds.add(permitId);
                      final docMonth =
                          getMonthBucket(doc['uploadedAt']?.toString()) ??
                          monthBucket;
                      if (docMonth != null) monthsSet.add(docMonth);
                      allDocs.add({
                        'id': permitId,
                        'indexNo': indexCounter++,
                        'fileName':
                            doc['fileName'] ?? 'State Permit - $stateName',
                        'fileUrl': doc['fileUrl'],
                        'category': 'state_permit',
                        'uploadedAt': doc['uploadedAt'] ?? mmp['created_at'],
                        'state': stateName,
                        'status': doc['validated'] == true
                            ? 'verified'
                            : 'pending',
                        'monthBucket': docMonth,
                      });
                    }
                  }
                }
              }
            }

            // Local permits
            if (permits['localPermits'] is List) {
              for (var lp in permits['localPermits']) {
                if (lp == null || lp is! Map) continue;
                final localityName = lp['localityName'];

                if (lp['documents'] is List) {
                  for (var i = 0; i < (lp['documents'] as List).length; i++) {
                    final doc = lp['documents'][i];
                    if (doc == null || doc is! Map) continue;
                    final permitId = '${mmp['id']}-local-$localityName-$i';
                    if (!seenIds.contains(permitId) && doc['fileUrl'] != null) {
                      seenIds.add(permitId);
                      final docMonth =
                          getMonthBucket(doc['uploadedAt']?.toString()) ??
                          monthBucket;
                      if (docMonth != null) monthsSet.add(docMonth);
                      allDocs.add({
                        'id': permitId,
                        'indexNo': indexCounter++,
                        'fileName':
                            doc['fileName'] ?? 'Local Permit - $localityName',
                        'fileUrl': doc['fileUrl'],
                        'category': 'local_permit',
                        'uploadedAt': doc['uploadedAt'] ?? mmp['created_at'],
                        'locality': localityName,
                        'status': doc['validated'] == true
                            ? 'verified'
                            : 'pending',
                        'monthBucket': docMonth,
                      });
                    }
                  }
                }
              }
            }
          }
        }
        debugPrint(
          'Loaded permits from ${mmpWithPermits.length ?? 0} MMP files',
        );
      } catch (e) {
        debugPrint('Error loading permits: $e');
      }

      // NOTE: wallet_transactions are NOT loaded in the React web app
      // Removed to match web app behavior exactly

      // Sort by date (newest first) initially
      allDocs.sort((a, b) {
        final dateA =
            DateTime.tryParse(a['uploadedAt']?.toString() ?? '') ??
            DateTime(1970);
        final dateB =
            DateTime.tryParse(b['uploadedAt']?.toString() ?? '') ??
            DateTime(1970);
        return dateB.compareTo(dateA);
      });

      // Reassign index numbers sequentially after sorting (1, 2, 3...)
      for (var i = 0; i < allDocs.length; i++) {
        allDocs[i]['indexNo'] = i + 1;
      }

      // Prepare filter lists
      final sortedMonths = monthsSet.toList()..sort((a, b) => b.compareTo(a));
      final sortedStates = statesSet.toList()..sort();

      if (mounted) {
        setState(() {
          _documents = allDocs;
          _availableMonths = sortedMonths;
          _availableStates = sortedStates;
          _isLoading = false;
        });
      }

      debugPrint('Total documents loaded: ${allDocs.length}');
      debugPrint('Available months: ${sortedMonths.length}');
      debugPrint('Available states: ${sortedStates.length}');
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
    var filtered = _documents.where((doc) {
      // Apply role-based filtering
      if (!_canViewDocument(doc)) {
        return false;
      }

      final matchesSearch =
          _searchQuery.isEmpty ||
          (doc['fileName']?.toString().toLowerCase().contains(
                _searchQuery.toLowerCase(),
              ) ??
              false) ||
          (doc['projectName']?.toString().toLowerCase().contains(
                _searchQuery.toLowerCase(),
              ) ??
              false) ||
          (doc['state']?.toString().toLowerCase().contains(
                _searchQuery.toLowerCase(),
              ) ??
              false) ||
          (doc['locality']?.toString().toLowerCase().contains(
                _searchQuery.toLowerCase(),
              ) ??
              false);

      final matchesCategory =
          _selectedCategory == 'all' || doc['category'] == _selectedCategory;

      final matchesMonth =
          _selectedMonth == 'all' || doc['monthBucket'] == _selectedMonth;

      final matchesState =
          _selectedState == 'all' || doc['state'] == _selectedState;

      return matchesSearch && matchesCategory && matchesMonth && matchesState;
    }).toList();

    // Apply sorting
    filtered.sort((a, b) {
      int comparison = 0;

      if (_sortField == 'uploadedAt') {
        final dateA =
            DateTime.tryParse(a['uploadedAt']?.toString() ?? '') ??
            DateTime(1970);
        final dateB =
            DateTime.tryParse(b['uploadedAt']?.toString() ?? '') ??
            DateTime(1970);
        comparison = dateA.compareTo(dateB);
      } else if (_sortField == 'fileName') {
        comparison = (a['fileName']?.toString() ?? '').compareTo(
          b['fileName']?.toString() ?? '',
        );
      } else if (_sortField == 'category') {
        comparison = (a['category']?.toString() ?? '').compareTo(
          b['category']?.toString() ?? '',
        );
      }

      return _sortAscending ? comparison : -comparison;
    });

    return filtered;
  }

  Map<String, dynamic>? _siteVisitCache = {};

  // Group documents by site visit
  Map<String?, List<Map<String, dynamic>>> _groupDocumentsBySiteVisit(
    List<Map<String, dynamic>> documents,
  ) {
    final grouped = <String?, List<Map<String, dynamic>>>{};
    for (var doc in documents) {
      final siteVisitId = doc['siteVisitId'] as String?;
      final key = siteVisitId ?? 'no-site';

      if (!grouped.containsKey(key)) {
        grouped[key] = [];
      }
      grouped[key]!.add(doc);
    }
    return grouped;
  }

  // Fetch site visit details for a given site visit ID
  Future<void> _getSiteVisitDetails(String siteVisitId) async {
    if (_siteVisitCache![siteVisitId] != null) {
      return;
    }

    try {
      final response = await Supabase.instance.client
          .from('site_visits')
          .select(
            'id, site_id, created_at, site:sites(id, name, address, project_id, state)',
          )
          .eq('id', siteVisitId)
          .single();

      _siteVisitCache![siteVisitId] = response;
    } catch (e) {
      debugPrint('Error fetching site visit $siteVisitId: $e');
    }
  }

  // Load current user's role and information for filtering
  Future<void> _loadCurrentUserInfo() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) return;

      _currentUserId = user.id;

      final profile = await Supabase.instance.client
          .from('profiles')
          .select('id, role, state_id, hubs_assigned')
          .eq('id', user.id)
          .single();

      _currentUserRole = profile['role'] as String?;
      _currentUserState = profile['state_id'] as String?;

      if (profile['hubs_assigned'] is List) {
        _currentUserHubs = List<String>.from(profile['hubs_assigned'] as List);
      }

      debugPrint(
        'Current user role: $_currentUserRole, state: $_currentUserState',
      );
    } catch (e) {
      debugPrint('Error loading current user info: $e');
    }
  }

  // Check if user can view a document based on role-based ACL
  bool _canViewDocument(Map<String, dynamic> doc) {
    final role = (_currentUserRole ?? '').toLowerCase();
    final documentCreatorId = doc['dataCollectorId'] as String?;
    final creatorStateId = doc['creatorStateId'] as String?;
    final creatorHubId = doc['creatorHubId'] as String?;

    // FOM and above roles (admin, super_admin, country_director, fom, data_team) can see all documents
    if (role == 'fom' ||
        role == 'admin' ||
        role == 'super_admin' ||
        role == 'country_director' ||
        role == 'data_team') {
      return true;
    }

    // Data Collector: can only see their own documents
    if (role == 'data_collector' || role == 'datacollector') {
      return documentCreatorId == _currentUserId;
    }

    // Coordinator (state level): can see documents from their state
    if (role == 'coordinator' ||
        role == 'field_coordinator' ||
        role == 'state_coordinator') {
      // Can see their own documents
      if (documentCreatorId == _currentUserId) {
        return true;
      }
      // Can see documents from their state
      if (_currentUserState != null && creatorStateId == _currentUserState) {
        return true;
      }
      return false;
    }

    // Supervisor (hub level): can see documents from their hub states
    if (role == 'supervisor' || role == 'hub_supervisor') {
      // Can see their own documents
      if (documentCreatorId == _currentUserId) {
        return true;
      }
      // Can see documents from their hub
      if (_currentUserHubs.isNotEmpty && creatorHubId != null) {
        return _currentUserHubs.contains(creatorHubId);
      }
      return false;
    }

    // Default: deny access for unknown roles
    return false;
  }

  Future<Map<String, dynamic>?> _getSiteVisitDetailsData(
    String siteVisitId,
  ) async {
    if (_siteVisitCache![siteVisitId] != null) {
      return _siteVisitCache![siteVisitId];
    }

    try {
      final response = await Supabase.instance.client
          .from('site_visits')
          .select(
            'id, site_id, created_at, site:sites(id, name, address, project_id, state)',
          )
          .eq('id', siteVisitId)
          .single();

      _siteVisitCache![siteVisitId] = response;
      return response;
    } catch (e) {
      debugPrint('Error fetching site visit $siteVisitId: $e');
      return null;
    }
  }

  List<Map<String, dynamic>> get _displayedDocuments {
    final filtered = _filteredDocuments;
    if (_displayedCount >= filtered.length) {
      return filtered;
    }
    return filtered.sublist(0, _displayedCount);
  }

  void _loadMore() {
    setState(() {
      _displayedCount += _pageSize;
    });
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

  Future<void> _openDocument(String? url, String? category) async {
    if (url == null || url.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _currentLocale == 'ar' ? 'الملف غير متاح' : 'File not available',
          ),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    // Detect image URLs by extension or Supabase pattern
    final lowerUrl = url.toLowerCase().split('?').first;
    final isImage =
        lowerUrl.endsWith('.jpg') ||
        lowerUrl.endsWith('.jpeg') ||
        lowerUrl.endsWith('.png') ||
        lowerUrl.endsWith('.gif') ||
        lowerUrl.endsWith('.webp') ||
        lowerUrl.endsWith('.heic') ||
        lowerUrl.endsWith('.bmp') ||
        lowerUrl.contains('/site_visit_photo') ||
        lowerUrl.contains('/photos/');

    // On non-web, show images in an in-app full-screen viewer
    if (!kIsWeb && isImage) {
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) =>
              _DocumentImageViewer(url: url, locale: _currentLocale),
        ),
      );
      return;
    }

    try {
      final uri = Uri.parse(url);
      // On mobile prefer inAppBrowserView (Chrome Custom Tab / SFSafariVC)
      // On web use platformDefault which opens the URL normally
      final mode = kIsWeb
          ? LaunchMode.platformDefault
          : LaunchMode.inAppBrowserView;

      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: mode);
      } else {
        // Fallback: try platform default
        await launchUrl(uri, mode: LaunchMode.platformDefault);
      }
    } catch (e) {
      debugPrint('Error opening document: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _currentLocale == 'ar'
                  ? 'تعذر فتح الملف: $e'
                  : 'Could not open file: $e',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
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

  String _truncateText(String? text, int maxLength) {
    if (text == null || text.isEmpty) return '-';
    if (text.length <= maxLength) return text;
    return '${text.substring(0, maxLength)}...';
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = _currentLocale == 'ar';
    final filteredDocs = _filteredDocuments;
    final displayedDocs = _displayedDocuments;
    final hasMore = _displayedCount < filteredDocs.length;

    // Calculate statistics from FILTERED documents (applies role-based access control)
    final stats = {
      'total': filteredDocs.length,
      'verified': filteredDocs
          .where((d) => d['status'] == 'verified' || d['status'] == 'approved')
          .length,
      'pending': filteredDocs.where((d) => d['status'] == 'pending').length,
      'mmpFiles': filteredDocs.where((d) => d['category'] == 'mmp_file').length,
      'permits': filteredDocs
          .where((d) => (d['category']?.toString() ?? '').contains('permit'))
          .length,
      'receipts': filteredDocs
          .where((d) => d['category'] == 'cost_receipt')
          .length,
    };

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
            : SafeArea(
                top: false,
                child: CustomScrollView(
                  slivers: [
                    SliverToBoxAdapter(
                      child: _buildStatsCards(stats, isArabic),
                    ),
                    SliverToBoxAdapter(child: _buildSearchBar(isArabic)),
                    SliverToBoxAdapter(child: _buildFilterRow(isArabic)),
                    SliverToBoxAdapter(child: _buildCategoryFilter(isArabic)),
                    SliverToBoxAdapter(
                      child: _buildInfoRow(
                        filteredDocs.length,
                        displayedDocs.length,
                        isArabic,
                      ),
                    ),
                    displayedDocs.isEmpty
                        ? SliverFillRemaining(child: _buildEmptyState(isArabic))
                        : _buildDocumentsListSliver(
                            displayedDocs,
                            hasMore,
                            isArabic,
                          ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _buildStatsCards(Map<String, int> stats, bool isArabic) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: LayoutBuilder(
        builder: (context, constraints) {
          // Calculate card dimensions
          final cardWidth = (constraints.maxWidth - 16) / 3;
          final cardHeight = cardWidth * 0.85;

          return Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              SizedBox(
                width: cardWidth,
                height: cardHeight,
                child: _buildStatCard(
                  isArabic ? 'المجموع' : 'Total',
                  stats['total'].toString(),
                  Colors.blue,
                  Icons.folder_open,
                ),
              ),
              SizedBox(
                width: cardWidth,
                height: cardHeight,
                child: _buildStatCard(
                  isArabic ? 'موثق' : 'Verified',
                  stats['verified'].toString(),
                  Colors.green,
                  Icons.verified,
                ),
              ),
              SizedBox(
                width: cardWidth,
                height: cardHeight,
                child: _buildStatCard(
                  isArabic ? 'قيد الانتظار' : 'Pending',
                  stats['pending'].toString(),
                  Colors.orange,
                  Icons.pending,
                ),
              ),
              SizedBox(
                width: cardWidth,
                height: cardHeight,
                child: _buildStatCard(
                  isArabic ? 'MMPs' : 'MMPs',
                  stats['mmpFiles'].toString(),
                  Colors.purple,
                  Icons.table_chart,
                ),
              ),
              SizedBox(
                width: cardWidth,
                height: cardHeight,
                child: _buildStatCard(
                  isArabic ? 'تصاريح' : 'Permits',
                  stats['permits'].toString(),
                  Colors.red,
                  Icons.security,
                ),
              ),
              SizedBox(
                width: cardWidth,
                height: cardHeight,
                child: _buildStatCard(
                  isArabic ? 'إيصالات' : 'Receipts',
                  stats['receipts'].toString(),
                  Colors.teal,
                  Icons.receipt_long,
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildStatCard(
    String label,
    String value,
    Color color,
    IconData icon,
  ) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
          ),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              label,
              style: GoogleFonts.poppins(fontSize: 9, color: Colors.grey[600]),
              textAlign: TextAlign.center,
              maxLines: 1,
            ),
          ),
        ],
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
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 14,
          ),
        ),
      ),
    );
  }

  Widget _buildFilterRow(bool isArabic) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Expanded(
            child: Container(
              height: 40,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.grey[300]!),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  isExpanded: true,
                  value: _selectedMonth,
                  hint: Text(
                    isArabic ? 'الشهر' : 'Month',
                    style: GoogleFonts.poppins(fontSize: 12),
                  ),
                  items: [
                    DropdownMenuItem(
                      value: 'all',
                      child: Text(
                        isArabic ? 'كل الأشهر' : 'All months',
                        style: GoogleFonts.poppins(fontSize: 12),
                      ),
                    ),
                    ..._availableMonths.map(
                      (month) => DropdownMenuItem(
                        value: month,
                        child: Text(
                          month,
                          style: GoogleFonts.poppins(fontSize: 12),
                        ),
                      ),
                    ),
                  ],
                  onChanged: (value) {
                    setState(() {
                      _selectedMonth = value ?? 'all';
                      _displayedCount = _pageSize;
                    });
                  },
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              height: 40,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.grey[300]!),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  isExpanded: true,
                  value: _selectedState,
                  hint: Text(
                    isArabic ? 'الولاية' : 'State',
                    style: GoogleFonts.poppins(fontSize: 12),
                  ),
                  items: [
                    DropdownMenuItem(
                      value: 'all',
                      child: Text(
                        isArabic ? 'كل الولايات' : 'All states',
                        style: GoogleFonts.poppins(fontSize: 12),
                      ),
                    ),
                    ..._availableStates.map(
                      (state) => DropdownMenuItem(
                        value: state,
                        child: Text(
                          state,
                          style: GoogleFonts.poppins(fontSize: 12),
                        ),
                      ),
                    ),
                  ],
                  onChanged: (value) {
                    setState(() {
                      _selectedState = value ?? 'all';
                      _displayedCount = _pageSize;
                    });
                  },
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          PopupMenuButton<String>(
            icon: const Icon(Icons.sort, color: AppColors.primaryBlue),
            onSelected: (value) {
              setState(() {
                if (_sortField == value) {
                  _sortAscending = !_sortAscending;
                } else {
                  _sortField = value;
                  _sortAscending = true;
                }
              });
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: 'uploadedAt',
                child: Row(
                  children: [
                    Icon(
                      Icons.access_time,
                      size: 16,
                      color: _sortField == 'uploadedAt'
                          ? AppColors.primaryBlue
                          : Colors.grey,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      isArabic ? 'التاريخ' : 'Date',
                      style: GoogleFonts.poppins(fontSize: 12),
                    ),
                    if (_sortField == 'uploadedAt')
                      Icon(
                        _sortAscending
                            ? Icons.arrow_upward
                            : Icons.arrow_downward,
                        size: 14,
                      ),
                  ],
                ),
              ),
              PopupMenuItem(
                value: 'fileName',
                child: Row(
                  children: [
                    Icon(
                      Icons.text_fields,
                      size: 16,
                      color: _sortField == 'fileName'
                          ? AppColors.primaryBlue
                          : Colors.grey,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      isArabic ? 'الاسم' : 'Name',
                      style: GoogleFonts.poppins(fontSize: 12),
                    ),
                    if (_sortField == 'fileName')
                      Icon(
                        _sortAscending
                            ? Icons.arrow_upward
                            : Icons.arrow_downward,
                        size: 14,
                      ),
                  ],
                ),
              ),
              PopupMenuItem(
                value: 'category',
                child: Row(
                  children: [
                    Icon(
                      Icons.category,
                      size: 16,
                      color: _sortField == 'category'
                          ? AppColors.primaryBlue
                          : Colors.grey,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      isArabic ? 'الفئة' : 'Category',
                      style: GoogleFonts.poppins(fontSize: 12),
                    ),
                    if (_sortField == 'category')
                      Icon(
                        _sortAscending
                            ? Icons.arrow_upward
                            : Icons.arrow_downward,
                        size: 14,
                      ),
                  ],
                ),
              ),
            ],
          ),
        ],
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
              selectedColor: AppColors.primaryBlue.withValues(alpha: 0.2),
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

  Widget _buildInfoRow(int filteredCount, int displayedCount, bool isArabic) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            isArabic
                ? 'عرض $displayedCount من $filteredCount'
                : 'Showing $displayedCount of $filteredCount',
            style: GoogleFonts.poppins(color: Colors.grey[600], fontSize: 12),
          ),
          if (_searchQuery.isNotEmpty ||
              _selectedCategory != 'all' ||
              _selectedMonth != 'all' ||
              _selectedState != 'all')
            TextButton.icon(
              onPressed: () {
                setState(() {
                  _searchQuery = '';
                  _selectedCategory = 'all';
                  _selectedMonth = 'all';
                  _selectedState = 'all';
                  _displayedCount = _pageSize;
                });
              },
              icon: const Icon(Icons.clear, size: 14),
              label: Text(
                isArabic ? 'مسح الفلاتر' : 'Clear filters',
                style: GoogleFonts.poppins(fontSize: 11),
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
            style: GoogleFonts.poppins(fontSize: 18, color: Colors.grey[600]),
          ),
          const SizedBox(height: 8),
          Text(
            isArabic
                ? 'جرب تغيير معايير البحث'
                : 'Try adjusting your search criteria',
            style: GoogleFonts.poppins(fontSize: 14, color: Colors.grey[500]),
          ),
        ],
      ),
    );
  }

  Widget _buildDocumentsList(
    List<Map<String, dynamic>> documents,
    bool hasMore,
    bool isArabic,
  ) {
    return RefreshIndicator(
      onRefresh: _loadDocuments,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: documents.length + (hasMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == documents.length) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: ElevatedButton.icon(
                  onPressed: _loadMore,
                  icon: const Icon(Icons.expand_more),
                  label: Text(
                    isArabic ? 'تحميل المزيد' : 'Load More',
                    style: GoogleFonts.poppins(),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryBlue,
                    foregroundColor: Colors.white,
                  ),
                ),
              ),
            );
          }
          final doc = documents[index];
          return _buildDocumentCard(doc, isArabic);
        },
      ),
    );
  }

  Widget _buildDocumentsListSliver(
    List<Map<String, dynamic>> documents,
    bool hasMore,
    bool isArabic,
  ) {
    final grouped = _groupDocumentsBySiteVisit(documents);

    return SliverList(
      delegate: SliverChildBuilderDelegate((context, index) {
        // Get grouped keys
        final groupKeys = grouped.keys.toList();
        int currentIndex = 0;

        // Iterate through groups
        for (var groupKey in groupKeys) {
          final groupDocs = grouped[groupKey]!;

          // Add site header
          if (index == currentIndex) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: _buildSiteGroupHeader(groupKey, groupDocs, isArabic),
            );
          }
          currentIndex++;

          // Add documents in this group
          for (var doc in groupDocs) {
            if (index == currentIndex) {
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: _buildDocumentCard(doc, isArabic),
              );
            }
            currentIndex++;
          }
        }

        // Load more button
        if (index == currentIndex && hasMore) {
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Center(
              child: ElevatedButton.icon(
                onPressed: _loadMore,
                icon: const Icon(Icons.expand_more),
                label: Text(
                  isArabic ? 'تحميل المزيد' : 'Load More',
                  style: GoogleFonts.poppins(),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlue,
                  foregroundColor: Colors.white,
                ),
              ),
            ),
          );
        }

        return const SizedBox.shrink();
      }, childCount: _buildGroupedItemCount(grouped, hasMore)),
    );
  }

  // Calculate total item count for grouped display (headers + docs + load more button)
  int _buildGroupedItemCount(
    Map<String?, List<Map<String, dynamic>>> grouped,
    bool hasMore,
  ) {
    int count = 0;
    for (var docs in grouped.values) {
      count += 1; // Header
      count += docs.length; // Documents
    }
    if (hasMore) count += 1; // Load more button
    return count;
  }

  Widget _buildSiteGroupHeader(
    String? siteVisitId,
    List<Map<String, dynamic>> docs,
    bool isArabic,
  ) {
    // Extract data collector and device info from documents (for site photos)
    String? dataCollectorId;
    String? deviceId;
    for (var doc in docs) {
      if (doc['dataCollectorId'] != null && dataCollectorId == null) {
        dataCollectorId = doc['dataCollectorId'];
      }
      if (doc['deviceId'] != null && deviceId == null) {
        deviceId = doc['deviceId'];
      }
    }

    return FutureBuilder<Map<String, dynamic>?>(
      future: siteVisitId != null && siteVisitId != 'no-site'
          ? _getSiteVisitDetailsData(siteVisitId)
          : Future.value(null),
      builder: (context, snapshot) {
        final siteData = snapshot.data;
        String siteName = isArabic ? 'بدون موقع' : 'No Site';
        String siteLocation = '';

        if (siteData != null && siteData['site'] != null) {
          final site = siteData['site'];
          siteName = site['name'] ?? siteName;
          siteLocation = site['address'] ?? site['state'] ?? '';
        }

        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.primaryBlue.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: AppColors.primaryBlue.withValues(alpha: 0.2),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.location_on,
                    color: AppColors.primaryBlue,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          siteName,
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: AppColors.primaryBlue,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (siteLocation.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            siteLocation,
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.grey[600],
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.primaryBlue.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '${docs.length} ${isArabic ? "مستند" : "doc"}',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primaryBlue,
                      ),
                    ),
                  ),
                ],
              ),
              // Show data collector and device info if available
              if (dataCollectorId != null || deviceId != null) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 12,
                  children: [
                    if (dataCollectorId != null)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.person, size: 12, color: Colors.grey[600]),
                          const SizedBox(width: 4),
                          Text(
                            _truncateText(dataCollectorId, 20),
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: Colors.grey[600],
                            ),
                          ),
                        ],
                      ),
                    if (deviceId != null)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.devices,
                            size: 12,
                            color: Colors.grey[600],
                          ),
                          const SizedBox(width: 4),
                          Text(
                            _truncateText(deviceId, 20),
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: Colors.grey[600],
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildDocumentCard(Map<String, dynamic> doc, bool isArabic) {
    final category = doc['category'] ?? 'other';
    final categoryColor = _getCategoryColor(category);
    final categoryIcon = _getCategoryIcon(category);
    final status = doc['status'];

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: () => _openDocument(doc['fileUrl'], doc['category']),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              // Index number
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: Colors.grey[200],
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    '${doc['indexNo'] ?? 0}',
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey[700],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: categoryColor.withValues(alpha: 0.1),
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
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: categoryColor.withValues(alpha: 0.1),
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
                        if (status != null)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color:
                                  status == 'verified' || status == 'approved'
                                  ? Colors.green.withValues(alpha: 0.1)
                                  : status == 'rejected'
                                  ? Colors.red.withValues(alpha: 0.1)
                                  : Colors.orange.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              status.toString().toUpperCase(),
                              style: GoogleFonts.poppins(
                                fontSize: 9,
                                color:
                                    status == 'verified' || status == 'approved'
                                    ? Colors.green[700]
                                    : status == 'rejected'
                                    ? Colors.red[700]
                                    : Colors.orange[700],
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(
                          Icons.access_time,
                          size: 12,
                          color: Colors.grey[500],
                        ),
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
                    // Data collector info for site photos
                    if (doc['category'] == 'site_visit_photo' &&
                        doc['dataCollectorId'] != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Row(
                          children: [
                            Icon(
                              Icons.person,
                              size: 12,
                              color: Colors.grey[500],
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                _truncateText(doc['dataCollectorId'], 25),
                                style: GoogleFonts.poppins(
                                  fontSize: 10,
                                  color: Colors.grey[600],
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    // Device ID info for site photos
                    if (doc['category'] == 'site_visit_photo' &&
                        doc['deviceId'] != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Row(
                          children: [
                            Icon(
                              Icons.devices,
                              size: 12,
                              color: Colors.grey[500],
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                _truncateText(doc['deviceId'], 25),
                                style: GoogleFonts.poppins(
                                  fontSize: 10,
                                  color: Colors.grey[600],
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (doc['projectName'] != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Row(
                          children: [
                            Icon(
                              Icons.work_outline,
                              size: 12,
                              color: Colors.grey[500],
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                doc['projectName'],
                                style: GoogleFonts.poppins(
                                  fontSize: 10,
                                  color: Colors.grey[600],
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (doc['state'] != null || doc['locality'] != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Row(
                          children: [
                            Icon(
                              Icons.location_on,
                              size: 12,
                              color: Colors.grey[500],
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                '${doc['locality'] ?? ''} ${doc['state'] ?? ''}'
                                    .trim(),
                                style: GoogleFonts.poppins(
                                  fontSize: 10,
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
              IconButton(
                icon: Icon(Icons.visibility, color: AppColors.primaryBlue),
                onPressed: () => _openDocument(doc['fileUrl'], doc['category']),
                tooltip: isArabic ? 'عرض' : 'View',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Full-screen in-app image viewer for document photos (mobile)
class _DocumentImageViewer extends StatefulWidget {
  final String url;
  final String locale;
  const _DocumentImageViewer({required this.url, required this.locale});

  @override
  State<_DocumentImageViewer> createState() => _DocumentImageViewerState();
}

class _DocumentImageViewerState extends State<_DocumentImageViewer> {
  final TransformationController _transformationController =
      TransformationController();

  @override
  void dispose() {
    _transformationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(
          widget.locale == 'ar' ? 'عرض الصورة' : 'View Document',
          style: GoogleFonts.poppins(color: Colors.white, fontSize: 16),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.open_in_browser, color: Colors.white),
            tooltip: widget.locale == 'ar'
                ? 'فتح في المتصفح'
                : 'Open in browser',
            onPressed: () async {
              final uri = Uri.parse(widget.url);
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              }
            },
          ),
        ],
      ),
      body: Center(
        child: InteractiveViewer(
          transformationController: _transformationController,
          minScale: 0.5,
          maxScale: 5.0,
          child: CachedNetworkImage(
            imageUrl: widget.url,
            fit: BoxFit.contain,
            placeholder: (_, __) => const Center(
              child: CircularProgressIndicator(color: Colors.white),
            ),
            errorWidget: (_, __, ___) => Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.broken_image, color: Colors.white54, size: 64),
                const SizedBox(height: 12),
                Text(
                  widget.locale == 'ar'
                      ? 'تعذر تحميل الصورة'
                      : 'Could not load image',
                  style: GoogleFonts.poppins(color: Colors.white54),
                ),
                const SizedBox(height: 16),
                TextButton.icon(
                  onPressed: () async {
                    final uri = Uri.parse(widget.url);
                    if (await canLaunchUrl(uri)) {
                      await launchUrl(
                        uri,
                        mode: LaunchMode.externalApplication,
                      );
                    }
                  },
                  icon: const Icon(Icons.open_in_browser, color: Colors.white),
                  label: Text(
                    widget.locale == 'ar'
                        ? 'فتح في المتصفح'
                        : 'Open in browser',
                    style: GoogleFonts.poppins(color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
