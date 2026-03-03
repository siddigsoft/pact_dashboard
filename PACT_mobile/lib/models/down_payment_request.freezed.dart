// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'down_payment_request.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;
/// @nodoc
mixin _$DownPaymentRequest {

 String get id; String get siteVisitId; String get mmpSiteEntryId; String get siteName; String get requestedBy; DateTime get requestedAt; String get requesterRole; String? get hubId; String? get hubName; double get totalTransportationBudget; double get requestedAmount; String get paymentType; List<InstallmentPlan> get installmentPlan; List<PaidInstallment> get paidInstallments; String get justification; List<String> get supportingDocuments; String? get supervisorId; String? get supervisorStatus; String? get supervisorApprovedBy; DateTime? get supervisorApprovedAt; String? get supervisorNotes; String? get supervisorRejectionReason; String? get adminStatus; String? get adminProcessedBy; DateTime? get adminProcessedAt; String? get adminNotes; String? get adminRejectionReason; String get status; double get totalPaidAmount; double? get remainingAmount; List<String> get walletTransactionIds; DateTime get createdAt; DateTime get updatedAt; Map<String, dynamic> get metadata;
/// Create a copy of DownPaymentRequest
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DownPaymentRequestCopyWith<DownPaymentRequest> get copyWith => _$DownPaymentRequestCopyWithImpl<DownPaymentRequest>(this as DownPaymentRequest, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DownPaymentRequest&&(identical(other.id, id) || other.id == id)&&(identical(other.siteVisitId, siteVisitId) || other.siteVisitId == siteVisitId)&&(identical(other.mmpSiteEntryId, mmpSiteEntryId) || other.mmpSiteEntryId == mmpSiteEntryId)&&(identical(other.siteName, siteName) || other.siteName == siteName)&&(identical(other.requestedBy, requestedBy) || other.requestedBy == requestedBy)&&(identical(other.requestedAt, requestedAt) || other.requestedAt == requestedAt)&&(identical(other.requesterRole, requesterRole) || other.requesterRole == requesterRole)&&(identical(other.hubId, hubId) || other.hubId == hubId)&&(identical(other.hubName, hubName) || other.hubName == hubName)&&(identical(other.totalTransportationBudget, totalTransportationBudget) || other.totalTransportationBudget == totalTransportationBudget)&&(identical(other.requestedAmount, requestedAmount) || other.requestedAmount == requestedAmount)&&(identical(other.paymentType, paymentType) || other.paymentType == paymentType)&&const DeepCollectionEquality().equals(other.installmentPlan, installmentPlan)&&const DeepCollectionEquality().equals(other.paidInstallments, paidInstallments)&&(identical(other.justification, justification) || other.justification == justification)&&const DeepCollectionEquality().equals(other.supportingDocuments, supportingDocuments)&&(identical(other.supervisorId, supervisorId) || other.supervisorId == supervisorId)&&(identical(other.supervisorStatus, supervisorStatus) || other.supervisorStatus == supervisorStatus)&&(identical(other.supervisorApprovedBy, supervisorApprovedBy) || other.supervisorApprovedBy == supervisorApprovedBy)&&(identical(other.supervisorApprovedAt, supervisorApprovedAt) || other.supervisorApprovedAt == supervisorApprovedAt)&&(identical(other.supervisorNotes, supervisorNotes) || other.supervisorNotes == supervisorNotes)&&(identical(other.supervisorRejectionReason, supervisorRejectionReason) || other.supervisorRejectionReason == supervisorRejectionReason)&&(identical(other.adminStatus, adminStatus) || other.adminStatus == adminStatus)&&(identical(other.adminProcessedBy, adminProcessedBy) || other.adminProcessedBy == adminProcessedBy)&&(identical(other.adminProcessedAt, adminProcessedAt) || other.adminProcessedAt == adminProcessedAt)&&(identical(other.adminNotes, adminNotes) || other.adminNotes == adminNotes)&&(identical(other.adminRejectionReason, adminRejectionReason) || other.adminRejectionReason == adminRejectionReason)&&(identical(other.status, status) || other.status == status)&&(identical(other.totalPaidAmount, totalPaidAmount) || other.totalPaidAmount == totalPaidAmount)&&(identical(other.remainingAmount, remainingAmount) || other.remainingAmount == remainingAmount)&&const DeepCollectionEquality().equals(other.walletTransactionIds, walletTransactionIds)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.metadata, metadata));
}


@override
int get hashCode => Object.hashAll([runtimeType,id,siteVisitId,mmpSiteEntryId,siteName,requestedBy,requestedAt,requesterRole,hubId,hubName,totalTransportationBudget,requestedAmount,paymentType,const DeepCollectionEquality().hash(installmentPlan),const DeepCollectionEquality().hash(paidInstallments),justification,const DeepCollectionEquality().hash(supportingDocuments),supervisorId,supervisorStatus,supervisorApprovedBy,supervisorApprovedAt,supervisorNotes,supervisorRejectionReason,adminStatus,adminProcessedBy,adminProcessedAt,adminNotes,adminRejectionReason,status,totalPaidAmount,remainingAmount,const DeepCollectionEquality().hash(walletTransactionIds),createdAt,updatedAt,const DeepCollectionEquality().hash(metadata)]);

@override
String toString() {
  return 'DownPaymentRequest(id: $id, siteVisitId: $siteVisitId, mmpSiteEntryId: $mmpSiteEntryId, siteName: $siteName, requestedBy: $requestedBy, requestedAt: $requestedAt, requesterRole: $requesterRole, hubId: $hubId, hubName: $hubName, totalTransportationBudget: $totalTransportationBudget, requestedAmount: $requestedAmount, paymentType: $paymentType, installmentPlan: $installmentPlan, paidInstallments: $paidInstallments, justification: $justification, supportingDocuments: $supportingDocuments, supervisorId: $supervisorId, supervisorStatus: $supervisorStatus, supervisorApprovedBy: $supervisorApprovedBy, supervisorApprovedAt: $supervisorApprovedAt, supervisorNotes: $supervisorNotes, supervisorRejectionReason: $supervisorRejectionReason, adminStatus: $adminStatus, adminProcessedBy: $adminProcessedBy, adminProcessedAt: $adminProcessedAt, adminNotes: $adminNotes, adminRejectionReason: $adminRejectionReason, status: $status, totalPaidAmount: $totalPaidAmount, remainingAmount: $remainingAmount, walletTransactionIds: $walletTransactionIds, createdAt: $createdAt, updatedAt: $updatedAt, metadata: $metadata)';
}


}

/// @nodoc
abstract mixin class $DownPaymentRequestCopyWith<$Res>  {
  factory $DownPaymentRequestCopyWith(DownPaymentRequest value, $Res Function(DownPaymentRequest) _then) = _$DownPaymentRequestCopyWithImpl;
@useResult
$Res call({
 String id, String siteVisitId, String mmpSiteEntryId, String siteName, String requestedBy, DateTime requestedAt, String requesterRole, String? hubId, String? hubName, double totalTransportationBudget, double requestedAmount, String paymentType, List<InstallmentPlan> installmentPlan, List<PaidInstallment> paidInstallments, String justification, List<String> supportingDocuments, String? supervisorId, String? supervisorStatus, String? supervisorApprovedBy, DateTime? supervisorApprovedAt, String? supervisorNotes, String? supervisorRejectionReason, String? adminStatus, String? adminProcessedBy, DateTime? adminProcessedAt, String? adminNotes, String? adminRejectionReason, String status, double totalPaidAmount, double? remainingAmount, List<String> walletTransactionIds, DateTime createdAt, DateTime updatedAt, Map<String, dynamic> metadata
});




}
/// @nodoc
class _$DownPaymentRequestCopyWithImpl<$Res>
    implements $DownPaymentRequestCopyWith<$Res> {
  _$DownPaymentRequestCopyWithImpl(this._self, this._then);

  final DownPaymentRequest _self;
  final $Res Function(DownPaymentRequest) _then;

/// Create a copy of DownPaymentRequest
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? siteVisitId = null,Object? mmpSiteEntryId = null,Object? siteName = null,Object? requestedBy = null,Object? requestedAt = null,Object? requesterRole = null,Object? hubId = freezed,Object? hubName = freezed,Object? totalTransportationBudget = null,Object? requestedAmount = null,Object? paymentType = null,Object? installmentPlan = null,Object? paidInstallments = null,Object? justification = null,Object? supportingDocuments = null,Object? supervisorId = freezed,Object? supervisorStatus = freezed,Object? supervisorApprovedBy = freezed,Object? supervisorApprovedAt = freezed,Object? supervisorNotes = freezed,Object? supervisorRejectionReason = freezed,Object? adminStatus = freezed,Object? adminProcessedBy = freezed,Object? adminProcessedAt = freezed,Object? adminNotes = freezed,Object? adminRejectionReason = freezed,Object? status = null,Object? totalPaidAmount = null,Object? remainingAmount = freezed,Object? walletTransactionIds = null,Object? createdAt = null,Object? updatedAt = null,Object? metadata = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,siteVisitId: null == siteVisitId ? _self.siteVisitId : siteVisitId // ignore: cast_nullable_to_non_nullable
as String,mmpSiteEntryId: null == mmpSiteEntryId ? _self.mmpSiteEntryId : mmpSiteEntryId // ignore: cast_nullable_to_non_nullable
as String,siteName: null == siteName ? _self.siteName : siteName // ignore: cast_nullable_to_non_nullable
as String,requestedBy: null == requestedBy ? _self.requestedBy : requestedBy // ignore: cast_nullable_to_non_nullable
as String,requestedAt: null == requestedAt ? _self.requestedAt : requestedAt // ignore: cast_nullable_to_non_nullable
as DateTime,requesterRole: null == requesterRole ? _self.requesterRole : requesterRole // ignore: cast_nullable_to_non_nullable
as String,hubId: freezed == hubId ? _self.hubId : hubId // ignore: cast_nullable_to_non_nullable
as String?,hubName: freezed == hubName ? _self.hubName : hubName // ignore: cast_nullable_to_non_nullable
as String?,totalTransportationBudget: null == totalTransportationBudget ? _self.totalTransportationBudget : totalTransportationBudget // ignore: cast_nullable_to_non_nullable
as double,requestedAmount: null == requestedAmount ? _self.requestedAmount : requestedAmount // ignore: cast_nullable_to_non_nullable
as double,paymentType: null == paymentType ? _self.paymentType : paymentType // ignore: cast_nullable_to_non_nullable
as String,installmentPlan: null == installmentPlan ? _self.installmentPlan : installmentPlan // ignore: cast_nullable_to_non_nullable
as List<InstallmentPlan>,paidInstallments: null == paidInstallments ? _self.paidInstallments : paidInstallments // ignore: cast_nullable_to_non_nullable
as List<PaidInstallment>,justification: null == justification ? _self.justification : justification // ignore: cast_nullable_to_non_nullable
as String,supportingDocuments: null == supportingDocuments ? _self.supportingDocuments : supportingDocuments // ignore: cast_nullable_to_non_nullable
as List<String>,supervisorId: freezed == supervisorId ? _self.supervisorId : supervisorId // ignore: cast_nullable_to_non_nullable
as String?,supervisorStatus: freezed == supervisorStatus ? _self.supervisorStatus : supervisorStatus // ignore: cast_nullable_to_non_nullable
as String?,supervisorApprovedBy: freezed == supervisorApprovedBy ? _self.supervisorApprovedBy : supervisorApprovedBy // ignore: cast_nullable_to_non_nullable
as String?,supervisorApprovedAt: freezed == supervisorApprovedAt ? _self.supervisorApprovedAt : supervisorApprovedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,supervisorNotes: freezed == supervisorNotes ? _self.supervisorNotes : supervisorNotes // ignore: cast_nullable_to_non_nullable
as String?,supervisorRejectionReason: freezed == supervisorRejectionReason ? _self.supervisorRejectionReason : supervisorRejectionReason // ignore: cast_nullable_to_non_nullable
as String?,adminStatus: freezed == adminStatus ? _self.adminStatus : adminStatus // ignore: cast_nullable_to_non_nullable
as String?,adminProcessedBy: freezed == adminProcessedBy ? _self.adminProcessedBy : adminProcessedBy // ignore: cast_nullable_to_non_nullable
as String?,adminProcessedAt: freezed == adminProcessedAt ? _self.adminProcessedAt : adminProcessedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,adminNotes: freezed == adminNotes ? _self.adminNotes : adminNotes // ignore: cast_nullable_to_non_nullable
as String?,adminRejectionReason: freezed == adminRejectionReason ? _self.adminRejectionReason : adminRejectionReason // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,totalPaidAmount: null == totalPaidAmount ? _self.totalPaidAmount : totalPaidAmount // ignore: cast_nullable_to_non_nullable
as double,remainingAmount: freezed == remainingAmount ? _self.remainingAmount : remainingAmount // ignore: cast_nullable_to_non_nullable
as double?,walletTransactionIds: null == walletTransactionIds ? _self.walletTransactionIds : walletTransactionIds // ignore: cast_nullable_to_non_nullable
as List<String>,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as DateTime,metadata: null == metadata ? _self.metadata : metadata // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>,
  ));
}

}


/// Adds pattern-matching-related methods to [DownPaymentRequest].
extension DownPaymentRequestPatterns on DownPaymentRequest {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DownPaymentRequest value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DownPaymentRequest() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DownPaymentRequest value)  $default,){
final _that = this;
switch (_that) {
case _DownPaymentRequest():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DownPaymentRequest value)?  $default,){
final _that = this;
switch (_that) {
case _DownPaymentRequest() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String siteVisitId,  String mmpSiteEntryId,  String siteName,  String requestedBy,  DateTime requestedAt,  String requesterRole,  String? hubId,  String? hubName,  double totalTransportationBudget,  double requestedAmount,  String paymentType,  List<InstallmentPlan> installmentPlan,  List<PaidInstallment> paidInstallments,  String justification,  List<String> supportingDocuments,  String? supervisorId,  String? supervisorStatus,  String? supervisorApprovedBy,  DateTime? supervisorApprovedAt,  String? supervisorNotes,  String? supervisorRejectionReason,  String? adminStatus,  String? adminProcessedBy,  DateTime? adminProcessedAt,  String? adminNotes,  String? adminRejectionReason,  String status,  double totalPaidAmount,  double? remainingAmount,  List<String> walletTransactionIds,  DateTime createdAt,  DateTime updatedAt,  Map<String, dynamic> metadata)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DownPaymentRequest() when $default != null:
return $default(_that.id,_that.siteVisitId,_that.mmpSiteEntryId,_that.siteName,_that.requestedBy,_that.requestedAt,_that.requesterRole,_that.hubId,_that.hubName,_that.totalTransportationBudget,_that.requestedAmount,_that.paymentType,_that.installmentPlan,_that.paidInstallments,_that.justification,_that.supportingDocuments,_that.supervisorId,_that.supervisorStatus,_that.supervisorApprovedBy,_that.supervisorApprovedAt,_that.supervisorNotes,_that.supervisorRejectionReason,_that.adminStatus,_that.adminProcessedBy,_that.adminProcessedAt,_that.adminNotes,_that.adminRejectionReason,_that.status,_that.totalPaidAmount,_that.remainingAmount,_that.walletTransactionIds,_that.createdAt,_that.updatedAt,_that.metadata);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String siteVisitId,  String mmpSiteEntryId,  String siteName,  String requestedBy,  DateTime requestedAt,  String requesterRole,  String? hubId,  String? hubName,  double totalTransportationBudget,  double requestedAmount,  String paymentType,  List<InstallmentPlan> installmentPlan,  List<PaidInstallment> paidInstallments,  String justification,  List<String> supportingDocuments,  String? supervisorId,  String? supervisorStatus,  String? supervisorApprovedBy,  DateTime? supervisorApprovedAt,  String? supervisorNotes,  String? supervisorRejectionReason,  String? adminStatus,  String? adminProcessedBy,  DateTime? adminProcessedAt,  String? adminNotes,  String? adminRejectionReason,  String status,  double totalPaidAmount,  double? remainingAmount,  List<String> walletTransactionIds,  DateTime createdAt,  DateTime updatedAt,  Map<String, dynamic> metadata)  $default,) {final _that = this;
switch (_that) {
case _DownPaymentRequest():
return $default(_that.id,_that.siteVisitId,_that.mmpSiteEntryId,_that.siteName,_that.requestedBy,_that.requestedAt,_that.requesterRole,_that.hubId,_that.hubName,_that.totalTransportationBudget,_that.requestedAmount,_that.paymentType,_that.installmentPlan,_that.paidInstallments,_that.justification,_that.supportingDocuments,_that.supervisorId,_that.supervisorStatus,_that.supervisorApprovedBy,_that.supervisorApprovedAt,_that.supervisorNotes,_that.supervisorRejectionReason,_that.adminStatus,_that.adminProcessedBy,_that.adminProcessedAt,_that.adminNotes,_that.adminRejectionReason,_that.status,_that.totalPaidAmount,_that.remainingAmount,_that.walletTransactionIds,_that.createdAt,_that.updatedAt,_that.metadata);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String siteVisitId,  String mmpSiteEntryId,  String siteName,  String requestedBy,  DateTime requestedAt,  String requesterRole,  String? hubId,  String? hubName,  double totalTransportationBudget,  double requestedAmount,  String paymentType,  List<InstallmentPlan> installmentPlan,  List<PaidInstallment> paidInstallments,  String justification,  List<String> supportingDocuments,  String? supervisorId,  String? supervisorStatus,  String? supervisorApprovedBy,  DateTime? supervisorApprovedAt,  String? supervisorNotes,  String? supervisorRejectionReason,  String? adminStatus,  String? adminProcessedBy,  DateTime? adminProcessedAt,  String? adminNotes,  String? adminRejectionReason,  String status,  double totalPaidAmount,  double? remainingAmount,  List<String> walletTransactionIds,  DateTime createdAt,  DateTime updatedAt,  Map<String, dynamic> metadata)?  $default,) {final _that = this;
switch (_that) {
case _DownPaymentRequest() when $default != null:
return $default(_that.id,_that.siteVisitId,_that.mmpSiteEntryId,_that.siteName,_that.requestedBy,_that.requestedAt,_that.requesterRole,_that.hubId,_that.hubName,_that.totalTransportationBudget,_that.requestedAmount,_that.paymentType,_that.installmentPlan,_that.paidInstallments,_that.justification,_that.supportingDocuments,_that.supervisorId,_that.supervisorStatus,_that.supervisorApprovedBy,_that.supervisorApprovedAt,_that.supervisorNotes,_that.supervisorRejectionReason,_that.adminStatus,_that.adminProcessedBy,_that.adminProcessedAt,_that.adminNotes,_that.adminRejectionReason,_that.status,_that.totalPaidAmount,_that.remainingAmount,_that.walletTransactionIds,_that.createdAt,_that.updatedAt,_that.metadata);case _:
  return null;

}
}

}

/// @nodoc


class _DownPaymentRequest extends DownPaymentRequest {
  const _DownPaymentRequest({required this.id, this.siteVisitId = '', this.mmpSiteEntryId = '', this.siteName = '', required this.requestedBy, required this.requestedAt, this.requesterRole = 'dataCollector', this.hubId, this.hubName, this.totalTransportationBudget = 0.0, this.requestedAmount = 0.0, this.paymentType = 'full_advance', final  List<InstallmentPlan> installmentPlan = const [], final  List<PaidInstallment> paidInstallments = const [], this.justification = '', final  List<String> supportingDocuments = const [], this.supervisorId, this.supervisorStatus, this.supervisorApprovedBy, this.supervisorApprovedAt, this.supervisorNotes, this.supervisorRejectionReason, this.adminStatus, this.adminProcessedBy, this.adminProcessedAt, this.adminNotes, this.adminRejectionReason, this.status = 'pending_supervisor', this.totalPaidAmount = 0.0, this.remainingAmount = 0.0, final  List<String> walletTransactionIds = const <String>[], required this.createdAt, required this.updatedAt, final  Map<String, dynamic> metadata = const <String, dynamic>{}}): _installmentPlan = installmentPlan,_paidInstallments = paidInstallments,_supportingDocuments = supportingDocuments,_walletTransactionIds = walletTransactionIds,_metadata = metadata,super._();
  

@override final  String id;
@override@JsonKey() final  String siteVisitId;
@override@JsonKey() final  String mmpSiteEntryId;
@override@JsonKey() final  String siteName;
@override final  String requestedBy;
@override final  DateTime requestedAt;
@override@JsonKey() final  String requesterRole;
@override final  String? hubId;
@override final  String? hubName;
@override@JsonKey() final  double totalTransportationBudget;
@override@JsonKey() final  double requestedAmount;
@override@JsonKey() final  String paymentType;
 final  List<InstallmentPlan> _installmentPlan;
@override@JsonKey() List<InstallmentPlan> get installmentPlan {
  if (_installmentPlan is EqualUnmodifiableListView) return _installmentPlan;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_installmentPlan);
}

 final  List<PaidInstallment> _paidInstallments;
@override@JsonKey() List<PaidInstallment> get paidInstallments {
  if (_paidInstallments is EqualUnmodifiableListView) return _paidInstallments;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_paidInstallments);
}

@override@JsonKey() final  String justification;
 final  List<String> _supportingDocuments;
@override@JsonKey() List<String> get supportingDocuments {
  if (_supportingDocuments is EqualUnmodifiableListView) return _supportingDocuments;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_supportingDocuments);
}

@override final  String? supervisorId;
@override final  String? supervisorStatus;
@override final  String? supervisorApprovedBy;
@override final  DateTime? supervisorApprovedAt;
@override final  String? supervisorNotes;
@override final  String? supervisorRejectionReason;
@override final  String? adminStatus;
@override final  String? adminProcessedBy;
@override final  DateTime? adminProcessedAt;
@override final  String? adminNotes;
@override final  String? adminRejectionReason;
@override@JsonKey() final  String status;
@override@JsonKey() final  double totalPaidAmount;
@override@JsonKey() final  double? remainingAmount;
 final  List<String> _walletTransactionIds;
@override@JsonKey() List<String> get walletTransactionIds {
  if (_walletTransactionIds is EqualUnmodifiableListView) return _walletTransactionIds;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_walletTransactionIds);
}

@override final  DateTime createdAt;
@override final  DateTime updatedAt;
 final  Map<String, dynamic> _metadata;
@override@JsonKey() Map<String, dynamic> get metadata {
  if (_metadata is EqualUnmodifiableMapView) return _metadata;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_metadata);
}


/// Create a copy of DownPaymentRequest
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DownPaymentRequestCopyWith<_DownPaymentRequest> get copyWith => __$DownPaymentRequestCopyWithImpl<_DownPaymentRequest>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DownPaymentRequest&&(identical(other.id, id) || other.id == id)&&(identical(other.siteVisitId, siteVisitId) || other.siteVisitId == siteVisitId)&&(identical(other.mmpSiteEntryId, mmpSiteEntryId) || other.mmpSiteEntryId == mmpSiteEntryId)&&(identical(other.siteName, siteName) || other.siteName == siteName)&&(identical(other.requestedBy, requestedBy) || other.requestedBy == requestedBy)&&(identical(other.requestedAt, requestedAt) || other.requestedAt == requestedAt)&&(identical(other.requesterRole, requesterRole) || other.requesterRole == requesterRole)&&(identical(other.hubId, hubId) || other.hubId == hubId)&&(identical(other.hubName, hubName) || other.hubName == hubName)&&(identical(other.totalTransportationBudget, totalTransportationBudget) || other.totalTransportationBudget == totalTransportationBudget)&&(identical(other.requestedAmount, requestedAmount) || other.requestedAmount == requestedAmount)&&(identical(other.paymentType, paymentType) || other.paymentType == paymentType)&&const DeepCollectionEquality().equals(other._installmentPlan, _installmentPlan)&&const DeepCollectionEquality().equals(other._paidInstallments, _paidInstallments)&&(identical(other.justification, justification) || other.justification == justification)&&const DeepCollectionEquality().equals(other._supportingDocuments, _supportingDocuments)&&(identical(other.supervisorId, supervisorId) || other.supervisorId == supervisorId)&&(identical(other.supervisorStatus, supervisorStatus) || other.supervisorStatus == supervisorStatus)&&(identical(other.supervisorApprovedBy, supervisorApprovedBy) || other.supervisorApprovedBy == supervisorApprovedBy)&&(identical(other.supervisorApprovedAt, supervisorApprovedAt) || other.supervisorApprovedAt == supervisorApprovedAt)&&(identical(other.supervisorNotes, supervisorNotes) || other.supervisorNotes == supervisorNotes)&&(identical(other.supervisorRejectionReason, supervisorRejectionReason) || other.supervisorRejectionReason == supervisorRejectionReason)&&(identical(other.adminStatus, adminStatus) || other.adminStatus == adminStatus)&&(identical(other.adminProcessedBy, adminProcessedBy) || other.adminProcessedBy == adminProcessedBy)&&(identical(other.adminProcessedAt, adminProcessedAt) || other.adminProcessedAt == adminProcessedAt)&&(identical(other.adminNotes, adminNotes) || other.adminNotes == adminNotes)&&(identical(other.adminRejectionReason, adminRejectionReason) || other.adminRejectionReason == adminRejectionReason)&&(identical(other.status, status) || other.status == status)&&(identical(other.totalPaidAmount, totalPaidAmount) || other.totalPaidAmount == totalPaidAmount)&&(identical(other.remainingAmount, remainingAmount) || other.remainingAmount == remainingAmount)&&const DeepCollectionEquality().equals(other._walletTransactionIds, _walletTransactionIds)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other._metadata, _metadata));
}


@override
int get hashCode => Object.hashAll([runtimeType,id,siteVisitId,mmpSiteEntryId,siteName,requestedBy,requestedAt,requesterRole,hubId,hubName,totalTransportationBudget,requestedAmount,paymentType,const DeepCollectionEquality().hash(_installmentPlan),const DeepCollectionEquality().hash(_paidInstallments),justification,const DeepCollectionEquality().hash(_supportingDocuments),supervisorId,supervisorStatus,supervisorApprovedBy,supervisorApprovedAt,supervisorNotes,supervisorRejectionReason,adminStatus,adminProcessedBy,adminProcessedAt,adminNotes,adminRejectionReason,status,totalPaidAmount,remainingAmount,const DeepCollectionEquality().hash(_walletTransactionIds),createdAt,updatedAt,const DeepCollectionEquality().hash(_metadata)]);

@override
String toString() {
  return 'DownPaymentRequest(id: $id, siteVisitId: $siteVisitId, mmpSiteEntryId: $mmpSiteEntryId, siteName: $siteName, requestedBy: $requestedBy, requestedAt: $requestedAt, requesterRole: $requesterRole, hubId: $hubId, hubName: $hubName, totalTransportationBudget: $totalTransportationBudget, requestedAmount: $requestedAmount, paymentType: $paymentType, installmentPlan: $installmentPlan, paidInstallments: $paidInstallments, justification: $justification, supportingDocuments: $supportingDocuments, supervisorId: $supervisorId, supervisorStatus: $supervisorStatus, supervisorApprovedBy: $supervisorApprovedBy, supervisorApprovedAt: $supervisorApprovedAt, supervisorNotes: $supervisorNotes, supervisorRejectionReason: $supervisorRejectionReason, adminStatus: $adminStatus, adminProcessedBy: $adminProcessedBy, adminProcessedAt: $adminProcessedAt, adminNotes: $adminNotes, adminRejectionReason: $adminRejectionReason, status: $status, totalPaidAmount: $totalPaidAmount, remainingAmount: $remainingAmount, walletTransactionIds: $walletTransactionIds, createdAt: $createdAt, updatedAt: $updatedAt, metadata: $metadata)';
}


}

/// @nodoc
abstract mixin class _$DownPaymentRequestCopyWith<$Res> implements $DownPaymentRequestCopyWith<$Res> {
  factory _$DownPaymentRequestCopyWith(_DownPaymentRequest value, $Res Function(_DownPaymentRequest) _then) = __$DownPaymentRequestCopyWithImpl;
@override @useResult
$Res call({
 String id, String siteVisitId, String mmpSiteEntryId, String siteName, String requestedBy, DateTime requestedAt, String requesterRole, String? hubId, String? hubName, double totalTransportationBudget, double requestedAmount, String paymentType, List<InstallmentPlan> installmentPlan, List<PaidInstallment> paidInstallments, String justification, List<String> supportingDocuments, String? supervisorId, String? supervisorStatus, String? supervisorApprovedBy, DateTime? supervisorApprovedAt, String? supervisorNotes, String? supervisorRejectionReason, String? adminStatus, String? adminProcessedBy, DateTime? adminProcessedAt, String? adminNotes, String? adminRejectionReason, String status, double totalPaidAmount, double? remainingAmount, List<String> walletTransactionIds, DateTime createdAt, DateTime updatedAt, Map<String, dynamic> metadata
});




}
/// @nodoc
class __$DownPaymentRequestCopyWithImpl<$Res>
    implements _$DownPaymentRequestCopyWith<$Res> {
  __$DownPaymentRequestCopyWithImpl(this._self, this._then);

  final _DownPaymentRequest _self;
  final $Res Function(_DownPaymentRequest) _then;

/// Create a copy of DownPaymentRequest
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? siteVisitId = null,Object? mmpSiteEntryId = null,Object? siteName = null,Object? requestedBy = null,Object? requestedAt = null,Object? requesterRole = null,Object? hubId = freezed,Object? hubName = freezed,Object? totalTransportationBudget = null,Object? requestedAmount = null,Object? paymentType = null,Object? installmentPlan = null,Object? paidInstallments = null,Object? justification = null,Object? supportingDocuments = null,Object? supervisorId = freezed,Object? supervisorStatus = freezed,Object? supervisorApprovedBy = freezed,Object? supervisorApprovedAt = freezed,Object? supervisorNotes = freezed,Object? supervisorRejectionReason = freezed,Object? adminStatus = freezed,Object? adminProcessedBy = freezed,Object? adminProcessedAt = freezed,Object? adminNotes = freezed,Object? adminRejectionReason = freezed,Object? status = null,Object? totalPaidAmount = null,Object? remainingAmount = freezed,Object? walletTransactionIds = null,Object? createdAt = null,Object? updatedAt = null,Object? metadata = null,}) {
  return _then(_DownPaymentRequest(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,siteVisitId: null == siteVisitId ? _self.siteVisitId : siteVisitId // ignore: cast_nullable_to_non_nullable
as String,mmpSiteEntryId: null == mmpSiteEntryId ? _self.mmpSiteEntryId : mmpSiteEntryId // ignore: cast_nullable_to_non_nullable
as String,siteName: null == siteName ? _self.siteName : siteName // ignore: cast_nullable_to_non_nullable
as String,requestedBy: null == requestedBy ? _self.requestedBy : requestedBy // ignore: cast_nullable_to_non_nullable
as String,requestedAt: null == requestedAt ? _self.requestedAt : requestedAt // ignore: cast_nullable_to_non_nullable
as DateTime,requesterRole: null == requesterRole ? _self.requesterRole : requesterRole // ignore: cast_nullable_to_non_nullable
as String,hubId: freezed == hubId ? _self.hubId : hubId // ignore: cast_nullable_to_non_nullable
as String?,hubName: freezed == hubName ? _self.hubName : hubName // ignore: cast_nullable_to_non_nullable
as String?,totalTransportationBudget: null == totalTransportationBudget ? _self.totalTransportationBudget : totalTransportationBudget // ignore: cast_nullable_to_non_nullable
as double,requestedAmount: null == requestedAmount ? _self.requestedAmount : requestedAmount // ignore: cast_nullable_to_non_nullable
as double,paymentType: null == paymentType ? _self.paymentType : paymentType // ignore: cast_nullable_to_non_nullable
as String,installmentPlan: null == installmentPlan ? _self._installmentPlan : installmentPlan // ignore: cast_nullable_to_non_nullable
as List<InstallmentPlan>,paidInstallments: null == paidInstallments ? _self._paidInstallments : paidInstallments // ignore: cast_nullable_to_non_nullable
as List<PaidInstallment>,justification: null == justification ? _self.justification : justification // ignore: cast_nullable_to_non_nullable
as String,supportingDocuments: null == supportingDocuments ? _self._supportingDocuments : supportingDocuments // ignore: cast_nullable_to_non_nullable
as List<String>,supervisorId: freezed == supervisorId ? _self.supervisorId : supervisorId // ignore: cast_nullable_to_non_nullable
as String?,supervisorStatus: freezed == supervisorStatus ? _self.supervisorStatus : supervisorStatus // ignore: cast_nullable_to_non_nullable
as String?,supervisorApprovedBy: freezed == supervisorApprovedBy ? _self.supervisorApprovedBy : supervisorApprovedBy // ignore: cast_nullable_to_non_nullable
as String?,supervisorApprovedAt: freezed == supervisorApprovedAt ? _self.supervisorApprovedAt : supervisorApprovedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,supervisorNotes: freezed == supervisorNotes ? _self.supervisorNotes : supervisorNotes // ignore: cast_nullable_to_non_nullable
as String?,supervisorRejectionReason: freezed == supervisorRejectionReason ? _self.supervisorRejectionReason : supervisorRejectionReason // ignore: cast_nullable_to_non_nullable
as String?,adminStatus: freezed == adminStatus ? _self.adminStatus : adminStatus // ignore: cast_nullable_to_non_nullable
as String?,adminProcessedBy: freezed == adminProcessedBy ? _self.adminProcessedBy : adminProcessedBy // ignore: cast_nullable_to_non_nullable
as String?,adminProcessedAt: freezed == adminProcessedAt ? _self.adminProcessedAt : adminProcessedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,adminNotes: freezed == adminNotes ? _self.adminNotes : adminNotes // ignore: cast_nullable_to_non_nullable
as String?,adminRejectionReason: freezed == adminRejectionReason ? _self.adminRejectionReason : adminRejectionReason // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,totalPaidAmount: null == totalPaidAmount ? _self.totalPaidAmount : totalPaidAmount // ignore: cast_nullable_to_non_nullable
as double,remainingAmount: freezed == remainingAmount ? _self.remainingAmount : remainingAmount // ignore: cast_nullable_to_non_nullable
as double?,walletTransactionIds: null == walletTransactionIds ? _self._walletTransactionIds : walletTransactionIds // ignore: cast_nullable_to_non_nullable
as List<String>,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as DateTime,metadata: null == metadata ? _self._metadata : metadata // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>,
  ));
}


}

/// @nodoc
mixin _$InstallmentPlan {

 int get installmentNumber; double get amount; DateTime get dueDate; String get description;
/// Create a copy of InstallmentPlan
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$InstallmentPlanCopyWith<InstallmentPlan> get copyWith => _$InstallmentPlanCopyWithImpl<InstallmentPlan>(this as InstallmentPlan, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is InstallmentPlan&&(identical(other.installmentNumber, installmentNumber) || other.installmentNumber == installmentNumber)&&(identical(other.amount, amount) || other.amount == amount)&&(identical(other.dueDate, dueDate) || other.dueDate == dueDate)&&(identical(other.description, description) || other.description == description));
}


@override
int get hashCode => Object.hash(runtimeType,installmentNumber,amount,dueDate,description);

@override
String toString() {
  return 'InstallmentPlan(installmentNumber: $installmentNumber, amount: $amount, dueDate: $dueDate, description: $description)';
}


}

/// @nodoc
abstract mixin class $InstallmentPlanCopyWith<$Res>  {
  factory $InstallmentPlanCopyWith(InstallmentPlan value, $Res Function(InstallmentPlan) _then) = _$InstallmentPlanCopyWithImpl;
@useResult
$Res call({
 int installmentNumber, double amount, DateTime dueDate, String description
});




}
/// @nodoc
class _$InstallmentPlanCopyWithImpl<$Res>
    implements $InstallmentPlanCopyWith<$Res> {
  _$InstallmentPlanCopyWithImpl(this._self, this._then);

  final InstallmentPlan _self;
  final $Res Function(InstallmentPlan) _then;

/// Create a copy of InstallmentPlan
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? installmentNumber = null,Object? amount = null,Object? dueDate = null,Object? description = null,}) {
  return _then(_self.copyWith(
installmentNumber: null == installmentNumber ? _self.installmentNumber : installmentNumber // ignore: cast_nullable_to_non_nullable
as int,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as double,dueDate: null == dueDate ? _self.dueDate : dueDate // ignore: cast_nullable_to_non_nullable
as DateTime,description: null == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [InstallmentPlan].
extension InstallmentPlanPatterns on InstallmentPlan {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _InstallmentPlan value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _InstallmentPlan() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _InstallmentPlan value)  $default,){
final _that = this;
switch (_that) {
case _InstallmentPlan():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _InstallmentPlan value)?  $default,){
final _that = this;
switch (_that) {
case _InstallmentPlan() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int installmentNumber,  double amount,  DateTime dueDate,  String description)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _InstallmentPlan() when $default != null:
return $default(_that.installmentNumber,_that.amount,_that.dueDate,_that.description);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int installmentNumber,  double amount,  DateTime dueDate,  String description)  $default,) {final _that = this;
switch (_that) {
case _InstallmentPlan():
return $default(_that.installmentNumber,_that.amount,_that.dueDate,_that.description);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int installmentNumber,  double amount,  DateTime dueDate,  String description)?  $default,) {final _that = this;
switch (_that) {
case _InstallmentPlan() when $default != null:
return $default(_that.installmentNumber,_that.amount,_that.dueDate,_that.description);case _:
  return null;

}
}

}

/// @nodoc


class _InstallmentPlan extends InstallmentPlan {
  const _InstallmentPlan({required this.installmentNumber, required this.amount, required this.dueDate, required this.description}): super._();
  

@override final  int installmentNumber;
@override final  double amount;
@override final  DateTime dueDate;
@override final  String description;

/// Create a copy of InstallmentPlan
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$InstallmentPlanCopyWith<_InstallmentPlan> get copyWith => __$InstallmentPlanCopyWithImpl<_InstallmentPlan>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _InstallmentPlan&&(identical(other.installmentNumber, installmentNumber) || other.installmentNumber == installmentNumber)&&(identical(other.amount, amount) || other.amount == amount)&&(identical(other.dueDate, dueDate) || other.dueDate == dueDate)&&(identical(other.description, description) || other.description == description));
}


@override
int get hashCode => Object.hash(runtimeType,installmentNumber,amount,dueDate,description);

@override
String toString() {
  return 'InstallmentPlan(installmentNumber: $installmentNumber, amount: $amount, dueDate: $dueDate, description: $description)';
}


}

/// @nodoc
abstract mixin class _$InstallmentPlanCopyWith<$Res> implements $InstallmentPlanCopyWith<$Res> {
  factory _$InstallmentPlanCopyWith(_InstallmentPlan value, $Res Function(_InstallmentPlan) _then) = __$InstallmentPlanCopyWithImpl;
@override @useResult
$Res call({
 int installmentNumber, double amount, DateTime dueDate, String description
});




}
/// @nodoc
class __$InstallmentPlanCopyWithImpl<$Res>
    implements _$InstallmentPlanCopyWith<$Res> {
  __$InstallmentPlanCopyWithImpl(this._self, this._then);

  final _InstallmentPlan _self;
  final $Res Function(_InstallmentPlan) _then;

/// Create a copy of InstallmentPlan
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? installmentNumber = null,Object? amount = null,Object? dueDate = null,Object? description = null,}) {
  return _then(_InstallmentPlan(
installmentNumber: null == installmentNumber ? _self.installmentNumber : installmentNumber // ignore: cast_nullable_to_non_nullable
as int,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as double,dueDate: null == dueDate ? _self.dueDate : dueDate // ignore: cast_nullable_to_non_nullable
as DateTime,description: null == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}

/// @nodoc
mixin _$PaidInstallment {

 int get installmentNumber; double get amount; DateTime get paidAt; String get transactionId;
/// Create a copy of PaidInstallment
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PaidInstallmentCopyWith<PaidInstallment> get copyWith => _$PaidInstallmentCopyWithImpl<PaidInstallment>(this as PaidInstallment, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PaidInstallment&&(identical(other.installmentNumber, installmentNumber) || other.installmentNumber == installmentNumber)&&(identical(other.amount, amount) || other.amount == amount)&&(identical(other.paidAt, paidAt) || other.paidAt == paidAt)&&(identical(other.transactionId, transactionId) || other.transactionId == transactionId));
}


@override
int get hashCode => Object.hash(runtimeType,installmentNumber,amount,paidAt,transactionId);

@override
String toString() {
  return 'PaidInstallment(installmentNumber: $installmentNumber, amount: $amount, paidAt: $paidAt, transactionId: $transactionId)';
}


}

/// @nodoc
abstract mixin class $PaidInstallmentCopyWith<$Res>  {
  factory $PaidInstallmentCopyWith(PaidInstallment value, $Res Function(PaidInstallment) _then) = _$PaidInstallmentCopyWithImpl;
@useResult
$Res call({
 int installmentNumber, double amount, DateTime paidAt, String transactionId
});




}
/// @nodoc
class _$PaidInstallmentCopyWithImpl<$Res>
    implements $PaidInstallmentCopyWith<$Res> {
  _$PaidInstallmentCopyWithImpl(this._self, this._then);

  final PaidInstallment _self;
  final $Res Function(PaidInstallment) _then;

/// Create a copy of PaidInstallment
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? installmentNumber = null,Object? amount = null,Object? paidAt = null,Object? transactionId = null,}) {
  return _then(_self.copyWith(
installmentNumber: null == installmentNumber ? _self.installmentNumber : installmentNumber // ignore: cast_nullable_to_non_nullable
as int,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as double,paidAt: null == paidAt ? _self.paidAt : paidAt // ignore: cast_nullable_to_non_nullable
as DateTime,transactionId: null == transactionId ? _self.transactionId : transactionId // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [PaidInstallment].
extension PaidInstallmentPatterns on PaidInstallment {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PaidInstallment value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PaidInstallment() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PaidInstallment value)  $default,){
final _that = this;
switch (_that) {
case _PaidInstallment():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PaidInstallment value)?  $default,){
final _that = this;
switch (_that) {
case _PaidInstallment() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int installmentNumber,  double amount,  DateTime paidAt,  String transactionId)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PaidInstallment() when $default != null:
return $default(_that.installmentNumber,_that.amount,_that.paidAt,_that.transactionId);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int installmentNumber,  double amount,  DateTime paidAt,  String transactionId)  $default,) {final _that = this;
switch (_that) {
case _PaidInstallment():
return $default(_that.installmentNumber,_that.amount,_that.paidAt,_that.transactionId);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int installmentNumber,  double amount,  DateTime paidAt,  String transactionId)?  $default,) {final _that = this;
switch (_that) {
case _PaidInstallment() when $default != null:
return $default(_that.installmentNumber,_that.amount,_that.paidAt,_that.transactionId);case _:
  return null;

}
}

}

/// @nodoc


class _PaidInstallment extends PaidInstallment {
  const _PaidInstallment({required this.installmentNumber, required this.amount, required this.paidAt, required this.transactionId}): super._();
  

@override final  int installmentNumber;
@override final  double amount;
@override final  DateTime paidAt;
@override final  String transactionId;

/// Create a copy of PaidInstallment
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PaidInstallmentCopyWith<_PaidInstallment> get copyWith => __$PaidInstallmentCopyWithImpl<_PaidInstallment>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PaidInstallment&&(identical(other.installmentNumber, installmentNumber) || other.installmentNumber == installmentNumber)&&(identical(other.amount, amount) || other.amount == amount)&&(identical(other.paidAt, paidAt) || other.paidAt == paidAt)&&(identical(other.transactionId, transactionId) || other.transactionId == transactionId));
}


@override
int get hashCode => Object.hash(runtimeType,installmentNumber,amount,paidAt,transactionId);

@override
String toString() {
  return 'PaidInstallment(installmentNumber: $installmentNumber, amount: $amount, paidAt: $paidAt, transactionId: $transactionId)';
}


}

/// @nodoc
abstract mixin class _$PaidInstallmentCopyWith<$Res> implements $PaidInstallmentCopyWith<$Res> {
  factory _$PaidInstallmentCopyWith(_PaidInstallment value, $Res Function(_PaidInstallment) _then) = __$PaidInstallmentCopyWithImpl;
@override @useResult
$Res call({
 int installmentNumber, double amount, DateTime paidAt, String transactionId
});




}
/// @nodoc
class __$PaidInstallmentCopyWithImpl<$Res>
    implements _$PaidInstallmentCopyWith<$Res> {
  __$PaidInstallmentCopyWithImpl(this._self, this._then);

  final _PaidInstallment _self;
  final $Res Function(_PaidInstallment) _then;

/// Create a copy of PaidInstallment
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? installmentNumber = null,Object? amount = null,Object? paidAt = null,Object? transactionId = null,}) {
  return _then(_PaidInstallment(
installmentNumber: null == installmentNumber ? _self.installmentNumber : installmentNumber // ignore: cast_nullable_to_non_nullable
as int,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as double,paidAt: null == paidAt ? _self.paidAt : paidAt // ignore: cast_nullable_to_non_nullable
as DateTime,transactionId: null == transactionId ? _self.transactionId : transactionId // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}

// dart format on
