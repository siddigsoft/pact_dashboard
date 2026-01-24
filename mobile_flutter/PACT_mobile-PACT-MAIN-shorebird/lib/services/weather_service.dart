// lib/services/weather_service.dart

import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:hive_flutter/hive_flutter.dart';
import 'package:latlong2/latlong.dart';

enum WeatherCondition {
  clear,
  partlyCloudy,
  cloudy,
  rain,
  heavyRain,
  thunderstorm,
  snow,
  fog,
  dust,
  unknown,
}

class WeatherData {
  final double temperature;
  final double feelsLike;
  final int humidity;
  final double windSpeed;
  final WeatherCondition condition;
  final String description;
  final String descriptionAr;
  final String iconCode;
  final DateTime timestamp;
  final DateTime? sunrise;
  final DateTime? sunset;
  final bool hasAlert;
  final String? alertMessage;
  final String? alertMessageAr;

  WeatherData({
    required this.temperature,
    required this.feelsLike,
    required this.humidity,
    required this.windSpeed,
    required this.condition,
    required this.description,
    this.descriptionAr = '',
    this.iconCode = '',
    required this.timestamp,
    this.sunrise,
    this.sunset,
    this.hasAlert = false,
    this.alertMessage,
    this.alertMessageAr,
  });

  bool get isSafeForFieldWork {
    if (condition == WeatherCondition.heavyRain ||
        condition == WeatherCondition.thunderstorm ||
        condition == WeatherCondition.dust) {
      return false;
    }
    if (temperature > 45 || temperature < 5) {
      return false;
    }
    if (windSpeed > 50) {
      return false;
    }
    return true;
  }

  String get safetyWarning {
    if (condition == WeatherCondition.thunderstorm) {
      return 'Thunderstorm warning - avoid outdoor activities';
    }
    if (condition == WeatherCondition.heavyRain) {
      return 'Heavy rain expected - plan indoor activities';
    }
    if (condition == WeatherCondition.dust) {
      return 'Dust storm warning - visibility reduced';
    }
    if (temperature > 45) {
      return 'Extreme heat warning - limit outdoor exposure';
    }
    if (temperature < 5) {
      return 'Cold weather alert - dress warmly';
    }
    if (windSpeed > 50) {
      return 'High winds expected - secure equipment';
    }
    return '';
  }

  String get safetyWarningAr {
    if (condition == WeatherCondition.thunderstorm) {
      return 'تحذير من عاصفة رعدية - تجنب الأنشطة الخارجية';
    }
    if (condition == WeatherCondition.heavyRain) {
      return 'متوقع هطول أمطار غزيرة - خطط لأنشطة داخلية';
    }
    if (condition == WeatherCondition.dust) {
      return 'تحذير من عاصفة ترابية - الرؤية منخفضة';
    }
    if (temperature > 45) {
      return 'تحذير من حرارة شديدة - قلل التعرض للخارج';
    }
    if (temperature < 5) {
      return 'تنبيه طقس بارد - ارتدِ ملابس دافئة';
    }
    if (windSpeed > 50) {
      return 'رياح قوية متوقعة - تأمين المعدات';
    }
    return '';
  }

  factory WeatherData.fromJson(Map<String, dynamic> json) {
    final main = json['main'] ?? {};
    final weather = (json['weather'] as List?)?.first ?? {};
    final wind = json['wind'] ?? {};
    final sys = json['sys'] ?? {};
    final alerts = json['alerts'] as List?;

    WeatherCondition condition;
    final weatherId = weather['id'] ?? 0;
    if (weatherId >= 200 && weatherId < 300) {
      condition = WeatherCondition.thunderstorm;
    } else if (weatherId >= 300 && weatherId < 500) {
      condition = WeatherCondition.rain;
    } else if (weatherId >= 500 && weatherId < 600) {
      condition = weatherId >= 502 ? WeatherCondition.heavyRain : WeatherCondition.rain;
    } else if (weatherId >= 600 && weatherId < 700) {
      condition = WeatherCondition.snow;
    } else if (weatherId >= 700 && weatherId < 800) {
      condition = weatherId == 761 || weatherId == 731 
          ? WeatherCondition.dust 
          : WeatherCondition.fog;
    } else if (weatherId == 800) {
      condition = WeatherCondition.clear;
    } else if (weatherId > 800) {
      condition = WeatherCondition.partlyCloudy;
    } else {
      condition = WeatherCondition.unknown;
    }

    return WeatherData(
      temperature: (main['temp'] ?? 0).toDouble(),
      feelsLike: (main['feels_like'] ?? 0).toDouble(),
      humidity: main['humidity'] ?? 0,
      windSpeed: ((wind['speed'] ?? 0) * 3.6).toDouble(),
      condition: condition,
      description: weather['description'] ?? '',
      iconCode: weather['icon'] ?? '',
      timestamp: DateTime.now(),
      sunrise: sys['sunrise'] != null 
          ? DateTime.fromMillisecondsSinceEpoch(sys['sunrise'] * 1000) 
          : null,
      sunset: sys['sunset'] != null 
          ? DateTime.fromMillisecondsSinceEpoch(sys['sunset'] * 1000) 
          : null,
      hasAlert: alerts?.isNotEmpty ?? false,
      alertMessage: alerts?.first?['description'],
    );
  }

  Map<String, dynamic> toJson() => {
    'temperature': temperature,
    'feels_like': feelsLike,
    'humidity': humidity,
    'wind_speed': windSpeed,
    'condition': condition.index,
    'description': description,
    'description_ar': descriptionAr,
    'icon_code': iconCode,
    'timestamp': timestamp.toIso8601String(),
    'sunrise': sunrise?.toIso8601String(),
    'sunset': sunset?.toIso8601String(),
    'has_alert': hasAlert,
    'alert_message': alertMessage,
    'alert_message_ar': alertMessageAr,
  };

  factory WeatherData.fromCache(Map<String, dynamic> json) {
    return WeatherData(
      temperature: (json['temperature'] ?? 0).toDouble(),
      feelsLike: (json['feels_like'] ?? 0).toDouble(),
      humidity: json['humidity'] ?? 0,
      windSpeed: (json['wind_speed'] ?? 0).toDouble(),
      condition: WeatherCondition.values[json['condition'] ?? 0],
      description: json['description'] ?? '',
      descriptionAr: json['description_ar'] ?? '',
      iconCode: json['icon_code'] ?? '',
      timestamp: DateTime.tryParse(json['timestamp'] ?? '') ?? DateTime.now(),
      sunrise: json['sunrise'] != null ? DateTime.tryParse(json['sunrise']) : null,
      sunset: json['sunset'] != null ? DateTime.tryParse(json['sunset']) : null,
      hasAlert: json['has_alert'] ?? false,
      alertMessage: json['alert_message'],
      alertMessageAr: json['alert_message_ar'],
    );
  }
}

class WeatherService {
  static final WeatherService _instance = WeatherService._internal();
  factory WeatherService() => _instance;
  WeatherService._internal();

  static const String _cacheBoxName = 'weather_cache';
  static const Duration _cacheExpiry = Duration(minutes: 30);

  String? _apiKey;
  WeatherData? _cachedWeather;
  DateTime? _lastFetch;

  Future<void> initialize({String? apiKey}) async {
    _apiKey = apiKey;
    
    try {
      if (!Hive.isBoxOpen(_cacheBoxName)) {
        await Hive.openBox(_cacheBoxName);
      }
      await _loadCachedWeather();
    } catch (e) {
      debugPrint('[WeatherService] Error initializing: $e');
    }
  }

  Future<void> _loadCachedWeather() async {
    try {
      final box = Hive.box(_cacheBoxName);
      final cached = box.get('current_weather');
      final lastFetchStr = box.get('last_fetch') as String?;
      
      if (cached != null) {
        _cachedWeather = WeatherData.fromCache(Map<String, dynamic>.from(cached));
        _lastFetch = lastFetchStr != null ? DateTime.tryParse(lastFetchStr) : null;
      }
    } catch (e) {
      debugPrint('[WeatherService] Error loading cached weather: $e');
    }
  }

  Future<void> _cacheWeather(WeatherData weather) async {
    try {
      final box = Hive.box(_cacheBoxName);
      await box.put('current_weather', weather.toJson());
      await box.put('last_fetch', DateTime.now().toIso8601String());
      _cachedWeather = weather;
      _lastFetch = DateTime.now();
    } catch (e) {
      debugPrint('[WeatherService] Error caching weather: $e');
    }
  }

  bool get _isCacheValid {
    if (_cachedWeather == null || _lastFetch == null) return false;
    return DateTime.now().difference(_lastFetch!) < _cacheExpiry;
  }

  Future<WeatherData?> getWeather(LatLng location, {bool forceRefresh = false}) async {
    if (!forceRefresh && _isCacheValid) {
      return _cachedWeather;
    }

    if (_apiKey == null || _apiKey!.isEmpty) {
      debugPrint('[WeatherService] No API key configured - returning mock data');
      return _getMockWeather(location);
    }

    try {
      final url = 'https://api.openweathermap.org/data/2.5/weather'
          '?lat=${location.latitude}'
          '&lon=${location.longitude}'
          '&appid=$_apiKey'
          '&units=metric';

      final response = await http.get(Uri.parse(url));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final weather = WeatherData.fromJson(data);
        await _cacheWeather(weather);
        return weather;
      } else {
        debugPrint('[WeatherService] API error: ${response.statusCode}');
        return _cachedWeather ?? _getMockWeather(location);
      }
    } catch (e) {
      debugPrint('[WeatherService] Error fetching weather: $e');
      return _cachedWeather ?? _getMockWeather(location);
    }
  }

  WeatherData _getMockWeather(LatLng location) {
    return WeatherData(
      temperature: 35.0,
      feelsLike: 38.0,
      humidity: 45,
      windSpeed: 15.0,
      condition: WeatherCondition.clear,
      description: 'Clear sky',
      descriptionAr: 'سماء صافية',
      timestamp: DateTime.now(),
      hasAlert: false,
    );
  }

  String getConditionIcon(WeatherCondition condition) {
    switch (condition) {
      case WeatherCondition.clear:
        return 'wb_sunny';
      case WeatherCondition.partlyCloudy:
        return 'partly_cloudy_day';
      case WeatherCondition.cloudy:
        return 'cloud';
      case WeatherCondition.rain:
        return 'grain';
      case WeatherCondition.heavyRain:
        return 'water_drop';
      case WeatherCondition.thunderstorm:
        return 'thunderstorm';
      case WeatherCondition.snow:
        return 'ac_unit';
      case WeatherCondition.fog:
        return 'foggy';
      case WeatherCondition.dust:
        return 'air';
      case WeatherCondition.unknown:
        return 'help_outline';
    }
  }

  String getConditionName(WeatherCondition condition, {bool isArabic = false}) {
    if (isArabic) {
      switch (condition) {
        case WeatherCondition.clear: return 'صافي';
        case WeatherCondition.partlyCloudy: return 'غائم جزئياً';
        case WeatherCondition.cloudy: return 'غائم';
        case WeatherCondition.rain: return 'ممطر';
        case WeatherCondition.heavyRain: return 'أمطار غزيرة';
        case WeatherCondition.thunderstorm: return 'عاصفة رعدية';
        case WeatherCondition.snow: return 'ثلج';
        case WeatherCondition.fog: return 'ضباب';
        case WeatherCondition.dust: return 'عاصفة ترابية';
        case WeatherCondition.unknown: return 'غير معروف';
      }
    }
    switch (condition) {
      case WeatherCondition.clear: return 'Clear';
      case WeatherCondition.partlyCloudy: return 'Partly Cloudy';
      case WeatherCondition.cloudy: return 'Cloudy';
      case WeatherCondition.rain: return 'Rain';
      case WeatherCondition.heavyRain: return 'Heavy Rain';
      case WeatherCondition.thunderstorm: return 'Thunderstorm';
      case WeatherCondition.snow: return 'Snow';
      case WeatherCondition.fog: return 'Fog';
      case WeatherCondition.dust: return 'Dust Storm';
      case WeatherCondition.unknown: return 'Unknown';
    }
  }
}
