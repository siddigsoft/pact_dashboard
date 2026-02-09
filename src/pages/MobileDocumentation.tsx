import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Smartphone,
  Download,
  FileDown,
  BookOpen,
  Wifi,
  WifiOff,
  MapPin,
  Camera,
  Bell,
  Shield,
  Settings,
  HelpCircle,
  Navigation,
  Wallet,
  MessageSquare,
  RefreshCw,
  Fingerprint,
  Battery,
  ChevronRight,
  Globe
} from 'lucide-react';
import {
  getMobileDocumentationSections,
  getArabicMobileDocumentationSections,
  generateMobileUserManualPDF,
  generateMobileUserManualDOCX,
  generateArabicMobileUserManualDOCX
} from '@/lib/mobile-docs-export';

export default function MobileDocumentation() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [exportType, setExportType] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'ar'>('en');

  const sections = language === 'en' ? getMobileDocumentationSections() : getArabicMobileDocumentationSections();

  const handleExport = async (type: 'pdf' | 'docx' | 'arabic-docx') => {
    try {
      setExporting(true);
      setExportType(type);
      await new Promise(resolve => setTimeout(resolve, 100));

      if (type === 'pdf') {
        generateMobileUserManualPDF();
        toast({
          title: "PDF Generated",
          description: "Mobile user manual has been downloaded as PDF",
        });
      } else if (type === 'docx') {
        await generateMobileUserManualDOCX();
        toast({
          title: "Word Document Generated",
          description: "Mobile user manual has been downloaded as DOCX",
        });
      } else if (type === 'arabic-docx') {
        await generateArabicMobileUserManualDOCX();
        toast({
          title: "Arabic Manual Generated",
          description: "Arabic mobile user manual has been downloaded as Word document",
        });
      }
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "Unable to generate document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
      setExportType(null);
    }
  };

  const sectionIcons: Record<number, any> = {
    0: Smartphone,
    1: Download,
    2: Shield,
    3: Navigation,
    4: MapPin,
    5: WifiOff,
    6: Globe,
    7: Wallet,
    8: FileDown,
    9: MessageSquare,
    10: Settings,
    11: HelpCircle,
    12: RefreshCw,
    13: HelpCircle,
    14: Fingerprint,
  };

  const sectionColors: Record<number, string> = {
    0: 'text-blue-500',
    1: 'text-green-500',
    2: 'text-purple-500',
    3: 'text-orange-500',
    4: 'text-red-500',
    5: 'text-gray-500',
    6: 'text-emerald-500',
    7: 'text-yellow-500',
    8: 'text-indigo-500',
    9: 'text-pink-500',
    10: 'text-slate-500',
    11: 'text-cyan-500',
    12: 'text-teal-500',
    13: 'text-amber-500',
    14: 'text-violet-500',
  };

  const featureHighlights = [
    { icon: WifiOff, label: language === 'en' ? 'Offline Mode' : 'بدون اتصال', desc: language === 'en' ? 'Works without internet' : 'يعمل بدون إنترنت' },
    { icon: MapPin, label: language === 'en' ? 'GPS Tracking' : 'تتبع GPS', desc: language === 'en' ? 'Location verification' : 'التحقق من الموقع' },
    { icon: Camera, label: language === 'en' ? 'Camera' : 'الكاميرا', desc: language === 'en' ? 'Photo documentation' : 'توثيق بالصور' },
    { icon: Bell, label: language === 'en' ? 'Notifications' : 'الإشعارات', desc: language === 'en' ? 'Push alerts' : 'تنبيهات فورية' },
    { icon: Fingerprint, label: language === 'en' ? 'Signatures' : 'التوقيعات', desc: language === 'en' ? 'Digital signing' : 'التوقيع الرقمي' },
    { icon: Battery, label: language === 'en' ? 'Battery Aware' : 'حالة البطارية', desc: language === 'en' ? 'Smart power usage' : 'استخدام ذكي للطاقة' },
  ];

  return (
    <div className="container mx-auto p-4 pt-36 md:p-6 max-w-6xl pb-24 sm:pb-8" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" data-testid="page-title-mobile-docs">
            <Smartphone className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            {language === 'en' ? 'Mobile User Manual' : 'دليل مستخدم الهاتف المحمول'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en'
              ? 'Complete guide for the PACT Mobile App'
              : 'الدليل الشامل لتطبيق PACT للهاتف المحمول'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={language === 'en' ? 'default' : 'outline'}
            onClick={() => setLanguage('en')}
            className="gap-2"
            data-testid="button-lang-english"
          >
            <Globe className="h-4 w-4" />
            English
          </Button>
          <Button
            variant={language === 'ar' ? 'default' : 'outline'}
            onClick={() => setLanguage('ar')}
            className="gap-2"
            data-testid="button-lang-arabic"
          >
            <Globe className="h-4 w-4" />
            العربية
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <Button
          onClick={() => handleExport('pdf')}
          disabled={exporting}
          variant="outline"
          className="gap-2"
          data-testid="button-export-mobile-pdf"
        >
          <FileDown className="h-4 w-4" />
          {exporting && exportType === 'pdf' ? (language === 'en' ? 'Generating...' : 'جاري التوليد...') : (language === 'en' ? 'Export PDF (English)' : 'تصدير PDF (إنجليزي)')}
        </Button>
        <Button
          onClick={() => handleExport('docx')}
          disabled={exporting}
          className="gap-2"
          data-testid="button-export-mobile-docx"
        >
          <Download className="h-4 w-4" />
          {exporting && exportType === 'docx' ? (language === 'en' ? 'Generating...' : 'جاري التوليد...') : (language === 'en' ? 'Export Word (English)' : 'تصدير Word (إنجليزي)')}
        </Button>
        <Button
          onClick={() => handleExport('arabic-docx')}
          disabled={exporting}
          variant="outline"
          className="gap-2"
          data-testid="button-export-mobile-arabic"
        >
          <Download className="h-4 w-4" />
          {exporting && exportType === 'arabic-docx' ? (language === 'en' ? 'Generating...' : 'جاري التوليد...') : (language === 'en' ? 'Export Word (Arabic)' : 'تصدير Word (عربي)')}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {featureHighlights.map((feature, idx) => (
          <Card key={idx} className="text-center">
            <CardContent className="p-3">
              <feature.icon className="h-6 w-6 mx-auto mb-1 text-primary" />
              <p className="text-xs font-medium">{feature.label}</p>
              <p className="text-xs text-muted-foreground">{feature.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="manual" data-testid="tab-manual">
            <BookOpen className="h-4 w-4 mr-1" />
            {language === 'en' ? 'User Manual' : 'دليل المستخدم'}
          </TabsTrigger>
          <TabsTrigger value="quick-ref" data-testid="tab-quick-ref">
            <Smartphone className="h-4 w-4 mr-1" />
            {language === 'en' ? 'Quick Reference' : 'مرجع سريع'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual">
          <Card>
            <CardContent className="p-4">
              <ScrollArea className="h-[calc(100vh-500px)] min-h-[400px]">
                <Accordion type="multiple" className="space-y-2">
                  {sections.map((section, idx) => {
                    const IconComponent = sectionIcons[idx] || Smartphone;
                    const colorClass = sectionColors[idx] || 'text-primary';

                    return (
                      <AccordionItem key={idx} value={`section-${idx}`} className="border rounded-md px-3">
                        <AccordionTrigger className="hover:no-underline gap-2" data-testid={`accordion-section-${idx}`}>
                          <div className="flex items-center gap-2 text-left flex-1">
                            <IconComponent className={`h-5 w-5 shrink-0 ${colorClass}`} />
                            <span className="font-semibold text-sm md:text-base">{section.title}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-2">
                            {section.content.map((line, lineIdx) => (
                              <p key={lineIdx} className="text-sm text-muted-foreground leading-relaxed">
                                {line}
                              </p>
                            ))}

                            {section.subsections?.map((sub, subIdx) => (
                              <div key={subIdx} className="ml-2 md:ml-4 mt-3">
                                <h4 className="font-medium text-sm mb-2 flex items-center gap-1">
                                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                  {sub.title}
                                </h4>
                                <ul className="space-y-1 ml-4">
                                  {sub.content.map((item, itemIdx) => (
                                    <li key={itemIdx} className="text-sm text-muted-foreground flex items-start gap-2">
                                      <span className="text-primary mt-1 shrink-0">&#8226;</span>
                                      <span>{item}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quick-ref">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Fingerprint className="h-5 w-5 text-blue-500" />
                  {language === 'en' ? 'Touch Gestures' : 'إيماءات اللمس'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { gesture: language === 'en' ? 'Swipe left/right' : 'تمرير يمين/يسار', action: language === 'en' ? 'Navigate between items' : 'التنقل بين العناصر' },
                    { gesture: language === 'en' ? 'Pull down' : 'السحب لأسفل', action: language === 'en' ? 'Refresh data' : 'تحديث البيانات' },
                    { gesture: language === 'en' ? 'Long press' : 'الضغط المطول', action: language === 'en' ? 'Access options menu' : 'الوصول لقائمة الخيارات' },
                    { gesture: language === 'en' ? 'Pinch' : 'القرص', action: language === 'en' ? 'Zoom on maps' : 'التكبير على الخرائط' },
                    { gesture: language === 'en' ? 'Double tap' : 'الضغط المزدوج', action: language === 'en' ? 'Quick zoom' : 'التكبير السريع' },
                    { gesture: language === 'en' ? 'Edge swipe' : 'التمرير من الحافة', action: language === 'en' ? 'Go back' : 'العودة للخلف' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 py-1">
                      <Badge variant="secondary" className="shrink-0">{item.gesture}</Badge>
                      <span className="text-sm text-muted-foreground">{item.action}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green-500" />
                  {language === 'en' ? 'Required Permissions' : 'الأذونات المطلوبة'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { perm: language === 'en' ? 'Location' : 'الموقع', reason: language === 'en' ? 'GPS tracking & geofencing' : 'تتبع GPS والسياج الجغرافي' },
                    { perm: language === 'en' ? 'Camera' : 'الكاميرا', reason: language === 'en' ? 'Photo capture at sites' : 'التقاط الصور في المواقع' },
                    { perm: language === 'en' ? 'Storage' : 'التخزين', reason: language === 'en' ? 'Offline data & images' : 'بيانات وصور بدون اتصال' },
                    { perm: language === 'en' ? 'Notifications' : 'الإشعارات', reason: language === 'en' ? 'Push alerts' : 'تنبيهات فورية' },
                    { perm: language === 'en' ? 'Microphone' : 'الميكروفون', reason: language === 'en' ? 'Voice notes & calls' : 'ملاحظات صوتية ومكالمات' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 py-1">
                      <Badge variant="outline" className="shrink-0">{item.perm}</Badge>
                      <span className="text-sm text-muted-foreground">{item.reason}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Navigation className="h-5 w-5 text-orange-500" />
                  {language === 'en' ? 'Bottom Navigation' : 'شريط التنقل السفلي'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { tab: language === 'en' ? 'Home' : 'الرئيسية', desc: language === 'en' ? 'Dashboard, stats & quick actions' : 'لوحة التحكم والإحصائيات' },
                    { tab: language === 'en' ? 'Sites' : 'المواقع', desc: language === 'en' ? 'Available & assigned visits' : 'الزيارات المتاحة والمعينة' },
                    { tab: language === 'en' ? 'Map' : 'الخريطة', desc: language === 'en' ? 'Interactive map view' : 'عرض الخريطة التفاعلية' },
                    { tab: language === 'en' ? 'Wallet' : 'المحفظة', desc: language === 'en' ? 'Balance & transactions' : 'الرصيد والمعاملات' },
                    { tab: language === 'en' ? 'More' : 'المزيد', desc: language === 'en' ? 'Settings, help & support' : 'الإعدادات والمساعدة والدعم' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 py-1">
                      <span className="text-sm font-medium">{item.tab}</span>
                      <span className="text-sm text-muted-foreground">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <WifiOff className="h-5 w-5 text-gray-500" />
                  {language === 'en' ? 'Offline Capabilities' : 'إمكانيات بدون اتصال'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    language === 'en' ? 'Start & complete site visits' : 'بدء وإكمال زيارات المواقع',
                    language === 'en' ? 'GPS tracking & photos' : 'تتبع GPS والتقاط الصور',
                    language === 'en' ? 'Data collection forms' : 'نماذج جمع البيانات',
                    language === 'en' ? 'Voice notes recording' : 'تسجيل الملاحظات الصوتية',
                    language === 'en' ? 'Cost request submission' : 'تقديم طلبات التكاليف',
                    language === 'en' ? 'Cached maps viewing' : 'عرض الخرائط المخزنة مؤقتاً',
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 py-1">
                      <span className="text-green-500 shrink-0">&#10003;</span>
                      <span className="text-sm text-muted-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-red-500" />
                  {language === 'en' ? 'Quick Troubleshooting' : 'استكشاف الأخطاء السريع'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { issue: language === 'en' ? 'GPS not working' : 'GPS لا يعمل', fix: language === 'en' ? 'Enable High Accuracy mode in device settings' : 'فعّل وضع الدقة العالية في إعدادات الجهاز' },
                    { issue: language === 'en' ? 'Data not syncing' : 'البيانات لا تتزامن', fix: language === 'en' ? 'Check internet connection, pull down to refresh' : 'تحقق من الإنترنت، اسحب لأسفل للتحديث' },
                    { issue: language === 'en' ? 'Camera not opening' : 'الكاميرا لا تفتح', fix: language === 'en' ? 'Grant camera permission, close other apps' : 'امنح إذن الكاميرا، أغلق التطبيقات الأخرى' },
                    { issue: language === 'en' ? 'App crashing' : 'التطبيق يتعطل', fix: language === 'en' ? 'Clear cache, ensure 100MB+ free space' : 'امسح ذاكرة التخزين، تأكد من وجود 100+ ميجابايت' },
                    { issue: language === 'en' ? "Can't log in" : 'لا أستطيع تسجيل الدخول', fix: language === 'en' ? 'Check credentials, try Forgot Password' : 'تحقق من البيانات، جرب نسيت كلمة المرور' },
                    { issue: language === 'en' ? 'Battery draining fast' : 'البطارية تنفد بسرعة', fix: language === 'en' ? 'Enable low bandwidth mode, close unused apps' : 'فعّل وضع النطاق المنخفض، أغلق التطبيقات' },
                  ].map((item, idx) => (
                    <div key={idx} className="p-2 rounded-md border">
                      <p className="text-sm font-medium text-destructive">{item.issue}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.fix}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6 text-center">
        <Separator className="mb-4" />
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            PACT Mobile App - {language === 'en' ? 'Field Operations Companion' : 'رفيق العمليات الميدانية'}
          </p>
          <p className="text-xs text-muted-foreground">
            {language === 'en' ? 'Version 3.0 | February 2026' : 'الإصدار 3.0 | فبراير 2026'}
          </p>
        </div>
      </div>
    </div>
  );
}
