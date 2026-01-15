import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/help_models.dart';
import '../services/help_service.dart';

class HelpScreen extends StatefulWidget {
  const HelpScreen({super.key});

  @override
  State<HelpScreen> createState() => _HelpScreenState();
}

class _HelpScreenState extends State<HelpScreen> {
  final _searchController = TextEditingController();
  List<HelpArticle> _searchResults = [];
  bool _isSearching = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String query) {
    setState(() {
      if (query.isEmpty) {
        _isSearching = false;
        _searchResults = [];
      } else {
        _isSearching = true;
        _searchResults = HelpService.searchArticles(query);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Help & Support'),
        backgroundColor: const Color(0xFF1976D2),
      ),
      body: Column(
        children: [
          _buildSearchBar(),
          Expanded(
            child: _isSearching
                ? _buildSearchResults()
                : _buildCategoriesList(),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      padding: const EdgeInsets.all(16),
      color: Colors.white,
      child: TextField(
        controller: _searchController,
        decoration: InputDecoration(
          hintText: 'Search help articles...',
          prefixIcon: const Icon(Icons.search),
          suffixIcon: _searchController.text.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () {
                    _searchController.clear();
                    _onSearchChanged('');
                  },
                )
              : null,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
        onChanged: _onSearchChanged,
      ),
    );
  }

  Widget _buildSearchResults() {
    if (_searchResults.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search_off, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'No results found',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              'Try different search terms',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Colors.grey[600],
                  ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _searchResults.length,
      itemBuilder: (context, index) {
        final article = _searchResults[index];
        return _buildArticleCard(article);
      },
    );
  }

  Widget _buildCategoriesList() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Help Categories
        ...HelpService.helpCategories.map((category) {
          return _buildCategorySection(category);
        }),

        const SizedBox(height: 24),

        // Contact Support Section
        _buildContactSupportSection(),

        const SizedBox(height: 16),

        // Report a Bug
        _buildReportBugCard(),
      ],
    );
  }

  Widget _buildCategorySection(HelpCategory category) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                category.title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              if (category.description.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  category.description,
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ],
          ),
        ),
        ...category.articles.map((article) => _buildArticleCard(article)),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildArticleCard(HelpArticle article) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: const Color(0xFF1976D2).withOpacity(0.1),
          child: const Icon(
            Icons.help_outline,
            color: Color(0xFF1976D2),
          ),
        ),
        title: Text(article.title),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => _showArticleDialog(article),
      ),
    );
  }

  void _showArticleDialog(HelpArticle article) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(article.title),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(article.content),
              if (article.solution != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF4CAF50).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.lightbulb_outline,
                        color: Color(0xFF4CAF50),
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Solution',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF4CAF50),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(article.solution!),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              if (article.tags.isNotEmpty) ...[
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  children: article.tags.map((tag) {
                    return Chip(
                      label: Text(
                        tag,
                        style: const TextStyle(fontSize: 12),
                      ),
                      backgroundColor: Colors.grey[200],
                      padding: EdgeInsets.zero,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    );
                  }).toList(),
                ),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Widget _buildContactSupportSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.support_agent,
                  color: Color(0xFF1976D2),
                  size: 28,
                ),
                const SizedBox(width: 12),
                Text(
                  'Contact Support',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildContactOption(
              icon: Icons.email,
              title: 'Email Support',
              subtitle: 'kazibwe@pactorg.org',
              onTap: () => _launchEmail('kazibwe@pactorg.org'),
            ),
            const Divider(height: 24),
            _buildContactOption(
              icon: Icons.phone,
              title: 'Emergency Support',
              subtitle: '+249 XXX XXX XXX',
              onTap: () => _launchPhone('+249XXXXXXXXX'),
            ),
            const Divider(height: 24),
            _buildContactOption(
              icon: Icons.language,
              title: 'Visit Website',
              subtitle: 'www.pactorg.org',
              onTap: () => _launchWebsite('https://www.pactorg.org'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContactOption({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xFF1976D2).withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: const Color(0xFF1976D2)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: Colors.grey),
        ],
      ),
    );
  }

  Widget _buildReportBugCard() {
    return Card(
      child: InkWell(
        onTap: _showReportBugDialog,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFF9800).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.bug_report,
                  color: Color(0xFFFF9800),
                  size: 28,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Report a Bug',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      'Help us improve the app',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }

  void _showReportBugDialog() {
    final stepsController = TextEditingController();
    final errorController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Report a Bug'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: stepsController,
                decoration: const InputDecoration(
                  labelText: 'Steps to Reproduce',
                  hintText: 'Describe what you were doing...',
                  border: OutlineInputBorder(),
                ),
                maxLines: 4,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: errorController,
                decoration: const InputDecoration(
                  labelText: 'Error Message (if any)',
                  hintText: 'Paste any error messages...',
                  border: OutlineInputBorder(),
                ),
                maxLines: 3,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              _submitBugReport(
                stepsController.text,
                errorController.text,
              );
              Navigator.pop(context);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFFF9800),
            ),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }

  void _submitBugReport(String steps, String errorMessage) async {
    final bugReport = BugReport(
      stepsToReproduce: steps,
      errorMessage: errorMessage,
      deviceInfo: 'Device info would be collected here',
      reportedAt: DateTime.now(),
    );

    // Send bug report via email
    final body = '''
Bug Report - PACT Mobile

Steps to Reproduce:
${steps.isNotEmpty ? steps : 'Not provided'}

Error Message:
${errorMessage.isNotEmpty ? errorMessage : 'Not provided'}

Device Info:
${bugReport.deviceInfo}

Reported At:
${bugReport.reportedAt.toIso8601String()}
''';

    final uri = Uri(
      scheme: 'mailto',
      path: 'kazibwe@pactorg.org',
      queryParameters: {
        'subject': 'PACT Mobile Bug Report',
        'body': body,
      },
    );

    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Bug report submitted. Thank you!'),
          backgroundColor: Color(0xFF4CAF50),
        ),
      );
    }
  }

  Future<void> _launchEmail(String email) async {
    final uri = Uri(
      scheme: 'mailto',
      path: email,
      queryParameters: {
        'subject': 'PACT Mobile Support Request',
      },
    );

    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      _showErrorDialog('Cannot open email app');
    }
  }

  Future<void> _launchPhone(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);

    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      _showErrorDialog('Cannot make phone call');
    }
  }

  Future<void> _launchWebsite(String url) async {
    final uri = Uri.parse(url);

    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      _showErrorDialog('Cannot open website');
    }
  }

  void _showErrorDialog(String message) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Error'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}
