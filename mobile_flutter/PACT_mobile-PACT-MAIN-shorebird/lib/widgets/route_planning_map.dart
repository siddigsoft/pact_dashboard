// lib/widgets/route_planning_map.dart

import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/route_planning_service.dart';
import '../theme/app_colors.dart';

class RoutePlanningMap extends StatefulWidget {
  final List<RouteSite> sites;
  final LatLng? currentLocation;
  final bool isArabic;
  final Function(RouteSite)? onSiteTap;
  final Function(OptimizedRoute)? onRouteCalculated;

  const RoutePlanningMap({
    super.key,
    required this.sites,
    this.currentLocation,
    this.isArabic = false,
    this.onSiteTap,
    this.onRouteCalculated,
  });

  @override
  State<RoutePlanningMap> createState() => _RoutePlanningMapState();
}

class _RoutePlanningMapState extends State<RoutePlanningMap> {
  final _routeService = RoutePlanningService();
  final _mapController = MapController();
  
  OptimizedRoute? _currentRoute;
  bool _isCalculating = false;
  bool _showRouteDetails = false;

  @override
  void initState() {
    super.initState();
    if (widget.sites.isNotEmpty) {
      _calculateRoute();
    }
  }

  @override
  void didUpdateWidget(RoutePlanningMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.sites != oldWidget.sites) {
      _calculateRoute();
    }
  }

  void _calculateRoute() {
    setState(() => _isCalculating = true);
    
    final route = _routeService.optimizeRoute(
      widget.sites,
      startPoint: widget.currentLocation,
    );
    
    setState(() {
      _currentRoute = route;
      _isCalculating = false;
    });
    
    widget.onRouteCalculated?.call(route);
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        _buildMap(),
        _buildTopBar(),
        if (_currentRoute != null && _showRouteDetails)
          _buildRouteDetailsPanel(),
        if (_isCalculating)
          _buildLoadingOverlay(),
      ],
    );
  }

  Widget _buildMap() {
    final center = widget.currentLocation ?? 
        (widget.sites.isNotEmpty 
            ? widget.sites.first.latLng 
            : const LatLng(15.5007, 32.5599));

    return FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        initialCenter: center,
        initialZoom: 10,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.pact.app',
        ),
        if (_currentRoute != null)
          PolylineLayer(
            polylines: [
              Polyline(
                points: _currentRoute!.routePolyline,
                color: AppColors.primaryBlue,
                strokeWidth: 4,
              ),
            ],
          ),
        MarkerLayer(
          markers: _buildMarkers(),
        ),
      ],
    );
  }

  List<Marker> _buildMarkers() {
    final markers = <Marker>[];

    if (widget.currentLocation != null) {
      markers.add(Marker(
        point: widget.currentLocation!,
        width: 40,
        height: 40,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.green,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.3),
                blurRadius: 6,
              ),
            ],
          ),
          child: const Icon(Icons.my_location, color: Colors.white, size: 20),
        ),
      ));
    }

    for (int i = 0; i < widget.sites.length; i++) {
      final site = widget.sites[i];
      final isInRoute = _currentRoute?.orderedSites.contains(site) ?? false;
      final routeIndex = _currentRoute?.orderedSites.indexOf(site) ?? -1;

      markers.add(Marker(
        point: site.latLng,
        width: 36,
        height: 36,
        child: GestureDetector(
          onTap: () => widget.onSiteTap?.call(site),
          child: Container(
            decoration: BoxDecoration(
              color: site.isVisited 
                  ? Colors.grey 
                  : isInRoute 
                      ? AppColors.primaryOrange 
                      : AppColors.primaryBlue,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 2),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.2),
                  blurRadius: 4,
                ),
              ],
            ),
            child: Center(
              child: isInRoute && routeIndex >= 0
                  ? Text(
                      '${routeIndex + 1}',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    )
                  : Icon(
                      site.isVisited ? Icons.check : Icons.location_on,
                      color: Colors.white,
                      size: 16,
                    ),
            ),
          ),
        ),
      ));
    }

    return markers;
  }

  Widget _buildTopBar() {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.white,
              Colors.white.withOpacity(0),
            ],
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.1),
                      blurRadius: 8,
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    const Icon(Icons.route, color: AppColors.primaryBlue),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _currentRoute != null
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  widget.isArabic 
                                      ? '${widget.sites.length} مواقع' 
                                      : '${widget.sites.length} sites',
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                  ),
                                ),
                                Text(
                                  '${_currentRoute!.totalDistanceText} • ${_currentRoute!.totalDurationText}',
                                  style: GoogleFonts.poppins(
                                    color: Colors.grey.shade600,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            )
                          : Text(
                              widget.isArabic 
                                  ? 'جاري حساب المسار...' 
                                  : 'Calculating route...',
                              style: GoogleFonts.poppins(fontSize: 14),
                            ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.1),
                    blurRadius: 8,
                  ),
                ],
              ),
              child: IconButton(
                icon: Icon(
                  _showRouteDetails ? Icons.expand_less : Icons.expand_more,
                  color: AppColors.primaryBlue,
                ),
                onPressed: () => setState(() => _showRouteDetails = !_showRouteDetails),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRouteDetailsPanel() {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Container(
        constraints: const BoxConstraints(maxHeight: 300),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.1),
              blurRadius: 10,
              offset: const Offset(0, -2),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Text(
                    widget.isArabic ? 'تفاصيل المسار' : 'Route Details',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Spacer(),
                  _buildStatChip(
                    Icons.straighten,
                    _currentRoute!.totalDistanceText,
                  ),
                  const SizedBox(width: 8),
                  _buildStatChip(
                    Icons.schedule,
                    _currentRoute!.totalDurationText,
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: _currentRoute!.orderedSites.length,
                itemBuilder: (context, index) {
                  final site = _currentRoute!.orderedSites[index];
                  final segment = index < _currentRoute!.segments.length
                      ? _currentRoute!.segments[index]
                      : null;

                  return _buildRouteStepTile(index + 1, site, segment);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatChip(IconData icon, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.primaryBlue.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: AppColors.primaryBlue),
          const SizedBox(width: 4),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: AppColors.primaryBlue,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRouteStepTile(int order, RouteSite site, RouteSegment? segment) {
    return ListTile(
      leading: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: site.isVisited ? Colors.grey : AppColors.primaryOrange,
          shape: BoxShape.circle,
        ),
        child: Center(
          child: Text(
            '$order',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
        ),
      ),
      title: Text(
        widget.isArabic ? site.nameAr.isNotEmpty ? site.nameAr : site.name : site.name,
        style: GoogleFonts.poppins(
          fontWeight: FontWeight.w500,
          decoration: site.isVisited ? TextDecoration.lineThrough : null,
        ),
      ),
      subtitle: segment != null
          ? Text(
              '${segment.distanceText} • ${segment.durationText}',
              style: GoogleFonts.poppins(
                fontSize: 12,
                color: Colors.grey.shade600,
              ),
            )
          : null,
      trailing: site.isVisited
          ? const Icon(Icons.check_circle, color: Colors.green)
          : null,
      onTap: () => widget.onSiteTap?.call(site),
    );
  }

  Widget _buildLoadingOverlay() {
    return Container(
      color: Colors.black.withOpacity(0.3),
      child: const Center(
        child: CircularProgressIndicator(color: Colors.white),
      ),
    );
  }
}
