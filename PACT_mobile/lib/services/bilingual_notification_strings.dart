class BilingualNotificationStrings {
  static String _biTitle(String en, String ar) =>
      '\u2066$en\u2069 \u200B|\u200B \u2067$ar\u2069';

  static String _biBody(String en, String ar) =>
      '\u2066$en\u2069 \u200B|\u200B \u2067$ar\u2069';

  static String get appUpdateAvailableTitle =>
      _biTitle('🎉 App Update Available', 'تحديث التطبيق متاح');

  static String appUpdateAvailableBody(String version) => _biBody(
    'A new version ($version) is ready. Tap to update!',
    'إصدار جديد ($version) جاهز. اضغط للتحديث!',
  );

  static String get downloadingUpdateTitle =>
      _biTitle('Downloading Update', 'جاري تحميل التحديث');

  static String get downloadingUpdateBody =>
      _biBody('Please wait...', 'يرجى الانتظار...');

  static String get updateInstalledTitle =>
      _biTitle('✅ Update Installed', 'تم تثبيت التحديث');

  static String get updateInstalledBody => _biBody(
    'Your app is now up to date. Restart to apply.',
    'تطبيقك محدث الآن. أعد التشغيل للتطبيق.',
  );

  static String get costSubmissionApprovedTitle =>
      _biTitle('Cost Submission Approved', 'تمت الموافقة على التكلفة');

  static String costSubmissionApprovedBody(
    String siteVisitId,
    double amount,
    String currency,
  ) => _biBody(
    'Approved for site visit $siteVisitId. Amount: ${amount.toStringAsFixed(2)} $currency',
    'تمت الموافقة لزيارة الموقع $siteVisitId. المبلغ: ${amount.toStringAsFixed(2)} $currency',
  );

  static String get costSubmissionRejectedTitle =>
      _biTitle('Cost Submission Rejected', 'تم رفض طلب التكلفة');

  static String costSubmissionRejectedBody(String siteVisitId, String reason) =>
      _biBody(
        'Rejected for site visit $siteVisitId. Reason: $reason',
        'تم الرفض لزيارة الموقع $siteVisitId. السبب: $reason',
      );

  static String get revisionRequestedTitle =>
      _biTitle('Revision Requested', 'مطلوب مراجعة');

  static String revisionRequestedBody(String siteVisitId, String notes) =>
      _biBody(
        'Site visit $siteVisitId needs revision. Notes: $notes',
        'زيارة الموقع $siteVisitId تحتاج مراجعة. الملاحظات: $notes',
      );

  static String get offlineSyncCompletedTitle =>
      _biTitle('Offline Sync Completed', 'اكتمل المزامنة');

  static String offlineSyncCompletedBody(int count) => _biBody(
    '$count submission(s) synchronized successfully.',
    'تم مزامنة $count طلب(ات) بنجاح.',
  );

  static String get budgetAlertTitle =>
      _biTitle('Budget Alert', 'تنبيه الميزانية');

  static String budgetAlertBody(
    String siteVisitId,
    double remaining,
    String currency,
  ) => _biBody(
    'Remaining budget for $siteVisitId: ${remaining.toStringAsFixed(2)} $currency',
    'الميزانية المتبقية لـ $siteVisitId: ${remaining.toStringAsFixed(2)} $currency',
  );

  static String get newChatMessageTitle =>
      _biTitle('New Message', 'رسالة جديدة');

  static String get mmpFileUploadedTitle =>
      _biTitle('MMP File Uploaded', 'تم رفع ملف MMP');

  static String get signatureVerifiedTitle =>
      _biTitle('Signature Verified', 'تم التحقق من التوقيع');

  static String get signatureVerifiedBody => _biBody(
    'Your signature has been verified by admin.',
    'تم التحقق من توقيعك من قبل المسؤول.',
  );

  static String get signatureRejectedTitle =>
      _biTitle('Signature Rejected', 'تم رفض التوقيع');

  static String get signatureRejectedBody => _biBody(
    'Your signature was rejected. Please submit a new one.',
    'تم رفض توقيعك. يرجى تقديم توقيع جديد.',
  );

  static String get siteVisitAssignedTitle =>
      _biTitle('Site Visit Assigned', 'تم تعيين زيارة موقع');

  static String siteVisitAssignedBody(String siteName) => _biBody(
    'You have been assigned to visit: $siteName',
    'تم تعيينك لزيارة: $siteName',
  );

  static String get siteVisitCompletedTitle =>
      _biTitle('Site Visit Completed', 'اكتملت زيارة الموقع');

  static String siteVisitCompletedBody(String siteName) => _biBody(
    'Your visit to $siteName has been recorded.',
    'تم تسجيل زيارتك لـ $siteName.',
  );

  static String get paymentReceivedTitle =>
      _biTitle('Payment Received', 'تم استلام الدفعة');

  static String paymentReceivedBody(double amount, String currency) => _biBody(
    'You received ${amount.toStringAsFixed(2)} $currency.',
    'استلمت ${amount.toStringAsFixed(2)} $currency.',
  );

  static String get walletUpdatedTitle =>
      _biTitle('Wallet Updated', 'تم تحديث المحفظة');

  static String walletUpdatedBody(double balance, String currency) => _biBody(
    'New balance: ${balance.toStringAsFixed(2)} $currency',
    'الرصيد الجديد: ${balance.toStringAsFixed(2)} $currency',
  );

  static String get approvalRequiredTitle =>
      _biTitle('Approval Required', 'مطلوب موافقة');

  static String approvalRequiredBody(String itemType) => _biBody(
    'A $itemType requires your approval.',
    'يتطلب $itemType موافقتك.',
  );

  static String get documentReadyTitle =>
      _biTitle('Document Ready', 'المستند جاهز');

  static String documentReadyBody(String docName) =>
      _biBody('$docName is ready for download.', '$docName جاهز للتحميل.');

  static String get reminderTitle => _biTitle('Reminder', 'تذكير');

  static String get incomingCallTitle =>
      _biTitle('Incoming Call', 'مكالمة واردة');

  static String incomingCallBody(String callerName) =>
      _biBody('$callerName is calling you.', '$callerName يتصل بك.');

  static String get missedCallTitle => _biTitle('Missed Call', 'مكالمة فائتة');

  static String missedCallBody(String callerName) => _biBody(
    'You missed a call from $callerName.',
    'فاتتك مكالمة من $callerName.',
  );

  static String get supportTicketUpdatedTitle =>
      _biTitle('Support Ticket Updated', 'تم تحديث تذكرة الدعم');

  static String supportTicketUpdatedBody(String ticketId) => _biBody(
    'Your support ticket #$ticketId has been updated.',
    'تم تحديث تذكرة الدعم #$ticketId الخاصة بك.',
  );

  static String get permitApprovedTitle =>
      _biTitle('Permit Approved', 'تمت الموافقة على التصريح');

  static String permitApprovedBody(String permitType, String location) =>
      _biBody(
        '$permitType approved for $location.',
        'تمت الموافقة على $permitType لـ $location.',
      );

  static String get permitRejectedTitle =>
      _biTitle('Permit Rejected', 'تم رفض التصريح');

  static String permitRejectedBody(String permitType, String location) =>
      _biBody(
        '$permitType rejected for $location.',
        'تم رفض $permitType لـ $location.',
      );

  // ── Fund Receipt Confirmation ───────────────────────────────────────────────
  static String get transportAdvanceReadyTitle =>
      _biTitle('💰 Transport Advance Disbursed', 'تم صرف سلفة المواصلات');

  static String transportAdvanceReadyBody(
    String amount,
    String siteName,
  ) => _biBody(
    'Your $amount SDG advance for $siteName has been disbursed.\nPlease open the app to confirm receipt.',
    'تم صرف سلفة $amount ج.س لموقع $siteName.\nافتح التطبيق لتأكيد الاستلام.',
  );

  static String get receiptConfirmedTitle =>
      _biTitle('✅ Receipt Confirmed', 'تم تأكيد الاستلام');

  static String receiptConfirmedBody(String siteName) => _biBody(
    'Fund receipt for $siteName has been acknowledged by the enumerator.',
    'تم تأكيد استلام أموال موقع $siteName من قِبل المُعدِّد.',
  );
}
