import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import 'dart:convert';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';

class TransactionScannerScreen extends StatefulWidget {
  const TransactionScannerScreen({super.key});
  @override
  State<TransactionScannerScreen> createState() => _TransactionScannerScreenState();
}

class _TransactionScannerScreenState extends State<TransactionScannerScreen> {
  final _supabase = Supabase.instance.client;
  final _picker = ImagePicker();
  File? _selectedImage;
  bool _isProcessing = false;
  Map<String, dynamic>? _extractedData;
  String? _errorMessage;
  String? _dataSource;

  Future<void> _pickImage(ImageSource source) async {
    try {
      final XFile? image = await _picker.pickImage(source: source, imageQuality: 85);
      if (image == null) return;
      if (!mounted) return;
      setState(() {
        _selectedImage = File(image.path);
        _extractedData = null;
        _errorMessage = null;
        _dataSource = null;
      });
      await _processImage();
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = 'Failed to pick image: $e');
    }
  }

  Future<void> _processImage() async {
    if (_selectedImage == null) return;
    if (!mounted) return;
    setState(() { _isProcessing = true; _errorMessage = null; });
    try {
      final bytes = await _selectedImage!.readAsBytes();
      final base64Image = base64Encode(bytes);

      final response = await _supabase.functions.invoke(
        'scan-transaction',
        body: {
          'image_base64': base64Image,
          'mime_type': 'image/jpeg',
        },
      );

      if (!mounted) return;

      if (response.status != 200 || response.data == null) {
        throw Exception('Scan service returned status ${response.status}');
      }

      final result = response.data as Map<String, dynamic>;
      if (result['error'] != null) {
        throw Exception(result['error'].toString());
      }

      final data = result['data'] as Map<String, dynamic>? ?? {};
      setState(() {
        _extractedData = data;
        _dataSource = result['source']?.toString();
        _isProcessing = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() { _isProcessing = false; _errorMessage = 'Processing failed: $e'; });
    }
  }

  void _reset() {
    setState(() {
      _selectedImage = null;
      _extractedData = null;
      _errorMessage = null;
      _dataSource = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Transaction Scanner', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          if (_selectedImage != null || _extractedData != null)
            IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _reset),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(children: [
                const Icon(Icons.document_scanner, size: 48, color: AppColors.primaryDark),
                const SizedBox(height: 8),
                const Text('AI-Powered Receipt Scanner', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 4),
                const Text(
                  'Take a photo or upload a bank transfer receipt to extract transaction details automatically.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey, fontSize: 13),
                ),
                const SizedBox(height: 16),
                Row(children: [
                  Expanded(child: ElevatedButton.icon(
                    onPressed: _isProcessing ? null : () => _pickImage(ImageSource.camera),
                    icon: const Icon(Icons.camera_alt),
                    label: const Text('Camera'),
                    style: ElevatedButton.styleFrom(backgroundColor: AppColors.primaryDark, foregroundColor: Colors.white),
                  )),
                  const SizedBox(width: 10),
                  Expanded(child: OutlinedButton.icon(
                    onPressed: _isProcessing ? null : () => _pickImage(ImageSource.gallery),
                    icon: const Icon(Icons.photo_library),
                    label: const Text('Gallery'),
                  )),
                ]),
              ]),
            ),
          ),
          const SizedBox(height: 14),
          if (_selectedImage != null) ...[
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.file(_selectedImage!, height: 200, fit: BoxFit.cover),
              ),
            ),
            const SizedBox(height: 14),
          ],
          if (_isProcessing) ...[
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 12),
                  const Text('Analysing receipt with AI…', style: TextStyle(color: Colors.grey)),
                  const SizedBox(height: 10),
                  ShimmerBox(height: 12, width: 200),
                  const SizedBox(height: 6),
                  ShimmerBox(height: 12, width: 160),
                ]),
              ),
            ),
          ],
          if (_errorMessage != null) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: Row(children: [
                const Icon(Icons.error_outline, color: Colors.red),
                const SizedBox(width: 10),
                Expanded(child: Text(_errorMessage!, style: TextStyle(color: Colors.red.shade800))),
              ]),
            ),
            const SizedBox(height: 10),
          ],
          if (_extractedData != null) ...[
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    const Icon(Icons.check_circle, color: Colors.green, size: 20),
                    const SizedBox(width: 8),
                    const Text('Extracted Data', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    const Spacer(),
                    if (_dataSource != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: Colors.green.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                        child: Text(_dataSource == 'gemini' ? 'Gemini AI' : 'AI', style: const TextStyle(fontSize: 11, color: Colors.green, fontWeight: FontWeight.w600)),
                      ),
                  ]),
                  const Divider(height: 20),
                  ..._extractedData!.entries
                      .where((e) => e.value != null && e.value.toString().isNotEmpty && e.value.toString() != 'null')
                      .map((e) {
                    final label = e.key.replaceAll('_', ' ').split(' ').map((w) => w.isNotEmpty ? '${w[0].toUpperCase()}${w.substring(1)}' : '').join(' ');
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        SizedBox(width: 140, child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.grey, fontSize: 13))),
                        Expanded(child: Text(e.value.toString(), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
                      ]),
                    );
                  }).toList(),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Data copied — paste into your transaction record'))),
                      icon: const Icon(Icons.copy),
                      label: const Text('Copy Data'),
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.primaryDark, foregroundColor: Colors.white),
                    ),
                  ),
                ]),
              ),
            ),
          ],
        ]),
      ),
    );
  }
}
