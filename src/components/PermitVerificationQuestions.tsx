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
    setStatePermitUploaded(true);
    handleComplete();
  };

  const handleComplete = () => {
    const decision: PermitDecision = {
      statePermit: {
        requirement: statePermitRequirement,
        canWorkWithout: stateCanWorkWithout,
        uploaded: statePermitUploaded,
      },
      localityPermit: {
        requirement: null,
        canWorkWithout: null,
        uploaded: existingLocalityPermit,
      },
    };

    // Generate summary message based on decision
    let message = '';
    if (statePermitRequirement === 'not_required') {
      message = `No state permit is required for ${state}. The verification process for the state permit is complete. You will now proceed to verify the permits for the localities.`;
    } else if (statePermitRequirement === 'required_have_it' && statePermitUploaded) {
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
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-800">
          <AlertTriangle className="h-5 w-5 text-blue-600" />
          State Permit Verification
        </CardTitle>
        <CardDescription>
          Verify state permit requirements for <strong>{state}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-base font-medium text-gray-800">
          Do you require a State permit in your state?
        </div>
        
        <RadioGroup
          value={statePermitRequirement || ''}
          onValueChange={(value) => setStatePermitRequirement(value as PermitRequirementOption)}
          className="space-y-3"
        >
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-blue-50/50 transition-colors">
            <RadioGroupItem value="required_have_it" id="state-required-have" />
            <Label htmlFor="state-required-have" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">Yes, it's required and I will upload it</div>
              <div className="text-sm text-gray-600">I have the state permit and will upload it now</div>
            </Label>
          </div>
          
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-blue-50/50 transition-colors">
            <RadioGroupItem value="required_dont_have_it" id="state-required-dont-have" />
            <Label htmlFor="state-required-dont-have" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">Yes, it's required but I don't have it</div>
              <div className="text-sm text-gray-600">The state permit is required but not available</div>
            </Label>
          </div>
          
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-blue-50/50 transition-colors">
            <RadioGroupItem value="not_required" id="state-not-required" />
            <Label htmlFor="state-not-required" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">No, it's not a requirement</div>
              <div className="text-sm text-gray-600">State permit is not required in this state</div>
            </Label>
          </div>
        </RadioGroup>
        
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleStatePermitNext}
            disabled={!statePermitRequirement}
            className="flex-1"
          >
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderStateFollowUp = () => (
    <Card className="border-orange-200 bg-gradient-to-br from-orange-50/50 to-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          State Permit Not Available
        </CardTitle>
        <CardDescription>
          You indicated the state permit for <strong>{state}</strong> is required but not available
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            The state permit is required but you don't have it. Can you proceed with the verification without it?
          </AlertDescription>
        </Alert>
        
        <div className="text-base font-medium text-gray-800">
          Are you able to work without the state permit?
        </div>
        
        <RadioGroup
          value={stateCanWorkWithout || ''}
          onValueChange={(value) => setStateCanWorkWithout(value as WorkWithoutPermitOption)}
          className="space-y-3"
        >
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-green-50/50 transition-colors">
            <RadioGroupItem value="yes" id="state-work-yes" />
            <Label htmlFor="state-work-yes" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">Yes, I can proceed without it</div>
              <div className="text-sm text-gray-600">I will continue with the CP verification</div>
            </Label>
          </div>
          
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-red-50/50 transition-colors">
            <RadioGroupItem value="no" id="state-work-no" />
            <Label htmlFor="state-work-no" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">No, I cannot proceed without it</div>
              <div className="text-sm text-gray-600">Send the MMP back to FOM for action</div>
            </Label>
          </div>
        </RadioGroup>
        
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={() => setStep('state_question')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button 
            onClick={handleStateFollowUpNext}
            disabled={!stateCanWorkWithout}
            className="flex-1"
            variant={stateCanWorkWithout === 'no' ? 'destructive' : 'default'}
          >
            {stateCanWorkWithout === 'no' ? (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Back to FOM
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderStateUpload = () => (
    <div className="space-y-4">
      <Button variant="outline" onClick={() => setStep('state_question')}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Questions
      </Button>
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

      {/* New confirmation dialogue */}
      <Dialog open={confirmationDialogOpen} onOpenChange={setConfirmationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Process Completed
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">{confirmationMessage}</p>
          </div>
          <DialogFooter>
            <Button onClick={handleConfirmationOkay}>
              Okay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PermitVerificationQuestions;
