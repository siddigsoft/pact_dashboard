import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2, Upload, ArrowRight, ArrowLeft, Send } from 'lucide-react';
import { StatePermitUpload } from './StatePermitUpload';

export type PermitRequirementOption = 
  | 'required_have_it' 
  | 'required_dont_have_it' 
  | 'not_required';

export type WorkWithoutPermitOption = 'yes' | 'no';

export interface PermitDecision {
  statePermit: {
    requirement: PermitRequirementOption | null;
    canWorkWithout: WorkWithoutPermitOption | null;
    uploaded: boolean;
  };
  localityPermit: {
    requirement: PermitRequirementOption | null;
    canWorkWithout: WorkWithoutPermitOption | null;
    uploaded: boolean;
  };
}

interface PermitVerificationQuestionsProps {
  state: string;
  locality: string;
  mmpFileId: string;
  onComplete: (decision: PermitDecision) => void;
  onSendBackToFOM: (reason: string) => void;
  onCancel: () => void;
  existingStatePermit?: boolean;
  existingLocalityPermit?: boolean;
  onMoveSitesToCategory?: (category: string) => void;
}

type Step = 
  | 'state_question' 
  | 'state_upload' 
  | 'state_follow_up' 
  | 'complete';

export const PermitVerificationQuestions: React.FC<PermitVerificationQuestionsProps> = ({
  state,
  locality,
  mmpFileId,
  onComplete,
  onSendBackToFOM,
  onCancel,
  existingStatePermit = false,
  existingLocalityPermit = false,
  onMoveSitesToCategory,
}) => {
  const [step, setStep] = useState<Step>('state_question');
  
  const [statePermitRequirement, setStatePermitRequirement] = useState<PermitRequirementOption | null>(null);
  const [stateCanWorkWithout, setStateCanWorkWithout] = useState<WorkWithoutPermitOption | null>(null);
  const [statePermitUploaded, setStatePermitUploaded] = useState(existingStatePermit);

  // New state for confirmation dialogue
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [pendingDecision, setPendingDecision] = useState<PermitDecision | null>(null);

  const handleStatePermitNext = () => {
    if (!statePermitRequirement) return;
    
    if (statePermitRequirement === 'required_have_it') {
      setStep('state_upload');
    } else if (statePermitRequirement === 'required_dont_have_it') {
      setStep('state_follow_up');
    } else {
      // Not required - complete with decision
      handleComplete();
    }
  };

  const handleStateFollowUpNext = () => {
    console.log('handleStateFollowUpNext called, stateCanWorkWithout:', stateCanWorkWithout);
    if (!stateCanWorkWithout) return;
    
    if (stateCanWorkWithout === 'yes') {
      // Can work without state permit - complete with decision
      handleComplete();
    } else {
      // Cannot work without - send back to FOM
      console.log('Calling onSendBackToFOM...');
      onSendBackToFOM(`State permit is required for ${state} but coordinator does not have it and cannot proceed without it.`);
    }
  };

  const handleStatePermitUploaded = () => {
    // Ensure statePermitRequirement is set (should be 'required_have_it' at this point)
    if (!statePermitRequirement || statePermitRequirement !== 'required_have_it') {
      console.error('State permit uploaded but requirement is not set correctly:', statePermitRequirement);
      // Still proceed but log the issue
    }
    setStatePermitUploaded(true);
    handleComplete(true);
  };

  const handleComplete = (uploadedOverride?: boolean) => {
    // Validate that we have the required information
    if (!statePermitRequirement) {
      console.error('Cannot complete: statePermitRequirement is not set');
      return;
    }

    // Determine the effective uploaded flag. When coming from
    // handleStatePermitUploaded we pass uploadedOverride=true so we
    // don't rely on the async state update of setStatePermitUploaded.
    const effectiveUploaded = uploadedOverride ?? statePermitUploaded;

    // Additional validation: if requirement is 'required_have_it', uploaded must be true
    if (statePermitRequirement === 'required_have_it' && !effectiveUploaded) {
      console.error('Cannot complete: state permit is required but not uploaded');
      // This shouldn't happen in normal flow, but if it does, we should handle it
      // For now, we'll still create the decision but log the issue
      // This is important to avoid blocking the user if there's a state management issue
    }

    // Additional validation: if requirement is 'required_dont_have_it', canWorkWithout must be set
    if (statePermitRequirement === 'required_dont_have_it' && !stateCanWorkWithout) {
      console.error('Cannot complete: state permit is required but canWorkWithout is not set');
      return;
    }

    const decision: PermitDecision = {
      statePermit: {
        requirement: statePermitRequirement,
        canWorkWithout: stateCanWorkWithout,
        uploaded: effectiveUploaded,
      },
      localityPermit: {
        requirement: null,
        canWorkWithout: null,
        uploaded: existingLocalityPermit,
      },
    };

    // Debug logging for state permit upload scenario
    if (statePermitRequirement === 'required_have_it' && effectiveUploaded) {
      console.log('[PermitVerificationQuestions] State permit uploaded - decision:', {
        requirement: decision.statePermit.requirement,
        uploaded: decision.statePermit.uploaded,
        state
      });
    }

    // Generate summary message based on decision
    let message = '';
    if (statePermitRequirement === 'not_required') {
      message = `No state permit is required for ${state}. The verification process for the state permit is complete. You will now proceed to verify the permits for the localities.`;
    } else if (statePermitRequirement === 'required_have_it' && effectiveUploaded) {
      message = `The state permit for ${state} has been uploaded successfully. The verification process for the state permit is complete. You will now proceed to verify the permits for the localities.`;
    } else if (statePermitRequirement === 'required_dont_have_it' && stateCanWorkWithout === 'yes') {
      message = `A state permit is required for ${state}, but you can proceed without it. The verification process for the state permit is complete. You will now proceed to verify the permits for the localities.`;
    } else if (statePermitRequirement === 'required_dont_have_it' && stateCanWorkWithout === 'no') {
      message = `The MMP has been sent back to FOM because a state permit is required for ${state} and you cannot proceed without it. No further action is needed here.`;
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

  const renderStateQuestion = () => (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/50 dark:to-background dark:border-blue-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
          <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div className="flex flex-col">
            <span lang="en">State Permit Verification</span>
            <p lang="ar" dir="rtl" className="text-sm font-normal text-blue-600 dark:text-blue-400 text-right">التحقق من تصريح الولاية</p>
          </div>
        </CardTitle>
        <CardDescription>
          <span lang="en">Verify state permit requirements for <strong>{state}</strong></span>
          <p lang="ar" dir="rtl" className="text-muted-foreground mt-1 text-right">تحقق من متطلبات تصريح الولاية لـ <strong>{state}</strong></p>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-base font-medium text-gray-800 dark:text-gray-200">
          <p lang="en">Do you require a State permit in your state?</p>
          <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 text-right">هل تحتاج إلى تصريح ولاية في ولايتك؟</p>
        </div>
        
        <RadioGroup
          value={statePermitRequirement || ''}
          onValueChange={(value) => setStatePermitRequirement(value as PermitRequirementOption)}
          className="space-y-3"
        >
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-blue-50/50 dark:hover:bg-blue-950/50 transition-colors">
            <RadioGroupItem value="required_have_it" id="state-required-have" />
            <Label htmlFor="state-required-have" className="flex-1 cursor-pointer">
              <p lang="en" className="font-medium text-gray-900 dark:text-gray-100">Yes, it's required and I will upload it</p>
              <p lang="en" className="text-sm text-gray-600 dark:text-gray-400">I have the state permit and will upload it now</p>
              <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 border-t pt-1 text-right">نعم، مطلوب وسأقوم برفعه - لدي تصريح الولاية وسأرفعه الآن</p>
            </Label>
          </div>
          
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-blue-50/50 dark:hover:bg-blue-950/50 transition-colors">
            <RadioGroupItem value="required_dont_have_it" id="state-required-dont-have" />
            <Label htmlFor="state-required-dont-have" className="flex-1 cursor-pointer">
              <p lang="en" className="font-medium text-gray-900 dark:text-gray-100">Yes, it's required but I don't have it</p>
              <p lang="en" className="text-sm text-gray-600 dark:text-gray-400">The state permit is required but not available</p>
              <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 border-t pt-1 text-right">نعم، مطلوب لكن ليس لدي - تصريح الولاية مطلوب لكنه غير متوفر</p>
            </Label>
          </div>
          
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-blue-50/50 dark:hover:bg-blue-950/50 transition-colors">
            <RadioGroupItem value="not_required" id="state-not-required" />
            <Label htmlFor="state-not-required" className="flex-1 cursor-pointer">
              <p lang="en" className="font-medium text-gray-900 dark:text-gray-100">No, it's not a requirement</p>
              <p lang="en" className="text-sm text-gray-600 dark:text-gray-400">State permit is not required in this state</p>
              <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 border-t pt-1 text-right">لا، ليس مطلوباً - تصريح الولاية غير مطلوب في هذه الولاية</p>
            </Label>
          </div>
        </RadioGroup>
        
        <div className="flex flex-col gap-3 pt-4">
          <div className="flex gap-3">
            <Button variant="outline" onClick={onCancel} data-testid="button-cancel-state-permit">
              <span lang="en">Cancel</span>
            </Button>
            <Button 
              onClick={handleStatePermitNext}
              disabled={!statePermitRequirement}
              className="flex-1"
              data-testid="button-next-state-permit"
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

  const renderStateFollowUp = () => (
    <Card className="border-orange-200 bg-gradient-to-br from-orange-50/50 to-white dark:from-orange-950/50 dark:to-background dark:border-orange-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-300">
          <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          <div className="flex flex-col">
            <span lang="en">State Permit Not Available</span>
            <p lang="ar" dir="rtl" className="text-sm font-normal text-orange-600 dark:text-orange-400 text-right">تصريح الولاية غير متوفر</p>
          </div>
        </CardTitle>
        <CardDescription>
          <span lang="en">You indicated the state permit for <strong>{state}</strong> is required but not available</span>
          <p lang="ar" dir="rtl" className="text-muted-foreground mt-1 text-right">أشرت إلى أن تصريح الولاية لـ <strong>{state}</strong> مطلوب لكنه غير متوفر</p>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <AlertDescription className="text-orange-800 dark:text-orange-200">
            <p lang="en">The state permit is required but you don't have it. Can you proceed with the verification without it?</p>
            <p lang="ar" dir="rtl" className="mt-1 text-sm text-right">تصريح الولاية مطلوب لكنك لا تملكه. هل يمكنك المتابعة بالتحقق بدونه؟</p>
          </AlertDescription>
        </Alert>
        
        <div className="text-base font-medium text-gray-800 dark:text-gray-200">
          <p lang="en">Are you able to work without the state permit?</p>
          <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 text-right">هل تستطيع العمل بدون تصريح الولاية؟</p>
        </div>
        
        <RadioGroup
          value={stateCanWorkWithout || ''}
          onValueChange={(value) => setStateCanWorkWithout(value as WorkWithoutPermitOption)}
          className="space-y-3"
        >
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-green-50/50 dark:hover:bg-green-950/50 transition-colors">
            <RadioGroupItem value="yes" id="state-work-yes" />
            <Label htmlFor="state-work-yes" className="flex-1 cursor-pointer">
              <p lang="en" className="font-medium text-gray-900 dark:text-gray-100">Yes, I can proceed without it</p>
              <p lang="en" className="text-sm text-gray-600 dark:text-gray-400">I will continue with the CP verification</p>
              <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 border-t pt-1 text-right">نعم، أستطيع المتابعة بدونه - سأستمر في التحقق من الشريك المنفذ</p>
            </Label>
          </div>
          
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-red-50/50 dark:hover:bg-red-950/50 transition-colors">
            <RadioGroupItem value="no" id="state-work-no" />
            <Label htmlFor="state-work-no" className="flex-1 cursor-pointer">
              <p lang="en" className="font-medium text-gray-900 dark:text-gray-100">No, I cannot proceed without it</p>
              <p lang="en" className="text-sm text-gray-600 dark:text-gray-400">Send the MMP back to FOM for action</p>
              <p lang="ar" dir="rtl" className="text-sm text-muted-foreground mt-1 border-t pt-1 text-right">لا، لا أستطيع المتابعة بدونه - أرسل خطة المراقبة الشهرية إلى مدير العمليات الميدانية لاتخاذ إجراء</p>
            </Label>
          </div>
        </RadioGroup>
        
        <div className="flex flex-col gap-3 pt-4">
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('state_question')} data-testid="button-back-state-followup">
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span lang="en">Back</span>
            </Button>
            <Button 
              onClick={handleStateFollowUpNext}
              disabled={!stateCanWorkWithout}
              className="flex-1"
              variant={stateCanWorkWithout === 'no' ? 'destructive' : 'default'}
              data-testid="button-continue-state-followup"
            >
              {stateCanWorkWithout === 'no' ? (
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
            {stateCanWorkWithout === 'no' ? 'رجوع | إرسال إلى مدير العمليات' : 'رجوع | متابعة'}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  const renderStateUpload = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <Button variant="outline" onClick={() => setStep('state_question')} data-testid="button-back-state-upload">
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span lang="en">Back to Questions</span>
        </Button>
        <p lang="ar" dir="rtl" className="text-xs text-muted-foreground text-right">العودة للأسئلة</p>
      </div>
      <StatePermitUpload
        state={state}
        mmpFileId={mmpFileId}
        onPermitUploaded={handleStatePermitUploaded}
        onCancel={() => setStep('state_question')}
        userType="coordinator"
      />
    </div>
  );

  return (
    <>
      {/* Existing content */}
      {step === 'state_question' && renderStateQuestion()}
      {step === 'state_upload' && renderStateUpload()}
      {step === 'state_follow_up' && renderStateFollowUp()}

      {/* Confirmation dialogue */}
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
              <Button onClick={handleConfirmationOkay} data-testid="button-confirm-ok">
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

export default PermitVerificationQuestions;
