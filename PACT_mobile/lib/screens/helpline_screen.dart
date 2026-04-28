import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_colors.dart';
import '../widgets/reusable_app_bar.dart';
import '../services/agora_call_service.dart';
import '../services/analytics_service.dart';
import 'agora_call_screen.dart';

class ContactPerson {
  final String id;
  final String name;
  final String role;
  final String phone;
  final String email;
  final String? state;
  final String? hub;

  const ContactPerson({
    required this.id,
    required this.name,
    required this.role,
    required this.phone,
    required this.email,
    this.state,
    this.hub,
  });

  factory ContactPerson.fromJson(Map<String, dynamic> json) {
    return ContactPerson(
      id: json['id'] as String? ?? '',
      name: json['full_name'] as String? ?? 'Unknown',
      role: json['role'] as String? ?? 'Staff',
      phone: json['phone'] as String? ?? 'No phone',
      email: json['email'] as String? ?? 'No email',
      state: json['state_id'] as String?,
      hub: json['hub_id'] as String?,
    );
  }
}

class HelplineScreen extends StatefulWidget {
  const HelplineScreen({super.key});

  @override
  State<HelplineScreen> createState() => _HelplineScreenState();
}

class _HelplineScreenState extends State<HelplineScreen> {
  late Future<Map<String, List<ContactPerson>>> _contactsFuture;
  final _supabase = Supabase.instance.client;
  String? _userState;
  String? _userHub;

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  String _bi(String en, String ar) => _isArabic ? ar : en;

  @override
  void initState() {
    super.initState();
    // Log screen view for analytics
    AnalyticsService.logScreenView('HelplineScreen');
    _contactsFuture = _loadContacts();
  }

  Future<Map<String, List<ContactPerson>>> _loadContacts() async {
    try {
      // Get current user's profile
      final user = _supabase.auth.currentUser;
      if (user == null) {
        throw Exception('User not authenticated');
      }

      final profile = await _supabase
          .from('profiles')
          .select('state_id, hub_id')
          .eq('id', user.id)
          .maybeSingle();

      if (profile != null) {
        _userState = profile['state_id'] as String?;
        _userHub = profile['hub_id'] as String?;
      }

      // Fetch all contacts with leadership/management roles
      final response = await _supabase
          .from('profiles')
          .select('id, full_name, role, phone, email, state_id, hub_id')
          .inFilter('role', [
            'state_coordinator',
            'supervisor',
            'fom',
            'country_director',
            'ict',
            'data_team',
          ]);

      final allContacts = (response as List)
          .map((json) => ContactPerson.fromJson(json))
          .toList();

      // Organize by category in the order: State Coordinator → Hub Supervisors → FOM → Data Team → Country Director → ICT
      final organized = <String, List<ContactPerson>>{
        'State Coordinator': [],
        'Hub Supervisors': [],
        'FOM': [],
        'Data Team': [],
        'Country Director': [],
        'ICT': [],
      };

      for (final contact in allContacts) {
        final role = contact.role.toLowerCase();

        if (role == 'state_coordinator') {
          // Include state coordinators from same state
          if (_userState != null && contact.state == _userState) {
            organized['State Coordinator']!.add(contact);
          }
        } else if (role == 'supervisor') {
          // Include supervisors from same hub
          if (_userHub != null && contact.hub == _userHub) {
            organized['Hub Supervisors']!.add(contact);
          }
        } else if (role == 'fom') {
          organized['FOM']!.add(contact);
        } else if (role == 'data_team') {
          organized['Data Team']!.add(contact);
        } else if (role == 'country_director') {
          organized['Country Director']!.add(contact);
        } else if (role == 'ict') {
          organized['ICT']!.add(contact);
        }
      }

      return organized;
    } catch (e) {
      debugPrint('Error loading hotline contacts: $e');
      rethrow;
    }
  }

  Future<void> _makeCall(String number) async {
    if (number.isEmpty || number == 'No phone') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No phone number available')),
      );
      return;
    }
    final Uri url = Uri.parse('tel:$number');
    try {
      if (await canLaunchUrl(url)) {
        await launchUrl(url);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Could not make call: $e')));
      }
    }
  }

  Future<void> _sendEmail(String email) async {
    if (email.isEmpty || email == 'No email') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No email address available')),
      );
      return;
    }
    final Uri url = Uri.parse('mailto:$email');
    try {
      if (await canLaunchUrl(url)) {
        await launchUrl(url);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Could not send email: $e')));
      }
    }
  }

  String _getRoleLabel(String role) {
    switch (role.toLowerCase()) {
      case 'state_coordinator':
        return _bi('State Coordinator', 'منسق الولاية');
      case 'supervisor':
        return _bi('Hub Supervisor', 'مشرف المركز');
      case 'fom':
        return _bi('Field Operations Manager', 'مدير العمليات الميدانية');
      case 'data_team':
        return _bi('Data Team', 'فريق البيانات');
      case 'country_director':
        return _bi('Country Director', 'مدير البلد');
      case 'ict':
        return _bi('ICT', 'تقنية المعلومات');
      default:
        return role;
    }
  }

  Future<void> _makeInAppCall(ContactPerson person) async {
    try {
      // Show confirmation dialog
      if (!mounted) return;

      final shouldCall = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(
            _bi('Call ${person.name}', 'اتصل ب${person.name}'),
            style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
          ),
          content: Text(
            _bi(
              'Start an in-app call with ${person.name}?',
              'هل تريد بدء مكالمة عبر التطبيق مع ${person.name}؟',
            ),
            style: GoogleFonts.poppins(),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(_bi('Cancel', 'إلغاء')),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryOrange,
              ),
              child: Text(
                _bi('Call', 'اتصال'),
                style: const TextStyle(color: Colors.white),
              ),
            ),
          ],
        ),
      );

      if (shouldCall == true) {
        // Initiate in-app call using AgoraCallService
        final agoraService = AgoraCallService();
        try {
          await agoraService.initialize(
            userId: Supabase.instance.client.auth.currentUser?.id ?? '',
            userName:
                Supabase.instance.client.auth.currentUser?.email ?? 'User',
          );
        } catch (e) {
          debugPrint('[Helpline] Failed to initialize Agora: $e');
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  _bi(
                    'Failed to initialize call service',
                    'فشل تهيئة خدمة المكالمة',
                  ),
                ),
                backgroundColor: Colors.red,
              ),
            );
          }
          return;
        }

        if (mounted) {
          // Navigate to Agora call screen
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (context) => AgoraCallScreen(
                channelName: 'emergency_${person.id}',
                remoteUserId: person.phone,
                remoteUserName: person.name,
                isOutgoing: true,
              ),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _bi('Error initiating call: $e', 'خطأ في بدء المكالمة: $e'),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundGray,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: _bi('Emergency Hotline', 'خط الطوارئ'),
              showBackButton: true,
            ),
            Expanded(
              child: FutureBuilder<Map<String, List<ContactPerson>>>(
                future: _contactsFuture,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  if (snapshot.hasError) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(
                              Icons.error_outline,
                              color: AppColors.primaryOrange,
                              size: 48,
                            ),
                            const SizedBox(height: 16),
                            Text(
                              _bi(
                                'Error loading contacts',
                                'خطأ في تحميل جهات الاتصال',
                              ),
                              style: GoogleFonts.poppins(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textDark,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              snapshot.error.toString(),
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                color: AppColors.textLight,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    );
                  }

                  final contacts = snapshot.data ?? {};
                  final hasContacts = contacts.values.any(
                    (list) => list.isNotEmpty,
                  );

                  if (!hasContacts) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(
                              Icons.phone_disabled,
                              color: AppColors.primaryOrange,
                              size: 48,
                            ),
                            const SizedBox(height: 16),
                            Text(
                              _bi(
                                'No contacts available',
                                'لا توجد جهات اتصال متاحة',
                              ),
                              style: GoogleFonts.poppins(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textDark,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }

                  return ListView(
                    padding: const EdgeInsets.all(16),
                    children: contacts.entries.map((entry) {
                      final category = entry.key;
                      final people = entry.value;

                      if (people.isEmpty) {
                        return const SizedBox.shrink();
                      }

                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              vertical: 12,
                              horizontal: 8,
                            ),
                            child: Text(
                              category,
                              style: GoogleFonts.poppins(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: AppColors.primaryOrange,
                              ),
                            ),
                          ),
                          ...List.generate(people.length, (index) {
                            final person = people[index];
                            return Card(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Padding(
                                    padding: const EdgeInsets.all(16),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Container(
                                              padding: const EdgeInsets.all(12),
                                              decoration: BoxDecoration(
                                                color: AppColors.primaryOrange
                                                    .withValues(alpha: 0.1),
                                                shape: BoxShape.circle,
                                              ),
                                              child: const Icon(
                                                Icons.person,
                                                color: AppColors.primaryOrange,
                                              ),
                                            ),
                                            const SizedBox(width: 12),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    person.name,
                                                    style: GoogleFonts.poppins(
                                                      fontSize: 16,
                                                      fontWeight:
                                                          FontWeight.w600,
                                                      color: AppColors.textDark,
                                                    ),
                                                  ),
                                                  Text(
                                                    _getRoleLabel(person.role),
                                                    style: GoogleFonts.poppins(
                                                      fontSize: 12,
                                                      color: AppColors
                                                          .primaryOrange,
                                                      fontWeight:
                                                          FontWeight.w500,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 16),
                                        const Divider(),
                                        const SizedBox(height: 12),
                                        // Phone
                                        Padding(
                                          padding: const EdgeInsets.only(
                                            bottom: 12,
                                          ),
                                          child: Row(
                                            children: [
                                              const Icon(
                                                Icons.phone,
                                                color: AppColors.primaryOrange,
                                                size: 18,
                                              ),
                                              const SizedBox(width: 12),
                                              Expanded(
                                                child: Text(
                                                  person.phone,
                                                  style: GoogleFonts.poppins(
                                                    fontSize: 13,
                                                    color: AppColors.textDark,
                                                  ),
                                                ),
                                              ),
                                              if (person.phone !=
                                                  'No phone') ...[
                                                IconButton(
                                                  onPressed: () {
                                                    HapticFeedback.mediumImpact();
                                                    _makeCall(person.phone);
                                                  },
                                                  icon: const Icon(
                                                    Icons.call,
                                                    color:
                                                        AppColors.primaryOrange,
                                                  ),
                                                  tooltip: _bi('Call', 'اتصال'),
                                                  padding: EdgeInsets.zero,
                                                  constraints:
                                                      const BoxConstraints(
                                                        minWidth: 32,
                                                        minHeight: 32,
                                                      ),
                                                ),
                                                IconButton(
                                                  onPressed: () {
                                                    HapticFeedback.mediumImpact();
                                                    _makeInAppCall(person);
                                                  },
                                                  icon: const Icon(
                                                    Icons.video_call,
                                                    color:
                                                        AppColors.primaryOrange,
                                                  ),
                                                  tooltip: _bi(
                                                    'In-app Call',
                                                    'اتصال عبر التطبيق',
                                                  ),
                                                  padding: EdgeInsets.zero,
                                                  constraints:
                                                      const BoxConstraints(
                                                        minWidth: 32,
                                                        minHeight: 32,
                                                      ),
                                                ),
                                              ],
                                            ],
                                          ),
                                        ),
                                        // Email
                                        Row(
                                          children: [
                                            const Icon(
                                              Icons.email,
                                              color: AppColors.primaryOrange,
                                              size: 18,
                                            ),
                                            const SizedBox(width: 12),
                                            Expanded(
                                              child: Text(
                                                person.email,
                                                style: GoogleFonts.poppins(
                                                  fontSize: 13,
                                                  color: AppColors.textDark,
                                                ),
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                            if (person.email != 'No email')
                                              IconButton(
                                                onPressed: () {
                                                  HapticFeedback.mediumImpact();
                                                  _sendEmail(person.email);
                                                },
                                                icon: const Icon(
                                                  Icons.mail_outline,
                                                  color:
                                                      AppColors.primaryOrange,
                                                ),
                                                tooltip: _bi(
                                                  'Email',
                                                  'بريد إلكتروني',
                                                ),
                                                padding: EdgeInsets.zero,
                                                constraints:
                                                    const BoxConstraints(
                                                      minWidth: 32,
                                                      minHeight: 32,
                                                    ),
                                              ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                )
                                .animate()
                                .fadeIn(
                                  duration: 300.ms,
                                  delay: (100 * index).ms,
                                )
                                .slideY(
                                  begin: 0.2,
                                  end: 0,
                                  duration: 300.ms,
                                  delay: (100 * index).ms,
                                );
                          }),
                          const SizedBox(height: 16),
                        ],
                      );
                    }).toList(),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
