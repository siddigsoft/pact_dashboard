import 'package:flutter/services.dart';

class AudioHelper {
  static const platform = MethodChannel('com.pact.mobile/audio');

  static Future<bool> getSpeakerphoneOn() async {
    try {
      final bool result = await platform.invokeMethod('getSpeakerphoneOn');
      return result;
    } catch (e) {
      print('Error getting speakerphone state: $e');
      return false;
    }
  }

  static Future<void> setSpeakerphoneOn(bool enabled) async {
    try {
      await platform.invokeMethod('setSpeakerphoneOn', {'enabled': enabled});
    } catch (e) {
      print('Error setting speakerphone: $e');
    }
  }
}
