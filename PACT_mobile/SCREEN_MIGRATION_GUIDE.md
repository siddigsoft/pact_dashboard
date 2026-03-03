# Screen Migration Guide: Responsive UI & Biometrics Integration

## Overview
This guide shows how to update existing screens to use responsive widgets and integrate biometrics functionality.

---

## Part 1: Responsive Screen Migration

### Before: Non-Responsive Screen
```dart
class OldScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Title')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(
          children: [
            Text('Hello', style: TextStyle(fontSize: 18)),
            SizedBox(height: 8),
            ElevatedButton(onPressed: () {}, child: Text('Button')),
          ],
        ),
      ),
    );
  }
}
```

### After: Responsive Screen
```dart
import 'package:pact_mobile/widgets/responsive_base_screen.dart';
import 'package:pact_mobile/utils/responsive_text_helper.dart';
import 'package:pact_mobile/widgets/responsive_buttons.dart';

class NewScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ResponsiveBaseScreen(
      title: 'Title',
      body: Column(
        children: [
          Text(
            'Hello',
            style: ResponsiveTextHelper.getResponsiveStyle(
              context,
              baseFontSize: 18,
              fontWeight: FontWeight.bold,
              maxFontSize: 24,
            ),
          ),
          const AdaptiveBlank(height: 8),
          ResponsiveButton(
            label: 'Button',
            onPressed: () {},
          ),
        ],
      ),
    );
  }
}
```

---

## Part 2: Fixing Biometrics in Call Screen

### Issue: Biometrics Not Functional

The biometric service may not be working because it's not initialized. Here's the fix:

#### Step 1: Update main.dart
```dart
import 'package:pact_mobile/services/biometric_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize biometric service early
  final bioService = BiometricService();
  await bioService.initialize();  // ← Add this line

  runApp(const MyApp());
}
```

#### Step 2: Add Biometric Toggle to Settings Screen

Update `lib/screens/settings_screen.dart`:

```dart
import 'package:pact_mobile/services/biometric_service.dart';

class SettingsScreen extends StatefulWidget {
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final BiometricService _biometricService = BiometricService();
  bool _biometricEnabled = false;

  @override
  void initState() {
    super.initState();
    _loadBiometricPreference();
  }

  Future<void> _loadBiometricPreference() async {
    final enabled = await _biometricService.isBiometricEnabled();
    setState(() {
      _biometricEnabled = enabled;
    });
  }

  Future<void> _toggleBiometric(bool newValue) async {
    if (newValue) {
      // Test authentication before enabling
      final authenticated = await _biometricService.authenticate();
      if (authenticated) {
        await _biometricService.enableBiometric();
        setState(() => _biometricEnabled = true);
      }
    } else {
      await _biometricService.disableBiometric();
      setState(() => _biometricEnabled = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ResponsiveBaseScreen(
      title: 'Settings',
      body: Column(
        children: [
          // ... other settings ...
          
          if (_biometricService.isBiometricsAvailable)
            ListTile(
              title: Text(_biometricService.biometricTypeName),
              subtitle: const Text('Enable biometric authentication'),
              trailing: Switch(
                value: _biometricEnabled,
                onChanged: _toggleBiometric,
              ),
            ),
        ],
      ),
    );
  }
}
```

---

## Part 3: Call Quality Metrics (Biometrics Fix)

### Issue: Call Quality Not Showing Biometric Data

The call quality indicator should show latency, jitter, and packet loss. Here's how to fix it:

#### Update call_quality_indicator.dart:

```dart
import 'package:flutter/material.dart';
import '../models/call_state.dart';
import '../utils/responsive_text_helper.dart';

class CallQualityIndicator extends StatelessWidget {
  final CallState callState;
  final bool showDetails;
  final double? latency;  // Add latency parameter
  final double? jitter;
  final double? packetLoss;

  const CallQualityIndicator({
    super.key,
    required this.callState,
    this.showDetails = false,
    this.latency,
    this.jitter,
    this.packetLoss,
  });

  Color _getQualityColor(double? latency) {
    if (latency == null) return Colors.grey;
    if (latency < 50) return Colors.green;        // Excellent
    if (latency < 100) return Colors.lightGreen;  // Good
    if (latency < 150) return Colors.yellow;      // Fair
    if (latency < 300) return Colors.orange;      // Poor
    return Colors.red;                             // Very Poor
  }

  int _getQualityBars(double? latency) {
    if (latency == null) return 0;
    if (latency < 50) return 5;
    if (latency < 100) return 4;
    if (latency < 150) return 3;
    if (latency < 300) return 2;
    return 1;
  }

  String _getQualityLabel(double? latency) {
    if (latency == null) return 'Unknown';
    if (latency < 50) return 'Excellent';
    if (latency < 100) return 'Good';
    if (latency < 150) return 'Fair';
    if (latency < 300) return 'Poor';
    return 'Very Poor';
  }

  @override
  Widget build(BuildContext context) {
    final color = _getQualityColor(latency);
    final bars = _getQualityBars(latency);
    final label = _getQualityLabel(latency);

    if (!showDetails) {
      // Simple view: just show quality bars
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ...List.generate(5, (index) {
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Container(
                width: 3,
                height: 12,
                decoration: BoxDecoration(
                  color: index < bars ? color : Colors.grey[300],
                  borderRadius: BorderRadius.circular(1),
                ),
              ),
            );
          }),
        ],
      );
    }

    // Detailed view: show all metrics
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Call Quality: $label',
            style: ResponsiveTextHelper.getResponsiveStyle(
              context,
              baseFontSize: 14,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          const SizedBox(height: 8),
          if (latency != null)
            Text(
              'Latency: ${latency?.toStringAsFixed(0)}ms',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          if (jitter != null)
            Text(
              'Jitter: ${jitter?.toStringAsFixed(0)}ms',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          if (packetLoss != null)
            Text(
              'Packet Loss: ${packetLoss?.toStringAsFixed(1)}%',
              style: Theme.of(context).textTheme.bodySmall,
            ),
        ],
      ),
    );
  }
}
```

#### Usage in Enhanced Call Screen:

```dart
// In enhanced_call_screen.dart _buildCallDetailsOverlay():

CallQualityIndicator(
  callState: _callState,
  showDetails: _showCallDetails,
  latency: _qualityMonitor?.lastLatency,
  jitter: _qualityMonitor?.lastJitter,
  packetLoss: _qualityMonitor?.lastPacketLoss,
),
```

---

## Part 4: Responsive Safe Area Updates

### Update Enhanced Call Screen:

```dart
// In enhanced_call_screen.dart

// Replace old button building with:
Positioned(
  bottom: 20,
  left: 0,
  right: 0,
  child: SafeArea(
    child: ResponsiveBottomButtonBar(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        ResponsiveIconButton(
          icon: Icons.mic,
          onPressed: _toggleAudio,
          iconColor: _callState.isAudioEnabled ? Colors.blue : Colors.red,
        ),
        ResponsiveIconButton(
          icon: Icons.videocam,
          onPressed: _toggleVideo,
          iconColor: _callState.isVideoEnabled ? Colors.blue : Colors.red,
        ),
        ResponsiveIconButton(
          icon: Icons.call_end,
          onPressed: () => _webrtcService.endCall(),
          iconColor: Colors.red,
          backgroundColor: Colors.red.withOpacity(0.2),
        ),
        ResponsiveIconButton(
          icon: _isScreenSharing ? Icons.screen_share : Icons.screen_share_outlined,
          onPressed: _toggleScreenSharing,
          iconColor: _isScreenSharing ? Colors.blue : Colors.grey,
        ),
      ],
    ),
  ),
),
```

---

## Part 5: Migration Checklist for Key Screens

### Communications Screen
- [ ] Replace `ElevatedButton` with `ResponsiveButton`
- [ ] Use `ResponsiveBaseScreen` wrapper
- [ ] Update text styles with `ResponsiveTextHelper`
- [ ] Wrap buttons with `SafeArea`

### Call History Screen  
- [ ] Update list item layouts to be responsive
- [ ] Use `ResponsiveCard` for history items
- [ ] Make filter chips responsive
- [ ] Add safe area to any bottom buttons

### Settings Screen
- [ ] Add biometric toggle
- [ ] Use `ResponsiveButton` for save/cancel
- [ ] Make form fields responsive
- [ ] Safe area for bottom actions

### Enhanced Call Screen
- [ ] Update control buttons to `ResponsiveBottomButtonBar`
- [ ] Use `CallQualityIndicator` with metrics
- [ ] Safe area for all buttons
- [ ] Responsive text for call duration

---

## Part 6: Testing Responsive Design

### Test Checklist:
```bash
# Test on various screen sizes
- [ ] 4.5" device (e.g., iPhone SE)
- [ ] 5.5" device (e.g., iPhone 11)
- [ ] 6.1" device (e.g., iPhone 12)
- [ ] 6.7" device (e.g., iPhone 13 Pro Max)
- [ ] 7"+ tablet
- [ ] Landscape orientation
- [ ] With notch (iPhone X+)
- [ ] With system gesture nav (Android 10+)

# Test font size settings
- [ ] Small text (0.8x)
- [ ] Normal text (1.0x)
- [ ] Large text (1.2x)
- [ ] Extra large (1.5x)

# Test buttons visibility
- [ ] All buttons visible in portrait
- [ ] All buttons visible in landscape
- [ ] Bottom buttons don't overlap safe area
- [ ] FAB properly positioned
```

### Test Command:
```bash
# Test on small device
flutter run --debug

# Test on large device  
adb shell am start -n com.example.pact_mobile/.MainActivity

# Test with large text
setprop ro.font.scale 1.5 && adb shell reboot
```

---

## Part 7: Common Issues & Solutions

### Issue: Biometric not detected
**Solution**: Check device has biometric sensor
```dart
if (BiometricService().isBiometricsAvailable) {
  // Show biometric toggle
} else {
  // Show disabled toggle with explanation
}
```

### Issue: Buttons under cutouts
**Solution**: Always wrap buttons in SafeArea
```dart
SafeArea(
  child: ResponsiveButton(...),
  bottom: true,
)
```

### Issue: Text too large/small
**Solution**: Use ResponsiveTextHelper with clamps
```dart
ResponsiveTextHelper.getResponsiveStyle(
  context,
  baseFontSize: 16,
  minFontSize: 12,  // Don't go too small
  maxFontSize: 20,  // Don't go too large
)
```

### Issue: Call quality shows 0
**Solution**: Ensure quality monitor is initialized
```dart
_qualityMonitor = CallQualityMonitor(_webrtcService);
await _qualityMonitor!.startMonitoring();
```

---

## Migration Priority

1. **High Priority** (Do First):
   - Enhanced Call Screen - users see this most
   - Settings Screen - add biometric toggle
   - Communications Screen - main hub

2. **Medium Priority** (Do Next):
   - Call History Screen
   - Call Analytics Screen
   - Missed Calls Screen

3. **Low Priority** (Nice to Have):
   - Other utility screens
   - Admin screens
   - Report screens

---

## Performance Notes

- Responsive calculations are zero-cost (using MediaQuery cache)
- Building is optimized with const constructors
- Safe areas computed only once per widget build
- Text scaling capped to prevent extreme values

