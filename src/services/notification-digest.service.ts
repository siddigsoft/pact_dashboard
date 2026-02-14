import { supabase } from '@/integrations/supabase/client';
import { EmailNotificationService } from './email-notification.service';

/**
 * Notification Digest Service
 * Generates and sends daily/weekly email digests of unread notifications
 */

export interface DigestItem {
  title: string;
  message: string;
  createdAt: string;
  priority?: string;
  link?: string;
}

export interface DigestSection {
  category: string;
  categoryLabel: string;
  categoryLabelAr: string;
  count: number;
  items: DigestItem[];
}

export interface NotificationDigest {
  userId: string;
  period: 'daily' | 'weekly';
  generatedAt: string;
  totalUnread: number;
  sections: DigestSection[];
}

// Category labels mapping - English and Arabic
const CATEGORY_LABELS: Record<string, { en: string; ar: string }> = {
  assignments: { en: 'Assignments', ar: 'المهام' },
  approvals: { en: 'Approvals', ar: 'الموافقات' },
  financial: { en: 'Financial', ar: 'المالية' },
  system: { en: 'System', ar: 'النظام' },
  wallet: { en: 'Wallet', ar: 'المحفظة' },
  retainer: { en: 'Retainer', ar: 'المكافآت' },
  account: { en: 'Account', ar: 'الحساب' },
  team: { en: 'Team', ar: 'الفريق' },
  signatures: { en: 'Signatures', ar: 'التوقيعات' },
  calls: { en: 'Calls', ar: 'المكالمات' },
  messages: { en: 'Messages', ar: 'الرسائل' },
  recall: { en: 'Recall', ar: 'الاسترجاع' },
  default: { en: 'Other', ar: 'أخرى' },
};

export class NotificationDigestService {
  /**
   * Calculate the date range for the period
   */
  private getDateRange(period: 'daily' | 'weekly'): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now);

    if (period === 'daily') {
      start.setDate(now.getDate() - 1);
    } else {
      start.setDate(now.getDate() - 7);
    }

    return { start, end: now };
  }

  /**
   * Get category label by category key
   */
  private getCategoryLabel(category: string): { en: string; ar: string } {
    return CATEGORY_LABELS[category] || CATEGORY_LABELS.default;
  }

  /**
   * Fetch unread notifications for the given period
   */
  private async fetchUnreadNotifications(
    userId: string,
    period: 'daily' | 'weekly'
  ): Promise<Array<{
    id: string;
    title_en?: string;
    title_ar?: string;
    title?: string;
    message_en?: string;
    message_ar?: string;
    message?: string;
    event_type?: string;
    priority?: string;
    action_url?: string;
    created_at: string;
  }>> {
    const { start, end } = this.getDateRange(period);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    console.log(
      `[DIGEST] Fetching unread notifications for user ${userId} from ${startIso} to ${endIso}`
    );

    try {
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('is_read', false)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[DIGEST] Error fetching notifications:', error);
        return [];
      }

      console.log(
        `[DIGEST] Found ${notifications?.length || 0} unread notifications`
      );
      return notifications || [];
    } catch (error) {
      console.error('[DIGEST] Exception fetching notifications:', error);
      return [];
    }
  }

  /**
   * Group notifications by category/event_type
   */
  private groupNotificationsByCategory(
    notifications: Array<{
      id: string;
      title_en?: string;
      title_ar?: string;
      title?: string;
      message_en?: string;
      message_ar?: string;
      message?: string;
      event_type?: string;
      priority?: string;
      action_url?: string;
      created_at: string;
    }>
  ): Record<string, DigestItem[]> {
    const grouped: Record<string, DigestItem[]> = {};

    for (const notification of notifications) {
      const category = notification.event_type || 'system';

      if (!grouped[category]) {
        grouped[category] = [];
      }

      grouped[category].push({
        title: notification.title_en || notification.title || 'Notification',
        message: notification.message_en || notification.message || '',
        createdAt: notification.created_at,
        priority: notification.priority,
        link: notification.action_url || undefined,
      });
    }

    return grouped;
  }

  /**
   * Generate digest for a user for the given period
   */
  async generateDigest(
    userId: string,
    period: 'daily' | 'weekly'
  ): Promise<NotificationDigest> {
    console.log(
      `[DIGEST] Generating ${period} digest for user ${userId}`
    );

    const notifications = await this.fetchUnreadNotifications(userId, period);
    const grouped = this.groupNotificationsByCategory(notifications);

    const sections: DigestSection[] = [];

    for (const [category, items] of Object.entries(grouped)) {
      const labels = this.getCategoryLabel(category);
      sections.push({
        category,
        categoryLabel: labels.en,
        categoryLabelAr: labels.ar,
        count: items.length,
        items: items.slice(0, 10), // Limit to 10 items per category
      });
    }

    // Sort sections by count descending
    sections.sort((a, b) => b.count - a.count);

    const digest: NotificationDigest = {
      userId,
      period,
      generatedAt: new Date().toISOString(),
      totalUnread: notifications.length,
      sections,
    };

    console.log(
      `[DIGEST] Generated digest with ${sections.length} sections and ${notifications.length} total items`
    );

    return digest;
  }

  /**
   * Get a summary of unread notifications counts by category
   */
  async getDigestSummary(
    userId: string,
    period: 'daily' | 'weekly'
  ): Promise<{ totalUnread: number; byCategoryCount: Record<string, number> }> {
    console.log(
      `[DIGEST] Generating summary for user ${userId}, period: ${period}`
    );

    const notifications = await this.fetchUnreadNotifications(userId, period);
    const grouped = this.groupNotificationsByCategory(notifications);

    const byCategoryCount: Record<string, number> = {};
    for (const [category, items] of Object.entries(grouped)) {
      byCategoryCount[category] = items.length;
    }

    return {
      totalUnread: notifications.length,
      byCategoryCount,
    };
  }

  /**
   * Generate HTML email for the digest
   */
  private generateDigestEmailHTML(
    recipientName: string,
    digest: NotificationDigest
  ): string {
    const { period, sections, totalUnread, generatedAt } = digest;

    const periodLabel =
      period === 'daily' ? 'Daily' : 'Weekly';
    const periodLabelAr =
      period === 'daily' ? 'يومي' : 'أسبوعي';

    const generatedDate = new Date(generatedAt);
    const dateStr = generatedDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const sectionsHTML = sections
      .map(
        (section) => `
    <div style="margin-bottom: 25px; padding: 20px; background-color: #f8f9fa; border-left: 4px solid #9b87f5; border-radius: 4px;">
      <h3 style="margin: 0 0 15px 0; color: #1a1a2e; font-size: 18px;">
        ${section.categoryLabel} (${section.count})
      </h3>
      <h3 style="margin: 0 0 15px 0; color: #1a1a2e; font-size: 18px; direction: rtl; text-align: right;">
        ${section.categoryLabelAr} (${section.count})
      </h3>
      
      <div style="margin-bottom: 10px;">
        ${section.items
          .map(
            (item) => `
        <div style="padding: 12px; margin-bottom: 10px; background-color: white; border-radius: 4px; border-left: 3px solid #e0e0e0;">
          <p style="margin: 0 0 5px 0; color: #333; font-weight: 600; font-size: 14px;">
            ${item.title}
          </p>
          <p style="margin: 0 0 5px 0; color: #555; font-size: 13px; line-height: 1.5;">
            ${item.message}
          </p>
          <p style="margin: 0; color: #999; font-size: 12px;">
            ${new Date(item.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
            ${item.priority ? ` • Priority: ${item.priority}` : ''}
          </p>
          ${
            item.link
              ? `<p style="margin: 8px 0 0 0;"><a href="https://app.pactorg.com${item.link}" style="color: #9b87f5; text-decoration: none; font-size: 12px;">View Details</a></p>`
              : ''
          }
        </div>
        `
          )
          .join('')}
      </div>
    </div>
  `
      )
      .join('');

    return `
    <!DOCTYPE html>
    <html dir="ltr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${periodLabel} Notification Digest | ${periodLabelAr}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #9b87f5; padding-bottom: 20px;">
          <h1 style="color: #1a1a2e; margin: 0; font-size: 28px;">
            ${periodLabel} Notification Digest
          </h1>
          <h1 style="color: #1a1a2e; margin: 0; font-size: 28px; direction: rtl;">
            ${periodLabelAr} ملخص الإشعارات
          </h1>
          <p style="color: #666; margin: 10px 0 0 0; font-size: 14px;">
            PACT Command Center | مركز قيادة باكت
          </p>
        </div>

        <!-- English Section -->
        <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #eee;">
          <p style="color: #333; font-size: 16px; line-height: 1.5;">
            Hello ${recipientName},
          </p>
          
          <p style="color: #555; font-size: 14px; line-height: 1.6;">
            You have <strong>${totalUnread}</strong> unread notification${
              totalUnread !== 1 ? 's' : ''
            } from the past ${period === 'daily' ? '24 hours' : '7 days'}. Here's a summary grouped by category:
          </p>

          ${sectionsHTML}

          <p style="color: #666; font-size: 13px; margin-top: 25px;">
            Generated on ${dateStr}
          </p>
        </div>

        <!-- Arabic Section -->
        <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
          <p style="color: #333; font-size: 16px; line-height: 1.8;">
            مرحباً ${recipientName}،
          </p>
          
          <p style="color: #555; font-size: 14px; line-height: 1.8;">
            لديك <strong>${totalUnread}</strong> إشعار غير مقروء من آخر ${
              period === 'daily' ? '24 ساعة' : '7 أيام'
            }. إليك ملخص مجمع حسب الفئة:
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <!-- Footer -->
        <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
          This is an automated ${periodLabel.toLowerCase()} digest from PACT Workflow Platform.<br>
          هذا ملخص ${periodLabelAr} آلي من منصة باكت للعمليات الميدانية.<br>
          You can manage your notification preferences in your account settings.
        </p>
      </div>
    </body>
    </html>
  `;
  }

  /**
   * Send digest email to a user
   */
  async sendDigestEmail(
    userId: string,
    period: 'daily' | 'weekly'
  ): Promise<{ success: boolean; error?: string }> {
    console.log(
      `[DIGEST] Sending ${period} digest email for user ${userId}`
    );

    try {
      // Fetch user info
      const { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .single();

      if (profileError || !userProfile?.email) {
        const errorMsg = `Failed to fetch user profile: ${profileError?.message || 'User not found'}`;
        console.error('[DIGEST]', errorMsg);
        return { success: false, error: errorMsg };
      }

      // Generate digest
      const digest = await this.generateDigest(userId, period);

      // Return early if no unread notifications
      if (digest.totalUnread === 0) {
        console.log(
          `[DIGEST] No unread notifications for ${period}, skipping email`
        );
        return { success: true };
      }

      // Generate email HTML
      const html = this.generateDigestEmailHTML(
        userProfile.full_name || 'User',
        digest
      );

      const periodLabel = period === 'daily' ? 'Daily' : 'Weekly';
      const subject = `${periodLabel} Notification Digest | ${
        period === 'daily' ? 'ملخص الإشعارات اليومي' : 'ملخص الإشعارات الأسبوعي'
      }`;

      // Send email
      const result = await EmailNotificationService.sendEmail({
        to: userProfile.email,
        subject,
        recipientName: userProfile.full_name || 'User',
        html,
        text: `You have ${digest.totalUnread} unread notification${
          digest.totalUnread !== 1 ? 's' : ''
        } from the past ${period === 'daily' ? '24 hours' : '7 days'}.`,
        priority: 'normal',
      });

      if (result.success) {
        console.log(
          `[DIGEST] Successfully sent ${period} digest to ${userProfile.email}`
        );
      } else {
        console.error(
          `[DIGEST] Failed to send ${period} digest: ${result.error}`
        );
      }

      return result;
    } catch (error: any) {
      const errorMsg = `Exception while sending digest: ${error.message}`;
      console.error('[DIGEST]', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Send digests to all users with unread notifications
   */
  async sendDigestsToAllUsers(period: 'daily' | 'weekly'): Promise<{
    success: boolean;
    totalSent: number;
    totalFailed: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    console.log(
      `[DIGEST] Starting bulk ${period} digest sending to all users`
    );

    try {
      const { start, end } = this.getDateRange(period);
      const startIso = start.toISOString();

      // Fetch all users with unread notifications in the period
      const { data: unreadByUser, error } = await supabase
        .from('notifications')
        .select('user_id')
        .eq('is_read', false)
        .gte('created_at', startIso)
        .lte('created_at', end.toISOString());

      if (error) {
        const errorMsg = `Failed to fetch unread notifications: ${error.message}`;
        console.error('[DIGEST]', errorMsg);
        return { success: false, totalSent: 0, totalFailed: 0, errors: [] };
      }

      // Get unique user IDs
      const uniqueUserIds = [
        ...new Set(unreadByUser?.map((n: any) => n.user_id) || []),
      ];
      console.log(
        `[DIGEST] Found ${uniqueUserIds.length} users with unread notifications`
      );

      let totalSent = 0;
      let totalFailed = 0;
      const errors: Array<{ userId: string; error: string }> = [];

      for (const userId of uniqueUserIds) {
        try {
          const result = await this.sendDigestEmail(userId, period);

          if (result.success) {
            totalSent++;
          } else {
            totalFailed++;
            errors.push({ userId, error: result.error || 'Unknown error' });
          }

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (err: any) {
          totalFailed++;
          errors.push({
            userId,
            error: err.message || 'Exception while sending',
          });
        }
      }

      console.log(
        `[DIGEST] Bulk ${period} digest sending complete: ${totalSent} sent, ${totalFailed} failed`
      );

      return { success: totalFailed === 0, totalSent, totalFailed, errors };
    } catch (error: any) {
      const errorMsg = `Exception in bulk digest sending: ${error.message}`;
      console.error('[DIGEST]', errorMsg);
      return { success: false, totalSent: 0, totalFailed: 0, errors: [] };
    }
  }
}

// Export singleton instance
export const notificationDigestService = new NotificationDigestService();
