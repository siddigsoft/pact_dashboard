import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Mail,
  Settings,
  FileText,
  Send,
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  XCircle,
  Plus,
  Edit,
  Trash2,
  Eye,
  Copy,
  Users,
  Server,
  Shield,
  AlertTriangle,
  Search,
  UserPlus,
  Lock,
  MapPin,
  Wallet,
  FolderOpen,
  Bell,
  MessageSquare,
  Wrench,
  Tag,
  ChevronRight,
  Clock,
  Calendar,
  Play,
  TestTube,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  category: string;
  isActive: boolean;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

interface UserForEmail {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

const defaultTemplates: EmailTemplate[] = [
  // === ONBOARDING & ACCOUNT ===
  {
    id: 'welcome',
    name: 'Welcome Email / رسالة الترحيب',
    subject: 'Welcome to PACT Command Center / مرحباً بك في مركز قيادة PACT',
    category: 'onboarding',
    isActive: true,
    variables: ['recipientName', 'loginUrl', 'role'],
    htmlContent: `<div dir="ltr"><h1>Welcome to PACT Command Center</h1><p>Hello {{recipientName}},</p><p>Your account has been created successfully as a <strong>{{role}}</strong>.</p><p>You can now login at: <a href="{{loginUrl}}">{{loginUrl}}</a></p><p>If you have any questions, please contact your administrator.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>مرحباً بك في مركز قيادة PACT</h1><p>مرحباً {{recipientName}}،</p><p>تم إنشاء حسابك بنجاح بصفتك <strong>{{role}}</strong>.</p><p>يمكنك الآن تسجيل الدخول على: <a href="{{loginUrl}}">{{loginUrl}}</a></p><p>إذا كانت لديك أي أسئلة، يرجى التواصل مع المسؤول.</p></div>`,
    textContent: 'Welcome to PACT Command Center\n\nHello {{recipientName}},\n\nYour account has been created successfully as a {{role}}.\n\nYou can now login at: {{loginUrl}}\n\n---\n\nمرحباً بك في مركز قيادة PACT\n\nمرحباً {{recipientName}}،\n\nتم إنشاء حسابك بنجاح بصفتك {{role}}.\n\nيمكنك الآن تسجيل الدخول على: {{loginUrl}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'account-activated',
    name: 'Account Activated / تفعيل الحساب',
    subject: 'Your PACT Account Has Been Activated / تم تفعيل حسابك في PACT',
    category: 'onboarding',
    isActive: true,
    variables: ['recipientName', 'loginUrl'],
    htmlContent: `<div dir="ltr"><h1>Account Activated</h1><p>Hello {{recipientName}},</p><p>Great news! Your PACT Command Center account has been activated. You can now access all features assigned to your role.</p><p><a href="{{loginUrl}}">Login Now</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم تفعيل الحساب</h1><p>مرحباً {{recipientName}}،</p><p>أخبار رائعة! تم تفعيل حسابك في مركز قيادة PACT. يمكنك الآن الوصول إلى جميع الميزات المخصصة لدورك.</p><p><a href="{{loginUrl}}">تسجيل الدخول الآن</a></p></div>`,
    textContent: 'Account Activated\n\nHello {{recipientName}},\n\nGreat news! Your PACT Command Center account has been activated.\n\n---\n\nتم تفعيل الحساب\n\nمرحباً {{recipientName}}،\n\nأخبار رائعة! تم تفعيل حسابك في مركز قيادة PACT.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'account-deactivated',
    name: 'Account Deactivated / تعطيل الحساب',
    subject: 'Your PACT Account Has Been Deactivated / تم تعطيل حسابك في PACT',
    category: 'onboarding',
    isActive: true,
    variables: ['recipientName', 'reason', 'contactEmail'],
    htmlContent: `<div dir="ltr"><h1>Account Deactivated</h1><p>Hello {{recipientName}},</p><p>Your PACT Command Center account has been deactivated.</p><p>Reason: {{reason}}</p><p>If you believe this is an error, please contact: {{contactEmail}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم تعطيل الحساب</h1><p>مرحباً {{recipientName}}،</p><p>تم تعطيل حسابك في مركز قيادة PACT.</p><p>السبب: {{reason}}</p><p>إذا كنت تعتقد أن هذا خطأ، يرجى التواصل: {{contactEmail}}</p></div>`,
    textContent: 'Account Deactivated\n\nHello {{recipientName}},\n\nYour PACT Command Center account has been deactivated.\n\nReason: {{reason}}\n\n---\n\nتم تعطيل الحساب\n\nمرحباً {{recipientName}}،\n\nتم تعطيل حسابك في مركز قيادة PACT.\n\nالسبب: {{reason}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'role-changed',
    name: 'Role Changed / تغيير الدور',
    subject: 'Your Role Has Been Updated - PACT / تم تحديث دورك - PACT',
    category: 'onboarding',
    isActive: true,
    variables: ['recipientName', 'oldRole', 'newRole', 'effectiveDate'],
    htmlContent: `<div dir="ltr"><h1>Role Update</h1><p>Hello {{recipientName}},</p><p>Your role has been changed from <strong>{{oldRole}}</strong> to <strong>{{newRole}}</strong>.</p><p>Effective date: {{effectiveDate}}</p><p>Your access permissions have been updated accordingly.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تحديث الدور</h1><p>مرحباً {{recipientName}}،</p><p>تم تغيير دورك من <strong>{{oldRole}}</strong> إلى <strong>{{newRole}}</strong>.</p><p>تاريخ السريان: {{effectiveDate}}</p><p>تم تحديث صلاحيات الوصول الخاصة بك وفقاً لذلك.</p></div>`,
    textContent: 'Role Update\n\nHello {{recipientName}},\n\nYour role has been changed from {{oldRole}} to {{newRole}}.\n\nEffective date: {{effectiveDate}}\n\n---\n\nتحديث الدور\n\nمرحباً {{recipientName}}،\n\nتم تغيير دورك من {{oldRole}} إلى {{newRole}}.\n\nتاريخ السريان: {{effectiveDate}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === AUTHENTICATION & SECURITY ===
  {
    id: 'password-reset',
    name: 'Password Reset / إعادة تعيين كلمة المرور',
    subject: 'Reset Your Password - PACT / إعادة تعيين كلمة المرور - PACT',
    category: 'authentication',
    isActive: true,
    variables: ['recipientName', 'otpCode', 'expiryMinutes'],
    htmlContent: `<div dir="ltr"><h1>Password Reset Request</h1><p>Hello {{recipientName}},</p><p>Your password reset code is: <strong style="font-size: 24px; letter-spacing: 3px;">{{otpCode}}</strong></p><p>This code expires in {{expiryMinutes}} minutes.</p><p>If you did not request this reset, please ignore this email.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>طلب إعادة تعيين كلمة المرور</h1><p>مرحباً {{recipientName}}،</p><p>رمز إعادة تعيين كلمة المرور الخاص بك هو: <strong style="font-size: 24px; letter-spacing: 3px;">{{otpCode}}</strong></p><p>ينتهي هذا الرمز خلال {{expiryMinutes}} دقيقة.</p><p>إذا لم تطلب إعادة التعيين هذه، يرجى تجاهل هذا البريد الإلكتروني.</p></div>`,
    textContent: 'Password Reset Request\n\nHello {{recipientName}},\n\nYour password reset code is: {{otpCode}}\n\nThis code expires in {{expiryMinutes}} minutes.\n\n---\n\nطلب إعادة تعيين كلمة المرور\n\nمرحباً {{recipientName}}،\n\nرمز إعادة تعيين كلمة المرور الخاص بك هو: {{otpCode}}\n\nينتهي هذا الرمز خلال {{expiryMinutes}} دقيقة.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'password-changed',
    name: 'Password Changed / تم تغيير كلمة المرور',
    subject: 'Your Password Has Been Changed - PACT / تم تغيير كلمة المرور - PACT',
    category: 'authentication',
    isActive: true,
    variables: ['recipientName', 'changeDate', 'ipAddress'],
    htmlContent: `<div dir="ltr"><h1>Password Changed</h1><p>Hello {{recipientName}},</p><p>Your password was successfully changed on {{changeDate}}.</p><p>IP Address: {{ipAddress}}</p><p>If you did not make this change, please contact your administrator immediately.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم تغيير كلمة المرور</h1><p>مرحباً {{recipientName}}،</p><p>تم تغيير كلمة المرور الخاصة بك بنجاح في {{changeDate}}.</p><p>عنوان IP: {{ipAddress}}</p><p>إذا لم تقم بهذا التغيير، يرجى التواصل مع المسؤول فوراً.</p></div>`,
    textContent: 'Password Changed\n\nHello {{recipientName}},\n\nYour password was successfully changed on {{changeDate}}.\n\n---\n\nتم تغيير كلمة المرور\n\nمرحباً {{recipientName}}،\n\nتم تغيير كلمة المرور الخاصة بك بنجاح في {{changeDate}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'two-factor-enabled',
    name: 'Two-Factor Authentication Enabled / تفعيل المصادقة الثنائية',
    subject: '2FA Enabled on Your Account - PACT / تم تفعيل المصادقة الثنائية - PACT',
    category: 'authentication',
    isActive: true,
    variables: ['recipientName', 'enabledDate'],
    htmlContent: `<div dir="ltr"><h1>Two-Factor Authentication Enabled</h1><p>Hello {{recipientName}},</p><p>Two-factor authentication has been enabled on your PACT account on {{enabledDate}}.</p><p>Your account is now more secure. You will need to enter a verification code each time you log in.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم تفعيل المصادقة الثنائية</h1><p>مرحباً {{recipientName}}،</p><p>تم تفعيل المصادقة الثنائية على حسابك في PACT في {{enabledDate}}.</p><p>أصبح حسابك الآن أكثر أماناً. ستحتاج إلى إدخال رمز التحقق في كل مرة تسجل فيها الدخول.</p></div>`,
    textContent: 'Two-Factor Authentication Enabled\n\nHello {{recipientName}},\n\nTwo-factor authentication has been enabled on your PACT account on {{enabledDate}}.\n\n---\n\nتم تفعيل المصادقة الثنائية\n\nمرحباً {{recipientName}}،\n\nتم تفعيل المصادقة الثنائية على حسابك في PACT في {{enabledDate}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'new-device-login',
    name: 'New Device Login Alert / تنبيه تسجيل دخول جديد',
    subject: 'New Login Detected - PACT Security Alert / تنبيه أمني: تم اكتشاف تسجيل دخول جديد',
    category: 'authentication',
    isActive: true,
    variables: ['recipientName', 'deviceInfo', 'location', 'loginTime', 'ipAddress'],
    htmlContent: `<div dir="ltr"><h1>New Login Detected</h1><p>Hello {{recipientName}},</p><p>A new login to your PACT account was detected:</p><ul><li>Device: {{deviceInfo}}</li><li>Location: {{location}}</li><li>Time: {{loginTime}}</li><li>IP: {{ipAddress}}</li></ul><p>If this was not you, please change your password immediately.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم اكتشاف تسجيل دخول جديد</h1><p>مرحباً {{recipientName}}،</p><p>تم اكتشاف تسجيل دخول جديد إلى حسابك في PACT:</p><ul><li>الجهاز: {{deviceInfo}}</li><li>الموقع: {{location}}</li><li>الوقت: {{loginTime}}</li><li>عنوان IP: {{ipAddress}}</li></ul><p>إذا لم يكن هذا أنت، يرجى تغيير كلمة المرور فوراً.</p></div>`,
    textContent: 'New Login Detected\n\nHello {{recipientName}},\n\nA new login to your PACT account was detected:\n\nDevice: {{deviceInfo}}\nLocation: {{location}}\nTime: {{loginTime}}\nIP: {{ipAddress}}\n\n---\n\nتم اكتشاف تسجيل دخول جديد\n\nمرحباً {{recipientName}}،\n\nتم اكتشاف تسجيل دخول جديد إلى حسابك:\n\nالجهاز: {{deviceInfo}}\nالموقع: {{location}}\nالوقت: {{loginTime}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === SITE VISITS & FIELD OPERATIONS ===
  {
    id: 'site-visit-assigned',
    name: 'Site Visit Assignment / تعيين زيارة موقع',
    subject: 'New Site Visit Assigned - {{siteName}} / تم تعيين زيارة موقع جديدة',
    category: 'operations',
    isActive: true,
    variables: ['recipientName', 'siteName', 'visitDate', 'location', 'projectName', 'instructions'],
    htmlContent: `<div dir="ltr"><h1>Site Visit Assignment</h1><p>Hello {{recipientName}},</p><p>You have been assigned to visit <strong>{{siteName}}</strong>.</p><ul><li>Date: {{visitDate}}</li><li>Location: {{location}}</li><li>Project: {{projectName}}</li></ul><p>Instructions: {{instructions}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تعيين زيارة موقع</h1><p>مرحباً {{recipientName}}،</p><p>تم تعيينك لزيارة <strong>{{siteName}}</strong>.</p><ul><li>التاريخ: {{visitDate}}</li><li>الموقع: {{location}}</li><li>المشروع: {{projectName}}</li></ul><p>التعليمات: {{instructions}}</p></div>`,
    textContent: 'Site Visit Assignment\n\nHello {{recipientName}},\n\nYou have been assigned to visit {{siteName}} on {{visitDate}}.\n\n---\n\nتعيين زيارة موقع\n\nمرحباً {{recipientName}}،\n\nتم تعيينك لزيارة {{siteName}} في {{visitDate}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'site-visit-reminder',
    name: 'Site Visit Reminder / تذكير بزيارة الموقع',
    subject: 'Reminder: Site Visit Tomorrow - {{siteName}} / تذكير: زيارة الموقع غداً',
    category: 'operations',
    isActive: true,
    variables: ['recipientName', 'siteName', 'visitDate', 'visitTime', 'location', 'contactPerson'],
    htmlContent: `<div dir="ltr"><h1>Site Visit Reminder</h1><p>Hello {{recipientName}},</p><p>This is a reminder that you have a scheduled site visit tomorrow:</p><ul><li>Site: {{siteName}}</li><li>Date: {{visitDate}}</li><li>Time: {{visitTime}}</li><li>Location: {{location}}</li><li>Contact: {{contactPerson}}</li></ul><p>Please ensure you have all necessary equipment and documentation.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تذكير بزيارة الموقع</h1><p>مرحباً {{recipientName}}،</p><p>هذا تذكير بأن لديك زيارة موقع مجدولة غداً:</p><ul><li>الموقع: {{siteName}}</li><li>التاريخ: {{visitDate}}</li><li>الوقت: {{visitTime}}</li><li>المكان: {{location}}</li><li>جهة الاتصال: {{contactPerson}}</li></ul><p>يرجى التأكد من توفر جميع المعدات والوثائق اللازمة.</p></div>`,
    textContent: 'Site Visit Reminder\n\nHello {{recipientName}},\n\nThis is a reminder that you have a scheduled site visit tomorrow.\n\n---\n\nتذكير بزيارة الموقع\n\nمرحباً {{recipientName}}،\n\nهذا تذكير بأن لديك زيارة موقع مجدولة غداً.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'site-visit-completed',
    name: 'Site Visit Completed / اكتملت زيارة الموقع',
    subject: 'Site Visit Completed - {{siteName}} / اكتملت زيارة الموقع',
    category: 'operations',
    isActive: true,
    variables: ['recipientName', 'siteName', 'completedDate', 'collectorName', 'status', 'notes'],
    htmlContent: `<div dir="ltr"><h1>Site Visit Completed</h1><p>Hello {{recipientName}},</p><p>A site visit has been completed:</p><ul><li>Site: {{siteName}}</li><li>Completed: {{completedDate}}</li><li>Collector: {{collectorName}}</li><li>Status: {{status}}</li></ul><p>Notes: {{notes}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>اكتملت زيارة الموقع</h1><p>مرحباً {{recipientName}}،</p><p>تم إكمال زيارة موقع:</p><ul><li>الموقع: {{siteName}}</li><li>تاريخ الإكمال: {{completedDate}}</li><li>جامع البيانات: {{collectorName}}</li><li>الحالة: {{status}}</li></ul><p>ملاحظات: {{notes}}</p></div>`,
    textContent: 'Site Visit Completed\n\nHello {{recipientName}},\n\nA site visit has been completed:\n\nSite: {{siteName}}\nCompleted: {{completedDate}}\n\n---\n\nاكتملت زيارة الموقع\n\nمرحباً {{recipientName}}،\n\nتم إكمال زيارة موقع:\n\nالموقع: {{siteName}}\nتاريخ الإكمال: {{completedDate}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'site-visit-cancelled',
    name: 'Site Visit Cancelled / إلغاء زيارة الموقع',
    subject: 'Site Visit Cancelled - {{siteName}} / تم إلغاء زيارة الموقع',
    category: 'operations',
    isActive: true,
    variables: ['recipientName', 'siteName', 'originalDate', 'cancelledBy', 'reason'],
    htmlContent: `<div dir="ltr"><h1>Site Visit Cancelled</h1><p>Hello {{recipientName}},</p><p>The following site visit has been cancelled:</p><ul><li>Site: {{siteName}}</li><li>Original Date: {{originalDate}}</li><li>Cancelled by: {{cancelledBy}}</li></ul><p>Reason: {{reason}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم إلغاء زيارة الموقع</h1><p>مرحباً {{recipientName}}،</p><p>تم إلغاء زيارة الموقع التالية:</p><ul><li>الموقع: {{siteName}}</li><li>التاريخ الأصلي: {{originalDate}}</li><li>ألغيت بواسطة: {{cancelledBy}}</li></ul><p>السبب: {{reason}}</p></div>`,
    textContent: 'Site Visit Cancelled\n\nHello {{recipientName}},\n\nThe following site visit has been cancelled:\n\nSite: {{siteName}}\nReason: {{reason}}\n\n---\n\nتم إلغاء زيارة الموقع\n\nمرحباً {{recipientName}}،\n\nتم إلغاء زيارة الموقع:\n\nالموقع: {{siteName}}\nالسبب: {{reason}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'site-visit-rescheduled',
    name: 'Site Visit Rescheduled / إعادة جدولة زيارة الموقع',
    subject: 'Site Visit Rescheduled - {{siteName}} / تم إعادة جدولة زيارة الموقع',
    category: 'operations',
    isActive: true,
    variables: ['recipientName', 'siteName', 'originalDate', 'newDate', 'reason'],
    htmlContent: `<div dir="ltr"><h1>Site Visit Rescheduled</h1><p>Hello {{recipientName}},</p><p>Your site visit has been rescheduled:</p><ul><li>Site: {{siteName}}</li><li>Original Date: {{originalDate}}</li><li>New Date: {{newDate}}</li></ul><p>Reason: {{reason}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم إعادة جدولة زيارة الموقع</h1><p>مرحباً {{recipientName}}،</p><p>تم إعادة جدولة زيارة الموقع الخاصة بك:</p><ul><li>الموقع: {{siteName}}</li><li>التاريخ الأصلي: {{originalDate}}</li><li>التاريخ الجديد: {{newDate}}</li></ul><p>السبب: {{reason}}</p></div>`,
    textContent: 'Site Visit Rescheduled\n\nHello {{recipientName}},\n\nYour site visit has been rescheduled:\n\nSite: {{siteName}}\nNew Date: {{newDate}}\n\n---\n\nتم إعادة جدولة زيارة الموقع\n\nمرحباً {{recipientName}}،\n\nتم إعادة جدولة زيارة الموقع:\n\nالموقع: {{siteName}}\nالتاريخ الجديد: {{newDate}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'gps-location-request',
    name: 'GPS Location Request / طلب موقع GPS',
    subject: 'GPS Location Required - {{siteName}} / مطلوب موقع GPS',
    category: 'operations',
    isActive: true,
    variables: ['recipientName', 'siteName', 'requestedBy', 'deadline'],
    htmlContent: `<div dir="ltr"><h1>GPS Location Required</h1><p>Hello {{recipientName}},</p><p>Please capture and submit GPS coordinates for the following site:</p><ul><li>Site: {{siteName}}</li><li>Requested by: {{requestedBy}}</li><li>Deadline: {{deadline}}</li></ul><p>Use the mobile app to capture accurate location data.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>مطلوب موقع GPS</h1><p>مرحباً {{recipientName}}،</p><p>يرجى التقاط وإرسال إحداثيات GPS للموقع التالي:</p><ul><li>الموقع: {{siteName}}</li><li>طلب بواسطة: {{requestedBy}}</li><li>الموعد النهائي: {{deadline}}</li></ul><p>استخدم تطبيق الهاتف لالتقاط بيانات الموقع بدقة.</p></div>`,
    textContent: 'GPS Location Required\n\nHello {{recipientName}},\n\nPlease capture and submit GPS coordinates for {{siteName}}.\n\nDeadline: {{deadline}}\n\n---\n\nمطلوب موقع GPS\n\nمرحباً {{recipientName}}،\n\nيرجى التقاط وإرسال إحداثيات GPS للموقع {{siteName}}.\n\nالموعد النهائي: {{deadline}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === FINANCIAL & WALLET ===
  {
    id: 'down-payment-approved',
    name: 'Down-Payment Approved / تمت الموافقة على الدفعة المقدمة',
    subject: 'Down-Payment Approved - {{amount}} SDG / تمت الموافقة على الدفعة المقدمة',
    category: 'financial',
    isActive: true,
    variables: ['recipientName', 'amount', 'projectName', 'approvedBy', 'approvalDate', 'referenceNumber'],
    htmlContent: `<div dir="ltr"><h1>Down-Payment Approved</h1><p>Hello {{recipientName}},</p><p>Your down-payment request has been approved:</p><ul><li>Amount: {{amount}} SDG</li><li>Project: {{projectName}}</li><li>Approved by: {{approvedBy}}</li><li>Date: {{approvalDate}}</li><li>Reference: {{referenceNumber}}</li></ul><p>The funds will be credited to your wallet shortly.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تمت الموافقة على الدفعة المقدمة</h1><p>مرحباً {{recipientName}}،</p><p>تمت الموافقة على طلب الدفعة المقدمة الخاص بك:</p><ul><li>المبلغ: {{amount}} جنيه سوداني</li><li>المشروع: {{projectName}}</li><li>وافق عليها: {{approvedBy}}</li><li>التاريخ: {{approvalDate}}</li><li>الرقم المرجعي: {{referenceNumber}}</li></ul><p>سيتم إضافة الأموال إلى محفظتك قريباً.</p></div>`,
    textContent: 'Down-Payment Approved\n\nHello {{recipientName}},\n\nYour down-payment of {{amount}} SDG has been approved.\n\n---\n\nتمت الموافقة على الدفعة المقدمة\n\nمرحباً {{recipientName}}،\n\nتمت الموافقة على الدفعة المقدمة بقيمة {{amount}} جنيه سوداني.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'down-payment-rejected',
    name: 'Down-Payment Rejected / رفض الدفعة المقدمة',
    subject: 'Down-Payment Request Rejected / تم رفض طلب الدفعة المقدمة',
    category: 'financial',
    isActive: true,
    variables: ['recipientName', 'amount', 'projectName', 'rejectedBy', 'reason'],
    htmlContent: `<div dir="ltr"><h1>Down-Payment Rejected</h1><p>Hello {{recipientName}},</p><p>Your down-payment request has been rejected:</p><ul><li>Amount: {{amount}} SDG</li><li>Project: {{projectName}}</li><li>Rejected by: {{rejectedBy}}</li></ul><p>Reason: {{reason}}</p><p>Please contact your supervisor for more information.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم رفض الدفعة المقدمة</h1><p>مرحباً {{recipientName}}،</p><p>تم رفض طلب الدفعة المقدمة الخاص بك:</p><ul><li>المبلغ: {{amount}} جنيه سوداني</li><li>المشروع: {{projectName}}</li><li>رفض بواسطة: {{rejectedBy}}</li></ul><p>السبب: {{reason}}</p><p>يرجى التواصل مع مشرفك للحصول على مزيد من المعلومات.</p></div>`,
    textContent: 'Down-Payment Rejected\n\nHello {{recipientName}},\n\nYour down-payment of {{amount}} SDG has been rejected.\n\nReason: {{reason}}\n\n---\n\nتم رفض الدفعة المقدمة\n\nمرحباً {{recipientName}}،\n\nتم رفض الدفعة المقدمة بقيمة {{amount}} جنيه سوداني.\n\nالسبب: {{reason}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'wallet-balance-low',
    name: 'Wallet Balance Low / رصيد المحفظة منخفض',
    subject: 'Low Wallet Balance Alert - {{currentBalance}} SDG / تنبيه: رصيد المحفظة منخفض',
    category: 'financial',
    isActive: true,
    variables: ['recipientName', 'currentBalance', 'minimumBalance', 'walletId'],
    htmlContent: `<div dir="ltr"><h1>Low Wallet Balance Alert</h1><p>Hello {{recipientName}},</p><p>Your wallet balance is running low:</p><ul><li>Current Balance: {{currentBalance}} SDG</li><li>Minimum Required: {{minimumBalance}} SDG</li><li>Wallet ID: {{walletId}}</li></ul><p>Please request a top-up to continue field operations.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تنبيه انخفاض رصيد المحفظة</h1><p>مرحباً {{recipientName}}،</p><p>رصيد محفظتك منخفض:</p><ul><li>الرصيد الحالي: {{currentBalance}} جنيه سوداني</li><li>الحد الأدنى المطلوب: {{minimumBalance}} جنيه سوداني</li><li>رقم المحفظة: {{walletId}}</li></ul><p>يرجى طلب إعادة شحن لمتابعة العمليات الميدانية.</p></div>`,
    textContent: 'Low Wallet Balance Alert\n\nHello {{recipientName}},\n\nYour wallet balance is low:\n\nCurrent: {{currentBalance}} SDG\n\n---\n\nتنبيه انخفاض رصيد المحفظة\n\nمرحباً {{recipientName}}،\n\nرصيد محفظتك منخفض:\n\nالرصيد الحالي: {{currentBalance}} جنيه سوداني',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cost-submission-received',
    name: 'Cost Submission Received / تم استلام طلب التكلفة',
    subject: 'Cost Submission Received - {{amount}} SDG / تم استلام طلب التكلفة',
    category: 'financial',
    isActive: true,
    variables: ['recipientName', 'amount', 'category', 'submittedBy', 'submissionDate', 'referenceNumber'],
    htmlContent: `<div dir="ltr"><h1>Cost Submission Received</h1><p>Hello {{recipientName}},</p><p>A new cost submission has been received:</p><ul><li>Amount: {{amount}} SDG</li><li>Category: {{category}}</li><li>Submitted by: {{submittedBy}}</li><li>Date: {{submissionDate}}</li><li>Reference: {{referenceNumber}}</li></ul><p>This submission is pending your review.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم استلام طلب التكلفة</h1><p>مرحباً {{recipientName}}،</p><p>تم استلام طلب تكلفة جديد:</p><ul><li>المبلغ: {{amount}} جنيه سوداني</li><li>الفئة: {{category}}</li><li>مقدم من: {{submittedBy}}</li><li>التاريخ: {{submissionDate}}</li><li>الرقم المرجعي: {{referenceNumber}}</li></ul><p>هذا الطلب في انتظار مراجعتك.</p></div>`,
    textContent: 'Cost Submission Received\n\nHello {{recipientName}},\n\nA new cost submission of {{amount}} SDG has been received.\n\n---\n\nتم استلام طلب التكلفة\n\nمرحباً {{recipientName}}،\n\nتم استلام طلب تكلفة جديد بقيمة {{amount}} جنيه سوداني.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cost-submission-approved',
    name: 'Cost Submission Approved / تمت الموافقة على التكلفة',
    subject: 'Your Cost Submission Has Been Approved / تمت الموافقة على طلب التكلفة',
    category: 'financial',
    isActive: true,
    variables: ['recipientName', 'amount', 'category', 'approvedBy', 'approvalDate'],
    htmlContent: `<div dir="ltr"><h1>Cost Submission Approved</h1><p>Hello {{recipientName}},</p><p>Your cost submission has been approved:</p><ul><li>Amount: {{amount}} SDG</li><li>Category: {{category}}</li><li>Approved by: {{approvedBy}}</li><li>Date: {{approvalDate}}</li></ul></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تمت الموافقة على طلب التكلفة</h1><p>مرحباً {{recipientName}}،</p><p>تمت الموافقة على طلب التكلفة الخاص بك:</p><ul><li>المبلغ: {{amount}} جنيه سوداني</li><li>الفئة: {{category}}</li><li>وافق عليها: {{approvedBy}}</li><li>التاريخ: {{approvalDate}}</li></ul></div>`,
    textContent: 'Cost Submission Approved\n\nHello {{recipientName}},\n\nYour cost submission of {{amount}} SDG has been approved.\n\n---\n\nتمت الموافقة على طلب التكلفة\n\nمرحباً {{recipientName}}،\n\nتمت الموافقة على طلب التكلفة بقيمة {{amount}} جنيه سوداني.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cost-submission-rejected',
    name: 'Cost Submission Rejected / رفض طلب التكلفة',
    subject: 'Your Cost Submission Has Been Rejected / تم رفض طلب التكلفة',
    category: 'financial',
    isActive: true,
    variables: ['recipientName', 'amount', 'category', 'rejectedBy', 'reason'],
    htmlContent: `<div dir="ltr"><h1>Cost Submission Rejected</h1><p>Hello {{recipientName}},</p><p>Your cost submission has been rejected:</p><ul><li>Amount: {{amount}} SDG</li><li>Category: {{category}}</li><li>Rejected by: {{rejectedBy}}</li></ul><p>Reason: {{reason}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم رفض طلب التكلفة</h1><p>مرحباً {{recipientName}}،</p><p>تم رفض طلب التكلفة الخاص بك:</p><ul><li>المبلغ: {{amount}} جنيه سوداني</li><li>الفئة: {{category}}</li><li>رفض بواسطة: {{rejectedBy}}</li></ul><p>السبب: {{reason}}</p></div>`,
    textContent: 'Cost Submission Rejected\n\nHello {{recipientName}},\n\nYour cost submission of {{amount}} SDG has been rejected.\n\nReason: {{reason}}\n\n---\n\nتم رفض طلب التكلفة\n\nمرحباً {{recipientName}}،\n\nتم رفض طلب التكلفة بقيمة {{amount}} جنيه سوداني.\n\nالسبب: {{reason}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'payment-processed',
    name: 'Payment Processed / تم معالجة الدفع',
    subject: 'Payment Processed - {{amount}} SDG / تم معالجة الدفع',
    category: 'financial',
    isActive: true,
    variables: ['recipientName', 'amount', 'paymentMethod', 'transactionId', 'processedDate'],
    htmlContent: `<div dir="ltr"><h1>Payment Processed</h1><p>Hello {{recipientName}},</p><p>Your payment has been processed:</p><ul><li>Amount: {{amount}} SDG</li><li>Method: {{paymentMethod}}</li><li>Transaction ID: {{transactionId}}</li><li>Date: {{processedDate}}</li></ul></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم معالجة الدفع</h1><p>مرحباً {{recipientName}}،</p><p>تم معالجة الدفع الخاص بك:</p><ul><li>المبلغ: {{amount}} جنيه سوداني</li><li>طريقة الدفع: {{paymentMethod}}</li><li>رقم المعاملة: {{transactionId}}</li><li>التاريخ: {{processedDate}}</li></ul></div>`,
    textContent: 'Payment Processed\n\nHello {{recipientName}},\n\nYour payment of {{amount}} SDG has been processed.\n\nTransaction ID: {{transactionId}}\n\n---\n\nتم معالجة الدفع\n\nمرحباً {{recipientName}}،\n\nتم معالجة الدفع بقيمة {{amount}} جنيه سوداني.\n\nرقم المعاملة: {{transactionId}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === MMP & PROJECTS ===
  {
    id: 'mmp-uploaded',
    name: 'MMP Uploaded / تم رفع خطة المراقبة',
    subject: 'MMP Uploaded Successfully - {{projectName}} / تم رفع خطة المراقبة الشهرية بنجاح',
    category: 'projects',
    isActive: true,
    variables: ['recipientName', 'projectName', 'fileName', 'recordCount', 'uploadedBy', 'uploadDate'],
    htmlContent: `<div dir="ltr"><h1>MMP Uploaded</h1><p>Hello {{recipientName}},</p><p>A new Monthly Monitoring Plan has been uploaded:</p><ul><li>Project: {{projectName}}</li><li>File: {{fileName}}</li><li>Records: {{recordCount}}</li><li>Uploaded by: {{uploadedBy}}</li><li>Date: {{uploadDate}}</li></ul></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم رفع خطة المراقبة الشهرية</h1><p>مرحباً {{recipientName}}،</p><p>تم رفع خطة مراقبة شهرية جديدة:</p><ul><li>المشروع: {{projectName}}</li><li>الملف: {{fileName}}</li><li>عدد السجلات: {{recordCount}}</li><li>رفع بواسطة: {{uploadedBy}}</li><li>التاريخ: {{uploadDate}}</li></ul></div>`,
    textContent: 'MMP Uploaded\n\nHello {{recipientName}},\n\nA new MMP has been uploaded for {{projectName}} with {{recordCount}} records.\n\n---\n\nتم رفع خطة المراقبة الشهرية\n\nمرحباً {{recipientName}}،\n\nتم رفع خطة مراقبة شهرية جديدة للمشروع {{projectName}} تحتوي على {{recordCount}} سجل.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mmp-assignment',
    name: 'MMP Assignment / تعيين خطة المراقبة',
    subject: 'You Have Been Assigned to MMP Sites - {{projectName}} / تم تعيينك لمواقع خطة المراقبة',
    category: 'projects',
    isActive: true,
    variables: ['recipientName', 'projectName', 'siteCount', 'assignedBy', 'startDate', 'endDate'],
    htmlContent: `<div dir="ltr"><h1>MMP Assignment</h1><p>Hello {{recipientName}},</p><p>You have been assigned to MMP sites:</p><ul><li>Project: {{projectName}}</li><li>Sites: {{siteCount}}</li><li>Assigned by: {{assignedBy}}</li><li>Period: {{startDate}} - {{endDate}}</li></ul></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تعيين خطة المراقبة</h1><p>مرحباً {{recipientName}}،</p><p>تم تعيينك لمواقع خطة المراقبة الشهرية:</p><ul><li>المشروع: {{projectName}}</li><li>عدد المواقع: {{siteCount}}</li><li>معين بواسطة: {{assignedBy}}</li><li>الفترة: {{startDate}} - {{endDate}}</li></ul></div>`,
    textContent: 'MMP Assignment\n\nHello {{recipientName}},\n\nYou have been assigned to {{siteCount}} sites for {{projectName}}.\n\n---\n\nتعيين خطة المراقبة\n\nمرحباً {{recipientName}}،\n\nتم تعيينك لـ {{siteCount}} موقع للمشروع {{projectName}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'project-created',
    name: 'Project Created / تم إنشاء مشروع',
    subject: 'New Project Created - {{projectName}} / تم إنشاء مشروع جديد',
    category: 'projects',
    isActive: true,
    variables: ['recipientName', 'projectName', 'projectCode', 'createdBy', 'startDate', 'endDate'],
    htmlContent: `<div dir="ltr"><h1>New Project Created</h1><p>Hello {{recipientName}},</p><p>A new project has been created:</p><ul><li>Name: {{projectName}}</li><li>Code: {{projectCode}}</li><li>Created by: {{createdBy}}</li><li>Duration: {{startDate}} - {{endDate}}</li></ul></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم إنشاء مشروع جديد</h1><p>مرحباً {{recipientName}}،</p><p>تم إنشاء مشروع جديد:</p><ul><li>الاسم: {{projectName}}</li><li>الرمز: {{projectCode}}</li><li>أنشئ بواسطة: {{createdBy}}</li><li>المدة: {{startDate}} - {{endDate}}</li></ul></div>`,
    textContent: 'New Project Created\n\nHello {{recipientName}},\n\nA new project has been created: {{projectName}} ({{projectCode}})\n\n---\n\nتم إنشاء مشروع جديد\n\nمرحباً {{recipientName}}،\n\nتم إنشاء مشروع جديد: {{projectName}} ({{projectCode}})',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'project-status-update',
    name: 'Project Status Update / تحديث حالة المشروع',
    subject: 'Project Status Update - {{projectName}} / تحديث حالة المشروع',
    category: 'projects',
    isActive: true,
    variables: ['recipientName', 'projectName', 'oldStatus', 'newStatus', 'updatedBy', 'updateDate'],
    htmlContent: `<div dir="ltr"><h1>Project Status Update</h1><p>Hello {{recipientName}},</p><p>A project status has been updated:</p><ul><li>Project: {{projectName}}</li><li>Previous Status: {{oldStatus}}</li><li>New Status: {{newStatus}}</li><li>Updated by: {{updatedBy}}</li><li>Date: {{updateDate}}</li></ul></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تحديث حالة المشروع</h1><p>مرحباً {{recipientName}}،</p><p>تم تحديث حالة المشروع:</p><ul><li>المشروع: {{projectName}}</li><li>الحالة السابقة: {{oldStatus}}</li><li>الحالة الجديدة: {{newStatus}}</li><li>حدث بواسطة: {{updatedBy}}</li><li>التاريخ: {{updateDate}}</li></ul></div>`,
    textContent: 'Project Status Update\n\nHello {{recipientName}},\n\n{{projectName}} status changed from {{oldStatus}} to {{newStatus}}.\n\n---\n\nتحديث حالة المشروع\n\nمرحباً {{recipientName}}،\n\nتم تغيير حالة {{projectName}} من {{oldStatus}} إلى {{newStatus}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === APPROVALS & WORKFLOW ===
  {
    id: 'approval-request',
    name: 'Approval Request / طلب موافقة',
    subject: 'Action Required: {{requestType}} Approval / مطلوب إجراء: موافقة على {{requestType}}',
    category: 'workflow',
    isActive: true,
    variables: ['recipientName', 'requestType', 'requesterName', 'amount', 'actionUrl', 'deadline'],
    htmlContent: `<div dir="ltr"><h1>Approval Required</h1><p>Hello {{recipientName}},</p><p>{{requesterName}} has submitted a {{requestType}} request requiring your approval.</p><ul><li>Amount: {{amount}}</li><li>Deadline: {{deadline}}</li></ul><p><a href="{{actionUrl}}">Review and Approve</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>مطلوب موافقة</h1><p>مرحباً {{recipientName}}،</p><p>قدم {{requesterName}} طلب {{requestType}} يتطلب موافقتك.</p><ul><li>المبلغ: {{amount}}</li><li>الموعد النهائي: {{deadline}}</li></ul><p><a href="{{actionUrl}}">مراجعة والموافقة</a></p></div>`,
    textContent: 'Approval Required\n\nHello {{recipientName}},\n\n{{requesterName}} has submitted a {{requestType}} request requiring your approval.\n\n---\n\nمطلوب موافقة\n\nمرحباً {{recipientName}}،\n\nقدم {{requesterName}} طلب {{requestType}} يتطلب موافقتك.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'approval-granted',
    name: 'Approval Granted / تمت الموافقة',
    subject: 'Your {{requestType}} Has Been Approved / تمت الموافقة على {{requestType}}',
    category: 'workflow',
    isActive: true,
    variables: ['recipientName', 'requestType', 'approvedBy', 'approvalDate', 'comments'],
    htmlContent: `<div dir="ltr"><h1>Approval Granted</h1><p>Hello {{recipientName}},</p><p>Your {{requestType}} request has been approved:</p><ul><li>Approved by: {{approvedBy}}</li><li>Date: {{approvalDate}}</li></ul><p>Comments: {{comments}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تمت الموافقة</h1><p>مرحباً {{recipientName}}،</p><p>تمت الموافقة على طلب {{requestType}} الخاص بك:</p><ul><li>وافق عليها: {{approvedBy}}</li><li>التاريخ: {{approvalDate}}</li></ul><p>التعليقات: {{comments}}</p></div>`,
    textContent: 'Approval Granted\n\nHello {{recipientName}},\n\nYour {{requestType}} has been approved by {{approvedBy}}.\n\n---\n\nتمت الموافقة\n\nمرحباً {{recipientName}}،\n\nتمت الموافقة على طلب {{requestType}} بواسطة {{approvedBy}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'approval-denied',
    name: 'Approval Denied / تم الرفض',
    subject: 'Your {{requestType}} Has Been Denied / تم رفض {{requestType}}',
    category: 'workflow',
    isActive: true,
    variables: ['recipientName', 'requestType', 'deniedBy', 'reason', 'nextSteps'],
    htmlContent: `<div dir="ltr"><h1>Approval Denied</h1><p>Hello {{recipientName}},</p><p>Your {{requestType}} request has been denied:</p><ul><li>Denied by: {{deniedBy}}</li><li>Reason: {{reason}}</li></ul><p>Next Steps: {{nextSteps}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم الرفض</h1><p>مرحباً {{recipientName}}،</p><p>تم رفض طلب {{requestType}} الخاص بك:</p><ul><li>رفض بواسطة: {{deniedBy}}</li><li>السبب: {{reason}}</li></ul><p>الخطوات التالية: {{nextSteps}}</p></div>`,
    textContent: 'Approval Denied\n\nHello {{recipientName}},\n\nYour {{requestType}} has been denied.\n\nReason: {{reason}}\n\n---\n\nتم الرفض\n\nمرحباً {{recipientName}}،\n\nتم رفض طلب {{requestType}} الخاص بك.\n\nالسبب: {{reason}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'signature-request',
    name: 'Signature Request / طلب توقيع',
    subject: 'Signature Required - {{documentName}} / مطلوب توقيع',
    category: 'workflow',
    isActive: true,
    variables: ['recipientName', 'documentName', 'requestedBy', 'deadline', 'signUrl'],
    htmlContent: `<div dir="ltr"><h1>Signature Required</h1><p>Hello {{recipientName}},</p><p>Your signature is required on the following document:</p><ul><li>Document: {{documentName}}</li><li>Requested by: {{requestedBy}}</li><li>Deadline: {{deadline}}</li></ul><p><a href="{{signUrl}}">Sign Document</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>مطلوب توقيع</h1><p>مرحباً {{recipientName}}،</p><p>مطلوب توقيعك على المستند التالي:</p><ul><li>المستند: {{documentName}}</li><li>طلب بواسطة: {{requestedBy}}</li><li>الموعد النهائي: {{deadline}}</li></ul><p><a href="{{signUrl}}">توقيع المستند</a></p></div>`,
    textContent: 'Signature Required\n\nHello {{recipientName}},\n\nYour signature is required on {{documentName}}.\n\nDeadline: {{deadline}}\n\n---\n\nمطلوب توقيع\n\nمرحباً {{recipientName}}،\n\nمطلوب توقيعك على {{documentName}}.\n\nالموعد النهائي: {{deadline}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'signature-completed',
    name: 'Signature Completed / تم التوقيع',
    subject: 'Document Signed - {{documentName}} / تم توقيع المستند',
    category: 'workflow',
    isActive: true,
    variables: ['recipientName', 'documentName', 'signedBy', 'signedDate', 'downloadUrl'],
    htmlContent: `<div dir="ltr"><h1>Document Signed</h1><p>Hello {{recipientName}},</p><p>A document has been signed:</p><ul><li>Document: {{documentName}}</li><li>Signed by: {{signedBy}}</li><li>Date: {{signedDate}}</li></ul><p><a href="{{downloadUrl}}">Download Document</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تم توقيع المستند</h1><p>مرحباً {{recipientName}}،</p><p>تم توقيع مستند:</p><ul><li>المستند: {{documentName}}</li><li>وقع بواسطة: {{signedBy}}</li><li>التاريخ: {{signedDate}}</li></ul><p><a href="{{downloadUrl}}">تحميل المستند</a></p></div>`,
    textContent: 'Document Signed\n\nHello {{recipientName}},\n\n{{documentName}} has been signed by {{signedBy}} on {{signedDate}}.\n\n---\n\nتم توقيع المستند\n\nمرحباً {{recipientName}}،\n\nتم توقيع {{documentName}} بواسطة {{signedBy}} في {{signedDate}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === REPORTS & NOTIFICATIONS ===
  {
    id: 'weekly-summary',
    name: 'Weekly Summary Report / تقرير الملخص الأسبوعي',
    subject: 'Weekly Summary Report - {{weekRange}} / تقرير الملخص الأسبوعي',
    category: 'reports',
    isActive: true,
    variables: ['recipientName', 'weekRange', 'siteVisitsCompleted', 'siteVisitsPending', 'totalExpenses', 'highlights'],
    htmlContent: `<div dir="ltr"><h1>Weekly Summary Report</h1><p>Hello {{recipientName}},</p><p>Here is your weekly summary for {{weekRange}}:</p><ul><li>Site Visits Completed: {{siteVisitsCompleted}}</li><li>Site Visits Pending: {{siteVisitsPending}}</li><li>Total Expenses: {{totalExpenses}} SDG</li></ul><p>Highlights: {{highlights}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تقرير الملخص الأسبوعي</h1><p>مرحباً {{recipientName}}،</p><p>إليك ملخصك الأسبوعي لـ {{weekRange}}:</p><ul><li>زيارات المواقع المكتملة: {{siteVisitsCompleted}}</li><li>زيارات المواقع المعلقة: {{siteVisitsPending}}</li><li>إجمالي المصروفات: {{totalExpenses}} جنيه سوداني</li></ul><p>أبرز النقاط: {{highlights}}</p></div>`,
    textContent: 'Weekly Summary Report\n\nHello {{recipientName}},\n\nWeekly summary for {{weekRange}}:\n\nSite Visits Completed: {{siteVisitsCompleted}}\nSite Visits Pending: {{siteVisitsPending}}\n\n---\n\nتقرير الملخص الأسبوعي\n\nمرحباً {{recipientName}}،\n\nملخص الأسبوع لـ {{weekRange}}:\n\nزيارات المواقع المكتملة: {{siteVisitsCompleted}}\nزيارات المواقع المعلقة: {{siteVisitsPending}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'monthly-report-ready',
    name: 'Monthly Report Ready / التقرير الشهري جاهز',
    subject: 'Monthly Report Ready - {{monthYear}} / التقرير الشهري جاهز',
    category: 'reports',
    isActive: true,
    variables: ['recipientName', 'monthYear', 'reportType', 'downloadUrl'],
    htmlContent: `<div dir="ltr"><h1>Monthly Report Ready</h1><p>Hello {{recipientName}},</p><p>The {{reportType}} report for {{monthYear}} is now ready.</p><p><a href="{{downloadUrl}}">Download Report</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>التقرير الشهري جاهز</h1><p>مرحباً {{recipientName}}،</p><p>تقرير {{reportType}} لشهر {{monthYear}} جاهز الآن.</p><p><a href="{{downloadUrl}}">تحميل التقرير</a></p></div>`,
    textContent: 'Monthly Report Ready\n\nHello {{recipientName}},\n\nThe {{reportType}} report for {{monthYear}} is now ready for download.\n\n---\n\nالتقرير الشهري جاهز\n\nمرحباً {{recipientName}}،\n\nتقرير {{reportType}} لشهر {{monthYear}} جاهز الآن للتحميل.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'system-maintenance',
    name: 'System Maintenance Notice / إشعار صيانة النظام',
    subject: 'Scheduled Maintenance - {{maintenanceDate}} / صيانة مجدولة',
    category: 'system',
    isActive: true,
    variables: ['recipientName', 'maintenanceDate', 'startTime', 'endTime', 'affectedServices', 'contactEmail'],
    htmlContent: `<div dir="ltr"><h1>Scheduled Maintenance</h1><p>Hello {{recipientName}},</p><p>PACT Command Center will undergo scheduled maintenance:</p><ul><li>Date: {{maintenanceDate}}</li><li>Time: {{startTime}} - {{endTime}}</li><li>Affected Services: {{affectedServices}}</li></ul><p>Please save your work before the maintenance window. Contact {{contactEmail}} for questions.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>صيانة مجدولة</h1><p>مرحباً {{recipientName}}،</p><p>سيخضع مركز قيادة PACT لصيانة مجدولة:</p><ul><li>التاريخ: {{maintenanceDate}}</li><li>الوقت: {{startTime}} - {{endTime}}</li><li>الخدمات المتأثرة: {{affectedServices}}</li></ul><p>يرجى حفظ عملك قبل فترة الصيانة. للأسئلة تواصل مع {{contactEmail}}</p></div>`,
    textContent: 'Scheduled Maintenance\n\nHello {{recipientName}},\n\nPACT Command Center will undergo maintenance on {{maintenanceDate}} from {{startTime}} to {{endTime}}.\n\n---\n\nصيانة مجدولة\n\nمرحباً {{recipientName}}،\n\nسيخضع مركز قيادة PACT لصيانة في {{maintenanceDate}} من {{startTime}} إلى {{endTime}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'urgent-alert',
    name: 'Urgent Alert / تنبيه عاجل',
    subject: 'URGENT: {{alertTitle}} / عاجل: {{alertTitle}}',
    category: 'system',
    isActive: true,
    variables: ['recipientName', 'alertTitle', 'alertMessage', 'actionRequired', 'deadline', 'contactPerson'],
    htmlContent: `<div dir="ltr"><h1 style="color: #dc2626;">URGENT ALERT</h1><p>Hello {{recipientName}},</p><p style="font-weight: bold;">{{alertTitle}}</p><p>{{alertMessage}}</p><p><strong>Action Required:</strong> {{actionRequired}}</p><p><strong>Deadline:</strong> {{deadline}}</p><p>Contact: {{contactPerson}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1 style="color: #dc2626;">تنبيه عاجل</h1><p>مرحباً {{recipientName}}،</p><p style="font-weight: bold;">{{alertTitle}}</p><p>{{alertMessage}}</p><p><strong>الإجراء المطلوب:</strong> {{actionRequired}}</p><p><strong>الموعد النهائي:</strong> {{deadline}}</p><p>جهة الاتصال: {{contactPerson}}</p></div>`,
    textContent: 'URGENT ALERT\n\nHello {{recipientName}},\n\n{{alertTitle}}\n\n{{alertMessage}}\n\nAction Required: {{actionRequired}}\nDeadline: {{deadline}}\n\n---\n\nتنبيه عاجل\n\nمرحباً {{recipientName}}،\n\n{{alertTitle}}\n\n{{alertMessage}}\n\nالإجراء المطلوب: {{actionRequired}}\nالموعد النهائي: {{deadline}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === COMMUNICATION ===
  {
    id: 'notification-general',
    name: 'General Notification / إشعار عام',
    subject: '{{title}} / {{title}}',
    category: 'notification',
    isActive: true,
    variables: ['recipientName', 'title', 'message', 'actionUrl', 'actionLabel'],
    htmlContent: `<div dir="ltr"><h1>{{title}}</h1><p>Hello {{recipientName}},</p><p>{{message}}</p><p><a href="{{actionUrl}}">{{actionLabel}}</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>{{title}}</h1><p>مرحباً {{recipientName}}،</p><p>{{message}}</p><p><a href="{{actionUrl}}">{{actionLabel}}</a></p></div>`,
    textContent: '{{title}}\n\nHello {{recipientName}},\n\n{{message}}\n\n---\n\n{{title}}\n\nمرحباً {{recipientName}}،\n\n{{message}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'custom-message',
    name: 'Custom Message / رسالة مخصصة',
    subject: 'Message from PACT Administration / رسالة من إدارة PACT',
    category: 'communication',
    isActive: true,
    variables: ['recipientName', 'senderName', 'subject', 'message'],
    htmlContent: `<div dir="ltr"><h1>Message from {{senderName}}</h1><p>Hello {{recipientName}},</p><p>{{message}}</p><p>Best regards,<br>{{senderName}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>رسالة من {{senderName}}</h1><p>مرحباً {{recipientName}}،</p><p>{{message}}</p><p>مع أطيب التحيات،<br>{{senderName}}</p></div>`,
    textContent: 'Message from {{senderName}}\n\nHello {{recipientName}},\n\n{{message}}\n\nBest regards,\n{{senderName}}\n\n---\n\nرسالة من {{senderName}}\n\nمرحباً {{recipientName}}،\n\n{{message}}\n\nمع أطيب التحيات،\n{{senderName}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'team-announcement',
    name: 'Team Announcement / إعلان الفريق',
    subject: 'Team Announcement: {{title}} / إعلان الفريق: {{title}}',
    category: 'communication',
    isActive: true,
    variables: ['recipientName', 'title', 'message', 'announcedBy', 'effectiveDate'],
    htmlContent: `<div dir="ltr"><h1>Team Announcement</h1><p>Hello {{recipientName}},</p><h2>{{title}}</h2><p>{{message}}</p><p>Announced by: {{announcedBy}}<br>Effective: {{effectiveDate}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>إعلان الفريق</h1><p>مرحباً {{recipientName}}،</p><h2>{{title}}</h2><p>{{message}}</p><p>أعلن بواسطة: {{announcedBy}}<br>تاريخ السريان: {{effectiveDate}}</p></div>`,
    textContent: 'Team Announcement\n\nHello {{recipientName}},\n\n{{title}}\n\n{{message}}\n\nAnnounced by: {{announcedBy}}\n\n---\n\nإعلان الفريق\n\nمرحباً {{recipientName}}،\n\n{{title}}\n\n{{message}}\n\nأعلن بواسطة: {{announcedBy}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'feedback-request',
    name: 'Feedback Request / طلب ملاحظات',
    subject: 'We Value Your Feedback - {{topic}} / نقدر ملاحظاتك',
    category: 'communication',
    isActive: true,
    variables: ['recipientName', 'topic', 'feedbackUrl', 'deadline'],
    htmlContent: `<div dir="ltr"><h1>Feedback Request</h1><p>Hello {{recipientName}},</p><p>We would like your feedback on: <strong>{{topic}}</strong></p><p>Please share your thoughts by {{deadline}}.</p><p><a href="{{feedbackUrl}}">Provide Feedback</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>طلب ملاحظات</h1><p>مرحباً {{recipientName}}،</p><p>نود الحصول على ملاحظاتك حول: <strong>{{topic}}</strong></p><p>يرجى مشاركة أفكارك بحلول {{deadline}}.</p><p><a href="{{feedbackUrl}}">تقديم الملاحظات</a></p></div>`,
    textContent: 'Feedback Request\n\nHello {{recipientName}},\n\nWe would like your feedback on: {{topic}}\n\nPlease share your thoughts by {{deadline}}.\n\n---\n\nطلب ملاحظات\n\nمرحباً {{recipientName}}،\n\nنود الحصول على ملاحظاتك حول: {{topic}}\n\nيرجى مشاركة أفكارك بحلول {{deadline}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === COMPLIANCE ===
  {
    id: 'audit-notification',
    name: 'Audit Notification / إشعار التدقيق',
    subject: 'Audit Scheduled - {{auditType}} / تدقيق مجدول',
    category: 'compliance',
    isActive: true,
    variables: ['recipientName', 'auditType', 'auditDate', 'auditor', 'department', 'preparationNotes'],
    htmlContent: `<div dir="ltr"><h1>Audit Notification</h1><p>Hello {{recipientName}},</p><p>An audit has been scheduled for your department:</p><ul><li>Type: {{auditType}}</li><li>Date: {{auditDate}}</li><li>Auditor: {{auditor}}</li><li>Department: {{department}}</li></ul><p>Preparation Notes: {{preparationNotes}}</p><p>Please ensure all documentation is ready for review.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>إشعار التدقيق</h1><p>مرحباً {{recipientName}}،</p><p>تم جدولة تدقيق لقسمك:</p><ul><li>النوع: {{auditType}}</li><li>التاريخ: {{auditDate}}</li><li>المدقق: {{auditor}}</li><li>القسم: {{department}}</li></ul><p>ملاحظات التحضير: {{preparationNotes}}</p><p>يرجى التأكد من جاهزية جميع الوثائق للمراجعة.</p></div>`,
    textContent: 'Audit Notification\n\nHello {{recipientName}},\n\nAn audit has been scheduled:\n\nType: {{auditType}}\nDate: {{auditDate}}\nAuditor: {{auditor}}\n\n---\n\nإشعار التدقيق\n\nمرحباً {{recipientName}}،\n\nتم جدولة تدقيق:\n\nالنوع: {{auditType}}\nالتاريخ: {{auditDate}}\nالمدقق: {{auditor}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'policy-update',
    name: 'Policy Update / تحديث السياسة',
    subject: 'Policy Update: {{policyName}} / تحديث السياسة',
    category: 'compliance',
    isActive: true,
    variables: ['recipientName', 'policyName', 'effectiveDate', 'summary', 'policyUrl', 'contactPerson'],
    htmlContent: `<div dir="ltr"><h1>Policy Update</h1><p>Hello {{recipientName}},</p><p>An important policy has been updated:</p><ul><li>Policy: {{policyName}}</li><li>Effective Date: {{effectiveDate}}</li></ul><p>Summary of Changes: {{summary}}</p><p><a href="{{policyUrl}}">View Full Policy</a></p><p>For questions, contact: {{contactPerson}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تحديث السياسة</h1><p>مرحباً {{recipientName}}،</p><p>تم تحديث سياسة مهمة:</p><ul><li>السياسة: {{policyName}}</li><li>تاريخ السريان: {{effectiveDate}}</li></ul><p>ملخص التغييرات: {{summary}}</p><p><a href="{{policyUrl}}">عرض السياسة الكاملة</a></p><p>للاستفسارات، تواصل مع: {{contactPerson}}</p></div>`,
    textContent: 'Policy Update\n\nHello {{recipientName}},\n\nPolicy {{policyName}} has been updated.\n\nEffective Date: {{effectiveDate}}\n\nSummary: {{summary}}\n\n---\n\nتحديث السياسة\n\nمرحباً {{recipientName}}،\n\nتم تحديث السياسة {{policyName}}.\n\nتاريخ السريان: {{effectiveDate}}\n\nالملخص: {{summary}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'compliance-reminder',
    name: 'Compliance Reminder / تذكير الامتثال',
    subject: 'Compliance Deadline Reminder - {{requirement}} / تذكير بموعد الامتثال',
    category: 'compliance',
    isActive: true,
    variables: ['recipientName', 'requirement', 'deadline', 'daysRemaining', 'actionUrl', 'consequences'],
    htmlContent: `<div dir="ltr"><h1>Compliance Reminder</h1><p>Hello {{recipientName}},</p><p>This is a reminder about an upcoming compliance deadline:</p><ul><li>Requirement: {{requirement}}</li><li>Deadline: {{deadline}}</li><li>Days Remaining: {{daysRemaining}}</li></ul><p>Failure to comply may result in: {{consequences}}</p><p><a href="{{actionUrl}}">Complete Now</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تذكير الامتثال</h1><p>مرحباً {{recipientName}}،</p><p>هذا تذكير بموعد امتثال قادم:</p><ul><li>المتطلب: {{requirement}}</li><li>الموعد النهائي: {{deadline}}</li><li>الأيام المتبقية: {{daysRemaining}}</li></ul><p>عدم الامتثال قد يؤدي إلى: {{consequences}}</p><p><a href="{{actionUrl}}">إكمال الآن</a></p></div>`,
    textContent: 'Compliance Reminder\n\nHello {{recipientName}},\n\nReminder: {{requirement}}\n\nDeadline: {{deadline}}\nDays Remaining: {{daysRemaining}}\n\n---\n\nتذكير الامتثال\n\nمرحباً {{recipientName}}،\n\nتذكير: {{requirement}}\n\nالموعد النهائي: {{deadline}}\nالأيام المتبقية: {{daysRemaining}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'data-privacy-update',
    name: 'Data Privacy Update / تحديث خصوصية البيانات',
    subject: 'Important: Data Privacy Policy Update / مهم: تحديث سياسة خصوصية البيانات',
    category: 'compliance',
    isActive: true,
    variables: ['recipientName', 'effectiveDate', 'changes', 'privacyUrl', 'contactEmail'],
    htmlContent: `<div dir="ltr"><h1>Data Privacy Update</h1><p>Hello {{recipientName}},</p><p>Our data privacy policy has been updated effective {{effectiveDate}}.</p><p>Key Changes:</p><p>{{changes}}</p><p><a href="{{privacyUrl}}">Read Full Privacy Policy</a></p><p>Questions? Contact: {{contactEmail}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تحديث خصوصية البيانات</h1><p>مرحباً {{recipientName}}،</p><p>تم تحديث سياسة خصوصية البيانات اعتباراً من {{effectiveDate}}.</p><p>التغييرات الرئيسية:</p><p>{{changes}}</p><p><a href="{{privacyUrl}}">قراءة سياسة الخصوصية الكاملة</a></p><p>أسئلة؟ تواصل: {{contactEmail}}</p></div>`,
    textContent: 'Data Privacy Update\n\nHello {{recipientName}},\n\nOur data privacy policy has been updated effective {{effectiveDate}}.\n\nKey Changes:\n{{changes}}\n\n---\n\nتحديث خصوصية البيانات\n\nمرحباً {{recipientName}}،\n\nتم تحديث سياسة خصوصية البيانات اعتباراً من {{effectiveDate}}.\n\nالتغييرات الرئيسية:\n{{changes}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === EMERGENCY ===
  {
    id: 'emergency-alert',
    name: 'Emergency Alert / تنبيه طوارئ',
    subject: 'EMERGENCY: {{alertTitle}} / طوارئ: {{alertTitle}}',
    category: 'emergency',
    isActive: true,
    variables: ['recipientName', 'alertTitle', 'alertMessage', 'immediateAction', 'emergencyContact', 'location'],
    htmlContent: `<div dir="ltr"><h1 style="color: #dc2626; background: #fef2f2; padding: 10px;">EMERGENCY ALERT</h1><p>Hello {{recipientName}},</p><p style="font-weight: bold; font-size: 18px;">{{alertTitle}}</p><p>{{alertMessage}}</p><p style="color: #dc2626; font-weight: bold;">IMMEDIATE ACTION REQUIRED: {{immediateAction}}</p><p>Location: {{location}}</p><p>Emergency Contact: {{emergencyContact}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1 style="color: #dc2626; background: #fef2f2; padding: 10px;">تنبيه طوارئ</h1><p>مرحباً {{recipientName}}،</p><p style="font-weight: bold; font-size: 18px;">{{alertTitle}}</p><p>{{alertMessage}}</p><p style="color: #dc2626; font-weight: bold;">إجراء فوري مطلوب: {{immediateAction}}</p><p>الموقع: {{location}}</p><p>جهة اتصال الطوارئ: {{emergencyContact}}</p></div>`,
    textContent: 'EMERGENCY ALERT\n\nHello {{recipientName}},\n\n{{alertTitle}}\n\n{{alertMessage}}\n\nIMMEDIATE ACTION: {{immediateAction}}\n\nLocation: {{location}}\nEmergency Contact: {{emergencyContact}}\n\n---\n\nتنبيه طوارئ\n\nمرحباً {{recipientName}}،\n\n{{alertTitle}}\n\n{{alertMessage}}\n\nإجراء فوري: {{immediateAction}}\n\nالموقع: {{location}}\nجهة اتصال الطوارئ: {{emergencyContact}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'security-breach',
    name: 'Security Breach Alert / تنبيه اختراق أمني',
    subject: 'SECURITY ALERT: Potential Breach Detected / تنبيه أمني: اكتشاف اختراق محتمل',
    category: 'emergency',
    isActive: true,
    variables: ['recipientName', 'incidentType', 'detectedTime', 'affectedSystems', 'immediateSteps', 'securityTeamContact'],
    htmlContent: `<div dir="ltr"><h1 style="color: #dc2626;">SECURITY BREACH ALERT</h1><p>Hello {{recipientName}},</p><p>A potential security incident has been detected:</p><ul><li>Incident Type: {{incidentType}}</li><li>Detected: {{detectedTime}}</li><li>Affected Systems: {{affectedSystems}}</li></ul><p style="font-weight: bold;">Immediate Steps Required:</p><p>{{immediateSteps}}</p><p>Security Team Contact: {{securityTeamContact}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1 style="color: #dc2626;">تنبيه اختراق أمني</h1><p>مرحباً {{recipientName}}،</p><p>تم اكتشاف حادث أمني محتمل:</p><ul><li>نوع الحادث: {{incidentType}}</li><li>وقت الاكتشاف: {{detectedTime}}</li><li>الأنظمة المتأثرة: {{affectedSystems}}</li></ul><p style="font-weight: bold;">الخطوات الفورية المطلوبة:</p><p>{{immediateSteps}}</p><p>اتصال فريق الأمن: {{securityTeamContact}}</p></div>`,
    textContent: 'SECURITY BREACH ALERT\n\nHello {{recipientName}},\n\nA security incident has been detected.\n\nIncident: {{incidentType}}\nDetected: {{detectedTime}}\nAffected: {{affectedSystems}}\n\nImmediate Steps: {{immediateSteps}}\n\n---\n\nتنبيه اختراق أمني\n\nمرحباً {{recipientName}}،\n\nتم اكتشاف حادث أمني.\n\nالحادث: {{incidentType}}\nوقت الاكتشاف: {{detectedTime}}\nالمتأثر: {{affectedSystems}}\n\nالخطوات الفورية: {{immediateSteps}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'evacuation-notice',
    name: 'Evacuation Notice / إشعار إخلاء',
    subject: 'URGENT: Evacuation Required - {{location}} / عاجل: إخلاء مطلوب',
    category: 'emergency',
    isActive: true,
    variables: ['recipientName', 'location', 'reason', 'evacuationRoute', 'assemblyPoint', 'emergencyContact'],
    htmlContent: `<div dir="ltr"><h1 style="color: #dc2626; background: #fef2f2; padding: 10px;">EVACUATION NOTICE</h1><p>Hello {{recipientName}},</p><p style="font-weight: bold;">Immediate evacuation is required at: {{location}}</p><p>Reason: {{reason}}</p><p><strong>Evacuation Route:</strong> {{evacuationRoute}}</p><p><strong>Assembly Point:</strong> {{assemblyPoint}}</p><p>Emergency Contact: {{emergencyContact}}</p><p style="color: #dc2626;">Do not use elevators. Remain calm and proceed immediately.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1 style="color: #dc2626; background: #fef2f2; padding: 10px;">إشعار إخلاء</h1><p>مرحباً {{recipientName}}،</p><p style="font-weight: bold;">مطلوب إخلاء فوري في: {{location}}</p><p>السبب: {{reason}}</p><p><strong>مسار الإخلاء:</strong> {{evacuationRoute}}</p><p><strong>نقطة التجمع:</strong> {{assemblyPoint}}</p><p>جهة اتصال الطوارئ: {{emergencyContact}}</p><p style="color: #dc2626;">لا تستخدم المصاعد. ابق هادئاً وتوجه فوراً.</p></div>`,
    textContent: 'EVACUATION NOTICE\n\nHello {{recipientName}},\n\nImmediate evacuation required at: {{location}}\n\nReason: {{reason}}\nEvacuation Route: {{evacuationRoute}}\nAssembly Point: {{assemblyPoint}}\n\nEmergency Contact: {{emergencyContact}}\n\n---\n\nإشعار إخلاء\n\nمرحباً {{recipientName}}،\n\nمطلوب إخلاء فوري في: {{location}}\n\nالسبب: {{reason}}\nمسار الإخلاء: {{evacuationRoute}}\nنقطة التجمع: {{assemblyPoint}}\n\nجهة اتصال الطوارئ: {{emergencyContact}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'service-outage',
    name: 'Service Outage Alert / تنبيه انقطاع الخدمة',
    subject: 'SERVICE OUTAGE: {{serviceName}} / انقطاع الخدمة: {{serviceName}}',
    category: 'emergency',
    isActive: true,
    variables: ['recipientName', 'serviceName', 'outageTime', 'affectedUsers', 'estimatedRestoration', 'workaround', 'statusUrl'],
    htmlContent: `<div dir="ltr"><h1 style="color: #f59e0b;">Service Outage Alert</h1><p>Hello {{recipientName}},</p><p>A critical service is currently experiencing an outage:</p><ul><li>Service: {{serviceName}}</li><li>Outage Started: {{outageTime}}</li><li>Affected Users: {{affectedUsers}}</li><li>Estimated Restoration: {{estimatedRestoration}}</li></ul><p><strong>Workaround:</strong> {{workaround}}</p><p><a href="{{statusUrl}}">Check Status Page</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1 style="color: #f59e0b;">تنبيه انقطاع الخدمة</h1><p>مرحباً {{recipientName}}،</p><p>خدمة حيوية تعاني حالياً من انقطاع:</p><ul><li>الخدمة: {{serviceName}}</li><li>بدء الانقطاع: {{outageTime}}</li><li>المستخدمون المتأثرون: {{affectedUsers}}</li><li>الاستعادة المتوقعة: {{estimatedRestoration}}</li></ul><p><strong>الحل البديل:</strong> {{workaround}}</p><p><a href="{{statusUrl}}">التحقق من صفحة الحالة</a></p></div>`,
    textContent: 'Service Outage Alert\n\nHello {{recipientName}},\n\nService: {{serviceName}}\nOutage Started: {{outageTime}}\nAffected: {{affectedUsers}}\nEstimated Restoration: {{estimatedRestoration}}\n\nWorkaround: {{workaround}}\n\n---\n\nتنبيه انقطاع الخدمة\n\nمرحباً {{recipientName}}،\n\nالخدمة: {{serviceName}}\nبدء الانقطاع: {{outageTime}}\nالمتأثرون: {{affectedUsers}}\nالاستعادة المتوقعة: {{estimatedRestoration}}\n\nالحل البديل: {{workaround}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === ADDITIONAL ONBOARDING TEMPLATES ===
  {
    id: 'welcome-back',
    name: 'Welcome Back / مرحباً بعودتك',
    subject: 'Welcome Back to PACT Command Center / مرحباً بعودتك إلى مركز قيادة PACT',
    category: 'onboarding',
    isActive: true,
    variables: ['recipientName', 'lastLoginDate', 'loginUrl', 'newFeatures'],
    htmlContent: `<div dir="ltr"><h1>Welcome Back!</h1><p>Hello {{recipientName}},</p><p>We noticed you haven't logged in since {{lastLoginDate}}. Welcome back to PACT Command Center!</p><p>Here's what's new: {{newFeatures}}</p><p><a href="{{loginUrl}}">Login Now</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>مرحباً بعودتك!</h1><p>مرحباً {{recipientName}}،</p><p>لاحظنا أنك لم تسجل الدخول منذ {{lastLoginDate}}. مرحباً بعودتك إلى مركز قيادة PACT!</p><p>إليك ما هو جديد: {{newFeatures}}</p><p><a href="{{loginUrl}}">تسجيل الدخول الآن</a></p></div>`,
    textContent: 'Welcome Back!\n\nHello {{recipientName}},\n\nWe noticed you haven\'t logged in since {{lastLoginDate}}. Welcome back!\n\n---\n\nمرحباً بعودتك!\n\nمرحباً {{recipientName}}،\n\nلاحظنا أنك لم تسجل الدخول منذ {{lastLoginDate}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'training-reminder',
    name: 'Training Reminder / تذكير بالتدريب',
    subject: 'Training Reminder: {{trainingName}} / تذكير بالتدريب',
    category: 'onboarding',
    isActive: true,
    variables: ['recipientName', 'trainingName', 'trainingDate', 'trainingTime', 'trainingUrl', 'instructor'],
    htmlContent: `<div dir="ltr"><h1>Training Reminder</h1><p>Hello {{recipientName}},</p><p>You have an upcoming training session:</p><ul><li>Training: {{trainingName}}</li><li>Date: {{trainingDate}}</li><li>Time: {{trainingTime}}</li><li>Instructor: {{instructor}}</li></ul><p><a href="{{trainingUrl}}">Join Training</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تذكير بالتدريب</h1><p>مرحباً {{recipientName}}،</p><p>لديك جلسة تدريبية قادمة:</p><ul><li>التدريب: {{trainingName}}</li><li>التاريخ: {{trainingDate}}</li><li>الوقت: {{trainingTime}}</li><li>المدرب: {{instructor}}</li></ul><p><a href="{{trainingUrl}}">الانضمام للتدريب</a></p></div>`,
    textContent: 'Training Reminder\n\nHello {{recipientName}},\n\nYou have training: {{trainingName}} on {{trainingDate}}\n\n---\n\nتذكير بالتدريب\n\nمرحباً {{recipientName}}،\n\nلديك تدريب: {{trainingName}} في {{trainingDate}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'orientation-complete',
    name: 'Orientation Complete / اكتمال التوجيه',
    subject: 'Congratulations! Orientation Complete / تهانينا! اكتمل التوجيه',
    category: 'onboarding',
    isActive: true,
    variables: ['recipientName', 'completionDate', 'dashboardUrl', 'supervisorName'],
    htmlContent: `<div dir="ltr"><h1>Orientation Complete!</h1><p>Hello {{recipientName}},</p><p>Congratulations! You have successfully completed your orientation on {{completionDate}}.</p><p>You are now ready to access all your assigned features. Your supervisor {{supervisorName}} will be your point of contact.</p><p><a href="{{dashboardUrl}}">Go to Dashboard</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>اكتمل التوجيه!</h1><p>مرحباً {{recipientName}}،</p><p>تهانينا! لقد أكملت توجيهك بنجاح في {{completionDate}}.</p><p>أنت الآن جاهز للوصول إلى جميع الميزات المخصصة لك. مشرفك {{supervisorName}} سيكون نقطة الاتصال الخاصة بك.</p><p><a href="{{dashboardUrl}}">الذهاب إلى لوحة التحكم</a></p></div>`,
    textContent: 'Orientation Complete!\n\nHello {{recipientName}},\n\nCongratulations! You have completed your orientation on {{completionDate}}.\n\n---\n\nاكتمل التوجيه!\n\nمرحباً {{recipientName}}،\n\nتهانينا! لقد أكملت توجيهك في {{completionDate}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === ADDITIONAL AUTHENTICATION TEMPLATES ===
  {
    id: 'suspicious-login',
    name: 'Suspicious Login Detected / تم اكتشاف تسجيل دخول مشبوه',
    subject: 'Security Alert: Suspicious Login Attempt / تنبيه أمني: محاولة تسجيل دخول مشبوهة',
    category: 'authentication',
    isActive: true,
    variables: ['recipientName', 'attemptTime', 'location', 'ipAddress', 'deviceInfo', 'secureAccountUrl'],
    htmlContent: `<div dir="ltr"><h1 style="color: #dc2626;">Suspicious Login Detected</h1><p>Hello {{recipientName}},</p><p>We detected a suspicious login attempt on your account:</p><ul><li>Time: {{attemptTime}}</li><li>Location: {{location}}</li><li>IP Address: {{ipAddress}}</li><li>Device: {{deviceInfo}}</li></ul><p>If this wasn't you, please <a href="{{secureAccountUrl}}">secure your account</a> immediately.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1 style="color: #dc2626;">تم اكتشاف تسجيل دخول مشبوه</h1><p>مرحباً {{recipientName}}،</p><p>اكتشفنا محاولة تسجيل دخول مشبوهة على حسابك:</p><ul><li>الوقت: {{attemptTime}}</li><li>الموقع: {{location}}</li><li>عنوان IP: {{ipAddress}}</li><li>الجهاز: {{deviceInfo}}</li></ul><p>إذا لم تكن أنت، يرجى <a href="{{secureAccountUrl}}">تأمين حسابك</a> فوراً.</p></div>`,
    textContent: 'Suspicious Login Detected\n\nHello {{recipientName}},\n\nWe detected a suspicious login attempt.\n\nTime: {{attemptTime}}\nLocation: {{location}}\nIP: {{ipAddress}}\n\n---\n\nتم اكتشاف تسجيل دخول مشبوه\n\nمرحباً {{recipientName}}،\n\nاكتشفنا محاولة تسجيل دخول مشبوهة.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'security-key-added',
    name: 'Security Key Added / تمت إضافة مفتاح الأمان',
    subject: 'Security Key Added to Your Account / تمت إضافة مفتاح أمان لحسابك',
    category: 'authentication',
    isActive: true,
    variables: ['recipientName', 'keyName', 'addedDate', 'deviceInfo'],
    htmlContent: `<div dir="ltr"><h1>Security Key Added</h1><p>Hello {{recipientName}},</p><p>A new security key has been added to your account:</p><ul><li>Key Name: {{keyName}}</li><li>Added On: {{addedDate}}</li><li>Device: {{deviceInfo}}</li></ul><p>If you did not add this key, please contact your administrator immediately.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تمت إضافة مفتاح الأمان</h1><p>مرحباً {{recipientName}}،</p><p>تمت إضافة مفتاح أمان جديد لحسابك:</p><ul><li>اسم المفتاح: {{keyName}}</li><li>تاريخ الإضافة: {{addedDate}}</li><li>الجهاز: {{deviceInfo}}</li></ul><p>إذا لم تقم بإضافة هذا المفتاح، يرجى التواصل مع المسؤول فوراً.</p></div>`,
    textContent: 'Security Key Added\n\nHello {{recipientName}},\n\nA new security key {{keyName}} has been added on {{addedDate}}.\n\n---\n\nتمت إضافة مفتاح الأمان\n\nمرحباً {{recipientName}}،\n\nتمت إضافة مفتاح أمان جديد {{keyName}} في {{addedDate}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'device-removed',
    name: 'Device Removed / تمت إزالة الجهاز',
    subject: 'Device Removed from Your Account / تمت إزالة جهاز من حسابك',
    category: 'authentication',
    isActive: true,
    variables: ['recipientName', 'deviceName', 'removedDate', 'removedBy'],
    htmlContent: `<div dir="ltr"><h1>Device Removed</h1><p>Hello {{recipientName}},</p><p>A device has been removed from your account:</p><ul><li>Device: {{deviceName}}</li><li>Removed On: {{removedDate}}</li><li>Removed By: {{removedBy}}</li></ul><p>This device can no longer access your account.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تمت إزالة الجهاز</h1><p>مرحباً {{recipientName}}،</p><p>تمت إزالة جهاز من حسابك:</p><ul><li>الجهاز: {{deviceName}}</li><li>تاريخ الإزالة: {{removedDate}}</li><li>تمت الإزالة بواسطة: {{removedBy}}</li></ul><p>لم يعد بإمكان هذا الجهاز الوصول إلى حسابك.</p></div>`,
    textContent: 'Device Removed\n\nHello {{recipientName}},\n\nDevice {{deviceName}} has been removed from your account on {{removedDate}}.\n\n---\n\nتمت إزالة الجهاز\n\nمرحباً {{recipientName}}،\n\nتمت إزالة الجهاز {{deviceName}} من حسابك في {{removedDate}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === ADDITIONAL OPERATIONS TEMPLATES ===
  {
    id: 'data-collection-complete',
    name: 'Data Collection Complete / اكتمال جمع البيانات',
    subject: 'Data Collection Complete - {{siteName}} / اكتمل جمع البيانات',
    category: 'operations',
    isActive: true,
    variables: ['recipientName', 'siteName', 'collectorName', 'completionDate', 'recordsCollected', 'nextSteps'],
    htmlContent: `<div dir="ltr"><h1>Data Collection Complete</h1><p>Hello {{recipientName}},</p><p>Data collection has been completed:</p><ul><li>Site: {{siteName}}</li><li>Collector: {{collectorName}}</li><li>Completed: {{completionDate}}</li><li>Records Collected: {{recordsCollected}}</li></ul><p>Next Steps: {{nextSteps}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>اكتمل جمع البيانات</h1><p>مرحباً {{recipientName}}،</p><p>تم إكمال جمع البيانات:</p><ul><li>الموقع: {{siteName}}</li><li>جامع البيانات: {{collectorName}}</li><li>تاريخ الإكمال: {{completionDate}}</li><li>السجلات المجمعة: {{recordsCollected}}</li></ul><p>الخطوات التالية: {{nextSteps}}</p></div>`,
    textContent: 'Data Collection Complete\n\nHello {{recipientName}},\n\nData collection at {{siteName}} is complete.\n\nRecords: {{recordsCollected}}\n\n---\n\nاكتمل جمع البيانات\n\nمرحباً {{recipientName}}،\n\nاكتمل جمع البيانات في {{siteName}}.\n\nالسجلات: {{recordsCollected}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'field-report-due',
    name: 'Field Report Due / موعد تقرير الميدان',
    subject: 'Field Report Due: {{reportType}} / موعد تقرير الميدان',
    category: 'operations',
    isActive: true,
    variables: ['recipientName', 'reportType', 'dueDate', 'siteName', 'submissionUrl', 'supervisor'],
    htmlContent: `<div dir="ltr"><h1>Field Report Due</h1><p>Hello {{recipientName}},</p><p>Your field report is due:</p><ul><li>Report Type: {{reportType}}</li><li>Site: {{siteName}}</li><li>Due Date: {{dueDate}}</li><li>Supervisor: {{supervisor}}</li></ul><p><a href="{{submissionUrl}}">Submit Report</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>موعد تقرير الميدان</h1><p>مرحباً {{recipientName}}،</p><p>تقريرك الميداني مستحق:</p><ul><li>نوع التقرير: {{reportType}}</li><li>الموقع: {{siteName}}</li><li>تاريخ الاستحقاق: {{dueDate}}</li><li>المشرف: {{supervisor}}</li></ul><p><a href="{{submissionUrl}}">إرسال التقرير</a></p></div>`,
    textContent: 'Field Report Due\n\nHello {{recipientName}},\n\nYour {{reportType}} report for {{siteName}} is due on {{dueDate}}.\n\n---\n\nموعد تقرير الميدان\n\nمرحباً {{recipientName}}،\n\nتقريرك {{reportType}} لـ {{siteName}} مستحق في {{dueDate}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'equipment-request',
    name: 'Equipment Request / طلب معدات',
    subject: 'Equipment Request for Field Work / طلب معدات للعمل الميداني',
    category: 'operations',
    isActive: true,
    variables: ['recipientName', 'equipmentList', 'requestedBy', 'projectName', 'neededBy', 'pickupLocation'],
    htmlContent: `<div dir="ltr"><h1>Equipment Request</h1><p>Hello {{recipientName}},</p><p>Equipment has been requested for field work:</p><ul><li>Equipment: {{equipmentList}}</li><li>Requested By: {{requestedBy}}</li><li>Project: {{projectName}}</li><li>Needed By: {{neededBy}}</li><li>Pickup Location: {{pickupLocation}}</li></ul></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>طلب معدات</h1><p>مرحباً {{recipientName}}،</p><p>تم طلب معدات للعمل الميداني:</p><ul><li>المعدات: {{equipmentList}}</li><li>طلب بواسطة: {{requestedBy}}</li><li>المشروع: {{projectName}}</li><li>مطلوب بحلول: {{neededBy}}</li><li>موقع الاستلام: {{pickupLocation}}</li></ul></div>`,
    textContent: 'Equipment Request\n\nHello {{recipientName}},\n\nEquipment requested: {{equipmentList}}\nProject: {{projectName}}\nNeeded By: {{neededBy}}\n\n---\n\nطلب معدات\n\nمرحباً {{recipientName}}،\n\nالمعدات المطلوبة: {{equipmentList}}\nالمشروع: {{projectName}}\nمطلوب بحلول: {{neededBy}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === ADDITIONAL FINANCIAL TEMPLATES ===
  {
    id: 'expense-approved',
    name: 'Expense Approved / تمت الموافقة على المصروفات',
    subject: 'Expense Approved - {{amount}} SDG / تمت الموافقة على المصروفات',
    category: 'financial',
    isActive: true,
    variables: ['recipientName', 'amount', 'expenseType', 'approvedBy', 'approvalDate', 'referenceNumber'],
    htmlContent: `<div dir="ltr"><h1>Expense Approved</h1><p>Hello {{recipientName}},</p><p>Your expense has been approved:</p><ul><li>Amount: {{amount}} SDG</li><li>Type: {{expenseType}}</li><li>Approved By: {{approvedBy}}</li><li>Date: {{approvalDate}}</li><li>Reference: {{referenceNumber}}</li></ul></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تمت الموافقة على المصروفات</h1><p>مرحباً {{recipientName}}،</p><p>تمت الموافقة على مصروفاتك:</p><ul><li>المبلغ: {{amount}} جنيه سوداني</li><li>النوع: {{expenseType}}</li><li>وافق عليها: {{approvedBy}}</li><li>التاريخ: {{approvalDate}}</li><li>الرقم المرجعي: {{referenceNumber}}</li></ul></div>`,
    textContent: 'Expense Approved\n\nHello {{recipientName}},\n\nYour expense of {{amount}} SDG has been approved.\n\n---\n\nتمت الموافقة على المصروفات\n\nمرحباً {{recipientName}}،\n\nتمت الموافقة على مصروفاتك بقيمة {{amount}} جنيه سوداني.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'budget-exceeded',
    name: 'Budget Exceeded Warning / تحذير تجاوز الميزانية',
    subject: 'Budget Alert: {{projectName}} Exceeded Limit / تنبيه الميزانية: تجاوز الحد',
    category: 'financial',
    isActive: true,
    variables: ['recipientName', 'projectName', 'budgetLimit', 'currentSpending', 'overageAmount', 'requiredAction'],
    htmlContent: `<div dir="ltr"><h1 style="color: #f59e0b;">Budget Exceeded Warning</h1><p>Hello {{recipientName}},</p><p>The budget for {{projectName}} has been exceeded:</p><ul><li>Budget Limit: {{budgetLimit}} SDG</li><li>Current Spending: {{currentSpending}} SDG</li><li>Overage: {{overageAmount}} SDG</li></ul><p><strong>Required Action:</strong> {{requiredAction}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1 style="color: #f59e0b;">تحذير تجاوز الميزانية</h1><p>مرحباً {{recipientName}}،</p><p>تم تجاوز ميزانية {{projectName}}:</p><ul><li>حد الميزانية: {{budgetLimit}} جنيه سوداني</li><li>الإنفاق الحالي: {{currentSpending}} جنيه سوداني</li><li>التجاوز: {{overageAmount}} جنيه سوداني</li></ul><p><strong>الإجراء المطلوب:</strong> {{requiredAction}}</p></div>`,
    textContent: 'Budget Exceeded Warning\n\nHello {{recipientName}},\n\n{{projectName}} has exceeded its budget.\n\nBudget: {{budgetLimit}} SDG\nSpent: {{currentSpending}} SDG\nOverage: {{overageAmount}} SDG\n\n---\n\nتحذير تجاوز الميزانية\n\nمرحباً {{recipientName}}،\n\nتم تجاوز ميزانية {{projectName}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'reimbursement-processed',
    name: 'Reimbursement Processed / تمت معالجة الاسترداد',
    subject: 'Reimbursement Processed - {{amount}} SDG / تمت معالجة الاسترداد',
    category: 'financial',
    isActive: true,
    variables: ['recipientName', 'amount', 'expenseDescription', 'processedDate', 'paymentMethod', 'transactionId'],
    htmlContent: `<div dir="ltr"><h1>Reimbursement Processed</h1><p>Hello {{recipientName}},</p><p>Your reimbursement has been processed:</p><ul><li>Amount: {{amount}} SDG</li><li>For: {{expenseDescription}}</li><li>Processed On: {{processedDate}}</li><li>Payment Method: {{paymentMethod}}</li><li>Transaction ID: {{transactionId}}</li></ul></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تمت معالجة الاسترداد</h1><p>مرحباً {{recipientName}}،</p><p>تمت معالجة طلب الاسترداد الخاص بك:</p><ul><li>المبلغ: {{amount}} جنيه سوداني</li><li>لـ: {{expenseDescription}}</li><li>تاريخ المعالجة: {{processedDate}}</li><li>طريقة الدفع: {{paymentMethod}}</li><li>رقم المعاملة: {{transactionId}}</li></ul></div>`,
    textContent: 'Reimbursement Processed\n\nHello {{recipientName}},\n\nYour reimbursement of {{amount}} SDG has been processed.\n\nTransaction ID: {{transactionId}}\n\n---\n\nتمت معالجة الاسترداد\n\nمرحباً {{recipientName}}،\n\nتمت معالجة استردادك بقيمة {{amount}} جنيه سوداني.\n\nرقم المعاملة: {{transactionId}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === ADDITIONAL WORKFLOW TEMPLATES ===
  {
    id: 'task-overdue',
    name: 'Task Overdue / تأخر المهمة',
    subject: 'Task Overdue: {{taskName}} / تأخر المهمة',
    category: 'workflow',
    isActive: true,
    variables: ['recipientName', 'taskName', 'dueDate', 'daysOverdue', 'projectName', 'supervisorName'],
    htmlContent: `<div dir="ltr"><h1 style="color: #dc2626;">Task Overdue</h1><p>Hello {{recipientName}},</p><p>The following task is overdue:</p><ul><li>Task: {{taskName}}</li><li>Due Date: {{dueDate}}</li><li>Days Overdue: {{daysOverdue}}</li><li>Project: {{projectName}}</li></ul><p>Please complete this task immediately or contact {{supervisorName}} if you need assistance.</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1 style="color: #dc2626;">تأخر المهمة</h1><p>مرحباً {{recipientName}}،</p><p>المهمة التالية متأخرة:</p><ul><li>المهمة: {{taskName}}</li><li>تاريخ الاستحقاق: {{dueDate}}</li><li>أيام التأخير: {{daysOverdue}}</li><li>المشروع: {{projectName}}</li></ul><p>يرجى إكمال هذه المهمة فوراً أو التواصل مع {{supervisorName}} إذا كنت بحاجة للمساعدة.</p></div>`,
    textContent: 'Task Overdue\n\nHello {{recipientName}},\n\nTask {{taskName}} is {{daysOverdue}} days overdue.\n\nDue Date: {{dueDate}}\n\n---\n\nتأخر المهمة\n\nمرحباً {{recipientName}}،\n\nالمهمة {{taskName}} متأخرة {{daysOverdue}} أيام.\n\nتاريخ الاستحقاق: {{dueDate}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'approval-reminder',
    name: 'Approval Reminder / تذكير بالموافقة',
    subject: 'Approval Pending: {{itemName}} / موافقة معلقة',
    category: 'workflow',
    isActive: true,
    variables: ['recipientName', 'itemName', 'itemType', 'submittedBy', 'submittedDate', 'approvalUrl', 'urgency'],
    htmlContent: `<div dir="ltr"><h1>Approval Reminder</h1><p>Hello {{recipientName}},</p><p>An item is awaiting your approval:</p><ul><li>Item: {{itemName}}</li><li>Type: {{itemType}}</li><li>Submitted By: {{submittedBy}}</li><li>Submitted On: {{submittedDate}}</li><li>Urgency: {{urgency}}</li></ul><p><a href="{{approvalUrl}}">Review & Approve</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تذكير بالموافقة</h1><p>مرحباً {{recipientName}}،</p><p>عنصر ينتظر موافقتك:</p><ul><li>العنصر: {{itemName}}</li><li>النوع: {{itemType}}</li><li>مقدم بواسطة: {{submittedBy}}</li><li>تاريخ التقديم: {{submittedDate}}</li><li>الأولوية: {{urgency}}</li></ul><p><a href="{{approvalUrl}}">المراجعة والموافقة</a></p></div>`,
    textContent: 'Approval Reminder\n\nHello {{recipientName}},\n\n{{itemName}} is awaiting your approval.\n\nSubmitted By: {{submittedBy}}\nUrgency: {{urgency}}\n\n---\n\nتذكير بالموافقة\n\nمرحباً {{recipientName}}،\n\n{{itemName}} ينتظر موافقتك.\n\nمقدم بواسطة: {{submittedBy}}\nالأولوية: {{urgency}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'workflow-complete',
    name: 'Workflow Complete / اكتمال سير العمل',
    subject: 'Workflow Complete: {{workflowName}} / اكتمل سير العمل',
    category: 'workflow',
    isActive: true,
    variables: ['recipientName', 'workflowName', 'completionDate', 'duration', 'finalStatus', 'summaryUrl'],
    htmlContent: `<div dir="ltr"><h1>Workflow Complete</h1><p>Hello {{recipientName}},</p><p>A workflow has been completed:</p><ul><li>Workflow: {{workflowName}}</li><li>Completed On: {{completionDate}}</li><li>Duration: {{duration}}</li><li>Final Status: {{finalStatus}}</li></ul><p><a href="{{summaryUrl}}">View Summary</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>اكتمل سير العمل</h1><p>مرحباً {{recipientName}}،</p><p>تم إكمال سير العمل:</p><ul><li>سير العمل: {{workflowName}}</li><li>تاريخ الإكمال: {{completionDate}}</li><li>المدة: {{duration}}</li><li>الحالة النهائية: {{finalStatus}}</li></ul><p><a href="{{summaryUrl}}">عرض الملخص</a></p></div>`,
    textContent: 'Workflow Complete\n\nHello {{recipientName}},\n\nWorkflow {{workflowName}} has been completed.\n\nStatus: {{finalStatus}}\nDuration: {{duration}}\n\n---\n\nاكتمل سير العمل\n\nمرحباً {{recipientName}}،\n\nاكتمل سير العمل {{workflowName}}.\n\nالحالة: {{finalStatus}}\nالمدة: {{duration}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === ADDITIONAL SYSTEM TEMPLATES ===
  {
    id: 'system-update',
    name: 'System Update / تحديث النظام',
    subject: 'System Update Completed - PACT / اكتمل تحديث النظام',
    category: 'system',
    isActive: true,
    variables: ['recipientName', 'updateVersion', 'updateDate', 'newFeatures', 'improvements', 'releaseNotesUrl'],
    htmlContent: `<div dir="ltr"><h1>System Update Complete</h1><p>Hello {{recipientName}},</p><p>PACT Command Center has been updated:</p><ul><li>Version: {{updateVersion}}</li><li>Updated On: {{updateDate}}</li></ul><p><strong>New Features:</strong></p><p>{{newFeatures}}</p><p><strong>Improvements:</strong></p><p>{{improvements}}</p><p><a href="{{releaseNotesUrl}}">View Release Notes</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>اكتمل تحديث النظام</h1><p>مرحباً {{recipientName}}،</p><p>تم تحديث مركز قيادة PACT:</p><ul><li>الإصدار: {{updateVersion}}</li><li>تاريخ التحديث: {{updateDate}}</li></ul><p><strong>الميزات الجديدة:</strong></p><p>{{newFeatures}}</p><p><strong>التحسينات:</strong></p><p>{{improvements}}</p><p><a href="{{releaseNotesUrl}}">عرض ملاحظات الإصدار</a></p></div>`,
    textContent: 'System Update Complete\n\nHello {{recipientName}},\n\nPACT has been updated to version {{updateVersion}}.\n\nNew Features: {{newFeatures}}\nImprovements: {{improvements}}\n\n---\n\nاكتمل تحديث النظام\n\nمرحباً {{recipientName}}،\n\nتم تحديث PACT إلى الإصدار {{updateVersion}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'backup-complete',
    name: 'Backup Complete / اكتمال النسخ الاحتياطي',
    subject: 'Backup Completed Successfully / اكتمل النسخ الاحتياطي بنجاح',
    category: 'system',
    isActive: true,
    variables: ['recipientName', 'backupDate', 'backupSize', 'backupType', 'retentionPeriod', 'nextBackup'],
    htmlContent: `<div dir="ltr"><h1>Backup Complete</h1><p>Hello {{recipientName}},</p><p>System backup has been completed successfully:</p><ul><li>Date: {{backupDate}}</li><li>Size: {{backupSize}}</li><li>Type: {{backupType}}</li><li>Retention: {{retentionPeriod}}</li><li>Next Backup: {{nextBackup}}</li></ul></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>اكتمل النسخ الاحتياطي</h1><p>مرحباً {{recipientName}}،</p><p>تم إكمال النسخ الاحتياطي للنظام بنجاح:</p><ul><li>التاريخ: {{backupDate}}</li><li>الحجم: {{backupSize}}</li><li>النوع: {{backupType}}</li><li>فترة الاحتفاظ: {{retentionPeriod}}</li><li>النسخ الاحتياطي التالي: {{nextBackup}}</li></ul></div>`,
    textContent: 'Backup Complete\n\nHello {{recipientName}},\n\nSystem backup completed on {{backupDate}}.\n\nSize: {{backupSize}}\nNext Backup: {{nextBackup}}\n\n---\n\nاكتمل النسخ الاحتياطي\n\nمرحباً {{recipientName}}،\n\nاكتمل النسخ الاحتياطي في {{backupDate}}.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === ADDITIONAL REPORTS TEMPLATES ===
  {
    id: 'analytics-update',
    name: 'Analytics Update / تحديث التحليلات',
    subject: 'Weekly Analytics Update - {{weekDate}} / تحديث التحليلات الأسبوعي',
    category: 'reports',
    isActive: true,
    variables: ['recipientName', 'weekDate', 'totalVisits', 'completedTasks', 'pendingApprovals', 'dashboardUrl'],
    htmlContent: `<div dir="ltr"><h1>Weekly Analytics Update</h1><p>Hello {{recipientName}},</p><p>Here's your weekly analytics summary for {{weekDate}}:</p><ul><li>Total Site Visits: {{totalVisits}}</li><li>Completed Tasks: {{completedTasks}}</li><li>Pending Approvals: {{pendingApprovals}}</li></ul><p><a href="{{dashboardUrl}}">View Full Dashboard</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تحديث التحليلات الأسبوعي</h1><p>مرحباً {{recipientName}}،</p><p>إليك ملخص التحليلات الأسبوعي لـ {{weekDate}}:</p><ul><li>إجمالي زيارات المواقع: {{totalVisits}}</li><li>المهام المكتملة: {{completedTasks}}</li><li>الموافقات المعلقة: {{pendingApprovals}}</li></ul><p><a href="{{dashboardUrl}}">عرض لوحة التحكم الكاملة</a></p></div>`,
    textContent: 'Weekly Analytics Update\n\nHello {{recipientName}},\n\nAnalytics for {{weekDate}}:\n\nSite Visits: {{totalVisits}}\nCompleted Tasks: {{completedTasks}}\nPending Approvals: {{pendingApprovals}}\n\n---\n\nتحديث التحليلات الأسبوعي\n\nمرحباً {{recipientName}}،\n\nتحليلات {{weekDate}}:\n\nزيارات المواقع: {{totalVisits}}\nالمهام المكتملة: {{completedTasks}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'performance-summary',
    name: 'Performance Summary / ملخص الأداء',
    subject: 'Performance Summary - {{period}} / ملخص الأداء',
    category: 'reports',
    isActive: true,
    variables: ['recipientName', 'period', 'kpiScore', 'achievements', 'areasForImprovement', 'supervisorComments'],
    htmlContent: `<div dir="ltr"><h1>Performance Summary</h1><p>Hello {{recipientName}},</p><p>Your performance summary for {{period}}:</p><ul><li>KPI Score: {{kpiScore}}</li></ul><p><strong>Achievements:</strong></p><p>{{achievements}}</p><p><strong>Areas for Improvement:</strong></p><p>{{areasForImprovement}}</p><p><strong>Supervisor Comments:</strong></p><p>{{supervisorComments}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>ملخص الأداء</h1><p>مرحباً {{recipientName}}،</p><p>ملخص أدائك لـ {{period}}:</p><ul><li>نتيجة مؤشرات الأداء: {{kpiScore}}</li></ul><p><strong>الإنجازات:</strong></p><p>{{achievements}}</p><p><strong>مجالات التحسين:</strong></p><p>{{areasForImprovement}}</p><p><strong>تعليقات المشرف:</strong></p><p>{{supervisorComments}}</p></div>`,
    textContent: 'Performance Summary\n\nHello {{recipientName}},\n\nYour performance for {{period}}:\n\nKPI Score: {{kpiScore}}\nAchievements: {{achievements}}\n\n---\n\nملخص الأداء\n\nمرحباً {{recipientName}}،\n\nأداؤك لـ {{period}}:\n\nنتيجة مؤشرات الأداء: {{kpiScore}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === ADDITIONAL NOTIFICATION TEMPLATES ===
  {
    id: 'activity-summary',
    name: 'Activity Summary / ملخص النشاط',
    subject: 'Your Daily Activity Summary / ملخص نشاطك اليومي',
    category: 'notification',
    isActive: true,
    variables: ['recipientName', 'date', 'tasksCompleted', 'sitesVisited', 'pendingItems', 'tomorrowSchedule'],
    htmlContent: `<div dir="ltr"><h1>Daily Activity Summary</h1><p>Hello {{recipientName}},</p><p>Here's your activity summary for {{date}}:</p><ul><li>Tasks Completed: {{tasksCompleted}}</li><li>Sites Visited: {{sitesVisited}}</li><li>Pending Items: {{pendingItems}}</li></ul><p><strong>Tomorrow's Schedule:</strong></p><p>{{tomorrowSchedule}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>ملخص النشاط اليومي</h1><p>مرحباً {{recipientName}}،</p><p>إليك ملخص نشاطك لـ {{date}}:</p><ul><li>المهام المكتملة: {{tasksCompleted}}</li><li>المواقع التي تمت زيارتها: {{sitesVisited}}</li><li>العناصر المعلقة: {{pendingItems}}</li></ul><p><strong>جدول الغد:</strong></p><p>{{tomorrowSchedule}}</p></div>`,
    textContent: 'Daily Activity Summary\n\nHello {{recipientName}},\n\nYour summary for {{date}}:\n\nTasks Completed: {{tasksCompleted}}\nSites Visited: {{sitesVisited}}\nPending: {{pendingItems}}\n\n---\n\nملخص النشاط اليومي\n\nمرحباً {{recipientName}}،\n\nملخصك لـ {{date}}:\n\nالمهام المكتملة: {{tasksCompleted}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'deadline-reminder',
    name: 'Deadline Reminder / تذكير بالموعد النهائي',
    subject: 'Deadline Approaching: {{itemName}} / اقتراب الموعد النهائي',
    category: 'notification',
    isActive: true,
    variables: ['recipientName', 'itemName', 'deadline', 'daysRemaining', 'priority', 'actionUrl'],
    htmlContent: `<div dir="ltr"><h1>Deadline Reminder</h1><p>Hello {{recipientName}},</p><p>A deadline is approaching:</p><ul><li>Item: {{itemName}}</li><li>Deadline: {{deadline}}</li><li>Days Remaining: {{daysRemaining}}</li><li>Priority: {{priority}}</li></ul><p><a href="{{actionUrl}}">Take Action</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تذكير بالموعد النهائي</h1><p>مرحباً {{recipientName}}،</p><p>يقترب موعد نهائي:</p><ul><li>العنصر: {{itemName}}</li><li>الموعد النهائي: {{deadline}}</li><li>الأيام المتبقية: {{daysRemaining}}</li><li>الأولوية: {{priority}}</li></ul><p><a href="{{actionUrl}}">اتخاذ إجراء</a></p></div>`,
    textContent: 'Deadline Reminder\n\nHello {{recipientName}},\n\n{{itemName}} is due on {{deadline}}.\n\nDays Remaining: {{daysRemaining}}\nPriority: {{priority}}\n\n---\n\nتذكير بالموعد النهائي\n\nمرحباً {{recipientName}}،\n\n{{itemName}} مستحق في {{deadline}}.\n\nالأيام المتبقية: {{daysRemaining}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === ADDITIONAL COMMUNICATION TEMPLATES ===
  {
    id: 'meeting-reminder',
    name: 'Meeting Reminder / تذكير بالاجتماع',
    subject: 'Meeting Reminder: {{meetingTitle}} / تذكير بالاجتماع',
    category: 'communication',
    isActive: true,
    variables: ['recipientName', 'meetingTitle', 'meetingDate', 'meetingTime', 'location', 'agenda', 'meetingUrl'],
    htmlContent: `<div dir="ltr"><h1>Meeting Reminder</h1><p>Hello {{recipientName}},</p><p>This is a reminder about your upcoming meeting:</p><ul><li>Title: {{meetingTitle}}</li><li>Date: {{meetingDate}}</li><li>Time: {{meetingTime}}</li><li>Location: {{location}}</li></ul><p><strong>Agenda:</strong></p><p>{{agenda}}</p><p><a href="{{meetingUrl}}">Join Meeting</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تذكير بالاجتماع</h1><p>مرحباً {{recipientName}}،</p><p>هذا تذكير بالاجتماع القادم:</p><ul><li>العنوان: {{meetingTitle}}</li><li>التاريخ: {{meetingDate}}</li><li>الوقت: {{meetingTime}}</li><li>المكان: {{location}}</li></ul><p><strong>جدول الأعمال:</strong></p><p>{{agenda}}</p><p><a href="{{meetingUrl}}">الانضمام للاجتماع</a></p></div>`,
    textContent: 'Meeting Reminder\n\nHello {{recipientName}},\n\nMeeting: {{meetingTitle}}\nDate: {{meetingDate}}\nTime: {{meetingTime}}\nLocation: {{location}}\n\n---\n\nتذكير بالاجتماع\n\nمرحباً {{recipientName}}،\n\nالاجتماع: {{meetingTitle}}\nالتاريخ: {{meetingDate}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'broadcast-message',
    name: 'Broadcast Message / رسالة جماعية',
    subject: 'Important Announcement: {{title}} / إعلان مهم',
    category: 'communication',
    isActive: true,
    variables: ['recipientName', 'title', 'message', 'senderName', 'senderRole', 'effectiveDate'],
    htmlContent: `<div dir="ltr"><h1>{{title}}</h1><p>Hello {{recipientName}},</p><p>{{message}}</p><p>Effective Date: {{effectiveDate}}</p><p>Best regards,<br>{{senderName}}<br>{{senderRole}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>{{title}}</h1><p>مرحباً {{recipientName}}،</p><p>{{message}}</p><p>تاريخ السريان: {{effectiveDate}}</p><p>مع أطيب التحيات،<br>{{senderName}}<br>{{senderRole}}</p></div>`,
    textContent: '{{title}}\n\nHello {{recipientName}},\n\n{{message}}\n\nEffective Date: {{effectiveDate}}\n\nBest regards,\n{{senderName}}\n\n---\n\n{{title}}\n\nمرحباً {{recipientName}}،\n\n{{message}}\n\nتاريخ السريان: {{effectiveDate}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === ADDITIONAL COMPLIANCE TEMPLATES ===
  {
    id: 'training-required',
    name: 'Training Required / تدريب مطلوب',
    subject: 'Mandatory Training Required: {{trainingName}} / تدريب إلزامي مطلوب',
    category: 'compliance',
    isActive: true,
    variables: ['recipientName', 'trainingName', 'deadline', 'duration', 'trainingUrl', 'consequences'],
    htmlContent: `<div dir="ltr"><h1>Mandatory Training Required</h1><p>Hello {{recipientName}},</p><p>You are required to complete the following training:</p><ul><li>Training: {{trainingName}}</li><li>Deadline: {{deadline}}</li><li>Duration: {{duration}}</li></ul><p>Failure to complete may result in: {{consequences}}</p><p><a href="{{trainingUrl}}">Start Training</a></p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>تدريب إلزامي مطلوب</h1><p>مرحباً {{recipientName}}،</p><p>يجب عليك إكمال التدريب التالي:</p><ul><li>التدريب: {{trainingName}}</li><li>الموعد النهائي: {{deadline}}</li><li>المدة: {{duration}}</li></ul><p>عدم الإكمال قد يؤدي إلى: {{consequences}}</p><p><a href="{{trainingUrl}}">بدء التدريب</a></p></div>`,
    textContent: 'Mandatory Training Required\n\nHello {{recipientName}},\n\nYou must complete: {{trainingName}}\n\nDeadline: {{deadline}}\nDuration: {{duration}}\n\n---\n\nتدريب إلزامي مطلوب\n\nمرحباً {{recipientName}}،\n\nيجب إكمال: {{trainingName}}\n\nالموعد النهائي: {{deadline}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'compliance-check',
    name: 'Compliance Check / فحص الامتثال',
    subject: 'Compliance Check Due: {{checkType}} / فحص الامتثال مستحق',
    category: 'compliance',
    isActive: true,
    variables: ['recipientName', 'checkType', 'dueDate', 'department', 'checklistUrl', 'contactPerson'],
    htmlContent: `<div dir="ltr"><h1>Compliance Check Due</h1><p>Hello {{recipientName}},</p><p>A compliance check is due for your department:</p><ul><li>Check Type: {{checkType}}</li><li>Due Date: {{dueDate}}</li><li>Department: {{department}}</li></ul><p><a href="{{checklistUrl}}">View Checklist</a></p><p>Questions? Contact: {{contactPerson}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1>فحص الامتثال مستحق</h1><p>مرحباً {{recipientName}}،</p><p>فحص امتثال مستحق لقسمك:</p><ul><li>نوع الفحص: {{checkType}}</li><li>تاريخ الاستحقاق: {{dueDate}}</li><li>القسم: {{department}}</li></ul><p><a href="{{checklistUrl}}">عرض قائمة التحقق</a></p><p>أسئلة؟ تواصل مع: {{contactPerson}}</p></div>`,
    textContent: 'Compliance Check Due\n\nHello {{recipientName}},\n\nCheck Type: {{checkType}}\nDue Date: {{dueDate}}\nDepartment: {{department}}\n\n---\n\nفحص الامتثال مستحق\n\nمرحباً {{recipientName}}،\n\nنوع الفحص: {{checkType}}\nتاريخ الاستحقاق: {{dueDate}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // === ADDITIONAL EMERGENCY TEMPLATES ===
  {
    id: 'weather-alert',
    name: 'Weather Alert / تنبيه الطقس',
    subject: 'WEATHER ALERT: {{alertType}} - {{location}} / تنبيه الطقس',
    category: 'emergency',
    isActive: true,
    variables: ['recipientName', 'alertType', 'location', 'severity', 'expectedDuration', 'safetyInstructions', 'emergencyContact'],
    htmlContent: `<div dir="ltr"><h1 style="color: #f59e0b;">Weather Alert</h1><p>Hello {{recipientName}},</p><p>A weather alert has been issued:</p><ul><li>Alert Type: {{alertType}}</li><li>Location: {{location}}</li><li>Severity: {{severity}}</li><li>Expected Duration: {{expectedDuration}}</li></ul><p><strong>Safety Instructions:</strong></p><p>{{safetyInstructions}}</p><p>Emergency Contact: {{emergencyContact}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1 style="color: #f59e0b;">تنبيه الطقس</h1><p>مرحباً {{recipientName}}،</p><p>تم إصدار تنبيه طقس:</p><ul><li>نوع التنبيه: {{alertType}}</li><li>الموقع: {{location}}</li><li>الشدة: {{severity}}</li><li>المدة المتوقعة: {{expectedDuration}}</li></ul><p><strong>تعليمات السلامة:</strong></p><p>{{safetyInstructions}}</p><p>جهة اتصال الطوارئ: {{emergencyContact}}</p></div>`,
    textContent: 'Weather Alert\n\nHello {{recipientName}},\n\nAlert: {{alertType}}\nLocation: {{location}}\nSeverity: {{severity}}\n\nSafety Instructions: {{safetyInstructions}}\n\n---\n\nتنبيه الطقس\n\nمرحباً {{recipientName}}،\n\nالتنبيه: {{alertType}}\nالموقع: {{location}}\nالشدة: {{severity}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'security-notice',
    name: 'Security Notice / إشعار أمني',
    subject: 'SECURITY NOTICE: {{title}} / إشعار أمني',
    category: 'emergency',
    isActive: true,
    variables: ['recipientName', 'title', 'description', 'affectedAreas', 'precautions', 'effectiveUntil', 'securityContact'],
    htmlContent: `<div dir="ltr"><h1 style="color: #dc2626;">Security Notice</h1><p>Hello {{recipientName}},</p><p><strong>{{title}}</strong></p><p>{{description}}</p><p><strong>Affected Areas:</strong> {{affectedAreas}}</p><p><strong>Precautions:</strong> {{precautions}}</p><p>Effective Until: {{effectiveUntil}}</p><p>Security Contact: {{securityContact}}</p></div><hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;"><div dir="rtl" style="text-align: right;"><h1 style="color: #dc2626;">إشعار أمني</h1><p>مرحباً {{recipientName}}،</p><p><strong>{{title}}</strong></p><p>{{description}}</p><p><strong>المناطق المتأثرة:</strong> {{affectedAreas}}</p><p><strong>الاحتياطات:</strong> {{precautions}}</p><p>ساري حتى: {{effectiveUntil}}</p><p>جهة اتصال الأمن: {{securityContact}}</p></div>`,
    textContent: 'Security Notice\n\nHello {{recipientName}},\n\n{{title}}\n\n{{description}}\n\nAffected Areas: {{affectedAreas}}\nPrecautions: {{precautions}}\n\n---\n\nإشعار أمني\n\nمرحباً {{recipientName}}،\n\n{{title}}\n\n{{description}}\n\nالمناطق المتأثرة: {{affectedAreas}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const TEMPLATES_STORAGE_KEY = 'pact_email_templates';
const TEMPLATES_VERSION_KEY = 'pact_email_templates_version';
const CURRENT_TEMPLATES_VERSION = '2.2-expanded-templates';

interface TemplateCategory {
  id: string;
  name: string;
  nameAr: string;
  icon: typeof Mail;
  description: string;
}

const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  { id: 'all', name: 'All Templates', nameAr: 'جميع القوالب', icon: FolderOpen, description: 'View all email templates' },
  { id: 'onboarding', name: 'Onboarding', nameAr: 'التأهيل', icon: UserPlus, description: 'Welcome, account activation, role changes' },
  { id: 'authentication', name: 'Authentication', nameAr: 'المصادقة', icon: Lock, description: 'Password reset, 2FA, login alerts' },
  { id: 'operations', name: 'Operations', nameAr: 'العمليات', icon: MapPin, description: 'Site visits, GPS requests, field work' },
  { id: 'financial', name: 'Financial', nameAr: 'المالية', icon: Wallet, description: 'Payments, approvals, wallet transactions' },
  { id: 'workflow', name: 'Workflow', nameAr: 'سير العمل', icon: FolderOpen, description: 'MMP, projects, task assignments' },
  { id: 'system', name: 'System', nameAr: 'النظام', icon: Wrench, description: 'Maintenance, alerts, system updates' },
  { id: 'notification', name: 'Notifications', nameAr: 'الإشعارات', icon: Bell, description: 'General notifications and alerts' },
  { id: 'communication', name: 'Communication', nameAr: 'التواصل', icon: MessageSquare, description: 'Custom messages, announcements' },
  { id: 'compliance', name: 'Compliance', nameAr: 'الامتثال', icon: Shield, description: 'Audits, policies, regulatory requirements' },
  { id: 'emergency', name: 'Emergency', nameAr: 'الطوارئ', icon: AlertTriangle, description: 'Critical alerts, security, evacuations' },
  { id: 'custom', name: 'Custom', nameAr: 'مخصص', icon: Tag, description: 'User-created templates' },
];

export default function EmailManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('settings');
  const [smtpStatus, setSmtpStatus] = useState<'checking' | 'configured' | 'not_configured' | 'error'>('checking');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  // Templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Template preview state
  const [previewWithSampleData, setPreviewWithSampleData] = useState(true);
  const [templateTestEmail, setTemplateTestEmail] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  // Compose state
  const [users, setUsers] = useState<UserForEmail[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeMessage, setComposeMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Scheduling state
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  // Load templates from localStorage with version check
  useEffect(() => {
    const storedVersion = localStorage.getItem(TEMPLATES_VERSION_KEY);
    
    // If version doesn't match, reset to new bilingual templates
    if (storedVersion !== CURRENT_TEMPLATES_VERSION) {
      setTemplates(defaultTemplates);
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(defaultTemplates));
      localStorage.setItem(TEMPLATES_VERSION_KEY, CURRENT_TEMPLATES_VERSION);
      return;
    }
    
    const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTemplates(parsed);
        } else {
          setTemplates(defaultTemplates);
          localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(defaultTemplates));
        }
      } catch {
        setTemplates(defaultTemplates);
        localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(defaultTemplates));
      }
    } else {
      setTemplates(defaultTemplates);
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(defaultTemplates));
    }
  }, []);

  // Save templates to localStorage when changed
  const saveTemplates = (newTemplates: EmailTemplate[]) => {
    setTemplates(newTemplates);
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(newTemplates));
  };

  // Check SMTP configuration status
  useEffect(() => {
    checkSmtpStatus();
  }, []);

  const checkSmtpStatus = async () => {
    setSmtpStatus('checking');
    try {
      // Test SMTP by calling the send-email function with a dry-run
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: { 
          action: 'check-config'
        },
      });
      
      if (error) {
        console.warn('SMTP check error:', error);
        // Assume configured if we get a function error (means function exists)
        setSmtpStatus('configured');
      } else if (data?.configured === false) {
        setSmtpStatus('not_configured');
      } else {
        setSmtpStatus('configured');
      }
    } catch (error) {
      console.error('SMTP status check failed:', error);
      // Assume configured - the actual send will fail if not
      setSmtpStatus('configured');
    }
  };

  // Load users for compose
  useEffect(() => {
    if (activeTab === 'compose') {
      fetchUsers();
    }
  }, [activeTab]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .order('full_name');
      
      if (error) throw error;
      setUsers((data || []).filter(u => u.email));
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast({
        title: 'Error loading users',
        description: 'Could not load user list',
        variant: 'destructive',
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  const testSmtpConnection = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    setTestingSmtp(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: testEmail,
          subject: 'PACT SMTP Test - Connection Successful',
          html: `
            <h1>SMTP Test Successful</h1>
            <p>This is a test email from PACT Command Center.</p>
            <p>If you received this email, your SMTP configuration is working correctly.</p>
            <p>Sent at: ${new Date().toLocaleString()}</p>
          `,
          text: 'SMTP Test Successful\n\nThis is a test email from PACT Command Center.\n\nIf you received this email, your SMTP configuration is working correctly.',
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Test email sent',
          description: `Check ${testEmail} for the test message`,
        });
        setTestEmail('');
      } else {
        throw new Error(data?.error || 'Failed to send test email');
      }
    } catch (error: any) {
      toast({
        title: 'Test failed',
        description: error.message || 'Could not send test email',
        variant: 'destructive',
      });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleCreateTemplate = () => {
    setEditingTemplate({
      id: `template-${Date.now()}`,
      name: '',
      subject: '',
      htmlContent: '',
      textContent: '',
      category: 'custom',
      isActive: true,
      variables: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setTemplateDialogOpen(true);
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate({ ...template });
    setTemplateDialogOpen(true);
  };

  const handleSaveTemplate = () => {
    if (!editingTemplate) return;
    
    if (!editingTemplate.name || !editingTemplate.subject) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in template name and subject',
        variant: 'destructive',
      });
      return;
    }

    // Extract variables from content using {{variableName}} pattern
    const variablePattern = /\{\{(\w+)\}\}/g;
    const allContent = editingTemplate.htmlContent + editingTemplate.subject;
    const matches = [...allContent.matchAll(variablePattern)];
    const extractedVariables = [...new Set(matches.map(m => m[1]))];

    const updatedTemplate = {
      ...editingTemplate,
      variables: extractedVariables,
      updatedAt: new Date().toISOString(),
    };

    const existingIndex = templates.findIndex(t => t.id === updatedTemplate.id);
    let newTemplates: EmailTemplate[];
    
    if (existingIndex >= 0) {
      newTemplates = templates.map((t, i) => i === existingIndex ? updatedTemplate : t);
    } else {
      newTemplates = [...templates, updatedTemplate];
    }

    saveTemplates(newTemplates);
    setTemplateDialogOpen(false);
    setEditingTemplate(null);
    
    toast({
      title: 'Template saved',
      description: `"${updatedTemplate.name}" has been saved`,
    });
  };

  const handleDeleteTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    
    if (defaultTemplates.some(t => t.id === templateId)) {
      toast({
        title: 'Cannot delete',
        description: 'System templates cannot be deleted',
        variant: 'destructive',
      });
      return;
    }

    const newTemplates = templates.filter(t => t.id !== templateId);
    saveTemplates(newTemplates);
    
    toast({
      title: 'Template deleted',
      description: `"${template.name}" has been removed`,
    });
  };

  const handleToggleTemplate = (templateId: string) => {
    const newTemplates = templates.map(t => 
      t.id === templateId ? { ...t, isActive: !t.isActive, updatedAt: new Date().toISOString() } : t
    );
    saveTemplates(newTemplates);
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.category.toLowerCase().includes(templateSearch.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryCount = (categoryId: string) => {
    if (categoryId === 'all') return templates.length;
    return templates.filter(t => t.category === categoryId).length;
  };

  // Sample data for template preview
  const getSampleData = (): Record<string, string> => ({
    recipientName: 'Ahmed Mohamed',
    loginUrl: 'https://pact.app/login',
    role: 'Field Coordinator',
    oldRole: 'Data Collector',
    newRole: 'Field Coordinator',
    effectiveDate: format(new Date(), 'PPP'),
    reason: 'Project restructuring',
    contactEmail: 'support@pactorg.com',
    otpCode: '123456',
    expiryMinutes: '15',
    changeDate: format(new Date(), 'PPP p'),
    ipAddress: '192.168.1.100',
    enabledDate: format(new Date(), 'PPP'),
    deviceInfo: 'Chrome on Windows',
    location: 'Khartoum, Sudan',
    loginTime: format(new Date(), 'PPP p'),
    siteName: 'Al-Fashir Community Center',
    visitDate: format(new Date(), 'PPP'),
    visitTime: '09:00 AM',
    projectName: 'Sudan Community Development',
    instructions: 'Complete beneficiary survey and GPS capture',
    contactPerson: 'Fatima Ali',
    collectorName: 'Omar Hassan',
    status: 'Completed',
    notes: 'All objectives met successfully',
    originalDate: format(new Date(), 'PPP'),
    newDate: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'PPP'),
    cancelledBy: 'Program Manager',
    requestedBy: 'Field Supervisor',
    deadline: format(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), 'PPP'),
    amount: '50,000',
    approvedBy: 'Finance Director',
    approvalDate: format(new Date(), 'PPP'),
    referenceNumber: 'DP-2024-001234',
    rejectedBy: 'Finance Manager',
    transactionId: 'TXN-2024-005678',
    processedDate: format(new Date(), 'PPP p'),
    auditType: 'Quarterly Financial Review',
    auditDate: format(new Date(), 'PPP'),
    auditorName: 'External Audit Team',
    policyName: 'Data Protection Policy',
    updateDate: format(new Date(), 'PPP'),
    keyChanges: 'Updated data retention period to 7 years',
    complianceArea: 'Financial Reporting',
    dueDate: format(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), 'PPP'),
    requirements: 'Submit quarterly expense reports',
    privacyOfficer: 'Legal Department',
    alertLevel: 'HIGH',
    incidentType: 'System Breach',
    briefDescription: 'Unauthorized access detected',
    immediateActions: 'Change passwords and review access logs',
    evacuationRoute: 'Exit via main stairwell to parking lot',
    assemblyPoint: 'North parking lot near main gate',
    emergencyContact: '+249-123-456-789',
    serviceName: 'Database Server',
    outageTime: format(new Date(), 'PPP p'),
    affectedUsers: 'All field teams',
    estimatedRestoration: '2 hours',
    workaround: 'Use offline mode in mobile app',
    statusUrl: 'https://status.pactorg.com',
  });

  // Replace variables in template with sample or actual data
  const replaceVariables = (content: string, data: Record<string, string>): string => {
    let result = content;
    Object.entries(data).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });
    return result;
  };

  // Send test email with template
  const sendTestTemplateEmail = async () => {
    if (!selectedTemplate) return;
    
    if (!templateTestEmail || !templateTestEmail.includes('@')) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    setSendingTestEmail(true);
    try {
      const sampleData = getSampleData();
      const renderedSubject = replaceVariables(selectedTemplate.subject, sampleData);
      const renderedHtml = replaceVariables(selectedTemplate.htmlContent, sampleData);
      const renderedText = replaceVariables(selectedTemplate.textContent, sampleData);

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: templateTestEmail,
          subject: `[TEST] ${renderedSubject}`,
          html: renderedHtml,
          text: renderedText,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Test email sent',
          description: `Template preview sent to ${templateTestEmail}`,
        });
        setTemplateTestEmail('');
      } else {
        throw new Error(data?.error || 'Failed to send test email');
      }
    } catch (error: any) {
      toast({
        title: 'Failed to send test email',
        description: error.message || 'Could not send test email',
        variant: 'destructive',
      });
    } finally {
      setSendingTestEmail(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.role?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const handleSelectAllUsers = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map(u => u.id));
    }
  };

  const handleToggleUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setComposeSubject(template.subject);
      setComposeMessage(template.textContent);
    }
  };

  const sendBulkEmail = async () => {
    if (selectedUsers.length === 0) {
      toast({
        title: 'No recipients selected',
        description: 'Please select at least one user to send the email to',
        variant: 'destructive',
      });
      return;
    }

    if (!composeSubject || !composeMessage) {
      toast({
        title: 'Missing content',
        description: 'Please enter a subject and message',
        variant: 'destructive',
      });
      return;
    }

    setSendingEmail(true);
    let successCount = 0;
    let failCount = 0;

    try {
      const selectedUserData = users.filter(u => selectedUsers.includes(u.id));
      
      for (const user of selectedUserData) {
        try {
          // Replace variables in subject and message
          const personalizedSubject = composeSubject
            .replace(/\{\{recipientName\}\}/g, user.full_name || 'User');
          const personalizedMessage = composeMessage
            .replace(/\{\{recipientName\}\}/g, user.full_name || 'User');

          const { error } = await supabase.functions.invoke('send-email', {
            body: {
              to: user.email,
              subject: personalizedSubject,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h1 style="color: #1a1a2e; margin-bottom: 20px;">PACT Command Center</h1>
                    <p style="color: #333;">Hello ${user.full_name || 'User'},</p>
                    <div style="color: #555; line-height: 1.6; white-space: pre-wrap;">${personalizedMessage}</div>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                    <p style="color: #999; font-size: 12px;">This message was sent from PACT Command Center.</p>
                  </div>
                </div>
              `,
              text: `Hello ${user.full_name || 'User'},\n\n${personalizedMessage}\n\n---\nThis message was sent from PACT Command Center.`,
            },
          });

          if (error) throw error;
          successCount++;
        } catch (err) {
          console.error(`Failed to send to ${user.email}:`, err);
          failCount++;
        }
      }

      toast({
        title: 'Emails sent',
        description: `Successfully sent to ${successCount} user(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
      });

      if (successCount > 0) {
        setSelectedUsers([]);
        setComposeSubject('');
        setComposeMessage('');
        setSelectedTemplateId('');
      }
    } catch (error: any) {
      toast({
        title: 'Error sending emails',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      onboarding: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
      authentication: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
      operations: 'bg-green-500/10 text-green-600 border-green-500/30',
      workflow: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
      notification: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
      communication: 'bg-pink-500/10 text-pink-600 border-pink-500/30',
      custom: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
    };
    return (
      <Badge variant="outline" className={colors[category] || colors.custom}>
        {category}
      </Badge>
    );
  };

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Mail className="h-6 w-6" />
              Email Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure outgoing emails, manage templates, and send communications
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="settings" className="flex items-center gap-2" data-testid="tab-settings">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2" data-testid="tab-templates">
            <FileText className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="compose" className="flex items-center gap-2" data-testid="tab-compose">
            <Send className="h-4 w-4" />
            Compose
          </TabsTrigger>
        </TabsList>

        {/* SMTP Settings Tab */}
        <TabsContent value="settings" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                SMTP Configuration Status
              </CardTitle>
              <CardDescription>
                Email server configuration managed through secure environment secrets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Status Display */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                {smtpStatus === 'checking' && (
                  <>
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    <div>
                      <p className="font-medium">Checking configuration...</p>
                      <p className="text-sm text-muted-foreground">Verifying SMTP settings</p>
                    </div>
                  </>
                )}
                {smtpStatus === 'configured' && (
                  <>
                    <CheckCircle className="h-6 w-6 text-green-600" />
                    <div>
                      <p className="font-medium text-green-600">SMTP Configured</p>
                      <p className="text-sm text-muted-foreground">
                        Email sending is available via IONOS SMTP (noreply@pactorg.com)
                      </p>
                    </div>
                  </>
                )}
                {smtpStatus === 'not_configured' && (
                  <>
                    <XCircle className="h-6 w-6 text-red-600" />
                    <div>
                      <p className="font-medium text-red-600">SMTP Not Configured</p>
                      <p className="text-sm text-muted-foreground">
                        Please configure SMTP secrets in the Replit Secrets panel
                      </p>
                    </div>
                  </>
                )}
                {smtpStatus === 'error' && (
                  <>
                    <AlertTriangle className="h-6 w-6 text-yellow-600" />
                    <div>
                      <p className="font-medium text-yellow-600">Configuration Error</p>
                      <p className="text-sm text-muted-foreground">
                        Could not verify SMTP configuration
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Security Notice */}
              <div className="flex items-start gap-3 p-4 rounded-lg border border-blue-500/30 bg-blue-500/5">
                <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-600">Secure Configuration</p>
                  <p className="text-muted-foreground mt-1">
                    SMTP credentials (host, port, username, password) are stored as encrypted secrets
                    and cannot be viewed or modified here for security. To update SMTP settings, 
                    use the Replit Secrets panel.
                  </p>
                </div>
              </div>

              {/* Test Email */}
              <div className="space-y-3">
                <Label>Test SMTP Configuration</Label>
                <div className="flex gap-3 flex-wrap">
                  <Input
                    placeholder="Enter email address to test..."
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="max-w-sm"
                    data-testid="input-test-smtp-email"
                  />
                  <Button
                    onClick={testSmtpConnection}
                    disabled={testingSmtp || smtpStatus !== 'configured'}
                    data-testid="button-test-smtp"
                  >
                    {testingSmtp ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Test Email
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Send a test email to verify the SMTP configuration is working correctly
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Current Configuration Info */}
          <Card>
            <CardHeader>
              <CardTitle>Email Configuration Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">From Address</p>
                  <p className="font-medium">noreply@pactorg.com</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Provider</p>
                  <p className="font-medium">IONOS SMTP</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Email Types Supported</p>
                  <p className="font-medium">OTP, Password Reset, Notifications, Custom</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Language Support</p>
                  <p className="font-medium">English, Arabic (Bilingual)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6 mt-6">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <div>
              <h2 className="text-xl font-semibold">Email Templates</h2>
              <p className="text-sm text-muted-foreground">Manage email templates used throughout the system</p>
            </div>
            <Button onClick={handleCreateTemplate} data-testid="button-create-template">
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            {/* Category Sidebar */}
            <Card className="lg:h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Categories</CardTitle>
                <CardDescription className="text-xs">Filter templates by category</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px] lg:h-auto lg:max-h-[500px]">
                  <div className="space-y-1 p-3 pt-0">
                    {TEMPLATE_CATEGORIES.map((category) => {
                      const IconComponent = category.icon;
                      const count = getCategoryCount(category.id);
                      const isSelected = selectedCategory === category.id;
                      return (
                        <button
                          key={category.id}
                          onClick={() => setSelectedCategory(category.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors ${
                            isSelected 
                              ? 'bg-primary/10 text-primary border border-primary/20' 
                              : 'hover-elevate'
                          }`}
                          data-testid={`category-${category.id}`}
                        >
                          <IconComponent className="h-4 w-4 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{category.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{category.nameAr}</p>
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {count}
                          </Badge>
                          {isSelected && <ChevronRight className="h-4 w-4 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Templates List */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-base">
                      {TEMPLATE_CATEGORIES.find(c => c.id === selectedCategory)?.name || 'All Templates'}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
                    </CardDescription>
                  </div>
                  {/* Mobile category selector */}
                  <div className="lg:hidden w-full">
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger data-testid="select-category-mobile">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {TEMPLATE_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name} ({getCategoryCount(cat.id)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search templates..."
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-templates"
                    />
                  </div>
                </div>

                <ScrollArea className="h-[500px]">
                  {filteredTemplates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <p className="font-medium text-muted-foreground">No templates found</p>
                      <p className="text-sm text-muted-foreground/70 mt-1">
                        {templateSearch ? 'Try a different search term' : 'No templates in this category'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredTemplates.map((template) => (
                        <div
                          key={template.id}
                          className="flex items-start gap-3 p-3 rounded-md border bg-card hover-elevate"
                          data-testid={`row-template-${template.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium truncate">{template.name}</p>
                              {getCategoryBadge(template.category)}
                              {!template.isActive && (
                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                  Disabled
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate mt-1">{template.subject}</p>
                            <div className="flex gap-1 flex-wrap mt-2">
                              {template.variables.slice(0, 3).map(v => (
                                <Badge key={v} variant="secondary" className="text-xs">
                                  {`{{${v}}}`}
                                </Badge>
                              ))}
                              {template.variables.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{template.variables.length - 3} more
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Switch
                              checked={template.isActive}
                              onCheckedChange={() => handleToggleTemplate(template.id)}
                              data-testid={`switch-template-${template.id}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedTemplate(template)}
                              data-testid={`button-view-template-${template.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditTemplate(template)}
                              data-testid={`button-edit-template-${template.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {!defaultTemplates.some(t => t.id === template.id) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteTemplate(template.id)}
                                data-testid={`button-delete-template-${template.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Compose Tab */}
        <TabsContent value="compose" className="space-y-6 mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Recipients */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Select Recipients
                </CardTitle>
                <CardDescription>Choose users to receive this email</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-users"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={handleSelectAllUsers}>
                    {selectedUsers.length === filteredUsers.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  {selectedUsers.length} of {users.length} selected
                </div>

                <ScrollArea className="h-[300px] rounded-md border p-2">
                  {loadingUsers ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No users found
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredUsers.map((user) => (
                        <div
                          key={user.id}
                          className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                            selectedUsers.includes(user.id) ? 'bg-primary/10' : 'hover-elevate'
                          }`}
                          onClick={() => handleToggleUser(user.id)}
                          data-testid={`user-${user.id}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(user.id)}
                            onChange={() => {}}
                            className="h-4 w-4"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{user.full_name || 'Unknown'}</p>
                            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {user.role}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Compose Message */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Compose Message
                </CardTitle>
                <CardDescription>Write your email message</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Use Template (Optional)</Label>
                  <Select 
                    value={selectedTemplateId} 
                    onValueChange={(v) => {
                      setSelectedTemplateId(v);
                      applyTemplate(v);
                    }}
                  >
                    <SelectTrigger data-testid="select-template">
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.filter(t => t.isActive).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Subject *</Label>
                  <Input
                    placeholder="Enter email subject..."
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    data-testid="input-compose-subject"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {"{{recipientName}}"} for personalization
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Message *</Label>
                  <Textarea
                    placeholder="Write your message here..."
                    value={composeMessage}
                    onChange={(e) => setComposeMessage(e.target.value)}
                    rows={8}
                    data-testid="input-compose-message"
                  />
                </div>

                {/* Scheduling Section */}
                <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium flex items-center gap-2">
                          Schedule Email
                          <Badge variant="secondary" className="text-xs">Preview</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">Send at a specific date and time</p>
                      </div>
                    </div>
                    <Switch
                      checked={isScheduled}
                      onCheckedChange={setIsScheduled}
                      data-testid="switch-schedule-email"
                    />
                  </div>
                  
                  {isScheduled && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2 pt-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Date</Label>
                          <Input
                            type="date"
                            value={scheduledDate}
                            onChange={(e) => setScheduledDate(e.target.value)}
                            min={format(new Date(), 'yyyy-MM-dd')}
                            data-testid="input-schedule-date"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Time</Label>
                          <Input
                            type="time"
                            value={scheduledTime}
                            onChange={(e) => setScheduledTime(e.target.value)}
                            data-testid="input-schedule-time"
                          />
                        </div>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs">
                        <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">
                          Scheduling is a preview feature. Emails will be queued for demonstration purposes. 
                          Full scheduling requires backend cron job infrastructure.
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Send/Schedule Buttons */}
                <div className="space-y-2">
                  {isScheduled ? (
                    <Button
                      className="w-full"
                      onClick={() => {
                        if (!scheduledDate || !scheduledTime) {
                          toast({
                            title: 'Missing schedule',
                            description: 'Please select both date and time for scheduling',
                            variant: 'destructive',
                          });
                          return;
                        }
                        const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
                        toast({
                          title: 'Email Queued (Preview)',
                          description: `Email to ${selectedUsers.length} user(s) queued for ${format(scheduledDateTime, 'PPP')} at ${format(scheduledDateTime, 'p')}. Note: Full scheduling requires backend infrastructure.`,
                        });
                        setIsScheduled(false);
                        setScheduledDate('');
                        setScheduledTime('');
                        setSelectedUsers([]);
                        setComposeSubject('');
                        setComposeMessage('');
                      }}
                      disabled={selectedUsers.length === 0 || !composeSubject || !composeMessage}
                      data-testid="button-schedule-email"
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Schedule for {selectedUsers.length} user(s)
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={sendBulkEmail}
                      disabled={sendingEmail || selectedUsers.length === 0}
                      data-testid="button-send-email"
                    >
                      {sendingEmail ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Sending to {selectedUsers.length} user(s)...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send Now to {selectedUsers.length} user(s)
                        </>
                      )}
                    </Button>
                  )}
                  
                  {/* Broadcast Info */}
                  <div className="flex items-center gap-2 p-2 rounded bg-muted/50 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    <span>Each recipient will receive a personalized email with their name</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Template Preview Dialog - Enhanced */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {selectedTemplate?.name}
            </DialogTitle>
            <DialogDescription>Preview and test your email template</DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4">
              {/* Preview Mode Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Preview with Sample Data</p>
                    <p className="text-xs text-muted-foreground">Replace variables with realistic example values</p>
                  </div>
                </div>
                <Switch
                  checked={previewWithSampleData}
                  onCheckedChange={setPreviewWithSampleData}
                  data-testid="switch-preview-sample-data"
                />
              </div>

              {/* Subject */}
              <div>
                <Label className="text-muted-foreground">Subject</Label>
                <p className="font-medium mt-1">
                  {previewWithSampleData 
                    ? replaceVariables(selectedTemplate.subject, getSampleData())
                    : selectedTemplate.subject}
                </p>
              </div>

              {/* Variables */}
              <div>
                <Label className="text-muted-foreground">Variables Used</Label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {selectedTemplate.variables.length > 0 ? (
                    selectedTemplate.variables.map(v => (
                      <Badge key={v} variant="outline">{`{{${v}}}`}</Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No variables in this template</p>
                  )}
                </div>
              </div>

              {/* HTML Content Preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-muted-foreground">Email Preview</Label>
                  <Badge variant="secondary" className="text-xs">
                    {previewWithSampleData ? 'With Sample Data' : 'Raw Template'}
                  </Badge>
                </div>
                <div 
                  className="p-4 rounded-lg border bg-white dark:bg-gray-900 max-h-[300px] overflow-auto"
                  dangerouslySetInnerHTML={{ 
                    __html: previewWithSampleData 
                      ? replaceVariables(selectedTemplate.htmlContent, getSampleData())
                      : selectedTemplate.htmlContent 
                  }}
                />
              </div>

              {/* Send Test Email */}
              <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
                <div className="flex items-center gap-2">
                  <TestTube className="h-4 w-4 text-primary" />
                  <Label className="font-medium">Send Test Email</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Send this template with sample data to verify it looks correct
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    placeholder="Enter test email address..."
                    value={templateTestEmail}
                    onChange={(e) => setTemplateTestEmail(e.target.value)}
                    className="flex-1 min-w-[200px]"
                    data-testid="input-template-test-email"
                  />
                  <Button
                    onClick={sendTestTemplateEmail}
                    disabled={sendingTestEmail || smtpStatus !== 'configured'}
                    data-testid="button-send-test-template"
                  >
                    {sendingTestEmail ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Test
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
              Close
            </Button>
            <Button onClick={() => {
              if (selectedTemplate) {
                handleEditTemplate(selectedTemplate);
                setSelectedTemplate(null);
              }
            }} data-testid="button-edit-from-preview">
              <Edit className="h-4 w-4 mr-2" />
              Edit Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Edit Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate?.name ? 'Edit Template' : 'Create Template'}
            </DialogTitle>
            <DialogDescription>
              Configure your email template. Use {"{{variableName}}"} for dynamic content.
            </DialogDescription>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Template Name *</Label>
                  <Input
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    placeholder="e.g., Welcome Email"
                    data-testid="input-template-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={editingTemplate.category}
                    onValueChange={(v) => setEditingTemplate({ ...editingTemplate, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="onboarding">Onboarding</SelectItem>
                      <SelectItem value="authentication">Authentication</SelectItem>
                      <SelectItem value="operations">Operations</SelectItem>
                      <SelectItem value="workflow">Workflow</SelectItem>
                      <SelectItem value="notification">Notification</SelectItem>
                      <SelectItem value="communication">Communication</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={editingTemplate.subject}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                  placeholder="e.g., Welcome to PACT - {{recipientName}}"
                  data-testid="input-template-subject"
                />
              </div>

              <div className="space-y-2">
                <Label>HTML Content</Label>
                <Textarea
                  value={editingTemplate.htmlContent}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, htmlContent: e.target.value })}
                  placeholder="<h1>Hello {{recipientName}}</h1><p>Your message here...</p>"
                  rows={8}
                  className="font-mono text-sm"
                  data-testid="input-template-html"
                />
              </div>

              <div className="space-y-2">
                <Label>Plain Text Content</Label>
                <Textarea
                  value={editingTemplate.textContent}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, textContent: e.target.value })}
                  placeholder="Hello {{recipientName}},\n\nYour message here..."
                  rows={4}
                  data-testid="input-template-text"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} data-testid="button-save-template">
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
