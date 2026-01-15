// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'down_payment_request.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

DownPaymentRequest _$DownPaymentRequestFromJson(Map<String, dynamic> json) {
  return _DownPaymentRequest.fromJson(json);
}

/// @nodoc
mixin _$DownPaymentRequest {
  String get id => throw _privateConstructorUsedError;
  @JsonKey(name: 'site_visit_id')
  String get siteVisitId => throw _privateConstructorUsedError;
  @JsonKey(name: 'mmp_site_entry_id')
  String get mmpSiteEntryId => throw _privateConstructorUsedError;
  @JsonKey(name: 'site_name')
  String get siteName => throw _privateConstructorUsedError;
  @JsonKey(name: 'requested_by')
  String get requestedBy => throw _privateConstructorUsedError;
  @JsonKey(name: 'requested_at')
  DateTime get requestedAt => throw _privateConstructorUsedError;
  @JsonKey(name: 'requester_role')
  String get requesterRole => throw _privateConstructorUsedError;
  @JsonKey(name: 'hub_id')
  String? get hubId => throw _privateConstructorUsedError;
  @JsonKey(name: 'hub_name')
  String? get hubName => throw _privateConstructorUsedError;
  @JsonKey(name: 'total_transportation_budget')
  double get totalTransportationBudget => throw _privateConstructorUsedError;
  @JsonKey(name: 'requested_amount')
  double get requestedAmount => throw _privateConstructorUsedError;
  @JsonKey(name: 'payment_type')
  String get paymentType => throw _privateConstructorUsedError;
  @JsonKey(name: 'installment_plan')
  List<InstallmentPlan> get installmentPlan =>
      throw _privateConstructorUsedError;
  @JsonKey(name: 'paid_installments')
  List<PaidInstallment> get paidInstallments =>
      throw _privateConstructorUsedError;
  String get justification => throw _privateConstructorUsedError;
  @JsonKey(name: 'supporting_documents')
  List<String> get supportingDocuments => throw _privateConstructorUsedError;
  @JsonKey(name: 'supervisor_id')
  String? get supervisorId => throw _privateConstructorUsedError;
  @JsonKey(name: 'supervisor_status')
  String? get supervisorStatus => throw _privateConstructorUsedError;
  @JsonKey(name: 'supervisor_approved_by')
  String? get supervisorApprovedBy => throw _privateConstructorUsedError;
  @JsonKey(name: 'supervisor_approved_at')
  DateTime? get supervisorApprovedAt => throw _privateConstructorUsedError;
  @JsonKey(name: 'supervisor_notes')
  String? get supervisorNotes => throw _privateConstructorUsedError;
  @JsonKey(name: 'supervisor_rejection_reason')
  String? get supervisorRejectionReason => throw _privateConstructorUsedError;
  @JsonKey(name: 'admin_status')
  String? get adminStatus => throw _privateConstructorUsedError;
  @JsonKey(name: 'admin_processed_by')
  String? get adminProcessedBy => throw _privateConstructorUsedError;
  @JsonKey(name: 'admin_processed_at')
  DateTime? get adminProcessedAt => throw _privateConstructorUsedError;
  @JsonKey(name: 'admin_notes')
  String? get adminNotes => throw _privateConstructorUsedError;
  @JsonKey(name: 'admin_rejection_reason')
  String? get adminRejectionReason => throw _privateConstructorUsedError;
  String get status => throw _privateConstructorUsedError;
  @JsonKey(name: 'total_paid_amount')
  double get totalPaidAmount => throw _privateConstructorUsedError;
  @JsonKey(name: 'remaining_amount')
  double? get remainingAmount => throw _privateConstructorUsedError;
  @JsonKey(name: 'wallet_transaction_ids')
  List<String> get walletTransactionIds => throw _privateConstructorUsedError;
  @JsonKey(name: 'created_at')
  DateTime get createdAt => throw _privateConstructorUsedError;
  @JsonKey(name: 'updated_at')
  DateTime get updatedAt => throw _privateConstructorUsedError;
  Map<String, dynamic> get metadata => throw _privateConstructorUsedError;

  /// Serializes this DownPaymentRequest to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of DownPaymentRequest
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $DownPaymentRequestCopyWith<DownPaymentRequest> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $DownPaymentRequestCopyWith<$Res> {
  factory $DownPaymentRequestCopyWith(
    DownPaymentRequest value,
    $Res Function(DownPaymentRequest) then,
  ) = _$DownPaymentRequestCopyWithImpl<$Res, DownPaymentRequest>;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'site_visit_id') String siteVisitId,
    @JsonKey(name: 'mmp_site_entry_id') String mmpSiteEntryId,
    @JsonKey(name: 'site_name') String siteName,
    @JsonKey(name: 'requested_by') String requestedBy,
    @JsonKey(name: 'requested_at') DateTime requestedAt,
    @JsonKey(name: 'requester_role') String requesterRole,
    @JsonKey(name: 'hub_id') String? hubId,
    @JsonKey(name: 'hub_name') String? hubName,
    @JsonKey(name: 'total_transportation_budget')
    double totalTransportationBudget,
    @JsonKey(name: 'requested_amount') double requestedAmount,
    @JsonKey(name: 'payment_type') String paymentType,
    @JsonKey(name: 'installment_plan') List<InstallmentPlan> installmentPlan,
    @JsonKey(name: 'paid_installments') List<PaidInstallment> paidInstallments,
    String justification,
    @JsonKey(name: 'supporting_documents') List<String> supportingDocuments,
    @JsonKey(name: 'supervisor_id') String? supervisorId,
    @JsonKey(name: 'supervisor_status') String? supervisorStatus,
    @JsonKey(name: 'supervisor_approved_by') String? supervisorApprovedBy,
    @JsonKey(name: 'supervisor_approved_at') DateTime? supervisorApprovedAt,
    @JsonKey(name: 'supervisor_notes') String? supervisorNotes,
    @JsonKey(name: 'supervisor_rejection_reason')
    String? supervisorRejectionReason,
    @JsonKey(name: 'admin_status') String? adminStatus,
    @JsonKey(name: 'admin_processed_by') String? adminProcessedBy,
    @JsonKey(name: 'admin_processed_at') DateTime? adminProcessedAt,
    @JsonKey(name: 'admin_notes') String? adminNotes,
    @JsonKey(name: 'admin_rejection_reason') String? adminRejectionReason,
    String status,
    @JsonKey(name: 'total_paid_amount') double totalPaidAmount,
    @JsonKey(name: 'remaining_amount') double? remainingAmount,
    @JsonKey(name: 'wallet_transaction_ids') List<String> walletTransactionIds,
    @JsonKey(name: 'created_at') DateTime createdAt,
    @JsonKey(name: 'updated_at') DateTime updatedAt,
    Map<String, dynamic> metadata,
  });
}

/// @nodoc
class _$DownPaymentRequestCopyWithImpl<$Res, $Val extends DownPaymentRequest>
    implements $DownPaymentRequestCopyWith<$Res> {
  _$DownPaymentRequestCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of DownPaymentRequest
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? siteVisitId = null,
    Object? mmpSiteEntryId = null,
    Object? siteName = null,
    Object? requestedBy = null,
    Object? requestedAt = null,
    Object? requesterRole = null,
    Object? hubId = freezed,
    Object? hubName = freezed,
    Object? totalTransportationBudget = null,
    Object? requestedAmount = null,
    Object? paymentType = null,
    Object? installmentPlan = null,
    Object? paidInstallments = null,
    Object? justification = null,
    Object? supportingDocuments = null,
    Object? supervisorId = freezed,
    Object? supervisorStatus = freezed,
    Object? supervisorApprovedBy = freezed,
    Object? supervisorApprovedAt = freezed,
    Object? supervisorNotes = freezed,
    Object? supervisorRejectionReason = freezed,
    Object? adminStatus = freezed,
    Object? adminProcessedBy = freezed,
    Object? adminProcessedAt = freezed,
    Object? adminNotes = freezed,
    Object? adminRejectionReason = freezed,
    Object? status = null,
    Object? totalPaidAmount = null,
    Object? remainingAmount = freezed,
    Object? walletTransactionIds = null,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? metadata = null,
  }) {
    return _then(
      _value.copyWith(
            id: null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                      as String,
            siteVisitId: null == siteVisitId
                ? _value.siteVisitId
                : siteVisitId // ignore: cast_nullable_to_non_nullable
                      as String,
            mmpSiteEntryId: null == mmpSiteEntryId
                ? _value.mmpSiteEntryId
                : mmpSiteEntryId // ignore: cast_nullable_to_non_nullable
                      as String,
            siteName: null == siteName
                ? _value.siteName
                : siteName // ignore: cast_nullable_to_non_nullable
                      as String,
            requestedBy: null == requestedBy
                ? _value.requestedBy
                : requestedBy // ignore: cast_nullable_to_non_nullable
                      as String,
            requestedAt: null == requestedAt
                ? _value.requestedAt
                : requestedAt // ignore: cast_nullable_to_non_nullable
                      as DateTime,
            requesterRole: null == requesterRole
                ? _value.requesterRole
                : requesterRole // ignore: cast_nullable_to_non_nullable
                      as String,
            hubId: freezed == hubId
                ? _value.hubId
                : hubId // ignore: cast_nullable_to_non_nullable
                      as String?,
            hubName: freezed == hubName
                ? _value.hubName
                : hubName // ignore: cast_nullable_to_non_nullable
                      as String?,
            totalTransportationBudget: null == totalTransportationBudget
                ? _value.totalTransportationBudget
                : totalTransportationBudget // ignore: cast_nullable_to_non_nullable
                      as double,
            requestedAmount: null == requestedAmount
                ? _value.requestedAmount
                : requestedAmount // ignore: cast_nullable_to_non_nullable
                      as double,
            paymentType: null == paymentType
                ? _value.paymentType
                : paymentType // ignore: cast_nullable_to_non_nullable
                      as String,
            installmentPlan: null == installmentPlan
                ? _value.installmentPlan
                : installmentPlan // ignore: cast_nullable_to_non_nullable
                      as List<InstallmentPlan>,
            paidInstallments: null == paidInstallments
                ? _value.paidInstallments
                : paidInstallments // ignore: cast_nullable_to_non_nullable
                      as List<PaidInstallment>,
            justification: null == justification
                ? _value.justification
                : justification // ignore: cast_nullable_to_non_nullable
                      as String,
            supportingDocuments: null == supportingDocuments
                ? _value.supportingDocuments
                : supportingDocuments // ignore: cast_nullable_to_non_nullable
                      as List<String>,
            supervisorId: freezed == supervisorId
                ? _value.supervisorId
                : supervisorId // ignore: cast_nullable_to_non_nullable
                      as String?,
            supervisorStatus: freezed == supervisorStatus
                ? _value.supervisorStatus
                : supervisorStatus // ignore: cast_nullable_to_non_nullable
                      as String?,
            supervisorApprovedBy: freezed == supervisorApprovedBy
                ? _value.supervisorApprovedBy
                : supervisorApprovedBy // ignore: cast_nullable_to_non_nullable
                      as String?,
            supervisorApprovedAt: freezed == supervisorApprovedAt
                ? _value.supervisorApprovedAt
                : supervisorApprovedAt // ignore: cast_nullable_to_non_nullable
                      as DateTime?,
            supervisorNotes: freezed == supervisorNotes
                ? _value.supervisorNotes
                : supervisorNotes // ignore: cast_nullable_to_non_nullable
                      as String?,
            supervisorRejectionReason: freezed == supervisorRejectionReason
                ? _value.supervisorRejectionReason
                : supervisorRejectionReason // ignore: cast_nullable_to_non_nullable
                      as String?,
            adminStatus: freezed == adminStatus
                ? _value.adminStatus
                : adminStatus // ignore: cast_nullable_to_non_nullable
                      as String?,
            adminProcessedBy: freezed == adminProcessedBy
                ? _value.adminProcessedBy
                : adminProcessedBy // ignore: cast_nullable_to_non_nullable
                      as String?,
            adminProcessedAt: freezed == adminProcessedAt
                ? _value.adminProcessedAt
                : adminProcessedAt // ignore: cast_nullable_to_non_nullable
                      as DateTime?,
            adminNotes: freezed == adminNotes
                ? _value.adminNotes
                : adminNotes // ignore: cast_nullable_to_non_nullable
                      as String?,
            adminRejectionReason: freezed == adminRejectionReason
                ? _value.adminRejectionReason
                : adminRejectionReason // ignore: cast_nullable_to_non_nullable
                      as String?,
            status: null == status
                ? _value.status
                : status // ignore: cast_nullable_to_non_nullable
                      as String,
            totalPaidAmount: null == totalPaidAmount
                ? _value.totalPaidAmount
                : totalPaidAmount // ignore: cast_nullable_to_non_nullable
                      as double,
            remainingAmount: freezed == remainingAmount
                ? _value.remainingAmount
                : remainingAmount // ignore: cast_nullable_to_non_nullable
                      as double?,
            walletTransactionIds: null == walletTransactionIds
                ? _value.walletTransactionIds
                : walletTransactionIds // ignore: cast_nullable_to_non_nullable
                      as List<String>,
            createdAt: null == createdAt
                ? _value.createdAt
                : createdAt // ignore: cast_nullable_to_non_nullable
                      as DateTime,
            updatedAt: null == updatedAt
                ? _value.updatedAt
                : updatedAt // ignore: cast_nullable_to_non_nullable
                      as DateTime,
            metadata: null == metadata
                ? _value.metadata
                : metadata // ignore: cast_nullable_to_non_nullable
                      as Map<String, dynamic>,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$DownPaymentRequestImplCopyWith<$Res>
    implements $DownPaymentRequestCopyWith<$Res> {
  factory _$$DownPaymentRequestImplCopyWith(
    _$DownPaymentRequestImpl value,
    $Res Function(_$DownPaymentRequestImpl) then,
  ) = __$$DownPaymentRequestImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'site_visit_id') String siteVisitId,
    @JsonKey(name: 'mmp_site_entry_id') String mmpSiteEntryId,
    @JsonKey(name: 'site_name') String siteName,
    @JsonKey(name: 'requested_by') String requestedBy,
    @JsonKey(name: 'requested_at') DateTime requestedAt,
    @JsonKey(name: 'requester_role') String requesterRole,
    @JsonKey(name: 'hub_id') String? hubId,
    @JsonKey(name: 'hub_name') String? hubName,
    @JsonKey(name: 'total_transportation_budget')
    double totalTransportationBudget,
    @JsonKey(name: 'requested_amount') double requestedAmount,
    @JsonKey(name: 'payment_type') String paymentType,
    @JsonKey(name: 'installment_plan') List<InstallmentPlan> installmentPlan,
    @JsonKey(name: 'paid_installments') List<PaidInstallment> paidInstallments,
    String justification,
    @JsonKey(name: 'supporting_documents') List<String> supportingDocuments,
    @JsonKey(name: 'supervisor_id') String? supervisorId,
    @JsonKey(name: 'supervisor_status') String? supervisorStatus,
    @JsonKey(name: 'supervisor_approved_by') String? supervisorApprovedBy,
    @JsonKey(name: 'supervisor_approved_at') DateTime? supervisorApprovedAt,
    @JsonKey(name: 'supervisor_notes') String? supervisorNotes,
    @JsonKey(name: 'supervisor_rejection_reason')
    String? supervisorRejectionReason,
    @JsonKey(name: 'admin_status') String? adminStatus,
    @JsonKey(name: 'admin_processed_by') String? adminProcessedBy,
    @JsonKey(name: 'admin_processed_at') DateTime? adminProcessedAt,
    @JsonKey(name: 'admin_notes') String? adminNotes,
    @JsonKey(name: 'admin_rejection_reason') String? adminRejectionReason,
    String status,
    @JsonKey(name: 'total_paid_amount') double totalPaidAmount,
    @JsonKey(name: 'remaining_amount') double? remainingAmount,
    @JsonKey(name: 'wallet_transaction_ids') List<String> walletTransactionIds,
    @JsonKey(name: 'created_at') DateTime createdAt,
    @JsonKey(name: 'updated_at') DateTime updatedAt,
    Map<String, dynamic> metadata,
  });
}

/// @nodoc
class __$$DownPaymentRequestImplCopyWithImpl<$Res>
    extends _$DownPaymentRequestCopyWithImpl<$Res, _$DownPaymentRequestImpl>
    implements _$$DownPaymentRequestImplCopyWith<$Res> {
  __$$DownPaymentRequestImplCopyWithImpl(
    _$DownPaymentRequestImpl _value,
    $Res Function(_$DownPaymentRequestImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of DownPaymentRequest
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? siteVisitId = null,
    Object? mmpSiteEntryId = null,
    Object? siteName = null,
    Object? requestedBy = null,
    Object? requestedAt = null,
    Object? requesterRole = null,
    Object? hubId = freezed,
    Object? hubName = freezed,
    Object? totalTransportationBudget = null,
    Object? requestedAmount = null,
    Object? paymentType = null,
    Object? installmentPlan = null,
    Object? paidInstallments = null,
    Object? justification = null,
    Object? supportingDocuments = null,
    Object? supervisorId = freezed,
    Object? supervisorStatus = freezed,
    Object? supervisorApprovedBy = freezed,
    Object? supervisorApprovedAt = freezed,
    Object? supervisorNotes = freezed,
    Object? supervisorRejectionReason = freezed,
    Object? adminStatus = freezed,
    Object? adminProcessedBy = freezed,
    Object? adminProcessedAt = freezed,
    Object? adminNotes = freezed,
    Object? adminRejectionReason = freezed,
    Object? status = null,
    Object? totalPaidAmount = null,
    Object? remainingAmount = freezed,
    Object? walletTransactionIds = null,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? metadata = null,
  }) {
    return _then(
      _$DownPaymentRequestImpl(
        id: null == id
            ? _value.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        siteVisitId: null == siteVisitId
            ? _value.siteVisitId
            : siteVisitId // ignore: cast_nullable_to_non_nullable
                  as String,
        mmpSiteEntryId: null == mmpSiteEntryId
            ? _value.mmpSiteEntryId
            : mmpSiteEntryId // ignore: cast_nullable_to_non_nullable
                  as String,
        siteName: null == siteName
            ? _value.siteName
            : siteName // ignore: cast_nullable_to_non_nullable
                  as String,
        requestedBy: null == requestedBy
            ? _value.requestedBy
            : requestedBy // ignore: cast_nullable_to_non_nullable
                  as String,
        requestedAt: null == requestedAt
            ? _value.requestedAt
            : requestedAt // ignore: cast_nullable_to_non_nullable
                  as DateTime,
        requesterRole: null == requesterRole
            ? _value.requesterRole
            : requesterRole // ignore: cast_nullable_to_non_nullable
                  as String,
        hubId: freezed == hubId
            ? _value.hubId
            : hubId // ignore: cast_nullable_to_non_nullable
                  as String?,
        hubName: freezed == hubName
            ? _value.hubName
            : hubName // ignore: cast_nullable_to_non_nullable
                  as String?,
        totalTransportationBudget: null == totalTransportationBudget
            ? _value.totalTransportationBudget
            : totalTransportationBudget // ignore: cast_nullable_to_non_nullable
                  as double,
        requestedAmount: null == requestedAmount
            ? _value.requestedAmount
            : requestedAmount // ignore: cast_nullable_to_non_nullable
                  as double,
        paymentType: null == paymentType
            ? _value.paymentType
            : paymentType // ignore: cast_nullable_to_non_nullable
                  as String,
        installmentPlan: null == installmentPlan
            ? _value._installmentPlan
            : installmentPlan // ignore: cast_nullable_to_non_nullable
                  as List<InstallmentPlan>,
        paidInstallments: null == paidInstallments
            ? _value._paidInstallments
            : paidInstallments // ignore: cast_nullable_to_non_nullable
                  as List<PaidInstallment>,
        justification: null == justification
            ? _value.justification
            : justification // ignore: cast_nullable_to_non_nullable
                  as String,
        supportingDocuments: null == supportingDocuments
            ? _value._supportingDocuments
            : supportingDocuments // ignore: cast_nullable_to_non_nullable
                  as List<String>,
        supervisorId: freezed == supervisorId
            ? _value.supervisorId
            : supervisorId // ignore: cast_nullable_to_non_nullable
                  as String?,
        supervisorStatus: freezed == supervisorStatus
            ? _value.supervisorStatus
            : supervisorStatus // ignore: cast_nullable_to_non_nullable
                  as String?,
        supervisorApprovedBy: freezed == supervisorApprovedBy
            ? _value.supervisorApprovedBy
            : supervisorApprovedBy // ignore: cast_nullable_to_non_nullable
                  as String?,
        supervisorApprovedAt: freezed == supervisorApprovedAt
            ? _value.supervisorApprovedAt
            : supervisorApprovedAt // ignore: cast_nullable_to_non_nullable
                  as DateTime?,
        supervisorNotes: freezed == supervisorNotes
            ? _value.supervisorNotes
            : supervisorNotes // ignore: cast_nullable_to_non_nullable
                  as String?,
        supervisorRejectionReason: freezed == supervisorRejectionReason
            ? _value.supervisorRejectionReason
            : supervisorRejectionReason // ignore: cast_nullable_to_non_nullable
                  as String?,
        adminStatus: freezed == adminStatus
            ? _value.adminStatus
            : adminStatus // ignore: cast_nullable_to_non_nullable
                  as String?,
        adminProcessedBy: freezed == adminProcessedBy
            ? _value.adminProcessedBy
            : adminProcessedBy // ignore: cast_nullable_to_non_nullable
                  as String?,
        adminProcessedAt: freezed == adminProcessedAt
            ? _value.adminProcessedAt
            : adminProcessedAt // ignore: cast_nullable_to_non_nullable
                  as DateTime?,
        adminNotes: freezed == adminNotes
            ? _value.adminNotes
            : adminNotes // ignore: cast_nullable_to_non_nullable
                  as String?,
        adminRejectionReason: freezed == adminRejectionReason
            ? _value.adminRejectionReason
            : adminRejectionReason // ignore: cast_nullable_to_non_nullable
                  as String?,
        status: null == status
            ? _value.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        totalPaidAmount: null == totalPaidAmount
            ? _value.totalPaidAmount
            : totalPaidAmount // ignore: cast_nullable_to_non_nullable
                  as double,
        remainingAmount: freezed == remainingAmount
            ? _value.remainingAmount
            : remainingAmount // ignore: cast_nullable_to_non_nullable
                  as double?,
        walletTransactionIds: null == walletTransactionIds
            ? _value._walletTransactionIds
            : walletTransactionIds // ignore: cast_nullable_to_non_nullable
                  as List<String>,
        createdAt: null == createdAt
            ? _value.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as DateTime,
        updatedAt: null == updatedAt
            ? _value.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as DateTime,
        metadata: null == metadata
            ? _value._metadata
            : metadata // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$DownPaymentRequestImpl implements _DownPaymentRequest {
  const _$DownPaymentRequestImpl({
    required this.id,
    @JsonKey(name: 'site_visit_id') required this.siteVisitId,
    @JsonKey(name: 'mmp_site_entry_id') this.mmpSiteEntryId = '',
    @JsonKey(name: 'site_name') this.siteName = '',
    @JsonKey(name: 'requested_by') required this.requestedBy,
    @JsonKey(name: 'requested_at') required this.requestedAt,
    @JsonKey(name: 'requester_role') this.requesterRole = 'dataCollector',
    @JsonKey(name: 'hub_id') this.hubId,
    @JsonKey(name: 'hub_name') this.hubName,
    @JsonKey(name: 'total_transportation_budget')
    this.totalTransportationBudget = 0.0,
    @JsonKey(name: 'requested_amount') this.requestedAmount = 0.0,
    @JsonKey(name: 'payment_type') this.paymentType = 'full_advance',
    @JsonKey(name: 'installment_plan')
    final List<InstallmentPlan> installmentPlan = const [],
    @JsonKey(name: 'paid_installments')
    final List<PaidInstallment> paidInstallments = const [],
    this.justification = '',
    @JsonKey(name: 'supporting_documents')
    final List<String> supportingDocuments = const [],
    @JsonKey(name: 'supervisor_id') this.supervisorId,
    @JsonKey(name: 'supervisor_status') this.supervisorStatus,
    @JsonKey(name: 'supervisor_approved_by') this.supervisorApprovedBy,
    @JsonKey(name: 'supervisor_approved_at') this.supervisorApprovedAt,
    @JsonKey(name: 'supervisor_notes') this.supervisorNotes,
    @JsonKey(name: 'supervisor_rejection_reason')
    this.supervisorRejectionReason,
    @JsonKey(name: 'admin_status') this.adminStatus,
    @JsonKey(name: 'admin_processed_by') this.adminProcessedBy,
    @JsonKey(name: 'admin_processed_at') this.adminProcessedAt,
    @JsonKey(name: 'admin_notes') this.adminNotes,
    @JsonKey(name: 'admin_rejection_reason') this.adminRejectionReason,
    this.status = 'pending_supervisor',
    @JsonKey(name: 'total_paid_amount') this.totalPaidAmount = 0.0,
    @JsonKey(name: 'remaining_amount') this.remainingAmount,
    @JsonKey(name: 'wallet_transaction_ids')
    final List<String> walletTransactionIds = const <String>[],
    @JsonKey(name: 'created_at') required this.createdAt,
    @JsonKey(name: 'updated_at') required this.updatedAt,
    final Map<String, dynamic> metadata = const <String, dynamic>{},
  }) : _installmentPlan = installmentPlan,
       _paidInstallments = paidInstallments,
       _supportingDocuments = supportingDocuments,
       _walletTransactionIds = walletTransactionIds,
       _metadata = metadata;

  factory _$DownPaymentRequestImpl.fromJson(Map<String, dynamic> json) =>
      _$$DownPaymentRequestImplFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'site_visit_id')
  final String siteVisitId;
  @override
  @JsonKey(name: 'mmp_site_entry_id')
  final String mmpSiteEntryId;
  @override
  @JsonKey(name: 'site_name')
  final String siteName;
  @override
  @JsonKey(name: 'requested_by')
  final String requestedBy;
  @override
  @JsonKey(name: 'requested_at')
  final DateTime requestedAt;
  @override
  @JsonKey(name: 'requester_role')
  final String requesterRole;
  @override
  @JsonKey(name: 'hub_id')
  final String? hubId;
  @override
  @JsonKey(name: 'hub_name')
  final String? hubName;
  @override
  @JsonKey(name: 'total_transportation_budget')
  final double totalTransportationBudget;
  @override
  @JsonKey(name: 'requested_amount')
  final double requestedAmount;
  @override
  @JsonKey(name: 'payment_type')
  final String paymentType;
  final List<InstallmentPlan> _installmentPlan;
  @override
  @JsonKey(name: 'installment_plan')
  List<InstallmentPlan> get installmentPlan {
    if (_installmentPlan is EqualUnmodifiableListView) return _installmentPlan;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_installmentPlan);
  }

  final List<PaidInstallment> _paidInstallments;
  @override
  @JsonKey(name: 'paid_installments')
  List<PaidInstallment> get paidInstallments {
    if (_paidInstallments is EqualUnmodifiableListView)
      return _paidInstallments;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_paidInstallments);
  }

  @override
  @JsonKey()
  final String justification;
  final List<String> _supportingDocuments;
  @override
  @JsonKey(name: 'supporting_documents')
  List<String> get supportingDocuments {
    if (_supportingDocuments is EqualUnmodifiableListView)
      return _supportingDocuments;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_supportingDocuments);
  }

  @override
  @JsonKey(name: 'supervisor_id')
  final String? supervisorId;
  @override
  @JsonKey(name: 'supervisor_status')
  final String? supervisorStatus;
  @override
  @JsonKey(name: 'supervisor_approved_by')
  final String? supervisorApprovedBy;
  @override
  @JsonKey(name: 'supervisor_approved_at')
  final DateTime? supervisorApprovedAt;
  @override
  @JsonKey(name: 'supervisor_notes')
  final String? supervisorNotes;
  @override
  @JsonKey(name: 'supervisor_rejection_reason')
  final String? supervisorRejectionReason;
  @override
  @JsonKey(name: 'admin_status')
  final String? adminStatus;
  @override
  @JsonKey(name: 'admin_processed_by')
  final String? adminProcessedBy;
  @override
  @JsonKey(name: 'admin_processed_at')
  final DateTime? adminProcessedAt;
  @override
  @JsonKey(name: 'admin_notes')
  final String? adminNotes;
  @override
  @JsonKey(name: 'admin_rejection_reason')
  final String? adminRejectionReason;
  @override
  @JsonKey()
  final String status;
  @override
  @JsonKey(name: 'total_paid_amount')
  final double totalPaidAmount;
  @override
  @JsonKey(name: 'remaining_amount')
  final double? remainingAmount;
  final List<String> _walletTransactionIds;
  @override
  @JsonKey(name: 'wallet_transaction_ids')
  List<String> get walletTransactionIds {
    if (_walletTransactionIds is EqualUnmodifiableListView)
      return _walletTransactionIds;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_walletTransactionIds);
  }

  @override
  @JsonKey(name: 'created_at')
  final DateTime createdAt;
  @override
  @JsonKey(name: 'updated_at')
  final DateTime updatedAt;
  final Map<String, dynamic> _metadata;
  @override
  @JsonKey()
  Map<String, dynamic> get metadata {
    if (_metadata is EqualUnmodifiableMapView) return _metadata;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(_metadata);
  }

  @override
  String toString() {
    return 'DownPaymentRequest(id: $id, siteVisitId: $siteVisitId, mmpSiteEntryId: $mmpSiteEntryId, siteName: $siteName, requestedBy: $requestedBy, requestedAt: $requestedAt, requesterRole: $requesterRole, hubId: $hubId, hubName: $hubName, totalTransportationBudget: $totalTransportationBudget, requestedAmount: $requestedAmount, paymentType: $paymentType, installmentPlan: $installmentPlan, paidInstallments: $paidInstallments, justification: $justification, supportingDocuments: $supportingDocuments, supervisorId: $supervisorId, supervisorStatus: $supervisorStatus, supervisorApprovedBy: $supervisorApprovedBy, supervisorApprovedAt: $supervisorApprovedAt, supervisorNotes: $supervisorNotes, supervisorRejectionReason: $supervisorRejectionReason, adminStatus: $adminStatus, adminProcessedBy: $adminProcessedBy, adminProcessedAt: $adminProcessedAt, adminNotes: $adminNotes, adminRejectionReason: $adminRejectionReason, status: $status, totalPaidAmount: $totalPaidAmount, remainingAmount: $remainingAmount, walletTransactionIds: $walletTransactionIds, createdAt: $createdAt, updatedAt: $updatedAt, metadata: $metadata)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$DownPaymentRequestImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.siteVisitId, siteVisitId) ||
                other.siteVisitId == siteVisitId) &&
            (identical(other.mmpSiteEntryId, mmpSiteEntryId) ||
                other.mmpSiteEntryId == mmpSiteEntryId) &&
            (identical(other.siteName, siteName) ||
                other.siteName == siteName) &&
            (identical(other.requestedBy, requestedBy) ||
                other.requestedBy == requestedBy) &&
            (identical(other.requestedAt, requestedAt) ||
                other.requestedAt == requestedAt) &&
            (identical(other.requesterRole, requesterRole) ||
                other.requesterRole == requesterRole) &&
            (identical(other.hubId, hubId) || other.hubId == hubId) &&
            (identical(other.hubName, hubName) || other.hubName == hubName) &&
            (identical(
                  other.totalTransportationBudget,
                  totalTransportationBudget,
                ) ||
                other.totalTransportationBudget == totalTransportationBudget) &&
            (identical(other.requestedAmount, requestedAmount) ||
                other.requestedAmount == requestedAmount) &&
            (identical(other.paymentType, paymentType) ||
                other.paymentType == paymentType) &&
            const DeepCollectionEquality().equals(
              other._installmentPlan,
              _installmentPlan,
            ) &&
            const DeepCollectionEquality().equals(
              other._paidInstallments,
              _paidInstallments,
            ) &&
            (identical(other.justification, justification) ||
                other.justification == justification) &&
            const DeepCollectionEquality().equals(
              other._supportingDocuments,
              _supportingDocuments,
            ) &&
            (identical(other.supervisorId, supervisorId) ||
                other.supervisorId == supervisorId) &&
            (identical(other.supervisorStatus, supervisorStatus) ||
                other.supervisorStatus == supervisorStatus) &&
            (identical(other.supervisorApprovedBy, supervisorApprovedBy) ||
                other.supervisorApprovedBy == supervisorApprovedBy) &&
            (identical(other.supervisorApprovedAt, supervisorApprovedAt) ||
                other.supervisorApprovedAt == supervisorApprovedAt) &&
            (identical(other.supervisorNotes, supervisorNotes) ||
                other.supervisorNotes == supervisorNotes) &&
            (identical(
                  other.supervisorRejectionReason,
                  supervisorRejectionReason,
                ) ||
                other.supervisorRejectionReason == supervisorRejectionReason) &&
            (identical(other.adminStatus, adminStatus) ||
                other.adminStatus == adminStatus) &&
            (identical(other.adminProcessedBy, adminProcessedBy) ||
                other.adminProcessedBy == adminProcessedBy) &&
            (identical(other.adminProcessedAt, adminProcessedAt) ||
                other.adminProcessedAt == adminProcessedAt) &&
            (identical(other.adminNotes, adminNotes) ||
                other.adminNotes == adminNotes) &&
            (identical(other.adminRejectionReason, adminRejectionReason) ||
                other.adminRejectionReason == adminRejectionReason) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.totalPaidAmount, totalPaidAmount) ||
                other.totalPaidAmount == totalPaidAmount) &&
            (identical(other.remainingAmount, remainingAmount) ||
                other.remainingAmount == remainingAmount) &&
            const DeepCollectionEquality().equals(
              other._walletTransactionIds,
              _walletTransactionIds,
            ) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            const DeepCollectionEquality().equals(other._metadata, _metadata));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hashAll([
    runtimeType,
    id,
    siteVisitId,
    mmpSiteEntryId,
    siteName,
    requestedBy,
    requestedAt,
    requesterRole,
    hubId,
    hubName,
    totalTransportationBudget,
    requestedAmount,
    paymentType,
    const DeepCollectionEquality().hash(_installmentPlan),
    const DeepCollectionEquality().hash(_paidInstallments),
    justification,
    const DeepCollectionEquality().hash(_supportingDocuments),
    supervisorId,
    supervisorStatus,
    supervisorApprovedBy,
    supervisorApprovedAt,
    supervisorNotes,
    supervisorRejectionReason,
    adminStatus,
    adminProcessedBy,
    adminProcessedAt,
    adminNotes,
    adminRejectionReason,
    status,
    totalPaidAmount,
    remainingAmount,
    const DeepCollectionEquality().hash(_walletTransactionIds),
    createdAt,
    updatedAt,
    const DeepCollectionEquality().hash(_metadata),
  ]);

  /// Create a copy of DownPaymentRequest
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$DownPaymentRequestImplCopyWith<_$DownPaymentRequestImpl> get copyWith =>
      __$$DownPaymentRequestImplCopyWithImpl<_$DownPaymentRequestImpl>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$$DownPaymentRequestImplToJson(this);
  }
}

abstract class _DownPaymentRequest implements DownPaymentRequest {
  const factory _DownPaymentRequest({
    required final String id,
    @JsonKey(name: 'site_visit_id') required final String siteVisitId,
    @JsonKey(name: 'mmp_site_entry_id') final String mmpSiteEntryId,
    @JsonKey(name: 'site_name') final String siteName,
    @JsonKey(name: 'requested_by') required final String requestedBy,
    @JsonKey(name: 'requested_at') required final DateTime requestedAt,
    @JsonKey(name: 'requester_role') final String requesterRole,
    @JsonKey(name: 'hub_id') final String? hubId,
    @JsonKey(name: 'hub_name') final String? hubName,
    @JsonKey(name: 'total_transportation_budget')
    final double totalTransportationBudget,
    @JsonKey(name: 'requested_amount') final double requestedAmount,
    @JsonKey(name: 'payment_type') final String paymentType,
    @JsonKey(name: 'installment_plan')
    final List<InstallmentPlan> installmentPlan,
    @JsonKey(name: 'paid_installments')
    final List<PaidInstallment> paidInstallments,
    final String justification,
    @JsonKey(name: 'supporting_documents')
    final List<String> supportingDocuments,
    @JsonKey(name: 'supervisor_id') final String? supervisorId,
    @JsonKey(name: 'supervisor_status') final String? supervisorStatus,
    @JsonKey(name: 'supervisor_approved_by') final String? supervisorApprovedBy,
    @JsonKey(name: 'supervisor_approved_at')
    final DateTime? supervisorApprovedAt,
    @JsonKey(name: 'supervisor_notes') final String? supervisorNotes,
    @JsonKey(name: 'supervisor_rejection_reason')
    final String? supervisorRejectionReason,
    @JsonKey(name: 'admin_status') final String? adminStatus,
    @JsonKey(name: 'admin_processed_by') final String? adminProcessedBy,
    @JsonKey(name: 'admin_processed_at') final DateTime? adminProcessedAt,
    @JsonKey(name: 'admin_notes') final String? adminNotes,
    @JsonKey(name: 'admin_rejection_reason') final String? adminRejectionReason,
    final String status,
    @JsonKey(name: 'total_paid_amount') final double totalPaidAmount,
    @JsonKey(name: 'remaining_amount') final double? remainingAmount,
    @JsonKey(name: 'wallet_transaction_ids')
    final List<String> walletTransactionIds,
    @JsonKey(name: 'created_at') required final DateTime createdAt,
    @JsonKey(name: 'updated_at') required final DateTime updatedAt,
    final Map<String, dynamic> metadata,
  }) = _$DownPaymentRequestImpl;

  factory _DownPaymentRequest.fromJson(Map<String, dynamic> json) =
      _$DownPaymentRequestImpl.fromJson;

  @override
  String get id;
  @override
  @JsonKey(name: 'site_visit_id')
  String get siteVisitId;
  @override
  @JsonKey(name: 'mmp_site_entry_id')
  String get mmpSiteEntryId;
  @override
  @JsonKey(name: 'site_name')
  String get siteName;
  @override
  @JsonKey(name: 'requested_by')
  String get requestedBy;
  @override
  @JsonKey(name: 'requested_at')
  DateTime get requestedAt;
  @override
  @JsonKey(name: 'requester_role')
  String get requesterRole;
  @override
  @JsonKey(name: 'hub_id')
  String? get hubId;
  @override
  @JsonKey(name: 'hub_name')
  String? get hubName;
  @override
  @JsonKey(name: 'total_transportation_budget')
  double get totalTransportationBudget;
  @override
  @JsonKey(name: 'requested_amount')
  double get requestedAmount;
  @override
  @JsonKey(name: 'payment_type')
  String get paymentType;
  @override
  @JsonKey(name: 'installment_plan')
  List<InstallmentPlan> get installmentPlan;
  @override
  @JsonKey(name: 'paid_installments')
  List<PaidInstallment> get paidInstallments;
  @override
  String get justification;
  @override
  @JsonKey(name: 'supporting_documents')
  List<String> get supportingDocuments;
  @override
  @JsonKey(name: 'supervisor_id')
  String? get supervisorId;
  @override
  @JsonKey(name: 'supervisor_status')
  String? get supervisorStatus;
  @override
  @JsonKey(name: 'supervisor_approved_by')
  String? get supervisorApprovedBy;
  @override
  @JsonKey(name: 'supervisor_approved_at')
  DateTime? get supervisorApprovedAt;
  @override
  @JsonKey(name: 'supervisor_notes')
  String? get supervisorNotes;
  @override
  @JsonKey(name: 'supervisor_rejection_reason')
  String? get supervisorRejectionReason;
  @override
  @JsonKey(name: 'admin_status')
  String? get adminStatus;
  @override
  @JsonKey(name: 'admin_processed_by')
  String? get adminProcessedBy;
  @override
  @JsonKey(name: 'admin_processed_at')
  DateTime? get adminProcessedAt;
  @override
  @JsonKey(name: 'admin_notes')
  String? get adminNotes;
  @override
  @JsonKey(name: 'admin_rejection_reason')
  String? get adminRejectionReason;
  @override
  String get status;
  @override
  @JsonKey(name: 'total_paid_amount')
  double get totalPaidAmount;
  @override
  @JsonKey(name: 'remaining_amount')
  double? get remainingAmount;
  @override
  @JsonKey(name: 'wallet_transaction_ids')
  List<String> get walletTransactionIds;
  @override
  @JsonKey(name: 'created_at')
  DateTime get createdAt;
  @override
  @JsonKey(name: 'updated_at')
  DateTime get updatedAt;
  @override
  Map<String, dynamic> get metadata;

  /// Create a copy of DownPaymentRequest
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$DownPaymentRequestImplCopyWith<_$DownPaymentRequestImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

InstallmentPlan _$InstallmentPlanFromJson(Map<String, dynamic> json) {
  return _InstallmentPlan.fromJson(json);
}

/// @nodoc
mixin _$InstallmentPlan {
  int get installmentNumber => throw _privateConstructorUsedError;
  double get amount => throw _privateConstructorUsedError;
  DateTime get dueDate => throw _privateConstructorUsedError;
  String get description => throw _privateConstructorUsedError;

  /// Serializes this InstallmentPlan to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of InstallmentPlan
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $InstallmentPlanCopyWith<InstallmentPlan> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $InstallmentPlanCopyWith<$Res> {
  factory $InstallmentPlanCopyWith(
    InstallmentPlan value,
    $Res Function(InstallmentPlan) then,
  ) = _$InstallmentPlanCopyWithImpl<$Res, InstallmentPlan>;
  @useResult
  $Res call({
    int installmentNumber,
    double amount,
    DateTime dueDate,
    String description,
  });
}

/// @nodoc
class _$InstallmentPlanCopyWithImpl<$Res, $Val extends InstallmentPlan>
    implements $InstallmentPlanCopyWith<$Res> {
  _$InstallmentPlanCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of InstallmentPlan
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? installmentNumber = null,
    Object? amount = null,
    Object? dueDate = null,
    Object? description = null,
  }) {
    return _then(
      _value.copyWith(
            installmentNumber: null == installmentNumber
                ? _value.installmentNumber
                : installmentNumber // ignore: cast_nullable_to_non_nullable
                      as int,
            amount: null == amount
                ? _value.amount
                : amount // ignore: cast_nullable_to_non_nullable
                      as double,
            dueDate: null == dueDate
                ? _value.dueDate
                : dueDate // ignore: cast_nullable_to_non_nullable
                      as DateTime,
            description: null == description
                ? _value.description
                : description // ignore: cast_nullable_to_non_nullable
                      as String,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$InstallmentPlanImplCopyWith<$Res>
    implements $InstallmentPlanCopyWith<$Res> {
  factory _$$InstallmentPlanImplCopyWith(
    _$InstallmentPlanImpl value,
    $Res Function(_$InstallmentPlanImpl) then,
  ) = __$$InstallmentPlanImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    int installmentNumber,
    double amount,
    DateTime dueDate,
    String description,
  });
}

/// @nodoc
class __$$InstallmentPlanImplCopyWithImpl<$Res>
    extends _$InstallmentPlanCopyWithImpl<$Res, _$InstallmentPlanImpl>
    implements _$$InstallmentPlanImplCopyWith<$Res> {
  __$$InstallmentPlanImplCopyWithImpl(
    _$InstallmentPlanImpl _value,
    $Res Function(_$InstallmentPlanImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of InstallmentPlan
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? installmentNumber = null,
    Object? amount = null,
    Object? dueDate = null,
    Object? description = null,
  }) {
    return _then(
      _$InstallmentPlanImpl(
        installmentNumber: null == installmentNumber
            ? _value.installmentNumber
            : installmentNumber // ignore: cast_nullable_to_non_nullable
                  as int,
        amount: null == amount
            ? _value.amount
            : amount // ignore: cast_nullable_to_non_nullable
                  as double,
        dueDate: null == dueDate
            ? _value.dueDate
            : dueDate // ignore: cast_nullable_to_non_nullable
                  as DateTime,
        description: null == description
            ? _value.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$InstallmentPlanImpl implements _InstallmentPlan {
  const _$InstallmentPlanImpl({
    required this.installmentNumber,
    required this.amount,
    required this.dueDate,
    required this.description,
  });

  factory _$InstallmentPlanImpl.fromJson(Map<String, dynamic> json) =>
      _$$InstallmentPlanImplFromJson(json);

  @override
  final int installmentNumber;
  @override
  final double amount;
  @override
  final DateTime dueDate;
  @override
  final String description;

  @override
  String toString() {
    return 'InstallmentPlan(installmentNumber: $installmentNumber, amount: $amount, dueDate: $dueDate, description: $description)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$InstallmentPlanImpl &&
            (identical(other.installmentNumber, installmentNumber) ||
                other.installmentNumber == installmentNumber) &&
            (identical(other.amount, amount) || other.amount == amount) &&
            (identical(other.dueDate, dueDate) || other.dueDate == dueDate) &&
            (identical(other.description, description) ||
                other.description == description));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode =>
      Object.hash(runtimeType, installmentNumber, amount, dueDate, description);

  /// Create a copy of InstallmentPlan
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$InstallmentPlanImplCopyWith<_$InstallmentPlanImpl> get copyWith =>
      __$$InstallmentPlanImplCopyWithImpl<_$InstallmentPlanImpl>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$$InstallmentPlanImplToJson(this);
  }
}

abstract class _InstallmentPlan implements InstallmentPlan {
  const factory _InstallmentPlan({
    required final int installmentNumber,
    required final double amount,
    required final DateTime dueDate,
    required final String description,
  }) = _$InstallmentPlanImpl;

  factory _InstallmentPlan.fromJson(Map<String, dynamic> json) =
      _$InstallmentPlanImpl.fromJson;

  @override
  int get installmentNumber;
  @override
  double get amount;
  @override
  DateTime get dueDate;
  @override
  String get description;

  /// Create a copy of InstallmentPlan
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$InstallmentPlanImplCopyWith<_$InstallmentPlanImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

PaidInstallment _$PaidInstallmentFromJson(Map<String, dynamic> json) {
  return _PaidInstallment.fromJson(json);
}

/// @nodoc
mixin _$PaidInstallment {
  int get installmentNumber => throw _privateConstructorUsedError;
  double get amount => throw _privateConstructorUsedError;
  DateTime get paidAt => throw _privateConstructorUsedError;
  String get transactionId => throw _privateConstructorUsedError;

  /// Serializes this PaidInstallment to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of PaidInstallment
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $PaidInstallmentCopyWith<PaidInstallment> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $PaidInstallmentCopyWith<$Res> {
  factory $PaidInstallmentCopyWith(
    PaidInstallment value,
    $Res Function(PaidInstallment) then,
  ) = _$PaidInstallmentCopyWithImpl<$Res, PaidInstallment>;
  @useResult
  $Res call({
    int installmentNumber,
    double amount,
    DateTime paidAt,
    String transactionId,
  });
}

/// @nodoc
class _$PaidInstallmentCopyWithImpl<$Res, $Val extends PaidInstallment>
    implements $PaidInstallmentCopyWith<$Res> {
  _$PaidInstallmentCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of PaidInstallment
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? installmentNumber = null,
    Object? amount = null,
    Object? paidAt = null,
    Object? transactionId = null,
  }) {
    return _then(
      _value.copyWith(
            installmentNumber: null == installmentNumber
                ? _value.installmentNumber
                : installmentNumber // ignore: cast_nullable_to_non_nullable
                      as int,
            amount: null == amount
                ? _value.amount
                : amount // ignore: cast_nullable_to_non_nullable
                      as double,
            paidAt: null == paidAt
                ? _value.paidAt
                : paidAt // ignore: cast_nullable_to_non_nullable
                      as DateTime,
            transactionId: null == transactionId
                ? _value.transactionId
                : transactionId // ignore: cast_nullable_to_non_nullable
                      as String,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$PaidInstallmentImplCopyWith<$Res>
    implements $PaidInstallmentCopyWith<$Res> {
  factory _$$PaidInstallmentImplCopyWith(
    _$PaidInstallmentImpl value,
    $Res Function(_$PaidInstallmentImpl) then,
  ) = __$$PaidInstallmentImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    int installmentNumber,
    double amount,
    DateTime paidAt,
    String transactionId,
  });
}

/// @nodoc
class __$$PaidInstallmentImplCopyWithImpl<$Res>
    extends _$PaidInstallmentCopyWithImpl<$Res, _$PaidInstallmentImpl>
    implements _$$PaidInstallmentImplCopyWith<$Res> {
  __$$PaidInstallmentImplCopyWithImpl(
    _$PaidInstallmentImpl _value,
    $Res Function(_$PaidInstallmentImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of PaidInstallment
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? installmentNumber = null,
    Object? amount = null,
    Object? paidAt = null,
    Object? transactionId = null,
  }) {
    return _then(
      _$PaidInstallmentImpl(
        installmentNumber: null == installmentNumber
            ? _value.installmentNumber
            : installmentNumber // ignore: cast_nullable_to_non_nullable
                  as int,
        amount: null == amount
            ? _value.amount
            : amount // ignore: cast_nullable_to_non_nullable
                  as double,
        paidAt: null == paidAt
            ? _value.paidAt
            : paidAt // ignore: cast_nullable_to_non_nullable
                  as DateTime,
        transactionId: null == transactionId
            ? _value.transactionId
            : transactionId // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$PaidInstallmentImpl implements _PaidInstallment {
  const _$PaidInstallmentImpl({
    required this.installmentNumber,
    required this.amount,
    required this.paidAt,
    required this.transactionId,
  });

  factory _$PaidInstallmentImpl.fromJson(Map<String, dynamic> json) =>
      _$$PaidInstallmentImplFromJson(json);

  @override
  final int installmentNumber;
  @override
  final double amount;
  @override
  final DateTime paidAt;
  @override
  final String transactionId;

  @override
  String toString() {
    return 'PaidInstallment(installmentNumber: $installmentNumber, amount: $amount, paidAt: $paidAt, transactionId: $transactionId)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$PaidInstallmentImpl &&
            (identical(other.installmentNumber, installmentNumber) ||
                other.installmentNumber == installmentNumber) &&
            (identical(other.amount, amount) || other.amount == amount) &&
            (identical(other.paidAt, paidAt) || other.paidAt == paidAt) &&
            (identical(other.transactionId, transactionId) ||
                other.transactionId == transactionId));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    installmentNumber,
    amount,
    paidAt,
    transactionId,
  );

  /// Create a copy of PaidInstallment
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$PaidInstallmentImplCopyWith<_$PaidInstallmentImpl> get copyWith =>
      __$$PaidInstallmentImplCopyWithImpl<_$PaidInstallmentImpl>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$$PaidInstallmentImplToJson(this);
  }
}

abstract class _PaidInstallment implements PaidInstallment {
  const factory _PaidInstallment({
    required final int installmentNumber,
    required final double amount,
    required final DateTime paidAt,
    required final String transactionId,
  }) = _$PaidInstallmentImpl;

  factory _PaidInstallment.fromJson(Map<String, dynamic> json) =
      _$PaidInstallmentImpl.fromJson;

  @override
  int get installmentNumber;
  @override
  double get amount;
  @override
  DateTime get paidAt;
  @override
  String get transactionId;

  /// Create a copy of PaidInstallment
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$PaidInstallmentImplCopyWith<_$PaidInstallmentImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
