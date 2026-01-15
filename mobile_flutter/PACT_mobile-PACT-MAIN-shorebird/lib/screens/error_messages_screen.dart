import 'package:flutter/material.dart';
import '../services/help_service.dart';

class ErrorMessagesScreen extends StatelessWidget {
  const ErrorMessagesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final errors = HelpService.commonErrors.entries.toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Common Errors'),
        backgroundColor: const Color(0xFF1976D2),
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: errors.length,
        itemBuilder: (context, index) {
          final entry = errors[index];
          final errorMessage = entry.value;

          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: Theme(
              data: Theme.of(context).copyWith(
                dividerColor: Colors.transparent,
              ),
              child: ExpansionTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF44336).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.error_outline,
                    color: Color(0xFFF44336),
                    size: 24,
                  ),
                ),
                title: Text(
                  errorMessage.error,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    errorMessage.meaning,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                  ),
                ),
                children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF4CAF50).withOpacity(0.05),
                      border: Border(
                        top: BorderSide(
                          color: Colors.grey[300]!,
                          width: 1,
                        ),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.lightbulb_outline,
                              color: Color(0xFF4CAF50),
                              size: 20,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'Solution',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                                color: Colors.grey[800],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          errorMessage.solution,
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey[800],
                            height: 1.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
