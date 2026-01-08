import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2, ArrowRight, ArrowLeft, Send, MapPin } from 'lucide-react';
import { LocalityPermitUpload } from './LocalityPermitUpload';
import type { PermitRequirementOption, WorkWithoutPermitOption } from './PermitVerificationQuestions';

export interface LocalityPermitDecision {
  requirement: PermitRequirementOption | null;
  canWorkWithout: WorkWithoutPermitOption | null;
  uploaded: boolean;
}

interface LocalityPermitQuestionsProps {
  state: string;
  locality: string;
  mmpFileId: string;
  onComplete: (decision: LocalityPermitDecision) => void;
  onSendBackToFOM: (reason: string) => void;
  onCancel: () => void;
  existingLocalityPermit?: boolean;
}

type Step = 
  | 'locality_question' 
  | 'locality_upload' 
  | 'locality_follow_up' 
  | 'complete';

export const LocalityPermitQuestions: React.FC<LocalityPermitQuestionsProps> = ({
  state,
  locality,
  mmpFileId,
  onComplete,
  onSendBackToFOM,
  onCancel,
  existingLocalityPermit = false,
}) => {
  const [step, setStep] = useState<Step>('locality_question');
  
  const [localityPermitRequirement, setLocalityPermitRequirement] = useState<PermitRequirementOption | null>(null);
  const [localityCanWorkWithout, setLocalityCanWorkWithout] = useState<WorkWithoutPermitOption | null>(null);
  const [localityPermitUploaded, setLocalityPermitUploaded] = useState(existingLocalityPermit);

  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [pendingDecision, setPendingDecision] = useState<LocalityPermitDecision | null>(null);

  const handleLocalityPermitNext = () => {
    if (!localityPermitRequirement) return;
    
    if (localityPermitRequirement === 'required_have_it') {
      setStep('locality_upload');
    } else if (localityPermitRequirement === 'required_dont_have_it') {
      setStep('locality_follow_up');
    } else {
      handleComplete();
    }
  };

  const handleLocalityFollowUpNext = () => {
    if (!localityCanWorkWithout) return;
    
    if (localityCanWorkWithout === 'yes') {
      handleComplete();
    } else {
      onSendBackToFOM(`Locality permit is required for ${locality}, ${state} but coordinator does not have it and cannot proceed without it.`);
    }
  };

  const handleLocalityPermitUploaded = () => {
    setLocalityPermitUploaded(true);
    handleComplete(true);
  };

  const handleComplete = (uploadedOverride?: boolean) => {
    if (!localityPermitRequirement) {
      console.error('Cannot complete: localityPermitRequirement is not set');
      return;
    }

    const effectiveUploaded = uploadedOverride ?? localityPermitUploaded;

    if (localityPermitRequirement === 'required_dont_have_it' && !localityCanWorkWithout) {
      console.error('Cannot complete: locality permit is required but canWorkWithout is not set');
      return;
    }

    const decision: LocalityPermitDecision = {
      requirement: localityPermitRequirement,
      canWorkWithout: localityCanWorkWithout,
      uploaded: effectiveUploaded,
    };

    let message = '';
    if (localityPermitRequirement === 'not_required') {
      message = `No locality permit is required for ${locality}, ${state}. The verification process is complete.`;
    } else if (localityPermitRequirement === 'required_have_it' && effectiveUploaded) {
      message = `The locality permit for ${locality}, ${state} has been uploaded successfully. The verification process is complete.`;
    } else if (localityPermitRequirement === 'required_dont_have_it' && localityCanWorkWithout === 'yes') {
      message = `A locality permit is required for ${locality}, ${state}, but you can proceed without it. The verification process is complete.`;
    } else if (localityPermitRequirement === 'required_dont_have_it' && localityCanWorkWithout === 'no') {
      message = `The MMP has been sent back to FOM because a locality permit is required for ${locality}, ${state} and you cannot proceed without it.`;
    }

    setConfirmationMessage(message);
    setPendingDecision(decision);
    setConfirmationDialogOpen(true);
  };

  const handleConfirmationOkay = () => {
    if (pendingDecision) {
      onComplete(pendingDecision);
    }
    setConfirmationDialogOpen(false);
    setPendingDecision(null);
  };

  const renderLocalityQuestion = () => (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-950/50 dark:to-background dark:border-purple-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-purple-800 dark:text-purple-300">
          <MapPin className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <div className="flex flex-col">
            <span lang="en">Locality Permit Verification</span>
            <p lang="ar" dir="rtl" className="text-sm font-normal text-purple-600 dark:text-purple-400 text-right">التحقق من تصريح المحلية</p>
          </div>
        </CardTitle>
        <CardDescription>
          <span lang="en">Verify locality permit requirements for <strong>{locality}</strong> in <strong>{state}</strong></span>
          <p lang="ar" dir="rtl" className="text-muted-foreground mt-1 text-right">تحقق من متطلبات تصريح المحلية لـ <strong>{locality}</strong> في <strong>{state}</strong></p>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-base font-medium text-gray-800 dark:text-gray-200">
          <p lang="en">Do you require a Locality permit for this locality?</p>
          <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 text-right">هل تحتاج إلى تصريح محلية لهذه المحلية؟</p>
        </div>
        
        <RadioGroup
          value={localityPermitRequirement || ''}
          onValueChange={(value) => setLocalityPermitRequirement(value as PermitRequirementOption)}
          className="space-y-3"
        >
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-purple-50/50 dark:hover:bg-purple-950/50 transition-colors">
            <RadioGroupItem value="required_have_it" id="locality-required-have" />
            <Label htmlFor="locality-required-have" className="flex-1 cursor-pointer">
              <p lang="en" className="font-medium text-gray-900 dark:text-gray-100">Yes, it's required and I will upload it</p>
              <p lang="en" className="text-sm text-gray-600 dark:text-gray-400">I have the locality permit and will upload it now</p>
              <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 border-t pt-1 text-right">نعم، مطلوب وسأقوم برفعه - لدي تصريح المحلية وسأرفعه الآن</p>
            </Label>
          </div>
          
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-purple-50/50 dark:hover:bg-purple-950/50 transition-colors">
            <RadioGroupItem value="required_dont_have_it" id="locality-required-dont-have" />
            <Label htmlFor="locality-required-dont-have" className="flex-1 cursor-pointer">
              <p lang="en" className="font-medium text-gray-900 dark:text-gray-100">Yes, it's required but I don't have it</p>
              <p lang="en" className="text-sm text-gray-600 dark:text-gray-400">The locality permit is required but not available</p>
              <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 border-t pt-1 text-right">نعم، مطلوب لكن ليس لدي - تصريح المحلية مطلوب لكنه غير متوفر</p>
            </Label>
          </div>
          
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-purple-50/50 dark:hover:bg-purple-950/50 transition-colors">
            <RadioGroupItem value="not_required" id="locality-not-required" />
            <Label htmlFor="locality-not-required" className="flex-1 cursor-pointer">
              <p lang="en" className="font-medium text-gray-900 dark:text-gray-100">No, it's not a requirement</p>
              <p lang="en" className="text-sm text-gray-600 dark:text-gray-400">Locality permit is not required in this locality</p>
              <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 border-t pt-1 text-right">لا، ليس مطلوباً - تصريح المحلية غير مطلوب في هذه المحلية</p>
            </Label>
          </div>
        </RadioGroup>
        
        <div className="flex flex-col gap-3 pt-4">
          <div className="flex gap-3">
            <Button variant="outline" onClick={onCancel} data-testid="button-cancel-locality-permit">
              <span lang="en">Cancel</span>
            </Button>
            <Button 
              onClick={handleLocalityPermitNext}
              disabled={!localityPermitRequirement}
              className="flex-1"
              data-testid="button-next-locality-permit"
            >
              <span lang="en">Next</span>
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
          <p lang="ar" dir="rtl" className="text-xs text-muted-foreground text-right">إلغاء | التالي</p>
        </div>
      </CardContent>
    </Card>
  );

  const renderLocalityFollowUp = () => (
    <Card className="border-orange-200 bg-gradient-to-br from-orange-50/50 to-white dark:from-orange-950/50 dark:to-background dark:border-orange-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-300">
          <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          <div className="flex flex-col">
            <span lang="en">Locality Permit Not Available</span>
            <p lang="ar" dir="rtl" className="text-sm font-normal text-orange-600 dark:text-orange-400 text-right">تصريح المحلية غير متوفر</p>
          </div>
        </CardTitle>
        <CardDescription>
          <span lang="en">You indicated the locality permit for <strong>{locality}</strong> is required but not available</span>
          <p lang="ar" dir="rtl" className="text-muted-foreground mt-1 text-right">أشرت إلى أن تصريح المحلية لـ <strong>{locality}</strong> مطلوب لكنه غير متوفر</p>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <AlertDescription className="text-orange-800 dark:text-orange-200">
            <p lang="en">The locality permit is required but you don't have it. Can you proceed with the verification without it?</p>
            <p lang="ar" dir="rtl" className="mt-1 text-sm text-right">تصريح المحلية مطلوب لكنك لا تملكه. هل يمكنك المتابعة بالتحقق بدونه؟</p>
          </AlertDescription>
        </Alert>
        
        <div className="text-base font-medium text-gray-800 dark:text-gray-200">
          <p lang="en">Are you able to work without the locality permit?</p>
          <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 text-right">هل تستطيع العمل بدون تصريح المحلية؟</p>
        </div>
        
        <RadioGroup
          value={localityCanWorkWithout || ''}
          onValueChange={(value) => setLocalityCanWorkWithout(value as WorkWithoutPermitOption)}
          className="space-y-3"
        >
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-green-50/50 dark:hover:bg-green-950/50 transition-colors">
            <RadioGroupItem value="yes" id="locality-work-yes" />
            <Label htmlFor="locality-work-yes" className="flex-1 cursor-pointer">
              <p lang="en" className="font-medium text-gray-900 dark:text-gray-100">Yes, I can proceed without it</p>
              <p lang="en" className="text-sm text-gray-600 dark:text-gray-400">I will continue with the site verification</p>
              <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 border-t pt-1 text-right">نعم، أستطيع المتابعة بدونه - سأستمر في التحقق من الموقع</p>
            </Label>
          </div>
          
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-red-50/50 dark:hover:bg-red-950/50 transition-colors">
            <RadioGroupItem value="no" id="locality-work-no" />
            <Label htmlFor="locality-work-no" className="flex-1 cursor-pointer">
              <p lang="en" className="font-medium text-gray-900 dark:text-gray-100">No, I cannot proceed without it</p>
              <p lang="en" className="text-sm text-gray-600 dark:text-gray-400">Send the MMP back to FOM for action</p>
              <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 border-t pt-1 text-right">لا، لا أستطيع المتابعة بدونه - أرسل خطة المراقبة الشهرية إلى مدير العمليات الميدانية لاتخاذ إجراء</p>
            </Label>
          </div>
        </RadioGroup>
        
        <div className="flex flex-col gap-3 pt-4">
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('locality_question')} data-testid="button-back-locality-followup">
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span lang="en">Back</span>
            </Button>
            <Button 
              onClick={handleLocalityFollowUpNext}
              disabled={!localityCanWorkWithout}
              className="flex-1"
              variant={localityCanWorkWithout === 'no' ? 'destructive' : 'default'}
              data-testid="button-continue-locality-followup"
            >
              {localityCanWorkWithout === 'no' ? (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  <span lang="en">Send Back to FOM</span>
                </>
              ) : (
                <>
                  <span lang="en">Continue</span>
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
          <p lang="ar" dir="rtl" className="text-xs text-muted-foreground text-right">
            {localityCanWorkWithout === 'no' ? 'رجوع | إرسال إلى مدير العمليات' : 'رجوع | متابعة'}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  const renderLocalityUpload = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <Button variant="outline" onClick={() => setStep('locality_question')} data-testid="button-back-locality-upload">
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span lang="en">Back to Questions</span>
        </Button>
        <p lang="ar" dir="rtl" className="text-xs text-muted-foreground text-right">العودة للأسئلة</p>
      </div>
      <LocalityPermitUpload
        state={state}
        locality={locality}
        mmpFileId={mmpFileId}
        onPermitUploaded={handleLocalityPermitUploaded}
        onCancel={() => setStep('locality_question')}
      />
    </div>
  );

  return (
    <>
      {step === 'locality_question' && renderLocalityQuestion()}
      {step === 'locality_upload' && renderLocalityUpload()}
      {step === 'locality_follow_up' && renderLocalityFollowUp()}

      <Dialog open={confirmationDialogOpen} onOpenChange={setConfirmationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div className="flex flex-col">
                <span lang="en">Process Completed</span>
                <p lang="ar" dir="rtl" className="text-sm font-normal text-muted-foreground text-right">اكتملت العملية</p>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p lang="en" className="text-sm text-muted-foreground">{confirmationMessage}</p>
          </div>
          <DialogFooter>
            <div className="flex flex-col gap-1 w-full">
              <Button onClick={handleConfirmationOkay} data-testid="button-locality-confirm-ok">
                <span lang="en">Okay</span>
              </Button>
              <p lang="ar" dir="rtl" className="text-xs text-muted-foreground text-right">حسناً</p>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LocalityPermitQuestions;
