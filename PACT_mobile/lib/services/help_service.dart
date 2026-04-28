import '../models/help_models.dart';

class HelpService {
  /// Common error messages with solutions - Fully bilingual
  static final Map<String, ErrorMessage> commonErrors = {
    'session_expired': ErrorMessage(
      error: 'Session Expired',
      errorAr: 'انتهت صلاحية الجلسة',
      meaning: 'Your login session has timed out for security reasons',
      meaningAr: 'انتهت جلسة تسجيل الدخول الخاصة بك لأسباب أمنية',
      solution: 'Please log in again to continue using the app',
      solutionAr: 'يرجى تسجيل الدخول مرة أخرى للمتابعة',
    ),
    'permission_denied': ErrorMessage(
      error: 'Permission Denied',
      errorAr: 'تم رفض الإذن',
      meaning: 'You do not have permission to access this resource',
      meaningAr: 'ليس لديك إذن للوصول إلى هذا المورد',
      solution:
          'Contact your administrator to request the necessary permissions',
      solutionAr: 'تواصل مع المسؤول لطلب الأذونات اللازمة',
    ),
    'network_error': ErrorMessage(
      error: 'Network Error',
      errorAr: 'خطأ في الشبكة',
      meaning: 'Cannot connect to the server',
      meaningAr: 'لا يمكن الاتصال بالخادم',
      solution:
          'Check your internet connection and try again. If offline, your data will sync when connection is restored',
      solutionAr:
          'تحقق من اتصالك بالإنترنت وحاول مرة أخرى. إذا كنت غير متصل، ستتم مزامنة بياناتك عند استعادة الاتصال',
    ),
    'validation_failed': ErrorMessage(
      error: 'Validation Failed',
      errorAr: 'فشل التحقق',
      meaning: 'The data you entered does not meet the required format',
      meaningAr: 'البيانات التي أدخلتها لا تتوافق مع التنسيق المطلوب',
      solution:
          'Review the error messages on each field and correct the invalid data',
      solutionAr: 'راجع رسائل الخطأ في كل حقل وصحح البيانات غير الصالحة',
    ),
    'server_error': ErrorMessage(
      error: 'Server Error',
      errorAr: 'خطأ في الخادم',
      meaning: 'An error occurred on the server while processing your request',
      meaningAr: 'حدث خطأ في الخادم أثناء معالجة طلبك',
      solution:
          'Try again in a few moments. If the problem persists, contact support',
      solutionAr: 'حاول مرة أخرى بعد لحظات. إذا استمرت المشكلة، تواصل مع الدعم',
    ),
    'duplicate_site': ErrorMessage(
      error: 'Duplicate Site',
      errorAr: 'موقع مكرر',
      meaning: 'A site with this location or name already exists',
      meaningAr: 'يوجد موقع بهذا الاسم أو الموقع الجغرافي بالفعل',
      solution: 'Check existing sites or choose a different location/name',
      solutionAr: 'تحقق من المواقع الحالية أو اختر موقعاً/اسماً مختلفاً',
    ),
    'location_disabled': ErrorMessage(
      error: 'Location Services Disabled',
      errorAr: 'خدمات الموقع معطلة',
      meaning: 'GPS location services are turned off on your device',
      meaningAr: 'خدمات تحديد الموقع GPS معطلة على جهازك',
      solution: 'Enable location services in your device settings to continue',
      solutionAr: 'قم بتفعيل خدمات الموقع في إعدادات جهازك للمتابعة',
    ),
    'low_gps_accuracy': ErrorMessage(
      error: 'Low GPS Accuracy',
      errorAr: 'دقة GPS منخفضة',
      meaning: 'Your current GPS accuracy is below the required 5 meters',
      meaningAr: 'دقة GPS الحالية أقل من الـ 5 أمتار المطلوبة',
      solution:
          'Move to an area with clear sky view. Avoid indoor locations and tall buildings',
      solutionAr:
          'انتقل إلى منطقة مفتوحة بدون عوائق. تجنب الأماكن الداخلية والمباني العالية',
    ),
    'storage_full': ErrorMessage(
      error: 'Storage Full',
      errorAr: 'التخزين ممتلئ',
      meaning: 'Your device storage is full',
      meaningAr: 'مساحة تخزين جهازك ممتلئة',
      solution:
          'Free up space by deleting unused apps or files, then try again',
      solutionAr:
          'قم بتحرير مساحة بحذف التطبيقات أو الملفات غير المستخدمة، ثم حاول مرة أخرى',
    ),
    'file_too_large': ErrorMessage(
      error: 'File Too Large',
      errorAr: 'الملف كبير جداً',
      meaning: 'The file you are trying to upload exceeds the size limit',
      meaningAr: 'الملف الذي تحاول رفعه يتجاوز الحد المسموح به',
      solution: 'Compress the file or choose a smaller file (max 5MB per file)',
      solutionAr:
          'قم بضغط الملف أو اختر ملفاً أصغر (الحد الأقصى 5 ميجابايت لكل ملف)',
    ),
    'unsupported_file': ErrorMessage(
      error: 'Unsupported File Type',
      errorAr: 'نوع ملف غير مدعوم',
      meaning: 'The file format is not supported',
      meaningAr: 'تنسيق الملف غير مدعوم',
      solution: 'Use PDF, JPG, or PNG files only',
      solutionAr: 'استخدم ملفات PDF أو JPG أو PNG فقط',
    ),
    'sync_failed': ErrorMessage(
      error: 'Sync Failed',
      errorAr: 'فشلت المزامنة',
      meaning: 'Unable to synchronize your local data with the server',
      meaningAr: 'تعذرت مزامنة بياناتك المحلية مع الخادم',
      solution:
          'Check your internet connection. Your data is saved locally and will sync automatically when connection is restored',
      solutionAr:
          'تحقق من اتصالك بالإنترنت. بياناتك محفوظة محلياً وستتم مزامنتها تلقائياً عند استعادة الاتصال',
    ),
    'draft_not_found': ErrorMessage(
      error: 'Draft Not Found',
      errorAr: 'المسودة غير موجودة',
      meaning: 'The saved draft could not be loaded',
      meaningAr: 'تعذر تحميل المسودة المحفوظة',
      solution:
          'The draft may have been corrupted. Check your offline queue or create a new entry',
      solutionAr:
          'قد تكون المسودة تالفة. تحقق من قائمة الانتظار غير المتصلة أو أنشئ إدخالاً جديداً',
    ),
    'submission_queued': ErrorMessage(
      error: 'Submission Queued',
      errorAr: 'الإرسال في قائمة الانتظار',
      meaning: 'Your submission is waiting to be sent (offline mode)',
      meaningAr: 'إرسالك في انتظار الإرسال (وضع عدم الاتصال)',
      solution:
          'This is not an error. Your data will be submitted automatically when internet is available',
      solutionAr: 'هذا ليس خطأ. ستُرسل بياناتك تلقائياً عند توفر الإنترنت',
    ),
    'biometric_failed': ErrorMessage(
      error: 'Biometric Authentication Failed',
      errorAr: 'فشل التحقق البيومتري',
      meaning: 'Fingerprint or face recognition was not recognized',
      meaningAr: 'لم يتم التعرف على بصمة الإصبع أو الوجه',
      solution:
          'Try again or use your password. Ensure finger is clean and properly placed. You may need to re-register biometrics in device settings',
      solutionAr:
          'حاول مرة أخرى أو استخدم كلمة المرور. تأكد من نظافة الإصبع ووضعه بشكل صحيح. قد تحتاج إلى إعادة تسجيل البيومترية في إعدادات الجهاز',
    ),
    'call_failed': ErrorMessage(
      error: 'Call Failed',
      errorAr: 'فشلت المكالمة',
      meaning: 'Unable to connect the voice or video call',
      meaningAr: 'تعذر الاتصال بالمكالمة الصوتية أو المرئية',
      solution:
          'Check your internet connection. Ensure microphone/camera permissions are granted. Try calling again',
      solutionAr:
          'تحقق من اتصالك بالإنترنت. تأكد من منح أذونات الميكروفون/الكاميرا. حاول الاتصال مرة أخرى',
    ),
    'chat_message_failed': ErrorMessage(
      error: 'Message Not Sent',
      errorAr: 'لم يتم إرسال الرسالة',
      meaning: 'Your chat message could not be delivered',
      meaningAr: 'تعذر تسليم رسالتك',
      solution:
          'Check your internet connection and try sending again. Messages require an active connection',
      solutionAr:
          'تحقق من اتصالك بالإنترنت وحاول الإرسال مرة أخرى. الرسائل تتطلب اتصالاً نشطاً',
    ),
  };

  /// Help categories with articles - Fully bilingual
  static final List<HelpCategory> helpCategories = [
    HelpCategory(
      id: 'getting_started',
      title: 'Getting Started',
      titleAr: 'البداية',
      description: 'Learn the basics of using PACT Mobile',
      descriptionAr: 'تعلم أساسيات استخدام تطبيق PACT للجوال',
      articles: [
        HelpArticle(
          id: 'login',
          title: 'How to Login',
          titleAr: 'كيفية تسجيل الدخول',
          content: '''
1. Open the PACT Mobile app
2. Enter your email address
3. Enter your password
4. Tap "Login"
5. If you have biometric authentication enabled, you can use fingerprint or face recognition

For first-time users, check your email for login credentials from your administrator.
''',
          contentAr: '''
1. افتح تطبيق PACT للجوال
2. أدخل عنوان بريدك الإلكتروني
3. أدخل كلمة المرور
4. اضغط على "تسجيل الدخول"
5. إذا كان لديك التحقق البيومتري مفعلاً، يمكنك استخدام بصمة الإصبع أو التعرف على الوجه

للمستخدمين الجدد، تحقق من بريدك الإلكتروني للحصول على بيانات تسجيل الدخول من المسؤول.
''',
          tags: ['login', 'authentication', 'getting started'],
        ),
        HelpArticle(
          id: 'first_setup',
          title: 'First-Time Setup',
          titleAr: 'الإعداد لأول مرة',
          content: '''
After your first login:

1. Update Your Profile
   - Go to Settings > Profile
   - Add your phone number
   - Upload a profile photo (optional)

2. Enable Location Services
   - Allow the app to access your location
   - Required for site visits and mapping

3. Enable Notifications
   - Stay informed about assignments and updates
   - Configure notification preferences in Settings

4. Enable Biometric Login (Optional)
   - Go to Settings > Security
   - Enable fingerprint or face recognition
   - Provides quick and secure access
''',
          contentAr: '''
بعد تسجيل الدخول لأول مرة:

1. تحديث ملفك الشخصي
   - اذهب إلى الإعدادات > الملف الشخصي
   - أضف رقم هاتفك
   - ارفع صورة شخصية (اختياري)

2. تفعيل خدمات الموقع
   - اسمح للتطبيق بالوصول إلى موقعك
   - مطلوب للزيارات الميدانية والخرائط

3. تفعيل الإشعارات
   - ابقَ على اطلاع بالمهام والتحديثات
   - اضبط تفضيلات الإشعارات في الإعدادات

4. تفعيل تسجيل الدخول البيومتري (اختياري)
   - اذهب إلى الإعدادات > الأمان
   - فعّل بصمة الإصبع أو التعرف على الوجه
   - يوفر وصولاً سريعاً وآمناً
''',
          tags: ['setup', 'profile', 'getting started'],
        ),
        HelpArticle(
          id: 'navigation',
          title: 'Navigating the App',
          titleAr: 'التنقل في التطبيق',
          content: '''
The app has 5 main sections:

1. Home - Dashboard with quick stats and recent activity
2. Field Operations - Site visits, surveys, and data collection
3. Wallet - Financial management and cost submissions
4. Reports - View and generate reports
5. Profile - Settings and account management

Use the bottom navigation bar to switch between sections.
Pull down on most screens to refresh data.
''',
          contentAr: '''
يحتوي التطبيق على 5 أقسام رئيسية:

1. الرئيسية - لوحة المعلومات مع الإحصائيات السريعة والنشاط الأخير
2. العمليات الميدانية - الزيارات الميدانية والاستبيانات وجمع البيانات
3. المحفظة - الإدارة المالية وتقديم التكاليف
4. التقارير - عرض وإنشاء التقارير
5. الملف الشخصي - الإعدادات وإدارة الحساب

استخدم شريط التنقل السفلي للتبديل بين الأقسام.
اسحب للأسفل في معظم الشاشات لتحديث البيانات.
''',
          tags: ['navigation', 'getting started'],
        ),
      ],
    ),
    HelpCategory(
      id: 'troubleshooting',
      title: 'Troubleshooting',
      titleAr: 'استكشاف الأخطاء وإصلاحها',
      description: 'Common issues and solutions',
      descriptionAr: 'المشاكل الشائعة وحلولها',
      articles: [
        HelpArticle(
          id: 'cannot_login',
          title: 'Cannot Login',
          titleAr: 'لا يمكن تسجيل الدخول',
          content: '''
If you cannot log in, try these steps:

1. Check Your Credentials
   - Verify email address spelling
   - Ensure password is correct (case-sensitive)
   - Check for extra spaces

2. Reset Password
   - Tap "Forgot Password?" on login screen
   - Enter your email
   - Check your email for reset link
   - Follow instructions to create new password

3. Check Internet Connection
   - Ensure you have active internet
   - Try switching between Wi-Fi and mobile data

4. Clear App Cache
   - Go to device Settings > Apps > PACT Mobile
   - Tap "Clear Cache" (not "Clear Data")
   - Restart app
''',
          contentAr: '''
إذا لم تتمكن من تسجيل الدخول، جرب هذه الخطوات:

1. تحقق من بياناتك
   - تأكد من صحة عنوان البريد الإلكتروني
   - تأكد من صحة كلمة المرور (حساسة لحالة الأحرف)
   - تحقق من عدم وجود مسافات إضافية

2. إعادة تعيين كلمة المرور
   - اضغط على "نسيت كلمة المرور؟" في شاشة تسجيل الدخول
   - أدخل بريدك الإلكتروني
   - تحقق من بريدك للحصول على رابط إعادة التعيين
   - اتبع التعليمات لإنشاء كلمة مرور جديدة

3. تحقق من اتصال الإنترنت
   - تأكد من وجود اتصال إنترنت نشط
   - جرب التبديل بين Wi-Fi وبيانات الجوال

4. مسح ذاكرة التخزين المؤقت
   - اذهب إلى إعدادات الجهاز > التطبيقات > PACT Mobile
   - اضغط على "مسح ذاكرة التخزين المؤقت" (وليس "مسح البيانات")
   - أعد تشغيل التطبيق
''',
          solution: 'If still unable to login, contact your administrator',
          solutionAr:
              'إذا كنت لا تزال غير قادر على تسجيل الدخول، تواصل مع المسؤول',
          tags: ['login', 'troubleshooting', 'password'],
        ),
        HelpArticle(
          id: 'location_not_working',
          title: 'Location Not Working',
          titleAr: 'الموقع لا يعمل',
          content: '''
If GPS location is not working:

1. Enable Location Services
   - Android: Settings > Location > Turn on
   - iOS: Settings > Privacy > Location Services > PACT Mobile > While Using

2. Improve GPS Accuracy
   - Move to an open area with clear sky view
   - Avoid indoor locations
   - Stay away from tall buildings
   - Wait 30 seconds for GPS to stabilize

3. Check GPS Accuracy
   - The app requires 5 meters accuracy
   - Current accuracy is shown when creating sites
   - Red text means accuracy is insufficient

4. Restart Location Services
   - Turn off location in device settings
   - Wait 10 seconds
   - Turn location back on
   - Restart the app
''',
          contentAr: '''
إذا كان موقع GPS لا يعمل:

1. تفعيل خدمات الموقع
   - أندرويد: الإعدادات > الموقع > تشغيل
   - iOS: الإعدادات > الخصوصية > خدمات الموقع > PACT Mobile > أثناء الاستخدام

2. تحسين دقة GPS
   - انتقل إلى منطقة مفتوحة برؤية واضحة للسماء
   - تجنب الأماكن الداخلية
   - ابتعد عن المباني العالية
   - انتظر 30 ثانية حتى يستقر GPS

3. التحقق من دقة GPS
   - يتطلب التطبيق دقة 5 أمتار
   - الدقة الحالية تظهر عند إنشاء المواقع
   - النص الأحمر يعني أن الدقة غير كافية

4. إعادة تشغيل خدمات الموقع
   - أوقف تشغيل الموقع في إعدادات الجهاز
   - انتظر 10 ثوانٍ
   - أعد تشغيل الموقع
   - أعد تشغيل التطبيق
''',
          solution:
              'If GPS continues to have issues, your device may have hardware problems. Contact support.',
          solutionAr:
              'إذا استمرت مشاكل GPS، قد يكون لدى جهازك مشاكل في الأجهزة. تواصل مع الدعم.',
          tags: ['gps', 'location', 'troubleshooting'],
        ),
        HelpArticle(
          id: 'data_not_syncing',
          title: 'Data Not Syncing',
          titleAr: 'البيانات لا تتزامن',
          content: '''
If your data is not syncing with the server:

1. Check Internet Connection
   - Ensure you have active internet
   - Try opening a web browser to verify

2. Manual Sync
   - Go to Settings > Data Sync
   - Tap "Sync Now"
   - Wait for sync to complete

3. Check Sync Status
   - Look for sync icon in the app bar
   - Green checkmark = synced
   - Orange arrow = syncing
   - Red X = sync failed

4. Review Pending Changes
   - Settings > Data Sync > View Pending
   - Shows items waiting to sync

Don't worry - your data is saved locally and will automatically sync when connection is restored.
''',
          contentAr: '''
إذا كانت بياناتك لا تتزامن مع الخادم:

1. تحقق من اتصال الإنترنت
   - تأكد من وجود اتصال إنترنت نشط
   - جرب فتح متصفح ويب للتحقق

2. المزامنة اليدوية
   - اذهب إلى الإعدادات > مزامنة البيانات
   - اضغط على "مزامنة الآن"
   - انتظر حتى تكتمل المزامنة

3. التحقق من حالة المزامنة
   - ابحث عن أيقونة المزامنة في شريط التطبيق
   - علامة خضراء = متزامن
   - سهم برتقالي = جاري المزامنة
   - X أحمر = فشلت المزامنة

4. مراجعة التغييرات المعلقة
   - الإعدادات > مزامنة البيانات > عرض المعلقة
   - تظهر العناصر في انتظار المزامنة

لا تقلق - بياناتك محفوظة محلياً وستتم مزامنتها تلقائياً عند استعادة الاتصال.
''',
          tags: ['sync', 'offline', 'troubleshooting'],
        ),
        HelpArticle(
          id: 'app_crashing',
          title: 'App Keeps Crashing',
          titleAr: 'التطبيق يتعطل باستمرار',
          content: '''
If the app crashes frequently:

1. Update the App
   - Check for updates in Play Store/App Store
   - Install latest version

2. Clear Cache
   - Device Settings > Apps > PACT Mobile
   - Clear Cache (NOT Clear Data)

3. Free Up Storage
   - Ensure device has at least 500MB free
   - Delete unused apps or files

4. Restart Device
   - Power off completely
   - Wait 30 seconds
   - Power back on

5. Reinstall App (Last Resort)
   - Ensure data is synced first
   - Uninstall app
   - Download from store
   - Login again
''',
          contentAr: '''
إذا كان التطبيق يتعطل باستمرار:

1. تحديث التطبيق
   - تحقق من التحديثات في متجر Play/App Store
   - ثبّت أحدث إصدار

2. مسح ذاكرة التخزين المؤقت
   - إعدادات الجهاز > التطبيقات > PACT Mobile
   - مسح ذاكرة التخزين المؤقت (وليس مسح البيانات)

3. تحرير مساحة التخزين
   - تأكد من وجود 500 ميجابايت على الأقل متاحة
   - احذف التطبيقات أو الملفات غير المستخدمة

4. إعادة تشغيل الجهاز
   - أوقف التشغيل بالكامل
   - انتظر 30 ثانية
   - أعد التشغيل

5. إعادة تثبيت التطبيق (كحل أخير)
   - تأكد من مزامنة البيانات أولاً
   - أزل التطبيق
   - حمّله من المتجر
   - سجل الدخول مرة أخرى
''',
          solution: 'If crashes persist, report the issue with crash details',
          solutionAr: 'إذا استمر التعطل، أبلغ عن المشكلة مع تفاصيل التعطل',
          tags: ['crash', 'troubleshooting', 'performance'],
        ),
      ],
    ),
    HelpCategory(
      id: 'field_operations',
      title: 'Field Operations',
      titleAr: 'العمليات الميدانية',
      description: 'Working with sites, surveys, and assignments',
      descriptionAr: 'العمل مع المواقع والاستبيانات والمهام',
      articles: [
        HelpArticle(
          id: 'create_site',
          title: 'How to Create a Site',
          titleAr: 'كيفية إنشاء موقع',
          content: '''
Creating a new site:

1. Go to Field Operations > Sites
2. Tap the "+" button
3. Select assignment from dropdown
4. Enter site details:
   - Site name (required)
   - Site code (auto-generated or custom)
   - Village/community name
   - GPS coordinates (auto-captured)
5. Upload site photos (optional)
6. Tap "Create Site"

Requirements:
- GPS accuracy must be under 5 meters
- Must have an active assignment
- Site name must be unique within assignment
''',
          contentAr: '''
إنشاء موقع جديد:

1. اذهب إلى العمليات الميدانية > المواقع
2. اضغط على زر "+"
3. اختر المهمة من القائمة المنسدلة
4. أدخل تفاصيل الموقع:
   - اسم الموقع (مطلوب)
   - رمز الموقع (يُنشأ تلقائياً أو مخصص)
   - اسم القرية/المجتمع
   - إحداثيات GPS (تُلتقط تلقائياً)
5. ارفع صور الموقع (اختياري)
6. اضغط على "إنشاء موقع"

المتطلبات:
- دقة GPS يجب أن تكون أقل من 5 أمتار
- يجب أن يكون لديك مهمة نشطة
- اسم الموقع يجب أن يكون فريداً ضمن المهمة
''',
          tags: ['site', 'field operations', 'gps'],
        ),
        HelpArticle(
          id: 'submit_survey',
          title: 'How to Submit a Survey',
          titleAr: 'كيفية تقديم استبيان',
          content: '''
Completing and submitting surveys:

1. Go to Field Operations > Surveys
2. Select a survey from your assignments
3. Navigate through survey sections
4. Answer all required questions (marked with *)
5. Add photos where requested
6. Review your answers
7. Tap "Submit Survey"

Tips:
- Save as draft to continue later
- Can work offline - submits when online
- Cannot edit after submission
- Review carefully before submitting
''',
          contentAr: '''
إكمال وتقديم الاستبيانات:

1. اذهب إلى العمليات الميدانية > الاستبيانات
2. اختر استبياناً من مهامك
3. تنقل عبر أقسام الاستبيان
4. أجب على جميع الأسئلة المطلوبة (مميزة بـ *)
5. أضف الصور حيث طُلب
6. راجع إجاباتك
7. اضغط على "تقديم الاستبيان"

نصائح:
- احفظ كمسودة للمتابعة لاحقاً
- يمكنك العمل بدون اتصال - يُقدّم عند الاتصال
- لا يمكن التعديل بعد التقديم
- راجع بعناية قبل التقديم
''',
          tags: ['survey', 'field operations', 'data collection'],
        ),
        HelpArticle(
          id: 'offline_work',
          title: 'Working Offline',
          titleAr: 'العمل بدون اتصال',
          content: '''
The app supports offline data collection:

What Works Offline:
- Create sites
- Complete surveys
- Take photos
- Record GPS coordinates
- View existing data
- Save work as draft

What Syncs Later:
- All offline data syncs automatically when connection restored
- Check Settings > Data Sync to see pending items
- Orange cloud icon shows items waiting to sync

Best Practices:
- Sync before going to field
- Keep app open while syncing
- Don't uninstall app with pending data
- Ensure sufficient device storage
''',
          contentAr: '''
يدعم التطبيق جمع البيانات بدون اتصال:

ما يعمل بدون اتصال:
- إنشاء المواقع
- إكمال الاستبيانات
- التقاط الصور
- تسجيل إحداثيات GPS
- عرض البيانات الموجودة
- حفظ العمل كمسودة

ما يتزامن لاحقاً:
- جميع البيانات غير المتصلة تتزامن تلقائياً عند استعادة الاتصال
- تحقق من الإعدادات > مزامنة البيانات لرؤية العناصر المعلقة
- أيقونة السحابة البرتقالية تظهر العناصر في انتظار المزامنة

أفضل الممارسات:
- تزامن قبل الذهاب إلى الميدان
- أبقِ التطبيق مفتوحاً أثناء المزامنة
- لا تزل التطبيق مع وجود بيانات معلقة
- تأكد من كفاية مساحة تخزين الجهاز
''',
          tags: ['offline', 'sync', 'field operations'],
        ),
        HelpArticle(
          id: 'site_visits',
          title: 'Recording Site Visits',
          titleAr: 'تسجيل الزيارات الميدانية',
          content: '''
How to record a site visit:

1. Go to Field Operations > Site Visit Hub
2. Select a site from your assignments
3. Tap "Start Visit" or "Continue Visit"
4. Fill in required information:
   - MMP Code
   - Household details
   - Equipment readings
   - Safety assessment
   - Photos/evidence
5. Choose action:
   - "Save as Draft" - Save locally for later
   - "Complete" - Submit for processing

Tips:
- GPS is captured automatically
- Take clear photos of equipment
- Answer all required fields (marked with *)
- Review before completing
''',
          contentAr: '''
كيفية تسجيل زيارة ميدانية:

1. اذهب إلى العمليات الميدانية > مركز الزيارات الميدانية
2. اختر موقعاً من مهامك
3. اضغط على "بدء الزيارة" أو "متابعة الزيارة"
4. املأ المعلومات المطلوبة:
   - رمز MMP
   - تفاصيل الأسرة
   - قراءات المعدات
   - تقييم السلامة
   - الصور/الأدلة
5. اختر الإجراء:
   - "حفظ كمسودة" - حفظ محلياً للاحقاً
   - "إكمال" - تقديم للمعالجة

نصائح:
- يُلتقط GPS تلقائياً
- التقط صوراً واضحة للمعدات
- أجب على جميع الحقول المطلوبة (مميزة بـ *)
- راجع قبل الإكمال
''',
          tags: ['site visit', 'mmp', 'field operations'],
        ),
      ],
    ),
    HelpCategory(
      id: 'cost_submissions',
      title: 'Cost Submissions',
      titleAr: 'تقديم التكاليف',
      description: 'Submit and track expense reimbursements',
      descriptionAr: 'تقديم وتتبع استرداد النفقات',
      articles: [
        HelpArticle(
          id: 'submit_costs',
          title: 'How to Submit Costs',
          titleAr: 'كيفية تقديم التكاليف',
          content: '''
Submitting expense reimbursements:

1. Go to Wallet > Cost Submissions
2. Tap "Submit New Costs"
3. Enter cost details:
   - Transportation costs
   - Accommodation costs
   - Meals and per diem
   - Other expenses
4. Add descriptions for each category
5. Upload supporting documents (receipts, invoices)
6. Review total amount
7. Tap "Submit"

Requirements:
- Must have supporting documents
- All amounts in correct currency
- Detailed descriptions required
- Max 10 documents (5MB each)
''',
          contentAr: '''
تقديم استرداد النفقات:

1. اذهب إلى المحفظة > تقديم التكاليف
2. اضغط على "تقديم تكاليف جديدة"
3. أدخل تفاصيل التكاليف:
   - تكاليف النقل
   - تكاليف الإقامة
   - الوجبات والبدل اليومي
   - نفقات أخرى
4. أضف وصفاً لكل فئة
5. ارفع المستندات الداعمة (الإيصالات، الفواتير)
6. راجع المبلغ الإجمالي
7. اضغط على "تقديم"

المتطلبات:
- يجب وجود مستندات داعمة
- جميع المبالغ بالعملة الصحيحة
- الأوصاف التفصيلية مطلوبة
- الحد الأقصى 10 مستندات (5 ميجابايت لكل منها)
''',
          tags: ['costs', 'expenses', 'reimbursement', 'wallet'],
        ),
        HelpArticle(
          id: 'track_costs',
          title: 'Track Your Submissions',
          titleAr: 'تتبع تقديماتك',
          content: '''
Monitoring your cost submissions:

Status meanings:
- Pending: Submitted, awaiting review
- Under Review: Being reviewed by finance team
- Approved: Approved, payment being processed
- Paid: Payment completed
- Rejected: Not approved (see comments)
- Cancelled: Cancelled by you

View details:
- Tap any submission to see full details
- View cost breakdown
- Download supporting documents
- See reviewer comments
''',
          contentAr: '''
مراقبة تقديمات التكاليف الخاصة بك:

معاني الحالات:
- معلق: تم التقديم، في انتظار المراجعة
- قيد المراجعة: يتم مراجعته من قبل فريق المالية
- موافق عليه: تمت الموافقة، جاري معالجة الدفع
- مدفوع: تم إكمال الدفع
- مرفوض: لم تتم الموافقة (انظر التعليقات)
- ملغى: تم إلغاؤه من قبلك

عرض التفاصيل:
- اضغط على أي تقديم لرؤية التفاصيل الكاملة
- عرض تفصيل التكاليف
- تحميل المستندات الداعمة
- رؤية تعليقات المراجع
''',
          tags: ['costs', 'status', 'wallet'],
        ),
      ],
    ),
    HelpCategory(
      id: 'settings',
      title: 'Settings & Account',
      titleAr: 'الإعدادات والحساب',
      description: 'Manage your account and preferences',
      descriptionAr: 'إدارة حسابك وتفضيلاتك',
      articles: [
        HelpArticle(
          id: 'change_password',
          title: 'Change Your Password',
          titleAr: 'تغيير كلمة المرور',
          content: '''
Updating your password:

1. Go to Profile > Settings > Security
2. Tap "Change Password"
3. Enter current password
4. Enter new password (must meet requirements)
5. Confirm new password
6. Tap "Update Password"

Password Requirements:
- At least 8 characters
- Mix of uppercase and lowercase
- At least one number
- At least one special character
''',
          contentAr: '''
تحديث كلمة المرور:

1. اذهب إلى الملف الشخصي > الإعدادات > الأمان
2. اضغط على "تغيير كلمة المرور"
3. أدخل كلمة المرور الحالية
4. أدخل كلمة المرور الجديدة (يجب أن تستوفي المتطلبات)
5. أكد كلمة المرور الجديدة
6. اضغط على "تحديث كلمة المرور"

متطلبات كلمة المرور:
- 8 أحرف على الأقل
- مزيج من الأحرف الكبيرة والصغيرة
- رقم واحد على الأقل
- حرف خاص واحد على الأقل
''',
          tags: ['password', 'security', 'settings'],
        ),
        HelpArticle(
          id: 'enable_biometric',
          title: 'Enable Biometric Authentication',
          titleAr: 'تفعيل التحقق البيومتري',
          content: '''
Setting up fingerprint or face recognition:

1. Go to Profile > Settings > Security
2. Tap "Biometric Authentication"
3. Follow device prompts to scan fingerprint/face
4. Create backup PIN (required)
5. Confirm setup

Benefits:
- Quick login without typing password
- More secure than password alone
- Works offline

Note: Device must support biometric authentication
''',
          contentAr: '''
إعداد بصمة الإصبع أو التعرف على الوجه:

1. اذهب إلى الملف الشخصي > الإعدادات > الأمان
2. اضغط على "التحقق البيومتري"
3. اتبع تعليمات الجهاز لمسح بصمة الإصبع/الوجه
4. أنشئ رمز PIN احتياطي (مطلوب)
5. أكد الإعداد

الفوائد:
- تسجيل دخول سريع بدون كتابة كلمة المرور
- أكثر أماناً من كلمة المرور وحدها
- يعمل بدون اتصال

ملاحظة: يجب أن يدعم الجهاز التحقق البيومتري
''',
          tags: ['biometric', 'security', 'settings'],
        ),
        HelpArticle(
          id: 'notification_settings',
          title: 'Manage Notifications',
          titleAr: 'إدارة الإشعارات',
          content: '''
Customize notification preferences:

1. Go to Profile > Settings > Notifications
2. Toggle notification types:
   - New assignments
   - Survey reminders
   - Payment notifications
   - System updates
3. Set quiet hours (optional)
4. Choose notification sound

Notification Types:
- Push: Real-time alerts
- In-app: Within app only
- Email: Email notifications
''',
          contentAr: '''
تخصيص تفضيلات الإشعارات:

1. اذهب إلى الملف الشخصي > الإعدادات > الإشعارات
2. تفعيل/إيقاف أنواع الإشعارات:
   - المهام الجديدة
   - تذكيرات الاستبيانات
   - إشعارات الدفع
   - تحديثات النظام
3. تعيين ساعات الهدوء (اختياري)
4. اختيار صوت الإشعار

أنواع الإشعارات:
- الفورية: تنبيهات في الوقت الفعلي
- داخل التطبيق: داخل التطبيق فقط
- البريد الإلكتروني: إشعارات البريد الإلكتروني
''',
          tags: ['notifications', 'settings'],
        ),
      ],
    ),
    HelpCategory(
      id: 'communication',
      title: 'Communication',
      titleAr: 'التواصل',
      description: 'Chat, calls, and messaging features',
      descriptionAr: 'المحادثة والمكالمات وميزات المراسلة',
      articles: [
        HelpArticle(
          id: 'using_chat',
          title: 'Using the Chat Feature',
          titleAr: 'استخدام ميزة المحادثة',
          content: '''
Communicating with team members:

1. Go to Chat from the bottom navigation
2. View your conversations
3. Tap a conversation to open it
4. Type your message and tap send

Features:
- Real-time messaging
- Messages appear in chronological order
- New messages appear at bottom
- Unread message indicators
- Group and individual chats
- Image and document attachments

Tips:
- Pull down to refresh messages
- Messages sync automatically
- Works when online only
''',
          contentAr: '''
التواصل مع أعضاء الفريق:

1. اذهب إلى المحادثة من شريط التنقل السفلي
2. اعرض محادثاتك
3. اضغط على محادثة لفتحها
4. اكتب رسالتك واضغط إرسال

الميزات:
- المراسلة في الوقت الفعلي
- الرسائل تظهر بالترتيب الزمني
- الرسائل الجديدة تظهر في الأسفل
- مؤشرات الرسائل غير المقروءة
- محادثات جماعية وفردية
- مرفقات الصور والمستندات

نصائح:
- اسحب للأسفل لتحديث الرسائل
- الرسائل تتزامن تلقائياً
- يعمل عند الاتصال فقط
''',
          tags: ['chat', 'messaging', 'communication'],
        ),
        HelpArticle(
          id: 'voice_calls',
          title: 'Making Voice/Video Calls',
          titleAr: 'إجراء المكالمات الصوتية/المرئية',
          content: '''
Calling team members within the app:

1. Open a chat conversation
2. Tap the phone or video icon in the header
3. Wait for the other person to answer
4. Tap end call button when finished

Call Features:
- Voice calls
- Video calls
- Mute/unmute
- Speaker mode
- Camera on/off

Requirements:
- Stable internet connection
- Microphone permission
- Camera permission (for video)
''',
          contentAr: '''
الاتصال بأعضاء الفريق داخل التطبيق:

1. افتح محادثة
2. اضغط على أيقونة الهاتف أو الفيديو في الرأس
3. انتظر حتى يرد الشخص الآخر
4. اضغط على زر إنهاء المكالمة عند الانتهاء

ميزات المكالمات:
- مكالمات صوتية
- مكالمات مرئية
- كتم/إلغاء كتم الصوت
- وضع مكبر الصوت
- تشغيل/إيقاف الكاميرا

المتطلبات:
- اتصال إنترنت مستقر
- إذن الميكروفون
- إذن الكاميرا (للفيديو)
''',
          tags: ['calls', 'video', 'voice', 'communication'],
        ),
      ],
    ),
  ];

  /// Get error message by key
  static ErrorMessage? getErrorMessage(String errorKey) {
    return commonErrors[errorKey];
  }

  /// Search articles by query - searches both languages
  static List<HelpArticle> searchArticles(String query) {
    final lowercaseQuery = query.toLowerCase();
    final results = <HelpArticle>[];

    for (final category in helpCategories) {
      for (final article in category.articles) {
        if (article.title.toLowerCase().contains(lowercaseQuery) ||
            article.titleAr.toLowerCase().contains(lowercaseQuery) ||
            article.content.toLowerCase().contains(lowercaseQuery) ||
            article.contentAr.toLowerCase().contains(lowercaseQuery) ||
            article.tags.any(
              (tag) => tag.toLowerCase().contains(lowercaseQuery),
            )) {
          results.add(article);
        }
      }
    }

    return results;
  }

  /// Get all articles for a category
  static List<HelpArticle> getArticlesByCategory(String categoryId) {
    final category = helpCategories.firstWhere(
      (cat) => cat.id == categoryId,
      orElse: () =>
          HelpCategory(id: '', title: '', description: '', articles: []),
    );
    return category.articles;
  }

  /// Get article by ID
  static HelpArticle? getArticleById(String articleId) {
    for (final category in helpCategories) {
      for (final article in category.articles) {
        if (article.id == articleId) {
          return article;
        }
      }
    }
    return null;
  }
}
