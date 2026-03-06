import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/visit_report_data.dart';
import '../services/offline/offline_db.dart';
import '../services/location_service.dart';
import '../services/photo_upload_service.dart';
import 'visit_report_dialog.dart';

/// Result of running the complete-visit flow.
/// - [isOffline] true when completion was saved locally (offline or session-fallback).
/// - [updatedSite] non-null when caller should update _mySites and _unsyncedCompletedVisits.
class CompleteVisitResult {
  final bool isOffline;
  final Map<String, dynamic>? updatedSite;

  const CompleteVisitResult({required this.isOffline, this.updatedSite});
}

/// Helpers used by the completion logic (mirror screen helpers).
Map<String, dynamic> _safeParseAdditionalData(dynamic data) {
  if (data is String) {
    try {
      final decoded = jsonDecode(data);
      return decoded is Map
          ? Map<String, dynamic>.from(decoded)
          : <String, dynamic>{};
    } catch (_) {
      return <String, dynamic>{};
    }
  } else if (data is Map<String, dynamic>) {
    return Map<String, dynamic>.from(data);
  } else if (data is Map) {
    return Map<String, dynamic>.from(data);
  }
  return <String, dynamic>{};
}

Map<String, dynamic>? _safeStartLocation(Map<String, dynamic> additionalData) {
  final raw = additionalData['start_location'];
  if (raw == null) return null;
  if (raw is Map) return Map<String, dynamic>.from(raw);
  return null;
}

double _safeToDouble(dynamic value) {
  if (value is num) return value.toDouble();
  if (value is String) {
    return double.tryParse(value.trim()) ?? 0.0;
  }
  return 0.0;
}

/// Entry point for the complete-site flow (dialog + offline/online completion).
class CompleteVisitFlow {
  CompleteVisitFlow._();

  /// Runs the complete-site flow: shows [VisitReportDialog], then performs
  /// offline or online completion. Caller should update _mySites and
  /// _unsyncedCompletedVisits when [CompleteVisitResult.updatedSite] is non-null.
  ///
  /// [onOnlineSuccessReload] is called after a short delay when online completion
  /// succeeds (so the screen can refresh lists).
  static Future<CompleteVisitResult?> run(
    BuildContext context, {
    required Map<String, dynamic> site,
    required String? userId,
    Future<void> Function()? onOnlineSuccessReload,
  }) async {
    final supabase = Supabase.instance.client;
    final mounted = context.mounted;

    try {
      debugPrint(
        '[CompleteVisitFlow] Starting completion for site: ${site['id']}',
      );

      final connectivity = await Connectivity().checkConnectivity();
      final isOffline = connectivity.contains(ConnectivityResult.none);
      debugPrint('[CompleteVisitFlow] Connectivity - offline: $isOffline');

      final reportData = await showDialog<VisitReportData>(
        context: context,
        builder: (ctx) => VisitReportDialog(site: site),
      );

      if (reportData == null) return null;

      // Clear any saved draft for this site now that the user completed the visit
      try {
        final siteId = site['id']?.toString();
        if (siteId != null && siteId.isNotEmpty) {
          await OfflineDb().removeCachedItem(
            OfflineDb.siteCacheBox,
            'visit_draft_$siteId',
          );
        }
      } catch (_) {}

      final position =
          reportData.coordinates ?? await LocationService.getCurrentLocation();
      final now = DateTime.now().toIso8601String();
      final coordinates = position != null
          ? {
              'latitude': (position.latitude as num).toDouble(),
              'longitude': (position.longitude as num).toDouble(),
              'accuracy': (position.accuracy as num).toDouble(),
            }
          : <String, dynamic>{};

      final selectedActivities = reportData.selectedActivityTypes
          .map((activity) => activity.trim().toUpperCase())
          .where((activity) => activity.isNotEmpty)
          .toSet()
          .toList();

      if (selectedActivities.isEmpty &&
          reportData.activityType != null &&
          reportData.activityType!.trim().isNotEmpty) {
        selectedActivities.add(reportData.activityType!.trim().toUpperCase());
      }

      final Map<String, dynamic> activityDetails = {};
      var totalVisitFees = 0;
      for (final activity in selectedActivities) {
        if (activity == 'PDM') {
          final pdmSiteVisits = reportData.pdmQuestionnaires > 0
              ? (reportData.pdmQuestionnaires / 7).floor()
              : 0;
          if (reportData.pdmQuestionnaires > 0) {
            activityDetails['PDM'] = {
              'questionnaires': reportData.pdmQuestionnaires,
              'site_visits': pdmSiteVisits,
            };
          } else {
            activityDetails['PDM'] = {'site_visits': 1};
          }
          totalVisitFees += pdmSiteVisits > 0 ? pdmSiteVisits : 1;
        } else if (activity == 'MDM') {
          activityDetails['MDM'] = {
            if (reportData.marketName != null &&
                reportData.marketName!.isNotEmpty)
              'market_name': reportData.marketName,
            'site_visits': 2,
          };
          totalVisitFees += 2;
        } else if (activity == 'WHM') {
          activityDetails['WHM'] = {
            if (reportData.warehouseName != null &&
                reportData.warehouseName!.isNotEmpty)
              'warehouse_name': reportData.warehouseName,
            'site_visits': 2,
          };
          totalVisitFees += 2;
        } else {
          activityDetails[activity] = {'site_visits': 1};
          totalVisitFees += 1;
        }
      }

      final additionalData = _safeParseAdditionalData(site['additional_data']);
      final feeMultiplier = totalVisitFees > 0 ? totalVisitFees : 1;
      final baseEnumeratorFee = _safeToDouble(
        additionalData['base_enumerator_fee'] ?? site['enumerator_fee'],
      );
      final transportFee = _safeToDouble(site['transport_fee']);
      final adjustedEnumeratorFee = baseEnumeratorFee > 0
          ? baseEnumeratorFee * feeMultiplier
          : 0.0;
      final adjustedTotalCost = adjustedEnumeratorFee > 0
          ? adjustedEnumeratorFee + transportFee
          : _safeToDouble(site['cost']);

      // ---------- OFFLINE MODE ----------
      if (isOffline) {
        debugPrint('[CompleteVisitFlow] Offline mode - saving locally');
        final endLocation = coordinates.isNotEmpty
            ? coordinates
            : <String, dynamic>{};

        final List<String> photoBase64Urls = [];
        for (final photoPath in reportData.photos) {
          try {
            final file = File(photoPath);
            final bytes = await file.readAsBytes();
            photoBase64Urls.add(
              'data:image/jpeg;base64,${base64Encode(bytes)}',
            );
          } catch (e) {
            debugPrint('[CompleteVisitFlow] Error converting photo: $e');
          }
        }

        final savedStartLocation = _safeStartLocation(additionalData);

        final offlineDb = OfflineDb();
        await offlineDb.queueCompleteVisit(
          visitId: site['id'].toString(),
          userId: userId ?? '',
          endLocation: endLocation,
          notes: reportData.notes,
          activities: reportData.activities,
          durationMinutes: reportData.durationMinutes,
          photoDataUrls: photoBase64Urls,
          siteName:
              site['site_name']?.toString() ?? site['siteName']?.toString(),
          siteCode:
              site['site_code']?.toString() ?? site['siteCode']?.toString(),
          state: site['state']?.toString(),
          locality: site['locality']?.toString(),
          startLocation: savedStartLocation,
        );

        final updatedSite = Map<String, dynamic>.from(site);
        updatedSite['status'] = 'Completed';
        updatedSite['visit_completed_at'] = now;
        updatedSite['_offline_modified'] = true;
        updatedSite['_synced'] = false;
        updatedSite['_offline_notes'] = reportData.notes;
        updatedSite['_offline_activities'] = reportData.activities;
        updatedSite['_offline_selected_activities'] = selectedActivities;
        updatedSite['_offline_activity_details'] = activityDetails;
        updatedSite['_offline_total_visit_fees'] = feeMultiplier;
        updatedSite['_offline_photos'] = photoBase64Urls;
        updatedSite['_offline_end_location'] = endLocation;

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Visit completed (offline). Will sync when online.',
              ),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return CompleteVisitResult(isOffline: true, updatedSite: updatedSite);
      }

      // ---------- ONLINE MODE: session check ----------
      var session = supabase.auth.currentSession;
      if (session == null || session.isExpired) {
        debugPrint(
          '[CompleteVisitFlow] Session expired, attempting refresh...',
        );
        try {
          await supabase.auth.refreshSession();
          debugPrint('[CompleteVisitFlow] Session refreshed');
        } catch (refreshError) {
          debugPrint(
            '[CompleteVisitFlow] Session refresh failed: $refreshError',
          );
          // Fall back to offline
          final endLocation = coordinates.isNotEmpty
              ? coordinates
              : <String, dynamic>{};
          final List<String> photoBase64Urls = [];
          for (final photoPath in reportData.photos) {
            try {
              final file = File(photoPath);
              final bytes = await file.readAsBytes();
              photoBase64Urls.add(
                'data:image/jpeg;base64,${base64Encode(bytes)}',
              );
            } catch (_) {}
          }
          final additionalData = _safeParseAdditionalData(
            site['additional_data'],
          );
          final savedStartLocation = _safeStartLocation(additionalData);
          final offlineDb = OfflineDb();
          await offlineDb.queueCompleteVisit(
            visitId: site['id'].toString(),
            userId: userId ?? '',
            endLocation: endLocation,
            notes: reportData.notes,
            activities: reportData.activities,
            durationMinutes: reportData.durationMinutes,
            photoDataUrls: photoBase64Urls,
            siteName:
                site['site_name']?.toString() ?? site['siteName']?.toString(),
            siteCode:
                site['site_code']?.toString() ?? site['siteCode']?.toString(),
            state: site['state']?.toString(),
            locality: site['locality']?.toString(),
            startLocation: savedStartLocation,
          );
          final updatedSite = Map<String, dynamic>.from(site);
          updatedSite['status'] = 'Completed';
          updatedSite['_offline_modified'] = true;
          updatedSite['_synced'] = false;
          updatedSite['_offline_notes'] = reportData.notes;
          updatedSite['_offline_activities'] = reportData.activities;
          updatedSite['_offline_selected_activities'] = selectedActivities;
          updatedSite['_offline_activity_details'] = activityDetails;
          updatedSite['_offline_total_visit_fees'] = feeMultiplier;
          updatedSite['_offline_photos'] = photoBase64Urls;
          updatedSite['_offline_end_location'] = endLocation;
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Visit completed (will sync when online).'),
                backgroundColor: Colors.orange,
              ),
            );
          }
          return CompleteVisitResult(isOffline: true, updatedSite: updatedSite);
        }
      }

      final currentUserId = supabase.auth.currentUser?.id;
      if (currentUserId == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Authentication error. Please log in again.'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return null;
      }

      var currentSession = supabase.auth.currentSession;
      if (currentSession == null || currentSession.isExpired) {
        try {
          await supabase.auth.refreshSession();
          currentSession = supabase.auth.currentSession;
        } catch (_) {
          throw Exception('Session expired. Please try again.');
        }
      }

      // Photo uploads
      List<String> photoUrls = [];
      if (reportData.photos.isNotEmpty) {
        currentSession = supabase.auth.currentSession;
        if (currentSession == null || currentSession.isExpired) {
          try {
            await supabase.auth.refreshSession();
          } catch (_) {
            throw Exception(
              'Session expired during photo upload. Please try again.',
            );
          }
        }
        try {
          photoUrls = await PhotoUploadService.uploadPhotos(
            site['id'].toString(),
            reportData.photos,
          );
          currentSession = supabase.auth.currentSession;
          if (currentSession == null || currentSession.isExpired) {
            try {
              await supabase.auth.refreshSession();
            } catch (_) {
              throw Exception(
                'Session expired during upload. Please try again.',
              );
            }
          }
        } catch (uploadError) {
          final errorStr = uploadError.toString().toLowerCase();
          if (errorStr.contains('auth') ||
              errorStr.contains('unauthorized') ||
              errorStr.contains('jwt') ||
              errorStr.contains('token')) {
            try {
              await supabase.auth.refreshSession();
              photoUrls = await PhotoUploadService.uploadPhotos(
                site['id'].toString(),
                reportData.photos,
              );
            } catch (_) {
              throw Exception(
                'Authentication error during photo upload. Please log in again.',
              );
            }
          } else {
            rethrow;
          }
        }
      }

      final reportInsert = <String, dynamic>{
        'site_visit_id': site['id'],
        'selected_activities': selectedActivities,
        'activity_details': activityDetails,
        'total_visit_fees': totalVisitFees,
        'notes': reportData.notes.trim(),
        'activities': reportData.activities.trim().isEmpty
            ? null
            : reportData.activities.trim(),
        'duration_minutes': reportData.durationMinutes,
        'coordinates': coordinates,
        'submitted_by': currentUserId,
        'submitted_at': now,
        'is_synced': true,
      };

      currentSession = supabase.auth.currentSession;
      if (currentSession == null || currentSession.isExpired) {
        try {
          await supabase.auth.refreshSession();
        } catch (_) {
          throw Exception('Session expired. Please try again.');
        }
      }

      dynamic savedReport;
      try {
        savedReport = await supabase
            .from('reports')
            .insert(reportInsert)
            .select()
            .single();
      } catch (dbError) {
        final errorStr = dbError.toString().toLowerCase();
        if (errorStr.contains('auth') ||
            errorStr.contains('unauthorized') ||
            errorStr.contains('jwt') ||
            errorStr.contains('token')) {
          try {
            await supabase.auth.refreshSession();
            savedReport = await supabase
                .from('reports')
                .insert(reportInsert)
                .select()
                .single();
          } catch (_) {
            throw Exception('Authentication error. Please log in again.');
          }
        } else {
          rethrow;
        }
      }

      if (photoUrls.isNotEmpty && savedReport != null) {
        final reportPhotos = photoUrls
            .map(
              (url) => {
                'report_id': savedReport['id'],
                'photo_url': url,
                'storage_path': url,
              },
            )
            .toList();
        currentSession = supabase.auth.currentSession;
        if (currentSession == null || currentSession.isExpired) {
          await supabase.auth.refreshSession();
        }
        try {
          await supabase.from('report_photos').insert(reportPhotos);
        } catch (photoError) {
          final errorStr = photoError.toString().toLowerCase();
          if (errorStr.contains('auth') ||
              errorStr.contains('unauthorized') ||
              errorStr.contains('jwt') ||
              errorStr.contains('token')) {
            await supabase.auth.refreshSession();
            await supabase.from('report_photos').insert(reportPhotos);
          } else {
            rethrow;
          }
        }
      }

      currentSession = supabase.auth.currentSession;
      if (currentSession == null || currentSession.isExpired) {
        await supabase.auth.refreshSession();
      }

      final updateData = <String, dynamic>{
        'status': 'Completed',
        'visit_completed_at': now,
        'visit_completed_by': currentUserId,
        'updated_at': now,
        'additional_data': {
          ...additionalData,
          'visit_report_submitted': true,
          'visit_report_id': savedReport['id'],
          'visit_report_submitted_at': now,
          'selected_activities': selectedActivities,
          'activity_details': activityDetails,
          'total_visit_fees': feeMultiplier,
          'fee_multiplier': feeMultiplier,
          if (baseEnumeratorFee > 0) 'base_enumerator_fee': baseEnumeratorFee,
          if (adjustedEnumeratorFee > 0)
            'adjusted_enumerator_fee': adjustedEnumeratorFee,
          if (feeMultiplier > 1) 'fee_adjusted_for_addon_activities': true,
          if (position != null)
            'final_location': {
              'latitude': position.latitude,
              'longitude': position.longitude,
              'accuracy': position.accuracy,
            },
        },
      };

      if (adjustedEnumeratorFee > 0) {
        updateData['enumerator_fee'] = adjustedEnumeratorFee;
        updateData['cost'] = adjustedTotalCost;
      }

      final currentSite = await supabase
          .from('mmp_site_entries')
          .select('visit_completed_at, visit_completed_by')
          .eq('id', site['id'])
          .maybeSingle();

      if (currentSite?['visit_completed_at'] == null) {
        updateData['visit_completed_at'] = now;
      }
      if (currentSite?['visit_completed_by'] == null) {
        updateData['visit_completed_by'] = currentUserId;
      }

      try {
        await supabase
            .from('mmp_site_entries')
            .update(updateData)
            .eq('id', site['id']);
      } catch (updateError) {
        final errorStr = updateError.toString().toLowerCase();
        if (errorStr.contains('auth') ||
            errorStr.contains('unauthorized') ||
            errorStr.contains('jwt') ||
            errorStr.contains('token')) {
          await supabase.auth.refreshSession();
          await supabase
              .from('mmp_site_entries')
              .update(updateData)
              .eq('id', site['id']);
        } else {
          rethrow;
        }
      }

      // Create wallet transaction for online completion
      try {
        final existing = await supabase
            .from('wallet_transactions')
            .select()
            .eq('reference_id', site['id'])
            .maybeSingle();

        if (existing == null) {
          final walletResponse = await supabase
              .from('wallets')
              .select('id')
              .eq('user_id', currentUserId)
              .maybeSingle();

          if (walletResponse != null) {
            final walletId = walletResponse['id'];
            final amount = adjustedEnumeratorFee + transportFee;

            if (amount > 0) {
              // Build detailed metadata for the transaction
              final metadata = {
                'site_id': site['id'],
                'site_name': site['site_name'] ?? site['siteName'] ?? 'Unknown',
                'site_code': site['site_code'] ?? site['siteCode'] ?? '',
                'fee_breakdown': {
                  'enumerator_fee': adjustedEnumeratorFee,
                  'transport_fee': transportFee,
                  'fee_multiplier': feeMultiplier,
                  'is_adjusted': feeMultiplier > 1,
                },
                'activity_details': activityDetails,
                'selected_activities': selectedActivities,
              };

              await supabase.from('wallet_transactions').insert({
                'wallet_id': walletId,
                'user_id': currentUserId,
                'reference_id': site['id'],
                'type': 'earning',
                'amount': amount,
                'description':
                    'Site visit completion: ${site['site_code'] ?? site['siteCode'] ?? 'Site'} | Enumerator: $adjustedEnumeratorFee, Transport: $transportFee',
                'status': 'posted',
                'created_at': now,
                'metadata': metadata,
              });
              debugPrint(
                '[CompleteVisitFlow] Wallet transaction created for user=$currentUserId, amount=$amount, breakdown: enum=$adjustedEnumeratorFee, transport=$transportFee',
              );
            }
          }
        }
      } catch (walletError) {
        final errorStr = walletError.toString().toLowerCase();
        if (errorStr.contains('auth') ||
            errorStr.contains('unauthorized') ||
            errorStr.contains('jwt') ||
            errorStr.contains('token')) {
          try {
            await supabase.auth.refreshSession();
            final existing = await supabase
                .from('wallet_transactions')
                .select()
                .eq('reference_id', site['id'])
                .maybeSingle();

            if (existing == null) {
              final walletResponse = await supabase
                  .from('wallets')
                  .select('id')
                  .eq('user_id', currentUserId)
                  .maybeSingle();

              if (walletResponse != null) {
                final walletId = walletResponse['id'];
                final amount = adjustedEnumeratorFee + transportFee;

                if (amount > 0) {
                  // Build detailed metadata for the transaction
                  final metadata = {
                    'site_id': site['id'],
                    'site_name':
                        site['site_name'] ?? site['siteName'] ?? 'Unknown',
                    'site_code': site['site_code'] ?? site['siteCode'] ?? '',
                    'fee_breakdown': {
                      'enumerator_fee': adjustedEnumeratorFee,
                      'transport_fee': transportFee,
                      'fee_multiplier': feeMultiplier,
                      'is_adjusted': feeMultiplier > 1,
                    },
                    'activity_details': activityDetails,
                    'selected_activities': selectedActivities,
                  };

                  await supabase.from('wallet_transactions').insert({
                    'wallet_id': walletId,
                    'user_id': currentUserId,
                    'reference_id': site['id'],
                    'type': 'earning',
                    'amount': amount,
                    'description':
                        'Site visit completion: ${site['site_code'] ?? site['siteCode'] ?? 'Site'} | Enumerator: $adjustedEnumeratorFee, Transport: $transportFee',
                    'status': 'posted',
                    'created_at': now,
                    'metadata': metadata,
                  });
                  debugPrint(
                    '[CompleteVisitFlow] Wallet transaction created (retry) for user=$currentUserId',
                  );
                }
              }
            }
          } catch (_) {
            debugPrint(
              '[CompleteVisitFlow] Wallet transaction creation failed (non-critical after retry)',
            );
          }
        } else {
          debugPrint(
            '[CompleteVisitFlow] Wallet transaction creation failed (non-critical): $walletError',
          );
        }
      }

      if (position != null) {
        currentSession = supabase.auth.currentSession;
        if (currentSession == null || currentSession.isExpired) {
          await supabase.auth.refreshSession();
        }
        try {
          final lat = (position.latitude as num).toDouble();
          final lng = (position.longitude as num).toDouble();
          final acc = (position.accuracy as num?)?.toDouble() ?? 10.0;
          await supabase.from('site_locations').insert({
            'site_id': site['id'],
            'user_id': currentUserId,
            'latitude': lat,
            'longitude': lng,
            'accuracy': acc,
            'notes': 'Visit end location',
            'recorded_at': now,
          });
        } catch (locationError) {
          final errorStr = locationError.toString().toLowerCase();
          if (errorStr.contains('auth') ||
              errorStr.contains('unauthorized') ||
              errorStr.contains('jwt') ||
              errorStr.contains('token')) {
            await supabase.auth.refreshSession();
            final lat = (position.latitude as num).toDouble();
            final lng = (position.longitude as num).toDouble();
            final acc = (position.accuracy as num?)?.toDouble() ?? 10.0;
            await supabase.from('site_locations').insert({
              'site_id': site['id'],
              'user_id': currentUserId,
              'latitude': lat,
              'longitude': lng,
              'accuracy': acc,
              'notes': 'Visit end location',
              'recorded_at': now,
            });
          } else {
            debugPrint(
              '[CompleteVisitFlow] Location insert failed (non-critical): $locationError',
            );
          }
        }
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Visit completed and report submitted successfully'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
          ),
        );
      }

      if (onOnlineSuccessReload != null) {
        Future.delayed(const Duration(seconds: 2), () async {
          try {
            await onOnlineSuccessReload();
          } catch (e) {
            debugPrint('[CompleteVisitFlow] Background reload error: $e');
          }
        });
      }

      return const CompleteVisitResult(isOffline: false);
    } catch (e, stack) {
      debugPrint('[CompleteVisitFlow] Error: $e');
      debugPrint('[CompleteVisitFlow] Stack: $stack');
      final errorStr = e.toString().toLowerCase();
      final isAuthError =
          errorStr.contains('auth') ||
          errorStr.contains('unauthorized') ||
          errorStr.contains('jwt') ||
          errorStr.contains('token') ||
          errorStr.contains('session expired');
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              isAuthError
                  ? 'Authentication error. Please try again or log in again if the problem persists.'
                  : 'Error: ${e.toString()}',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
      return null;
    }
  }
}
