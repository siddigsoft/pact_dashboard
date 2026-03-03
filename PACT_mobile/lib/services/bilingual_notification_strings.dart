class BilingualNotificationStrings {
  static String get appUpdateAvailableTitle =>
      '🎉 App Update Available | تحديث التطبيق متاح';

  static String appUpdateAvailableBody(String version) =>
      'A new version ($version) is ready. Tap to update!\n'
      'إصدار جديد ($version) جاهز. اضغط للتحديث!';

  static String get downloadingUpdateTitle =>
      'Downloading Update | جاري تحميل التحديث';

  static String get downloadingUpdateBody => 'Please wait...\nيرجى الانتظار...';

  static String get updateInstalledTitle =>
      '✅ Update Installed | تم تثبيت التحديث';

  static String get updateInstalledBody =>
      'Your app is now up to date. Restart to apply.\n'
      'تطبيقك محدث الآن. أعد التشغيل للتطبيق.';

  static String get costSubmissionApprovedTitle =>
      'Cost Submission Approved | تمت الموافقة على التكلفة';

  static String costSubmissionApprovedBody(
    String siteVisitId,
    double amount,
    String currency,
  ) =>
      'Approved for site visit $siteVisitId. Amount: ${amount.toStringAsFixed(2)} $currency\n'
      'تمت الموافقة لزيارة الموقع $siteVisitId. المبلغ: ${amount.toStringAsFixed(2)} $currency';

  static String get costSubmissionRejectedTitle =>
      'Cost Submission Rejected | تم رفض طلب التكلفة';

  static String costSubmissionRejectedBody(String siteVisitId, String reason) =>
      'Rejected for site visit $siteVisitId. Reason: $reason\n'
      'تم الرفض لزيارة الموقع $siteVisitId. السبب: $reason';

  static String get revisionRequestedTitle =>
      'Revision Requested | مطلوب مراجعة';

  static String revisionRequestedBody(String siteVisitId, String notes) =>
      'Site visit $siteVisitId needs revision. Notes: $notes\n'
      'زيارة الموقع $siteVisitId تحتاج مراجعة. الملاحظات: $notes';

  static String get offlineSyncCompletedTitle =>
      'Offline Sync Completed | اكتمل المزامنة';

  static String offlineSyncCompletedBody(int count) =>
      '$count submission(s) synchronized successfully.\n'
      'تم مزامنة $count طلب(ات) بنجاح.';

  static String get budgetAlertTitle => 'Budget Alert | تنبيه الميزانية';

  static String budgetAlertBody(
    String siteVisitId,
    double remaining,
    String currency,
  ) =>
      'Remaining budget for $siteVisitId: ${remaining.toStringAsFixed(2)} $currency\n'
      'الميزانية المتبقية لـ $siteVisitId: ${remaining.toStringAsFixed(2)} $currency';

  static String get newChatMessageTitle => 'New Message | رسالة جديدة';

  static String get mmpFileUploadedTitle =>
      'MMP File Uploaded | تم رفع ملف MMP';

  static String get signatureVerifiedTitle =>
      'Signature Verified | تم التحقق من التوقيع';

  static String get signatureVerifiedBody =>
      'Your signature has been verified by admin.\n'
      'تم التحقق من توقيعك من قبل المسؤول.';

  static String get signatureRejectedTitle =>
      'Signature Rejected | تم رفض التوقيع';

  static String get signatureRejectedBody =>
      'Your signature was rejected. Please submit a new one.\n'
      'تم رفض توقيعك. يرجى تقديم توقيع جديد.';

  static String get siteVisitAssignedTitle =>
      'Site Visit Assigned | تم تعيين زيارة موقع';

  static String siteVisitAssignedBody(String siteName) =>
      'You have been assigned to visit: $siteName\n'
      'تم تعيينك لزيارة: $siteName';

  static String get siteVisitCompletedTitle =>
      'Site Visit Completed | اكتملت زيارة الموقع';

  static String siteVisitCompletedBody(String siteName) =>
      'Your visit to $siteName has been recorded.\n'
      'تم تسجيل زيارتك لـ $siteName.';

  static String get paymentReceivedTitle =>
      'Payment Received | تم استلام الدفعة';

  static String paymentReceivedBody(double amount, String currency) =>
      'You received ${amount.toStringAsFixed(2)} $currency.\n'
      'استلمت ${amount.toStringAsFixed(2)} $currency.';

  static String get walletUpdatedTitle => 'Wallet Updated | تم تحديث المحفظة';

  static String walletUpdatedBody(double balance, String currency) =>
      'New balance: ${balance.toStringAsFixed(2)} $currency\n'
      'الرصيد الجديد: ${balance.toStringAsFixed(2)} $currency';

  static String get approvalRequiredTitle => 'Approval Required | مطلوب موافقة';

  static String approvalRequiredBody(String itemType) =>
      'A $itemType requires your approval.\n'
      'يتطلب $itemType موافقتك.';

  static String get documentReadyTitle => 'Document Ready | المستند جاهز';

  static String documentReadyBody(String docName) =>
      '$docName is ready for download.\n'
      '$docName جاهز للتحميل.';

  static String get reminderTitle => 'Reminder | تذكير';

  static String get incomingCallTitle => 'Incoming Call | مكالمة واردة';

  static String incomingCallBody(String callerName) =>
      '$callerName is calling you.\n'
      '$callerName يتصل بك.';

  static String get missedCallTitle => 'Missed Call | مكالمة فائتة';

  static String missedCallBody(String callerName) =>
      'You missed a call from $callerName.\n'
      'فاتتك مكالمة من $callerName.';

  static String get supportTicketUpdatedTitle =>
      'Support Ticket Updated | تم تحديث تذكرة الدعم';

  static String supportTicketUpdatedBody(String ticketId) =>
      'Your support ticket #$ticketId has been updated.\n'
      'تم تحديث تذكرة الدعم #$ticketId الخاصة بك.';

  static String get permitApprovedTitle =>
      'Permit Approved | تمت الموافقة على التصريح';

  static String permitApprovedBody(String permitType, String location) =>
      '$permitType approved for $location.\n'
      'تمت الموافقة على $permitType لـ $location.';

  static String get permitRejectedTitle => 'Permit Rejected | تم رفض التصريح';

  static String permitRejectedBody(String permitType, String location) =>
      '$permitType rejected for $location.\n'
      'تم رفض $permitType لـ $location.';

  // ── Fund Receipt Confirmation ───────────────────────────────────────────────
  static String get transportAdvanceReadyTitle =>
      '💰 Transport Advance Disbursed | تم صرف سلفة المواصلات';

  static String transportAdvanceReadyBody(String amount, String siteName) =>
      'Your $amount SDG advance for $siteName has been disbursed.\n'
      'تم صرف سلفة $amount ج.س لموقع $siteName.\n'
      'Please open the app to confirm receipt. | افتح التطبيق لتأكيد الاستلام.';

  static String get receiptConfirmedTitle =>
      '✅ Receipt Confirmed | تم تأكيد الاستلام';

  static String receiptConfirmedBody(String siteName) =>
      'Fund receipt for $siteName has been acknowledged by the enumerator.\n'
      'تم تأكيد استلام أموال موقع $siteName من قِبل المُعدِّد.';
}
