import 'dart:async';

import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;
import 'package:flutter/services.dart';

class AndroidVolumeButtonService {
  static const EventChannel _eventChannel = EventChannel(
    'pact_mobile/sos_volume_button_events',
  );

  Stream<Map<String, dynamic>> get events {
    if (!_isSupportedPlatform) {
      return const Stream<Map<String, dynamic>>.empty();
    }

    return _eventChannel.receiveBroadcastStream().map((event) {
      if (event is Map) {
        return Map<String, dynamic>.from(event);
      }
      return <String, dynamic>{'event': event?.toString() ?? 'unknown'};
    });
  }

  bool get _isSupportedPlatform {
    if (kIsWeb) return false;
    return defaultTargetPlatform == TargetPlatform.android;
  }
}
