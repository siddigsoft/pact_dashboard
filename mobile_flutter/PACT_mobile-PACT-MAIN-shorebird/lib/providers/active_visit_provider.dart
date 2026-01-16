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
  
  // ========== NEW: LOCKED START GPS ==========
  // GPS captured once on "Start Visit" - never changes after that
  final Position? lockedStartGPS;
  final bool gpsLocked;
  final bool isCapturingGPS;
  final String? gpsError;

  const ActiveVisitState({
    this.visit,
    this.startedAt,
    this.elapsedTime = Duration.zero,
    this.currentLocation,
    this.isTrackingLocation = false,
    this.locationHistory = const [],
    this.notes,
    this.photos = const [],
    // New GPS fields
    this.lockedStartGPS,
    this.gpsLocked = false,
    this.isCapturingGPS = false,
    this.gpsError,
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
    // New GPS fields
    Position? lockedStartGPS,
    bool? gpsLocked,
    bool? isCapturingGPS,
    String? gpsError,
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
      // New GPS fields
      lockedStartGPS: lockedStartGPS ?? this.lockedStartGPS,
      gpsLocked: gpsLocked ?? this.gpsLocked,
      isCapturingGPS: isCapturingGPS ?? this.isCapturingGPS,
      gpsError: gpsError ?? this.gpsError,
    );
  }

  bool get hasActiveVisit => visit != null;
  String get formattedElapsedTime {
    final hours = elapsedTime.inHours;
    final minutes = elapsedTime.inMinutes.remainder(60);
    final seconds = elapsedTime.inSeconds.remainder(60);
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
  
  // ========== NEW: GPS STATUS HELPERS ==========
  bool get hasLockedGPS => lockedStartGPS != null && gpsLocked;
  double? get lockedLatitude => lockedStartGPS?.latitude;
  double? get lockedLongitude => lockedStartGPS?.longitude;
  double? get lockedAccuracy => lockedStartGPS?.accuracy;
  
  Map<String, dynamic>? get lockedGPSAsMap {
    if (lockedStartGPS == null) return null;
    return {
      'latitude': lockedStartGPS!.latitude,
      'longitude': lockedStartGPS!.longitude,
      'accuracy': lockedStartGPS!.accuracy,
      'timestamp': lockedStartGPS!.timestamp.toIso8601String(),
      'locked': true,
    };
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
  
  // ========== GPS CAPTURE CONSTANTS ==========
  static const double maxAccuracyMeters = 10.0; // GPS must be ≤10m accuracy
  static const int maxGpsAttempts = 30; // Max attempts (30 seconds timeout)
  static const Duration gpsTimeout = Duration(seconds: 30);

  SupabaseClient get supabase => Supabase.instance.client;

  ActiveVisitNotifier(this._ref) : super(const ActiveVisitState());

  /// Start a site visit - captures GPS once with ≤10m accuracy
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
      // Reset GPS state
      lockedStartGPS: null,
      gpsLocked: false,
      isCapturingGPS: true,
      gpsError: null,
    );

    // Start timer
    _startTimer();

    // ========== NEW: CAPTURE GPS ONCE WITH ≤10M ACCURACY ==========
    await _captureStartGPS();

    debugPrint('Started active visit: ${visit.siteName}');
  }

  /// Capture GPS once on start with ≤10m accuracy requirement
  Future<Position?> _captureStartGPS() async {
    debugPrint('📍 Starting GPS capture for visit (accuracy ≤${maxAccuracyMeters}m required)...');
    
    state = state.copyWith(isCapturingGPS: true, gpsError: null);
    
    try {
      // Check permission first
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        final requested = await Geolocator.requestPermission();
        if (requested == LocationPermission.denied) {
          state = state.copyWith(
            isCapturingGPS: false,
            gpsError: 'Location permission denied',
          );
          debugPrint('❌ GPS permission denied');
          return null;
        }
      }
      
      if (permission == LocationPermission.deniedForever) {
        state = state.copyWith(
          isCapturingGPS: false,
          gpsError: 'Location permission permanently denied. Please enable in settings.',
        );
        debugPrint('❌ GPS permission permanently denied');
        return null;
      }
      
      // Check if location service is enabled
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        state = state.copyWith(
          isCapturingGPS: false,
          gpsError: 'Location services disabled. Please enable GPS.',
        );
        debugPrint('❌ Location services disabled');
        return null;
      }
      
      // Attempt to get position with ≤10m accuracy
      Position? bestPosition;
      int attempts = 0;
      
      while (attempts < maxGpsAttempts) {
        attempts++;
        debugPrint('📍 GPS attempt $attempts/$maxGpsAttempts...');
        
        try {
          final position = await Geolocator.getCurrentPosition(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.best,
              distanceFilter: 0,
            ),
          ).timeout(const Duration(seconds: 5));
          
          debugPrint('📍 Got position: ${position.latitude}, ${position.longitude} (accuracy: ${position.accuracy}m)');
          
          // Check if accuracy is within our requirement
          if (position.accuracy <= maxAccuracyMeters) {
            bestPosition = position;
            debugPrint('✅ GPS captured with accuracy ${position.accuracy}m (≤${maxAccuracyMeters}m)');
            break;
          } else {
            // Keep the best position so far
            if (bestPosition == null || position.accuracy < bestPosition.accuracy) {
              bestPosition = position;
            }
            debugPrint('⚠️ Accuracy ${position.accuracy}m > ${maxAccuracyMeters}m required, trying again...');
          }
        } catch (e) {
          debugPrint('⚠️ GPS attempt $attempts failed: $e');
        }
        
        // Small delay between attempts
        await Future.delayed(const Duration(milliseconds: 500));
      }
      
      // After all attempts, use best position if we have one
      if (bestPosition != null) {
        // Lock the GPS - it will never change after this
        state = state.copyWith(
          lockedStartGPS: bestPosition,
          gpsLocked: true,
          isCapturingGPS: false,
          gpsError: bestPosition.accuracy > maxAccuracyMeters 
              ? 'GPS captured with ${bestPosition.accuracy.toStringAsFixed(1)}m accuracy (target: ≤${maxAccuracyMeters}m)'
              : null,
        );
        
        debugPrint('🔒 GPS LOCKED: ${bestPosition.latitude}, ${bestPosition.longitude} (${bestPosition.accuracy}m)');
        return bestPosition;
      } else {
        state = state.copyWith(
          isCapturingGPS: false,
          gpsError: 'Could not capture GPS location. Please try again.',
        );
        debugPrint('❌ Failed to capture any GPS position');
        return null;
      }
      
    } catch (e) {
      state = state.copyWith(
        isCapturingGPS: false,
        gpsError: 'GPS error: ${e.toString()}',
      );
      debugPrint('❌ GPS capture error: $e');
      return null;
    }
  }

  /// Get the locked GPS as a map (for saving to database)
  Map<String, dynamic>? getLockedGPSMap() {
    return state.lockedGPSAsMap;
  }

  /// Stop the current visit
  Future<void> stopVisit() async {
    if (!state.hasActiveVisit) return;

    // Stop timer
    _timer?.cancel();
    _timer = null;

    // Stop location tracking
    await _stopLocationTracking();

    // Clear state (including locked GPS)
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

  /// Update current location (but NEVER change the locked start GPS)
  void updateLocation(Position position) {
    if (!state.hasActiveVisit) return;

    // Only update current location and history, NEVER the locked GPS
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

      // Start location stream for tracking (but NOT for changing locked GPS)
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

/// Provider for locked GPS status
final lockedGPSProvider = Provider<Map<String, dynamic>?>((ref) {
  return ref.watch(activeVisitProvider).lockedGPSAsMap;
});

/// Provider for GPS capturing status
final isCapturingGPSProvider = Provider<bool>((ref) {
  return ref.watch(activeVisitProvider).isCapturingGPS;
});

/// Provider for GPS error message
final gpsErrorProvider = Provider<String?>((ref) {
  return ref.watch(activeVisitProvider).gpsError;
});
