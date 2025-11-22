
import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ShieldCheck, Clock, CheckCircle, UserCog } from "lucide-react";

const RegistrationSuccess = () => {
  const [searchParams] = useSearchParams();
  const isManagementRole = searchParams.get('type') === 'management';
  const registrationId = `REG-${Date.now().toString(36).toUpperCase()}`;

  // Define approval stages with their status and icons
  const approvalStages = [
    {
      title: 'Registration Submitted',
      description: 'Your application has been received successfully',
      status: 'completed',
      icon: CheckCircle2
    },
    {
      title: 'Document Verification',
      description: 'Your documents and credentials are being verified',
      status: 'current',
      icon: ShieldCheck
    },
    {
      title: isManagementRole ? 'Management Approval' : 'Team Approval',
      description: isManagementRole 
        ? 'Review by management team for role approval' 
        : 'Review by team lead for system access',
      status: 'pending',
      icon: UserCog
    }
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
     
      <Card className="w-full max-w-lg animate-scale-in">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-bold text-blue-600 animate-fade-in">
            Registration Successful!
          </CardTitle>
          <CardDescription className="text-lg">
            {isManagementRole ? (
              "Your management role registration is pending approval"
            ) : (
              "Your registration is pending approval"
            )}
          </CardDescription>
          <div className="mt-2 p-3 bg-muted/50 rounded-md animate-fade-in">
            <p className="text-sm font-medium">Registration ID: {registrationId}</p>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-6 relative">
            {approvalStages.map((stage, index) => (
              <div key={stage.title} className="flex items-start gap-4 relative animate-fade-in" style={{ animationDelay: `${index * 200}ms` }}>
                <div className={`rounded-full p-3 ${
                  stage.status === 'completed' ? 'bg-green-100 text-green-600' :
                  stage.status === 'current' ? 'bg-blue-100 text-blue-600' :
                  'bg-gray-100 text-gray-400'
                } transform transition-all duration-300 hover:scale-110`}>
                  <stage.icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{stage.title}</h3>
                  <p className="text-sm text-muted-foreground">{stage.description}</p>
                </div>
                {index < approvalStages.length - 1 && (
                  <div className="absolute left-[2.4rem] ml-[0.2rem] h-[calc(100%+1rem)] w-px bg-gray-200" />
                )}
              </div>
            ))}
          </div>

          <div className="bg-muted p-4 rounded-lg space-y-3 animate-fade-in">
            <h3 className="font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              What happens next?
            </h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 text-green-500" />
                You'll receive an email notification when your account is approved
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 text-green-500" />
                Keep your Registration ID for future reference
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 text-green-500" />
                Typical approval time is 1-2 business days
              </li>
            </ul>
          </div>
        </CardContent>

        <CardFooter className="flex justify-center">
          <Link to="/login">
            <Button variant="outline" className="animate-fade-in">Return to Login</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
};

export default RegistrationSuccess;
