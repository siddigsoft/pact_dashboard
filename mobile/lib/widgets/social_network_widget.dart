import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Social network and friends display
class SocialNetworkWidget extends StatelessWidget {
  final List<Map<String, dynamic>> connections;
  final int pendingRequestCount;
  final bool isArabic;
  final VoidCallback? onViewFriends;
  final VoidCallback? onViewRequests;

  const SocialNetworkWidget({
    super.key,
    required this.connections,
    this.pendingRequestCount = 0,
    this.isArabic = false,
    this.onViewFriends,
    this.onViewRequests,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isArabic ? '👫 الأصدقاء' : '👫 Friends',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${connections.length} ${isArabic ? 'أصدقاء' : 'connections'}',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: AppColors.textLight,
                      ),
                    ),
                  ],
                ),
                if (pendingRequestCount > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade50,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.person_add,
                          size: 16,
                          color: AppColors.primaryBlue,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          '$pendingRequestCount ${isArabic ? 'طلب' : 'requests'}',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppColors.primaryBlue,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          if (connections.isEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: Text(
                  isArabic
                      ? 'لا توجد أصدقاء بعد. ابدأ بالبحث والاتصال'
                      : 'No friends yet. Search and connect with people.',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: AppColors.textLight,
                    height: 1.5,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: SizedBox(
                height: 100,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  itemCount: connections.length,
                  itemBuilder: (context, index) {
                    final connection = connections[index];
                    final profileData = connection['profiles'] ?? {};
                    final name =
                        (profileData is List && profileData.isNotEmpty
                            ? profileData[0]['name']
                            : profileData['name']) ??
                        'Friend';

                    return Container(
                      margin: const EdgeInsets.only(right: 12, bottom: 12),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 60,
                            height: 60,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppColors.primaryBlue.withOpacity(0.1),
                              border: Border.all(
                                color: AppColors.primaryBlue.withOpacity(0.3),
                              ),
                            ),
                            child: Center(
                              child: Text(
                                name.toString().substring(0, 1).toUpperCase(),
                                style: GoogleFonts.poppins(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.primaryBlue,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          SizedBox(
                            width: 60,
                            child: Text(
                              name.toString(),
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                fontWeight: FontWeight.w500,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                if (onViewFriends != null)
                  ElevatedButton.icon(
                    onPressed: onViewFriends,
                    icon: const Icon(Icons.people, size: 16),
                    label: Text(
                      isArabic ? 'جميع الأصدقاء' : 'All Friends',
                      style: const TextStyle(fontSize: 11),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primaryBlue,
                      foregroundColor: Colors.white,
                    ),
                  ),
                if (onViewRequests != null && pendingRequestCount > 0)
                  OutlinedButton.icon(
                    onPressed: onViewRequests,
                    icon: const Icon(Icons.person_add, size: 16),
                    label: Text(
                      isArabic ? 'الطلبات' : 'Requests',
                      style: const TextStyle(fontSize: 11),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primaryBlue,
                      side: const BorderSide(color: AppColors.primaryBlue),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
