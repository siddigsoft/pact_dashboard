// lib/widgets/weather_widget.dart

import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:latlong2/latlong.dart';
import '../services/weather_service.dart';
import '../theme/app_colors.dart';

class WeatherWidget extends StatefulWidget {
  final LatLng location;
  final bool isArabic;
  final bool compact;

  const WeatherWidget({
    super.key,
    required this.location,
    this.isArabic = false,
    this.compact = false,
  });

  @override
  State<WeatherWidget> createState() => _WeatherWidgetState();
}

class _WeatherWidgetState extends State<WeatherWidget> {
  final _weatherService = WeatherService();
  WeatherData? _weather;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadWeather();
  }

  Future<void> _loadWeather() async {
    await _weatherService.initialize();
    final weather = await _weatherService.getWeather(widget.location);
    if (mounted) {
      setState(() {
        _weather = weather;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return _buildLoading();
    }

    if (_weather == null) {
      return const SizedBox.shrink();
    }

    return Directionality(
      textDirection: widget.isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: widget.compact ? _buildCompact() : _buildFull(),
    );
  }

  Widget _buildLoading() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    );
  }

  Widget _buildCompact() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: _weather!.isSafeForFieldWork 
            ? Colors.green.withOpacity(0.1) 
            : Colors.orange.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: _weather!.isSafeForFieldWork 
              ? Colors.green.withOpacity(0.3) 
              : Colors.orange.withOpacity(0.3),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            _getWeatherIcon(_weather!.condition),
            size: 18,
            color: _weather!.isSafeForFieldWork ? Colors.green : Colors.orange,
          ),
          const SizedBox(width: 6),
          Text(
            '${_weather!.temperature.round()}°C',
            style: GoogleFonts.poppins(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: _weather!.isSafeForFieldWork ? Colors.green : Colors.orange,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFull() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.primaryBlue,
            AppColors.primaryBlue.withOpacity(0.8),
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: AppColors.primaryBlue.withOpacity(0.3),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  _getWeatherIcon(_weather!.condition),
                  color: Colors.white,
                  size: 32,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${_weather!.temperature.round()}°C',
                      style: GoogleFonts.poppins(
                        fontSize: 32,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    Text(
                      _weatherService.getConditionName(
                        _weather!.condition,
                        isArabic: widget.isArabic,
                      ),
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        color: Colors.white.withOpacity(0.9),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _buildInfoChip(
                Icons.thermostat,
                widget.isArabic 
                    ? 'يشعر ${_weather!.feelsLike.round()}°' 
                    : 'Feels ${_weather!.feelsLike.round()}°',
              ),
              const SizedBox(width: 8),
              _buildInfoChip(
                Icons.water_drop,
                '${_weather!.humidity}%',
              ),
              const SizedBox(width: 8),
              _buildInfoChip(
                Icons.air,
                '${_weather!.windSpeed.round()} km/h',
              ),
            ],
          ),
          if (!_weather!.isSafeForFieldWork) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.orange.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.orange.withOpacity(0.5)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber, color: Colors.orange, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      widget.isArabic 
                          ? _weather!.safetyWarningAr 
                          : _weather!.safetyWarning,
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildInfoChip(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.15),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.white),
          const SizedBox(width: 4),
          Text(
            text,
            style: GoogleFonts.poppins(
              fontSize: 11,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  IconData _getWeatherIcon(WeatherCondition condition) {
    switch (condition) {
      case WeatherCondition.clear:
        return Icons.wb_sunny;
      case WeatherCondition.partlyCloudy:
        return Icons.cloud;
      case WeatherCondition.cloudy:
        return Icons.cloud_queue;
      case WeatherCondition.rain:
        return Icons.grain;
      case WeatherCondition.heavyRain:
        return Icons.water_drop;
      case WeatherCondition.thunderstorm:
        return Icons.flash_on;
      case WeatherCondition.snow:
        return Icons.ac_unit;
      case WeatherCondition.fog:
        return Icons.foggy;
      case WeatherCondition.dust:
        return Icons.air;
      case WeatherCondition.unknown:
        return Icons.help_outline;
    }
  }
}
