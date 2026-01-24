// lib/services/route_planning_service.dart

import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';

class RouteSite {
  final String id;
  final String name;
  final String nameAr;
  final double latitude;
  final double longitude;
  final String? state;
  final String? locality;
  final bool isVisited;
  final int? priority;
  final DateTime? scheduledDate;

  RouteSite({
    required this.id,
    required this.name,
    this.nameAr = '',
    required this.latitude,
    required this.longitude,
    this.state,
    this.locality,
    this.isVisited = false,
    this.priority,
    this.scheduledDate,
  });

  LatLng get latLng => LatLng(latitude, longitude);

  factory RouteSite.fromJson(Map<String, dynamic> json) {
    return RouteSite(
      id: json['id']?.toString() ?? '',
      name: json['name'] ?? json['site_name'] ?? '',
      nameAr: json['name_ar'] ?? json['site_name_ar'] ?? '',
      latitude: (json['latitude'] ?? json['lat'] ?? 0.0).toDouble(),
      longitude: (json['longitude'] ?? json['lng'] ?? json['lon'] ?? 0.0).toDouble(),
      state: json['state'],
      locality: json['locality'],
      isVisited: json['is_visited'] ?? false,
      priority: json['priority'],
      scheduledDate: json['scheduled_date'] != null 
          ? DateTime.tryParse(json['scheduled_date']) 
          : null,
    );
  }
}

class RouteSegment {
  final RouteSite from;
  final RouteSite to;
  final double distanceKm;
  final Duration estimatedDuration;
  final int order;

  RouteSegment({
    required this.from,
    required this.to,
    required this.distanceKm,
    required this.estimatedDuration,
    required this.order,
  });

  String get distanceText {
    if (distanceKm < 1) {
      return '${(distanceKm * 1000).round()} m';
    }
    return '${distanceKm.toStringAsFixed(1)} km';
  }

  String get durationText {
    if (estimatedDuration.inMinutes < 60) {
      return '${estimatedDuration.inMinutes} min';
    }
    final hours = estimatedDuration.inHours;
    final minutes = estimatedDuration.inMinutes % 60;
    return '${hours}h ${minutes}m';
  }
}

class OptimizedRoute {
  final List<RouteSite> orderedSites;
  final List<RouteSegment> segments;
  final double totalDistanceKm;
  final Duration totalDuration;
  final LatLng? startPoint;

  OptimizedRoute({
    required this.orderedSites,
    required this.segments,
    required this.totalDistanceKm,
    required this.totalDuration,
    this.startPoint,
  });

  String get totalDistanceText {
    if (totalDistanceKm < 1) {
      return '${(totalDistanceKm * 1000).round()} m';
    }
    return '${totalDistanceKm.toStringAsFixed(1)} km';
  }

  String get totalDurationText {
    if (totalDuration.inMinutes < 60) {
      return '${totalDuration.inMinutes} min';
    }
    final hours = totalDuration.inHours;
    final minutes = totalDuration.inMinutes % 60;
    return '${hours}h ${minutes}m';
  }

  List<LatLng> get routePolyline => orderedSites.map((s) => s.latLng).toList();
}

class RoutePlanningService {
  static final RoutePlanningService _instance = RoutePlanningService._internal();
  factory RoutePlanningService() => _instance;
  RoutePlanningService._internal();

  static const double _averageSpeedKmh = 40.0;
  static const double _visitTimeMinutes = 30.0;

  final Distance _distance = const Distance();

  double calculateDistance(LatLng from, LatLng to) {
    return _distance.as(LengthUnit.Kilometer, from, to);
  }

  Duration estimateTravelTime(double distanceKm) {
    final travelMinutes = (distanceKm / _averageSpeedKmh) * 60;
    return Duration(minutes: travelMinutes.round());
  }

  OptimizedRoute optimizeRoute(List<RouteSite> sites, {LatLng? startPoint}) {
    if (sites.isEmpty) {
      return OptimizedRoute(
        orderedSites: [],
        segments: [],
        totalDistanceKm: 0,
        totalDuration: Duration.zero,
        startPoint: startPoint,
      );
    }

    if (sites.length == 1) {
      double startDistance = 0;
      if (startPoint != null) {
        startDistance = calculateDistance(startPoint, sites.first.latLng);
      }
      return OptimizedRoute(
        orderedSites: sites,
        segments: [],
        totalDistanceKm: startDistance,
        totalDuration: estimateTravelTime(startDistance) + Duration(minutes: _visitTimeMinutes.round()),
        startPoint: startPoint,
      );
    }

    final optimizedSites = _nearestNeighborTSP(sites, startPoint);
    final segments = _createSegments(optimizedSites, startPoint);
    
    double totalDistance = 0;
    for (final segment in segments) {
      totalDistance += segment.distanceKm;
    }

    if (startPoint != null && optimizedSites.isNotEmpty) {
      totalDistance += calculateDistance(startPoint, optimizedSites.first.latLng);
    }

    final travelDuration = estimateTravelTime(totalDistance);
    final visitDuration = Duration(minutes: (optimizedSites.length * _visitTimeMinutes).round());
    final totalDuration = travelDuration + visitDuration;

    return OptimizedRoute(
      orderedSites: optimizedSites,
      segments: segments,
      totalDistanceKm: totalDistance,
      totalDuration: totalDuration,
      startPoint: startPoint,
    );
  }

  List<RouteSite> _nearestNeighborTSP(List<RouteSite> sites, LatLng? startPoint) {
    if (sites.isEmpty) return [];
    
    final unvisited = List<RouteSite>.from(sites);
    final route = <RouteSite>[];

    LatLng currentLocation;
    if (startPoint != null) {
      currentLocation = startPoint;
    } else {
      final first = unvisited.removeAt(0);
      route.add(first);
      currentLocation = first.latLng;
    }

    while (unvisited.isNotEmpty) {
      double minDistance = double.infinity;
      int nearestIndex = 0;

      for (int i = 0; i < unvisited.length; i++) {
        final distance = calculateDistance(currentLocation, unvisited[i].latLng);
        
        double adjustedDistance = distance;
        if (unvisited[i].priority != null) {
          adjustedDistance *= (1 - (unvisited[i].priority! / 100));
        }

        if (adjustedDistance < minDistance) {
          minDistance = adjustedDistance;
          nearestIndex = i;
        }
      }

      final nearest = unvisited.removeAt(nearestIndex);
      route.add(nearest);
      currentLocation = nearest.latLng;
    }

    return route;
  }

  List<RouteSegment> _createSegments(List<RouteSite> orderedSites, LatLng? startPoint) {
    final segments = <RouteSegment>[];
    
    for (int i = 0; i < orderedSites.length - 1; i++) {
      final from = orderedSites[i];
      final to = orderedSites[i + 1];
      final distance = calculateDistance(from.latLng, to.latLng);
      
      segments.add(RouteSegment(
        from: from,
        to: to,
        distanceKm: distance,
        estimatedDuration: estimateTravelTime(distance),
        order: i + 1,
      ));
    }

    return segments;
  }

  List<RouteSite> filterByLocality(List<RouteSite> sites, String locality) {
    return sites.where((s) => s.locality == locality).toList();
  }

  List<RouteSite> filterByState(List<RouteSite> sites, String state) {
    return sites.where((s) => s.state == state).toList();
  }

  List<RouteSite> filterUnvisited(List<RouteSite> sites) {
    return sites.where((s) => !s.isVisited).toList();
  }

  List<RouteSite> filterByDate(List<RouteSite> sites, DateTime date) {
    return sites.where((s) => 
      s.scheduledDate != null &&
      s.scheduledDate!.year == date.year &&
      s.scheduledDate!.month == date.month &&
      s.scheduledDate!.day == date.day
    ).toList();
  }

  Map<String, List<RouteSite>> groupByLocality(List<RouteSite> sites) {
    final grouped = <String, List<RouteSite>>{};
    for (final site in sites) {
      final locality = site.locality ?? 'Unknown';
      grouped.putIfAbsent(locality, () => []).add(site);
    }
    return grouped;
  }

  List<RouteSite> sortByPriority(List<RouteSite> sites) {
    final sorted = List<RouteSite>.from(sites);
    sorted.sort((a, b) {
      final priorityA = a.priority ?? 50;
      final priorityB = b.priority ?? 50;
      return priorityB.compareTo(priorityA);
    });
    return sorted;
  }

  List<RouteSite> getNearestSites(LatLng location, List<RouteSite> sites, {int limit = 5}) {
    final sitesWithDistance = sites.map((site) {
      final distance = calculateDistance(location, site.latLng);
      return MapEntry(site, distance);
    }).toList();

    sitesWithDistance.sort((a, b) => a.value.compareTo(b.value));

    return sitesWithDistance.take(limit).map((e) => e.key).toList();
  }
}
