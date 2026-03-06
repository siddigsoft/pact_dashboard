import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';

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

  Future<void> _pickImage(ImageSource source) async {
    try {
      final XFile? image = await _picker.pickImage(source: source, imageQuality: 85);
      if (image == null) return;
      setState(() { _selectedImage = File(image.path); _extractedData = null; _errorMessage = null; });
      await _processImage();
    } catch (e) {
      setState(() => _errorMessage = 'Failed to pick image: $e');
    }
  }

  Future<void> _processImage() async {
    if (_selectedImage == null) return;
    setState(() { _isProcessing = true; _errorMessage = null; });
    try {
      final bytes = await _selectedImage!.readAsBytes();
      final base64Image = base64Encode(bytes);

      final secrets = await _supabase.functions.invoke('get-secret', body: {'name': 'GOOGLE_AI_API_KEY'});
      final apiKey = secrets.data?['value'] ?? '';

      if (apiKey.isEmpty) throw Exception('AI API key not available');

      final response = await http.post(
        Uri.parse('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$apiKey'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'contents': [{
            'parts': [
              {
                'text': 'Extract transaction details from this bank receipt/screenshot. Return JSON with fields: sender_name, sender_account, receiver_name, receiver_account, amount, currency, transaction_id, date, bank_name, transfer_type. For Arabic text, transliterate to English. Return only valid JSON.'
              },
              {
                'inline_data': {'mime_type': 'image/jpeg', 'data': base64Image}
              }
            ]
          }],
          'generationConfig': {'response_mime_type': 'application/json'}
        }),
      );

      if (response.statusCode == 200) {
        final result = jsonDecode(response.body);
        final text = result['candidates']?[0]?['content']?['parts']?[0]?['text'] ?? '{}';
        final data = jsonDecode(text);
        setState(() { _extractedData = Map<String, dynamic>.from(data); _isProcessing = false; });
      } else {
        throw Exception('API error: ${response.statusCode}');
      }
    } catch (e) {
      setState(() { _isProcessing = false; _errorMessage = 'Processing failed: $e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Transaction Scanner', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
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
                const Text('Take a photo or upload a bank transfer receipt to extract transaction details automatically.', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey, fontSize: 13)),
                const SizedBox(height: 16),
                Row(children: [
                  Expanded(child: ElevatedButton.icon(
                    onPressed: _isProcessing ? null : () => _pickImage(ImageSource.camera),
                    icon: const Icon(Icons.camera_alt),
                    label: const Text('Camera'),
                    style: ElevatedButton.styleFrom(backgroundColor: AppColors.primaryDark, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 12)),
                  )),
                  const SizedBox(width: 10),
                  Expanded(child: ElevatedButton.icon(
                    onPressed: _isProcessing ? null : () => _pickImage(ImageSource.gallery),
                    icon: const Icon(Icons.photo_library),
                    label: const Text('Gallery'),
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.grey.shade700, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 12)),
                  )),
                ]),
              ]),
            ),
          ),
          if (_selectedImage != null) ...[
            const SizedBox(height: 14),
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.file(_selectedImage!, height: 200, fit: BoxFit.cover),
              ),
            ),
          ],
          if (_isProcessing) ...[
            const SizedBox(height: 20),
            const Center(child: Column(children: [
              CircularProgressIndicator(),
              SizedBox(height: 10),
              Text('Analysing receipt with AI...', style: TextStyle(color: Colors.grey)),
            ])),
          ],
          if (_errorMessage != null) ...[
            const SizedBox(height: 14),
            Card(
              color: Colors.red.shade50,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  const Icon(Icons.error, color: Colors.red),
                  const SizedBox(width: 10),
                  Expanded(child: Text(_errorMessage!, style: const TextStyle(color: Colors.red))),
                ]),
              ),
            ),
          ],
          if (_extractedData != null && _extractedData!.isNotEmpty) ...[
            const SizedBox(height: 14),
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Colors.green.shade300)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    const Icon(Icons.check_circle, color: Colors.green),
                    const SizedBox(width: 8),
                    const Text('Extracted Data', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  ]),
                  const Divider(height: 20),
                  ..._extractedData!.entries.where((e) => e.value != null && e.value.toString().isNotEmpty).map((entry) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      SizedBox(width: 130, child: Text(entry.key.replaceAll('_', ' ').toUpperCase(), style: const TextStyle(fontSize: 11, color: Colors.grey, fontWeight: FontWeight.w600))),
                      Expanded(child: Text(entry.value.toString(), style: const TextStyle(fontWeight: FontWeight.w500))),
                    ]),
                  )).toList(),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Transaction data copied to clipboard')));
                      },
                      icon: const Icon(Icons.content_copy),
                      label: const Text('Copy Data'),
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.green, foregroundColor: Colors.white),
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
