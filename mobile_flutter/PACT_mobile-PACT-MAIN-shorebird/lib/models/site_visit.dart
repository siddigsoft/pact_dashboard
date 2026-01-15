class SiteVisit {
  final String id;
  final String? userId;  // User who created/owns this site visit
  final String siteName;
  final String siteCode;
  final String status; // dispatched → assigned/accepted → in_progress → completed / cancelled
  final String locality;
  final String state;
  final String activity;
  final String priority;
  final DateTime? dueDate;
  final String notes;
  final String mainActivity;
  final Map<String, dynamic>? location;
  double? get latitude {
    final lat = location?['latitude'];
    if (lat == null) return null;
    return lat is int ? lat.toDouble() : lat as double;
  }

  double? get longitude {
    final lng = location?['longitude'];
    if (lng == null) return null;
    return lng is int ? lng.toDouble() : lng as double;
  }

  String get locationString => location?['description'] as String? ?? '';
  final Map<String, dynamic>? fees;
  final Map<String, dynamic>? visitData;
  final String assignedTo;
  final String? assignedBy;
  final DateTime? assignedAt;
  final List<String>? attachments;
  final DateTime? completedAt;
  final int? rating;
  final String? mmpId;
  final DateTime createdAt;
  final double? arrivalLatitude;
  final double? arrivalLongitude;
  final DateTime? arrivalTimestamp;
  final Map<String, dynamic>? journeyPath;
  final bool arrivalRecorded;
  
  // ========== NEW TRACKING COLUMNS (from mmp_site_entries schema) ==========
  final String? claimedBy;
  final DateTime? claimedAt;
  final String? acceptedBy;
  final DateTime? acceptedAt;
  final String? visitStartedBy;
  final DateTime? visitStartedAt;
  final String? visitCompletedBy;
  final DateTime? visitCompletedAt;
  final DateTime? updatedAt;
  
  // ========== FEES (from mmp_site_entries schema) ==========
  final double? enumeratorFee;
  final double? transportFee;
  final double? cost; // total cost
  
  // ========== ADDITIONAL DATA (jsonb) ==========
  // Contains: start_location, end_location, photos, offline_markers, offline_synced_at, etc.
  final Map<String, dynamic>? additionalData;

  SiteVisit({
    required this.id,
    this.userId,
    required this.siteName,
    required this.siteCode,
    required this.status,
    required this.locality,
    required this.state,
    required this.activity,
    required this.priority,
    this.dueDate,
    required this.notes,
    required this.mainActivity,
    this.location,
    this.fees,
    this.visitData,
    required this.assignedTo,
    this.assignedBy,
    this.assignedAt,
    this.attachments,
    this.completedAt,
    this.rating,
    this.mmpId,
    required this.createdAt,
    this.arrivalLatitude,
    this.arrivalLongitude,
    this.arrivalTimestamp,
    this.journeyPath,
    this.arrivalRecorded = false,
    // New tracking columns
    this.claimedBy,
    this.claimedAt,
    this.acceptedBy,
    this.acceptedAt,
    this.visitStartedBy,
    this.visitStartedAt,
    this.visitCompletedBy,
    this.visitCompletedAt,
    this.updatedAt,
    // Fees
    this.enumeratorFee,
    this.transportFee,
    this.cost,
    // Additional data
    this.additionalData,
  });
  factory SiteVisit.fromJson(Map<String, dynamic> json) {
    // Handle mmp_site_entries schema
    if (json.containsKey('mmp_file_id')) {
      // Build additional_data with hub_office and other direct columns
      Map<String, dynamic> additionalData = json['additional_data'] ?? {};
      
      // Add direct columns to additional_data for easy access
      if (json['hub_office'] != null) {
        additionalData['hub_office'] = json['hub_office'];
      }
      if (json['monitoring_by'] != null) {
        additionalData['monitoring_by'] = json['monitoring_by'];
      }
      if (json['survey_tool'] != null) {
        additionalData['survey_tool'] = json['survey_tool'];
      }
      if (json['cp_name'] != null) {
        additionalData['cp_name'] = json['cp_name'];
      }
      if (json['visit_type'] != null) {
        additionalData['visit_type'] = json['visit_type'];
      }
      
      return SiteVisit(
        id: json['id']?.toString() ?? '',
        userId: json['accepted_by'],
        siteName: json['site_name'] ?? '',
        siteCode: json['site_code'] ?? '',
        status: json['status'] ?? 'dispatched',
        locality: json['locality'] ?? '',
        state: json['state'] ?? '',
        activity: json['activity_at_site'] ?? json['main_activity'] ?? '',
        priority: 'Medium',
        dueDate: json['visit_date'] != null ? DateTime.tryParse(json['visit_date']) : null,
        notes: json['comments'] ?? '',
        mainActivity: json['main_activity'] ?? '',
        location: null,
        fees: {
          'enumerator_fee': json['enumerator_fee'],
          'transport_fee': json['transport_fee'],
        },
        visitData: additionalData,
        assignedTo: json['accepted_by'] ?? '',
        assignedBy: json['dispatched_by'],
        assignedAt: json['dispatched_at'] != null ? DateTime.tryParse(json['dispatched_at']) : null,
        attachments: null,
        completedAt: json['visit_completed_at'] != null ? DateTime.tryParse(json['visit_completed_at']) : null,
        rating: null,
        mmpId: json['mmp_file_id'],
        createdAt: json['created_at'] != null ? DateTime.parse(json['created_at']) : DateTime.now(),
        arrivalLatitude: null,
        arrivalLongitude: null,
        arrivalTimestamp: null,
        journeyPath: null,
        arrivalRecorded: false,
        // New tracking columns
        claimedBy: json['claimed_by'],
        claimedAt: json['claimed_at'] != null ? DateTime.tryParse(json['claimed_at']) : null,
        acceptedBy: json['accepted_by'],
        acceptedAt: json['accepted_at'] != null ? DateTime.tryParse(json['accepted_at']) : null,
        visitStartedBy: json['visit_started_by'],
        visitStartedAt: json['visit_started_at'] != null ? DateTime.tryParse(json['visit_started_at']) : null,
        visitCompletedBy: json['visit_completed_by'],
        visitCompletedAt: json['visit_completed_at'] != null ? DateTime.tryParse(json['visit_completed_at']) : null,
        updatedAt: json['updated_at'] != null ? DateTime.tryParse(json['updated_at']) : null,
        // Fees
        enumeratorFee: _parseDouble(json['enumerator_fee']),
        transportFee: _parseDouble(json['transport_fee']),
        cost: _parseDouble(json['cost']),
        // Additional data
        additionalData: json['additional_data'],
      );
    }

    // Handle other schemas (legacy)
    return SiteVisit(
      id: json['id']?.toString() ?? '',
      userId: json['user_id'],
      siteName: json['site_name'] ?? '',
      siteCode: json['site_code'] ?? '',
      status: json['status'] ?? 'pending',
      locality: json['locality'] ?? '',
      state: json['state'] ?? '',
      activity: json['activity'] ?? '',
      priority: json['priority'] ?? 'medium',
      dueDate:
          json['due_date'] != null ? DateTime.parse(json['due_date']) : null,
      notes: json['notes'] ?? '',
      mainActivity: json['main_activity'] ?? '',
      location: json['location'],
      fees: json['fees'],
      visitData: json['visit_data'],
      assignedTo: json['assigned_to'] ?? '',
      assignedBy: json['assigned_by'],
      assignedAt: json['assigned_at'] != null
          ? DateTime.parse(json['assigned_at'])
          : null,
    attachments: json['attachments'] != null
      ? (json['attachments'] as List)
        .where((e) => e != null)
        .map((e) => e.toString())
        .toList()
      : null,
      completedAt: json['completed_at'] != null
          ? DateTime.parse(json['completed_at'])
          : null,
      rating: json['rating'],
      mmpId: json['mmp_id'],
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'])
          : DateTime.now(),
      arrivalLatitude: json['arrival_latitude'],
      arrivalLongitude: json['arrival_longitude'],
      arrivalTimestamp: json['arrival_timestamp'] != null
          ? DateTime.parse(json['arrival_timestamp'])
          : null,
      journeyPath: json['journey_path'],
      arrivalRecorded: json['arrival_recorded'] ?? false,
      // Legacy fields - left blank for schema compatibility
      claimedBy: null,
      claimedAt: null,
      acceptedBy: json['assigned_by'],
      acceptedAt: json['assigned_at'],
      visitStartedBy: null,
      visitStartedAt: null,
      visitCompletedBy: null,
      visitCompletedAt: json['completed_at'],
      updatedAt: null,
      // Fees
      enumeratorFee: null,
      transportFee: null,
      cost: null,
      // Additional data
      additionalData: null,
    );
  }
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      // Map to mmp_site_entries columns
      'site_name': siteName,
      'site_code': siteCode,
      'status': status,
      'locality': locality,
      'state': state,
      'activity_at_site': activity, // Map 'activity' to 'activity_at_site'
      'main_activity': mainActivity,
      'comments': notes, // Map 'notes' to 'comments'
      'mmp_file_id': mmpId,
      'created_at': createdAt.toIso8601String(),
      // Tracking columns
      'claimed_by': claimedBy,
      'claimed_at': claimedAt?.toIso8601String(),
      'accepted_by': acceptedBy,
      'accepted_at': acceptedAt?.toIso8601String(),
      'visit_started_by': visitStartedBy,
      'visit_started_at': visitStartedAt?.toIso8601String(),
      'visit_completed_by': visitCompletedBy,
      'visit_completed_at': visitCompletedAt?.toIso8601String(),
      'updated_at': updatedAt?.toIso8601String(),
      'dispatched_by': assignedBy,
      'dispatched_at': assignedAt?.toIso8601String(),
      // Fees
      'enumerator_fee': enumeratorFee,
      'transport_fee': transportFee,
      'cost': cost,
      // Additional data (JSONB column)
      'additional_data': additionalData ?? {},
    };
  }

  SiteVisit copyWith({
    String? id,
    String? userId,
    String? siteName,
    String? siteCode,
    String? status,
    String? locality,
    String? state,
    String? activity,
    String? priority,
    DateTime? dueDate,
    String? notes,
    String? mainActivity,
    Map<String, dynamic>? location,
    Map<String, dynamic>? fees,
    Map<String, dynamic>? visitData,
    String? assignedTo,
    String? assignedBy,
    DateTime? assignedAt,
    List<String>? attachments,
    DateTime? completedAt,
    int? rating,
    String? mmpId,
    DateTime? createdAt,
    double? arrivalLatitude,
    double? arrivalLongitude,
    DateTime? arrivalTimestamp,
    Map<String, dynamic>? journeyPath,
    bool? arrivalRecorded,
    // Tracking columns
    String? claimedBy,
    DateTime? claimedAt,
    String? acceptedBy,
    DateTime? acceptedAt,
    String? visitStartedBy,
    DateTime? visitStartedAt,
    String? visitCompletedBy,
    DateTime? visitCompletedAt,
    DateTime? updatedAt,
    // Fees
    double? enumeratorFee,
    double? transportFee,
    double? cost,
    // Additional data
    Map<String, dynamic>? additionalData,
  }) {
    return SiteVisit(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      siteName: siteName ?? this.siteName,
      siteCode: siteCode ?? this.siteCode,
      status: status ?? this.status,
      locality: locality ?? this.locality,
      state: state ?? this.state,
      activity: activity ?? this.activity,
      priority: priority ?? this.priority,
      dueDate: dueDate ?? this.dueDate,
      notes: notes ?? this.notes,
      mainActivity: mainActivity ?? this.mainActivity,
      location: location ?? this.location,
      fees: fees ?? this.fees,
      visitData: visitData ?? this.visitData,
      assignedTo: assignedTo ?? this.assignedTo,
      assignedBy: assignedBy ?? this.assignedBy,
      assignedAt: assignedAt ?? this.assignedAt,
      attachments: attachments ?? this.attachments,
      completedAt: completedAt ?? this.completedAt,
      rating: rating ?? this.rating,
      mmpId: mmpId ?? this.mmpId,
      createdAt: createdAt ?? this.createdAt,
      arrivalLatitude: arrivalLatitude ?? this.arrivalLatitude,
      arrivalLongitude: arrivalLongitude ?? this.arrivalLongitude,
      arrivalTimestamp: arrivalTimestamp ?? this.arrivalTimestamp,
      journeyPath: journeyPath ?? this.journeyPath,
      arrivalRecorded: arrivalRecorded ?? this.arrivalRecorded,
      // Tracking columns
      claimedBy: claimedBy ?? this.claimedBy,
      claimedAt: claimedAt ?? this.claimedAt,
      acceptedBy: acceptedBy ?? this.acceptedBy,
      acceptedAt: acceptedAt ?? this.acceptedAt,
      visitStartedBy: visitStartedBy ?? this.visitStartedBy,
      visitStartedAt: visitStartedAt ?? this.visitStartedAt,
      visitCompletedBy: visitCompletedBy ?? this.visitCompletedBy,
      visitCompletedAt: visitCompletedAt ?? this.visitCompletedAt,
      updatedAt: updatedAt ?? this.updatedAt,
      // Fees
      enumeratorFee: enumeratorFee ?? this.enumeratorFee,
      transportFee: transportFee ?? this.transportFee,
      cost: cost ?? this.cost,
      // Additional data
      additionalData: additionalData ?? this.additionalData,
    );
  }

  // ========== HELPER METHODS ==========
  
  /// Calculate total cost from enumerator and transport fees
  double? get calculatedTotalCost {
    if (enumeratorFee == null && transportFee == null) return null;
    return (enumeratorFee ?? 0) + (transportFee ?? 0);
  }

  /// Check if visit is in final completed state
  bool get isCompleted => status.toLowerCase().contains('completed');

  /// Check if visit is pending dispatch
  bool get isPending => status.toLowerCase().contains('dispatched');

  /// Check if visit has been claimed
  bool get isClaimed => claimedBy != null && claimedAt != null;

  /// Check if visit has been accepted by data collector
  bool get isAccepted => acceptedBy != null && acceptedAt != null;

  /// Check if visit has been started
  bool get isStarted => visitStartedBy != null && visitStartedAt != null;
}

// ============================================================================
// STATIC HELPER FUNCTIONS
// ============================================================================

double? _parseDouble(dynamic value) {
  if (value == null) return null;
  if (value is double) return value;
  if (value is int) return value.toDouble();
  if (value is String) return double.tryParse(value);
  return null;
}
