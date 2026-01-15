import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/site_visit.dart';
import '../services/site_visit_service.dart';
import 'withdrawal_provider.dart' show currentUserIdProvider;

/// Provider for site visit service
final siteVisitServiceProvider = Provider<SiteVisitService>((ref) {
  return SiteVisitService();
});

/// Stream provider for assigned site visits (real-time)
final assignedSiteVisitsStreamProvider = StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  final userId = ref.watch(currentUserIdProvider);
  if (userId == null) {
    return Stream.value([]);
  }

  final service = ref.watch(siteVisitServiceProvider);
  return service.watchAssignedSiteVisits(userId);
});

/// Stream provider for available site visits (real-time)
final availableSiteVisitsStreamProvider = StreamProvider.autoDispose<List<SiteVisit>>((ref) {
  final service = ref.watch(siteVisitServiceProvider);
  return service.watchAvailableSiteVisits();
});

/// Stream provider for accepted site visits (real-time)
final acceptedSiteVisitsStreamProvider = StreamProvider.autoDispose<List<SiteVisit>>((ref) {
  final userId = ref.watch(currentUserIdProvider);
  if (userId == null) {
    return Stream.value([]);
  }

  final service = ref.watch(siteVisitServiceProvider);
  return service.watchAcceptedSiteVisits(userId);
});

/// Stream provider for ongoing site visits (real-time)
final ongoingSiteVisitsStreamProvider = StreamProvider.autoDispose<List<SiteVisit>>((ref) {
  final userId = ref.watch(currentUserIdProvider);
  if (userId == null) {
    return Stream.value([]);
  }

  final service = ref.watch(siteVisitServiceProvider);
  return service.watchOngoingSiteVisits(userId);
});

/// Stream provider for completed site visits (real-time)
final completedSiteVisitsStreamProvider = StreamProvider.autoDispose<List<SiteVisit>>((ref) {
  final userId = ref.watch(currentUserIdProvider);
  if (userId == null) {
    return Stream.value([]);
  }

  final service = ref.watch(siteVisitServiceProvider);
  return service.watchCompletedSiteVisits(userId);
});