import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2, Upload, ArrowRight, ArrowLeft, Send } from 'lucide-react';
import { StatePermitUpload } from './StatePermitUpload';
import { LocalityPermitUpload } from './LocalityPermitUpload';

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
}

type Step = 
  | 'state_question' 
  | 'state_upload' 
  | 'state_follow_up' 
  | 'locality_question' 
  | 'locality_upload' 
  | 'locality_follow_up' 
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
}) => {
  const [step, setStep] = useState<Step>(existingStatePermit ? 'locality_question' : 'state_question');
  
  const [statePermitRequirement, setStatePermitRequirement] = useState<PermitRequirementOption | null>(null);
  const [stateCanWorkWithout, setStateCanWorkWithout] = useState<WorkWithoutPermitOption | null>(null);
  const [statePermitUploaded, setStatePermitUploaded] = useState(existingStatePermit);
  
  const [localityPermitRequirement, setLocalityPermitRequirement] = useState<PermitRequirementOption | null>(null);
  const [localityCanWorkWithout, setLocalityCanWorkWithout] = useState<WorkWithoutPermitOption | null>(null);
  const [localityPermitUploaded, setLocalityPermitUploaded] = useState(existingLocalityPermit);

  const handleStatePermitNext = () => {
    if (!statePermitRequirement) return;
    
    if (statePermitRequirement === 'required_have_it') {
      setStep('state_upload');
    } else if (statePermitRequirement === 'required_dont_have_it') {
      setStep('state_follow_up');
    } else {
      // Not required - proceed to locality question
      setStep('locality_question');
    }
  };

  const handleStateFollowUpNext = () => {
    if (!stateCanWorkWithout) return;
    
    if (stateCanWorkWithout === 'yes') {
      // Can work without state permit - proceed to locality
      setStep('locality_question');
    } else {
      // Cannot work without - send back to FOM
      onSendBackToFOM(`State permit is required for ${state} but coordinator does not have it and cannot proceed without it.`);
    }
  };

  const handleStatePermitUploaded = () => {
    setStatePermitUploaded(true);
    setStep('locality_question');
  };

  const handleLocalityPermitNext = () => {
    if (!localityPermitRequirement) return;
    
    if (localityPermitRequirement === 'required_have_it') {
      setStep('locality_upload');
    } else if (localityPermitRequirement === 'required_dont_have_it') {
      setStep('locality_follow_up');
    } else {
      // Not required - complete verification
      handleComplete();
    }
  };

  const handleLocalityFollowUpNext = () => {
    if (!localityCanWorkWithout) return;
    
    if (localityCanWorkWithout === 'yes') {
      // Can work without locality permit - complete
      handleComplete();
    } else {
      // Cannot work without - send back to FOM
      onSendBackToFOM(`Locality permit is required for ${locality}, ${state} but coordinator does not have it and cannot proceed without it.`);
    }
  };

  const handleLocalityPermitUploaded = () => {
    setLocalityPermitUploaded(true);
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
        requirement: localityPermitRequirement,
        canWorkWithout: localityCanWorkWithout,
        uploaded: localityPermitUploaded,
      },
    };
    onComplete(decision);
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

  const renderLocalityQuestion = () => (
    <Card className="border-green-200 bg-gradient-to-br from-green-50/50 to-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-800">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          Locality Permit Verification
        </CardTitle>
        <CardDescription>
          Verify locality permit requirements for <strong>{locality}, {state}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {statePermitUploaded && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              State permit for {state} has been uploaded successfully.
            </AlertDescription>
          </Alert>
        )}
        
        <div className="text-base font-medium text-gray-800">
          Do you require a Locality permit for this location?
        </div>
        
        <RadioGroup
          value={localityPermitRequirement || ''}
          onValueChange={(value) => setLocalityPermitRequirement(value as PermitRequirementOption)}
          className="space-y-3"
        >
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-green-50/50 transition-colors">
            <RadioGroupItem value="required_have_it" id="locality-required-have" />
            <Label htmlFor="locality-required-have" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">Yes, it's required and I will upload it</div>
              <div className="text-sm text-gray-600">I have the locality permit and will upload it now</div>
            </Label>
          </div>
          
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-green-50/50 transition-colors">
            <RadioGroupItem value="required_dont_have_it" id="locality-required-dont-have" />
            <Label htmlFor="locality-required-dont-have" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">Yes, it's required but I don't have it</div>
              <div className="text-sm text-gray-600">The locality permit is required but not available</div>
            </Label>
          </div>
          
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-green-50/50 transition-colors">
            <RadioGroupItem value="not_required" id="locality-not-required" />
            <Label htmlFor="locality-not-required" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">No, it's not a requirement</div>
              <div className="text-sm text-gray-600">Locality permit is not required for this area</div>
            </Label>
          </div>
        </RadioGroup>
        
        <div className="flex gap-3 pt-4">
          {!existingStatePermit && (
            <Button variant="outline" onClick={() => setStep('state_question')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          <Button 
            onClick={handleLocalityPermitNext}
            disabled={!localityPermitRequirement}
            className="flex-1"
          >
            {localityPermitRequirement === 'not_required' ? (
              <>
                Complete Verification
                <CheckCircle2 className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderLocalityFollowUp = () => (
    <Card className="border-orange-200 bg-gradient-to-br from-orange-50/50 to-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          Locality Permit Not Available
        </CardTitle>
        <CardDescription>
          You indicated the locality permit for <strong>{locality}, {state}</strong> is required but not available
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            The locality permit is required but you don't have it. Can you proceed with the verification without it?
          </AlertDescription>
        </Alert>
        
        <div className="text-base font-medium text-gray-800">
          Are you able to work without the locality permit?
        </div>
        
        <RadioGroup
          value={localityCanWorkWithout || ''}
          onValueChange={(value) => setLocalityCanWorkWithout(value as WorkWithoutPermitOption)}
          className="space-y-3"
        >
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-green-50/50 transition-colors">
            <RadioGroupItem value="yes" id="locality-work-yes" />
            <Label htmlFor="locality-work-yes" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">Yes, I can proceed without it</div>
              <div className="text-sm text-gray-600">I will complete the CP verification</div>
            </Label>
          </div>
          
          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-red-50/50 transition-colors">
            <RadioGroupItem value="no" id="locality-work-no" />
            <Label htmlFor="locality-work-no" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">No, I cannot proceed without it</div>
              <div className="text-sm text-gray-600">Send the MMP back to FOM for action</div>
            </Label>
          </div>
        </RadioGroup>
        
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={() => setStep('locality_question')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button 
            onClick={handleLocalityFollowUpNext}
            disabled={!localityCanWorkWithout}
            className="flex-1"
            variant={localityCanWorkWithout === 'no' ? 'destructive' : 'default'}
          >
            {localityCanWorkWithout === 'no' ? (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Back to FOM
              </>
            ) : (
              <>
                Complete Verification
                <CheckCircle2 className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderLocalityUpload = () => (
    <div className="space-y-4">
      <Button variant="outline" onClick={() => setStep('locality_question')}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Questions
      </Button>
      <LocalityPermitUpload
        state={state}
        locality={locality}
        mmpFileId={mmpFileId}
        onPermitUploaded={handleLocalityPermitUploaded}
        onCancel={() => setStep('locality_question')}
      />
    </div>
  );

  switch (step) {
    case 'state_question':
      return renderStateQuestion();
    case 'state_upload':
      return renderStateUpload();
    case 'state_follow_up':
      return renderStateFollowUp();
    case 'locality_question':
      return renderLocalityQuestion();
    case 'locality_upload':
      return renderLocalityUpload();
    case 'locality_follow_up':
      return renderLocalityFollowUp();
    default:
      return null;
  }
};

export default PermitVerificationQuestions;
