// Example implementation of biometric authentication following local_auth package guidelines
// This file demonstrates proper usage of the BiometricAuthService

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:local_auth/error_codes.dart' as auth_error;
import '../services/biometric_auth_service.dart';

class BiometricAuthExample extends StatefulWidget {
  const BiometricAuthExample({super.key});

  @override
  State<BiometricAuthExample> createState() => _BiometricAuthExampleState();
}

class _BiometricAuthExampleState extends State<BiometricAuthExample> {
  final BiometricAuthService _biometricService = BiometricAuthService();
  
  bool _isAvailable = false;
  bool _isEnabled = false;
  String _biometricType = 'Unknown';
  List<BiometricType> _availableBiometrics = [];

  @override
  void initState() {
    super.initState();
    _checkBiometricCapabilities();
  }

  /// Check device biometric capabilities
  Future<void> _checkBiometricCapabilities() async {
    final isAvailable = await _biometricService.isBiometricAvailable();
    final biometrics = await _biometricService.getAvailableBiometrics();
    final isEnabled = await _biometricService.isBiometricEnabled();
    final typeName = _biometricService.getBiometricTypeName(biometrics);

    setState(() {
      _isAvailable = isAvailable;
      _isEnabled = isEnabled;
      _biometricType = typeName;
      _availableBiometrics = biometrics;
    });
  }

  /// Demonstrate basic authentication
  Future<void> _authenticateBasic() async {
    try {
      final authenticated = await _biometricService.authenticate(
        reason: 'Please authenticate to continue',
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              authenticated ? 'Authentication successful!' : 'Authentication failed',
            ),
            backgroundColor: authenticated ? Colors.green : Colors.red,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Authentication error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// Demonstrate authentication with error handling
  Future<void> _authenticateWithErrorHandling() async {
    try {
      final authenticated = await _biometricService.authenticate(
        reason: 'Authenticate for secure access',
      );

      if (authenticated) {
        // Proceed with secure operation
        _showMessage('Authentication successful!', Colors.green);
      } else {
        _showMessage('Authentication was cancelled', Colors.orange);
      }
    } on PlatformException catch (e) {
      String errorMessage;
      
      if (e.code == auth_error.notAvailable) {
        errorMessage = 'Biometric authentication not available on this device';
      } else if (e.code == auth_error.notEnrolled) {
        errorMessage = 'No biometric credentials enrolled. Please set up in device settings.';
      } else if (e.code == auth_error.lockedOut) {
        errorMessage = 'Too many failed attempts. Please try again later.';
      } else if (e.code == auth_error.permanentlyLockedOut) {
        errorMessage = 'Biometric authentication is permanently locked. Please use device settings to unlock.';
      } else if (e.code == auth_error.passcodeNotSet) {
        errorMessage = 'Passcode not set. Please set up a passcode in device settings.';
      } else {
        errorMessage = 'Authentication error: ${e.message}';
      }
      
      _showMessage(errorMessage, Colors.red);
    }
  }

  /// Enable biometric authentication for user
  Future<void> _enableBiometric() async {
    try {
      // First verify biometric works
      final authenticated = await _biometricService.authenticate(
        reason: 'Verify your biometric to enable quick login',
      );

      if (!authenticated) {
        _showMessage('Biometric verification failed', Colors.red);
        return;
      }

      // Store user credentials (example)
      await _biometricService.storeCredentials(
        'user@example.com',
        'example_password',
      );

      // Enable biometric
      await _biometricService.enableBiometric('user@example.com');

      setState(() {
        _isEnabled = true;
      });

      _showMessage('Biometric authentication enabled!', Colors.green);
    } catch (e) {
      _showMessage('Failed to enable biometric: $e', Colors.red);
    }
  }

  /// Disable biometric authentication
  Future<void> _disableBiometric() async {
    try {
      await _biometricService.disableBiometric();
      await _biometricService.clearStoredCredentials();

      setState(() {
        _isEnabled = false;
      });

      _showMessage('Biometric authentication disabled', Colors.orange);
    } catch (e) {
      _showMessage('Failed to disable biometric: $e', Colors.red);
    }
  }

  /// Helper method to show messages
  void _showMessage(String message, Color color) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: color,
          duration: const Duration(seconds: 3),
        ),
      );
    }
  }

  /// Get icon for biometric type
  IconData _getBiometricIcon() {
    if (_biometricType.toLowerCase().contains('face')) {
      return Icons.face;
    } else if (_biometricType.toLowerCase().contains('fingerprint')) {
      return Icons.fingerprint;
    } else if (_biometricType.toLowerCase().contains('iris')) {
      return Icons.remove_red_eye;
    } else {
      return Icons.lock;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Biometric Authentication Example'),
        backgroundColor: Colors.deepPurple,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Device Capability Card
            Card(
              elevation: 4,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Icon(
                      _getBiometricIcon(),
                      size: 64,
                      color: _isAvailable ? Colors.green : Colors.grey,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Device Capabilities',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    _buildInfoRow('Available', _isAvailable ? 'Yes' : 'No'),
                    _buildInfoRow('Type', _biometricType),
                    _buildInfoRow('Enabled', _isEnabled ? 'Yes' : 'No'),
                    if (_availableBiometrics.isNotEmpty)
                      _buildInfoRow(
                        'Methods',
                        _availableBiometrics
                            .map((b) => b.toString().split('.').last)
                            .join(', '),
                      ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Authentication Methods
            Text(
              'Authentication Methods',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),

            // Basic Authentication
            ElevatedButton.icon(
              onPressed: _isAvailable ? _authenticateBasic : null,
              icon: const Icon(Icons.fingerprint),
              label: const Text('Basic Authentication'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.all(16),
                backgroundColor: Colors.deepPurple,
                foregroundColor: Colors.white,
              ),
            ),

            const SizedBox(height: 12),

            // Authentication with Error Handling
            ElevatedButton.icon(
              onPressed: _isAvailable ? _authenticateWithErrorHandling : null,
              icon: const Icon(Icons.security),
              label: const Text('Authentication with Error Handling'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.all(16),
                backgroundColor: Colors.blue,
                foregroundColor: Colors.white,
              ),
            ),

            const SizedBox(height: 24),

            // Settings
            Text(
              'Biometric Settings',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),

            // Enable/Disable Biometric
            ElevatedButton.icon(
              onPressed: _isAvailable
                  ? (_isEnabled ? _disableBiometric : _enableBiometric)
                  : null,
              icon: Icon(_isEnabled ? Icons.lock_open : Icons.lock),
              label: Text(_isEnabled ? 'Disable Biometric' : 'Enable Biometric'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.all(16),
                backgroundColor: _isEnabled ? Colors.orange : Colors.green,
                foregroundColor: Colors.white,
              ),
            ),

            const SizedBox(height: 12),

            // Refresh Capabilities
            OutlinedButton.icon(
              onPressed: _checkBiometricCapabilities,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh Capabilities'),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.all(16),
              ),
            ),

            const SizedBox(height: 24),

            // Important Notes
            Card(
              color: Colors.blue.shade50,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.info, color: Colors.blue.shade700),
                        const SizedBox(width: 8),
                        Text(
                          'Important Notes',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.blue.shade700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    const Text('• Biometric authentication requires enrollment in device settings'),
                    const SizedBox(height: 8),
                    const Text('• iOS requires NSFaceIDUsageDescription in Info.plist'),
                    const SizedBox(height: 8),
                    const Text('• Android requires USE_BIOMETRIC permission'),
                    const SizedBox(height: 8),
                    const Text('• Always provide device credential fallback'),
                    const SizedBox(height: 8),
                    const Text('• Handle all error codes appropriately'),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            '$label:',
            style: const TextStyle(fontWeight: FontWeight.w500),
          ),
          Text(
            value,
            style: const TextStyle(color: Colors.grey),
          ),
        ],
      ),
    );
  }
}
