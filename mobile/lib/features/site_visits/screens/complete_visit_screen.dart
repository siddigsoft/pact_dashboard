import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:io';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class CompleteVisitScreen extends ConsumerStatefulWidget {
  final String visitId;
  const CompleteVisitScreen({super.key, required this.visitId});

  @override
  ConsumerState<CompleteVisitScreen> createState() => _CompleteVisitScreenState();
}

class _CompleteVisitScreenState extends ConsumerState<CompleteVisitScreen> {
  final _notesCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  final _picker = ImagePicker();

  List<File> _photos = [];
  Map<String, dynamic>? _gps;
  bool _submitting = false;
  bool _gettingGps = false;
  String? _visitName;

  @override
  void initState() {
    super.initState();
    _loadVisitName();
    _getGps();
  }

  Future<void> _loadVisitName() async {
    try {
      final data = await Supabase.instance.client
          .from('site_visits').select('site_name').eq('id', widget.visitId).maybeSingle();
      if (mounted) setState(() => _visitName = data?['site_name'] as String?);
    } catch (_) {}
  }

  Future<void> _getGps() async {
    setState(() => _gettingGps = true);
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.deniedForever) { setState(() => _gettingGps = false); return; }
      final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high, timeLimit: const Duration(seconds: 15));
      setState(() { _gps = { 'latitude': pos.latitude, 'longitude': pos.longitude, 'accuracy': pos.accuracy }; _gettingGps = false; });
    } catch (_) { setState(() => _gettingGps = false); }
  }

  Future<void> _addPhoto() async {
    final picked = await _picker.pickMultiImage(imageQuality: 70);
    if (picked.isNotEmpty) setState(() => _photos.addAll(picked.map((x) => File(x.path))));
  }

  Future<void> _takePhoto() async {
    final picked = await _picker.pickImage(source: ImageSource.camera, imageQuality: 70);
    if (picked != null) setState(() => _photos.add(File(picked.path)));
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      final client = Supabase.instance.client;
      final user = ref.read(currentUserProvider);

      // Upload photos
      final photoUrls = <String>[];
      for (final photo in _photos) {
        try {
          final bytes = await photo.readAsBytes();
          final name = 'visits/${widget.visitId}/${DateTime.now().millisecondsSinceEpoch}.jpg';
          await client.storage.from('site-visit-photos').uploadBinary(name, bytes,
            fileOptions: const FileOptions(contentType: 'image/jpeg'));
          final url = client.storage.from('site-visit-photos').getPublicUrl(name);
          photoUrls.add(url);
        } catch (_) {}
      }

      await client.from('site_visits').update({
        'status': 'completed',
        'completed_at': DateTime.now().toIso8601String(),
        'completion_notes': _notesCtrl.text.trim(),
        'completion_gps': _gps,
        'completion_photos': photoUrls,
      }).eq('id', widget.visitId);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Visit completed successfully!'), backgroundColor: AppColors.success),
        );
        context.go('/dashboard');
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error),
      );
    } finally { if (mounted) setState(() => _submitting = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Complete: ${_visitName ?? 'Visit'}')),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // GPS Card
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('GPS Location', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                          const SizedBox(height: 12),
                          if (_gettingGps)
                            const Row(children: [
                              SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                              SizedBox(width: 12),
                              Text('Getting GPS...'),
                            ])
                          else if (_gps != null)
                            Row(children: [
                              const Icon(Icons.gps_fixed, color: AppColors.success, size: 18),
                              const SizedBox(width: 8),
                              Expanded(child: Text(
                                '${(_gps!['latitude'] as double).toStringAsFixed(6)}, ${(_gps!['longitude'] as double).toStringAsFixed(6)}\n±${(_gps!['accuracy'] as double).toStringAsFixed(0)}m',
                                style: const TextStyle(fontSize: 13),
                              )),
                              TextButton(onPressed: _getGps, child: const Text('Refresh')),
                            ])
                          else
                            Row(children: [
                              const Icon(Icons.gps_off, color: AppColors.error, size: 18),
                              const SizedBox(width: 8),
                              const Text('GPS not available'),
                              const Spacer(),
                              TextButton(onPressed: _getGps, child: const Text('Retry')),
                            ]),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Notes
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Completion Notes', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _notesCtrl,
                            maxLines: 5,
                            decoration: const InputDecoration(
                              hintText: 'Describe what was observed, any issues, findings...',
                              border: OutlineInputBorder(),
                            ),
                            validator: (v) => (v == null || v.trim().isEmpty) ? 'Notes are required' : null,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Photos
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Photos (Proof)', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                          const SizedBox(height: 12),
                          Row(children: [
                            Expanded(child: OutlinedButton.icon(
                              onPressed: _takePhoto,
                              icon: const Icon(Icons.camera_alt_outlined, size: 16),
                              label: const Text('Camera'),
                            )),
                            const SizedBox(width: 12),
                            Expanded(child: OutlinedButton.icon(
                              onPressed: _addPhoto,
                              icon: const Icon(Icons.photo_library_outlined, size: 16),
                              label: const Text('Gallery'),
                            )),
                          ]),
                          if (_photos.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            SizedBox(
                              height: 80,
                              child: ListView.builder(
                                scrollDirection: Axis.horizontal,
                                itemCount: _photos.length,
                                itemBuilder: (_, i) => Stack(
                                  children: [
                                    Container(
                                      width: 80, height: 80,
                                      margin: const EdgeInsets.only(right: 8),
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(8),
                                        image: DecorationImage(image: FileImage(_photos[i]), fit: BoxFit.cover),
                                      ),
                                    ),
                                    Positioned(top: 0, right: 8, child: GestureDetector(
                                      onTap: () => setState(() => _photos.removeAt(i)),
                                      child: const CircleAvatar(radius: 10, backgroundColor: AppColors.error, child: Icon(Icons.close, size: 12, color: Colors.white)),
                                    )),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  SizedBox(
                    height: 52,
                    child: ElevatedButton.icon(
                      onPressed: _submitting ? null : _submit,
                      icon: _submitting
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.check_circle_outline),
                      label: const Text('Mark as Completed', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
