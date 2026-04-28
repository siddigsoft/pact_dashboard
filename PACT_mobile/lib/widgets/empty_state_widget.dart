import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

/// Reusable empty state widget for consistent UX
class EmptyStateWidget extends StatelessWidget {
  final String title;
  final String? subtitle;
  final IconData? icon;
  final Widget? illustration;
  final String? actionLabel;
  final VoidCallback? onActionPressed;
  final bool isLoading;
  final EdgeInsets padding;
  final Color? iconColor;
  final double iconSize;

  const EmptyStateWidget({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.illustration,
    this.actionLabel,
    this.onActionPressed,
    this.isLoading = false,
    this.padding = const EdgeInsets.all(24.0),
    this.iconColor,
    this.iconSize = 64.0,
  }) : assert(
         icon == null || illustration == null,
         'Provide either icon or illustration, not both',
       );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Center(
      child: SingleChildScrollView(
        child: Padding(
          padding: padding,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Icon or Illustration
              if (illustration != null)
                SizedBox(width: 120, height: 120, child: illustration!)
                    .animate()
                    .fadeIn(duration: 500.ms)
                    .scale(begin: Offset(0.8, 0.8), end: Offset(1.0, 1.0))
              else if (icon != null)
                Container(
                      padding: EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: (iconColor ?? theme.primaryColor).withOpacity(
                          0.1,
                        ),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        icon,
                        size: iconSize,
                        color: iconColor ?? theme.primaryColor,
                      ),
                    )
                    .animate()
                    .fadeIn(duration: 500.ms)
                    .scale(begin: Offset(0.8, 0.8), end: Offset(1.0, 1.0)),

              SizedBox(height: 24),

              // Title
              Text(
                    title,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: theme.textTheme.bodySmall?.color,
                    ),
                  )
                  .animate()
                  .slideY(begin: 0.3, end: 0.0, duration: 500.ms)
                  .fadeIn(duration: 500.ms),

              // Subtitle
              if (subtitle != null) ...[
                SizedBox(height: 12),
                Text(
                      subtitle!,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: Colors.grey[600],
                      ),
                    )
                    .animate()
                    .slideY(
                      begin: 0.3,
                      end: 0.0,
                      duration: 500.ms,
                      delay: 100.ms,
                    )
                    .fadeIn(duration: 500.ms, delay: 100.ms),
              ],

              // Action Button
              if (actionLabel != null && onActionPressed != null) ...[
                SizedBox(height: 32),
                isLoading
                    ? SizedBox(
                        width: 200,
                        height: 48,
                        child: Center(
                          child: SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2.0),
                          ),
                        ),
                      )
                    : ElevatedButton(
                            onPressed: onActionPressed,
                            style: ElevatedButton.styleFrom(
                              padding: EdgeInsets.symmetric(
                                horizontal: 32,
                                vertical: 12,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: Text(
                              actionLabel!,
                              style: TextStyle(fontSize: 16),
                            ),
                          )
                          .animate()
                          .slideY(
                            begin: 0.3,
                            end: 0.0,
                            duration: 500.ms,
                            delay: 200.ms,
                          )
                          .fadeIn(duration: 500.ms, delay: 200.ms),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Pre-configured empty state templates
class EmptyStateTemplates {
  /// No chats
  static Widget noChats(BuildContext context, {VoidCallback? onStartChat}) {
    return EmptyStateWidget(
      title: 'No Chats Yet',
      subtitle: 'Start a new conversation to connect with others',
      icon: Icons.chat_bubble_outline,
      actionLabel: 'Start Chat',
      onActionPressed: onStartChat,
    );
  }

  /// No messages
  static Widget noMessages(BuildContext context) {
    return EmptyStateWidget(
      title: 'No Messages',
      subtitle: 'Say hello to get the conversation started!',
      icon: Icons.mail_outline,
    );
  }

  /// No calls
  static Widget noCalls(BuildContext context, {VoidCallback? onMakeCall}) {
    return EmptyStateWidget(
      title: 'No Call History',
      subtitle: 'Your calls will appear here',
      icon: Icons.call_outlined,
      actionLabel: 'Make a Call',
      onActionPressed: onMakeCall,
    );
  }

  /// No contacts
  static Widget noContacts(BuildContext context, {VoidCallback? onAddContact}) {
    return EmptyStateWidget(
      title: 'No Contacts',
      subtitle: 'Start by adding your first contact',
      icon: Icons.person_outline,
      actionLabel: 'Add Contact',
      onActionPressed: onAddContact,
    );
  }

  /// No search results
  static Widget noSearchResults(BuildContext context, String query) {
    return EmptyStateWidget(
      title: 'No Results Found',
      subtitle: 'Try searching for something else',
      icon: Icons.search_off,
    );
  }

  /// No files
  static Widget noFiles(BuildContext context) {
    return EmptyStateWidget(
      title: 'No Files',
      subtitle: 'Shared files will appear here',
      icon: Icons.folder_outlined,
    );
  }

  /// Connection error
  static Widget connectionError(BuildContext context, {VoidCallback? onRetry}) {
    return EmptyStateWidget(
      title: 'Connection Error',
      subtitle: 'Check your internet connection and try again',
      icon: Icons.cloud_off_outlined,
      iconColor: Colors.red,
      actionLabel: 'Retry',
      onActionPressed: onRetry,
    );
  }

  /// Loading state
  static Widget loading(BuildContext context, {String? message}) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(width: 48, height: 48, child: CircularProgressIndicator()),
          if (message != null) ...[
            SizedBox(height: 16),
            Text(message, style: Theme.of(context).textTheme.bodyMedium),
          ],
        ],
      ),
    );
  }

  /// Access denied
  static Widget accessDenied(BuildContext context, {VoidCallback? onRetry}) {
    return EmptyStateWidget(
      title: 'Access Denied',
      subtitle: 'You don\'t have permission to view this',
      icon: Icons.lock_outline,
      iconColor: Colors.orange,
      actionLabel: 'Try Again',
      onActionPressed: onRetry,
    );
  }
}
