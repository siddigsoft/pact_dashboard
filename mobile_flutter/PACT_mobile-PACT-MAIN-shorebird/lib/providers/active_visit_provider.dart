import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'dart:async';
import '../models/site_visit.dart';
import '../services/location_tracking_service.dart';

/// Active visit state management
class ActiveVisitState {
  final SiteVisit? visit;
  final DateTime? startedAt;
  final Duration elapsedTime;
  final Position? currentLocation;
  final bool isTrackingLocation;
  final List<Position> locationHistory;
  final String? notes;
  final List<String> photos;

  const ActiveVisitState({
    this.visit,
    this.startedAt,
    this.elapsedTime = Duration.zero,
    this.currentLocation,
    this.isTrackingLocation = false,
    this.locationHistory = const [],
    this.notes,
    this.photos = const [],
  });

  ActiveVisitState copyWith({
    SiteVisit? visit,
    DateTime? startedAt,
    Duration? elapsedTime,
    Position? currentLocation,
    bool? isTrackingLocation,
    List<Position>? locationHistory,
    String? notes,
    List<String>? photos,
  }) {
    return ActiveVisitState(
      visit: visit ?? this.visit,
      startedAt: startedAt ?? this.startedAt,
      elapsedTime: elapsedTime ?? this.elapsedTime,
      currentLocation: currentLocation ?? this.currentLocation,
      isTrackingLocation: isTrackingLocation ?? this.isTrackingLocation,
      locationHistory: locationHistory ?? this.locationHistory,
      notes: notes ?? this.notes,
      photos: photos ?? this.photos,
    );
  }

  bool get hasActiveVisit => visit != null;
  String get formattedElapsedTime {
    final hours = elapsedTime.inHours;
    final minutes = elapsedTime.inMinutes.remainder(60);
    final seconds = elapsedTime.inSeconds.remainder(60);
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
}

/// Provider for active visit state
final activeVisitProvider = StateNotifierProvider<ActiveVisitNotifier, ActiveVisitState>((ref) {
  return ActiveVisitNotifier(ref);
});

class ActiveVisitNotifier extends StateNotifier<ActiveVisitState> {
  final Ref _ref;
  Timer? _timer;
  StreamSubscription<Position>? _locationSubscription;
  final LocationTrackingService _locationService = LocationTrackingService();

  SupabaseClient get supabase => Supabase.instance.client;

  ActiveVisitNotifier(this._ref) : super(const ActiveVisitState());

  /// Start a site visit
  Future<void> startVisit(SiteVisit visit) async {
    // Stop any existing visit
    await stopVisit();

    final now = DateTime.now();
    state = state.copyWith(
      visit: visit,
      startedAt: now,
      elapsedTime: Duration.zero,
      locationHistory: [],
      notes: null,
      photos: [],
    );

    // Start timer
    _startTimer();

    // Start location tracking
    await _startLocationTracking();

    debugPrint('Started active visit: ${visit.siteName}');
  }

  /// Stop the current visit
  Future<void> stopVisit() async {
    if (!state.hasActiveVisit) return;

    // Stop timer
    _timer?.cancel();
    _timer = null;

    // Stop location tracking
    await _stopLocationTracking();

    // Clear state
    state = const ActiveVisitState();

    debugPrint('Stopped active visit');
  }

  /// Complete the current visit
  Future<void> completeVisit({
    String? notes,
    List<String>? photos,
  }) async {
    if (!state.hasActiveVisit) return;

    // Update final state
    state = state.copyWith(
      notes: notes,
      photos: photos ?? state.photos,
    );

    // Stop the visit
    await stopVisit();
  }

  /// Update current location
  void updateLocation(Position position) {
    if (!state.hasActiveVisit) return;

    state = state.copyWith(
      currentLocation: position,
      locationHistory: [...state.locationHistory, position],
    );
  }

  /// Add photo to visit
  void addPhoto(String photoPath) {
    if (!state.hasActiveVisit) return;

    state = state.copyWith(
      photos: [...state.photos, photoPath],
    );
  }

  /// Update notes
  void updateNotes(String notes) {
    if (!state.hasActiveVisit) return;

    state = state.copyWith(notes: notes);
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (state.hasActiveVisit && state.startedAt != null) {
        final elapsed = DateTime.now().difference(state.startedAt!);
        state = state.copyWith(elapsedTime: elapsed);
      }
    });
  }

  Future<void> _startLocationTracking() async {
    try {
      // Request location permission if needed
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        final requested = await Geolocator.requestPermission();
        if (requested == LocationPermission.denied) {
          debugPrint('Location permission denied');
          return;
        }
      }

      // Start location stream
      _locationSubscription = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 10, // Update every 10 meters
        ),
      ).listen((Position position) {
        updateLocation(position);
      });

      state = state.copyWith(isTrackingLocation: true);
      debugPrint('Started location tracking for active visit');
    } catch (e) {
      debugPrint('Error starting location tracking: $e');
    }
  }

  Future<void> _stopLocationTracking() async {
    await _locationSubscription?.cancel();
    _locationSubscription = null;
    state = state.copyWith(isTrackingLocation: false);
    debugPrint('Stopped location tracking');
  }

  @override
  void dispose() {
    _timer?.cancel();
    _locationSubscription?.cancel();
    super.dispose();
  }
}

/// Provider for checking if user has an active visit
final hasActiveVisitProvider = Provider<bool>((ref) {
  return ref.watch(activeVisitProvider).hasActiveVisit;
});

/// Provider for current active visit
final currentActiveVisitProvider = Provider<SiteVisit?>((ref) {
  return ref.watch(activeVisitProvider).visit;
});