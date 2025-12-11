import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, ArrowLeft, Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const otpFormSchema = z.object({
  otp: z.string().length(6, "Please enter the 6-digit code")
});

const passwordFormSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState<'otp' | 'password' | 'success'>('otp');
  const [email, setEmail] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();

  const otpForm = useForm<z.infer<typeof otpFormSchema>>({
    resolver: zodResolver(otpFormSchema),
    defaultValues: {
      otp: ""
    }
  });

  const passwordForm = useForm<z.infer<typeof passwordFormSchema>>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      password: "",
      confirmPassword: ""
    }
  });

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  const onVerifyOTP = async (values: z.infer<typeof otpFormSchema>) => {
    setIsVerifying(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('verify-reset-otp', {
        body: { email, otp: values.otp },
      });

      if (error || !data?.success) {
        toast({
          title: "Invalid code",
          description: error?.message || data?.error || "The verification code is invalid or expired.",
          variant: "destructive",
        });
        setIsVerifying(false);
        return;
      }

      setStep('password');
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: "Could not verify the code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const onResetPassword = async (values: z.infer<typeof passwordFormSchema>) => {
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('admin-change-password', {
        body: { 
          email, 
          newPassword: values.password,
          otp: otpForm.getValues('otp')
        },
      });

      if (error || !data?.success) {
        toast({
          title: "Password reset failed",
          description: error?.message || data?.error || "Could not reset your password. Please try again.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      setStep('success');
      toast({
        title: "Password reset successful",
        description: "Your password has been reset. You can now log in with your new password.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderOTPStep = () => (
    <Form {...otpForm}>
      <form onSubmit={otpForm.handleSubmit(onVerifyOTP)} className="animate-fade-in">
        <CardContent className="space-y-4 pt-4">
          <p className="text-sm text-gray-600 text-center mb-4">
            Enter the 6-digit code sent to <strong>{email}</strong>
          </p>
          <FormField
            control={otpForm.control}
            name="otp"
            render={({ field }) => (
              <FormItem className="flex flex-col items-center">
                <FormControl>
                  <InputOTP
                    maxLength={6}
                    value={field.value}
                    onChange={field.onChange}
                    data-testid="input-reset-otp"
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button 
            type="submit" 
            className="w-full bg-[#9b87f5] hover:bg-[#8b77e5] transition-colors"
            disabled={isVerifying}
            data-testid="button-verify-otp"
          >
            {isVerifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify Code"
            )}
          </Button>
          <Button 
            variant="ghost" 
            className="w-full flex items-center justify-center"
            onClick={() => navigate("/forgot-password")}
            type="button"
            data-testid="button-back-forgot"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Request New Code
          </Button>
        </CardFooter>
      </form>
    </Form>
  );

  const renderPasswordStep = () => (
    <Form {...passwordForm}>
      <form onSubmit={passwordForm.handleSubmit(onResetPassword)} className="animate-fade-in">
        <CardContent className="space-y-4 pt-4">
          <FormField
            control={passwordForm.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New Password</FormLabel>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <FormControl>
                    <Input
                      {...field}
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter new password"
                      disabled={isLoading}
                      className="pl-10 pr-10 bg-white/50 focus:bg-white transition-colors"
                      data-testid="input-new-password"
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={passwordForm.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <FormControl>
                    <Input
                      {...field}
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm new password"
                      disabled={isLoading}
                      className="pl-10 pr-10 bg-white/50 focus:bg-white transition-colors"
                      data-testid="input-confirm-password"
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button 
            type="submit" 
            className="w-full bg-[#9b87f5] hover:bg-[#8b77e5] transition-colors"
            disabled={isLoading}
            data-testid="button-reset-password"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting Password...
              </>
            ) : (
              "Reset Password"
            )}
          </Button>
        </CardFooter>
      </form>
    </Form>
  );

  const renderSuccessStep = () => (
    <div className="animate-fade-in">
      <CardContent className="space-y-4 pt-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-green-800 font-medium mb-2">Password Reset Successful</p>
          <p className="text-sm text-gray-600">
            Your password has been reset. You can now log in with your new password.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full bg-[#9b87f5] hover:bg-[#8b77e5] transition-colors"
          onClick={() => navigate("/login")}
          data-testid="button-go-to-login"
        >
          Go to Login
        </Button>
      </CardFooter>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-indigo-50">
      <div className="w-full max-w-md p-4">
        <Card className="backdrop-blur-sm bg-white/80 border border-white/20 shadow-xl animate-fade-in">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-[#9b87f5] flex items-center justify-center shadow-lg transform hover:scale-105 transition-duration-300">
                <Lock className="h-8 w-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-gray-800">
              {step === 'otp' && 'Verify Your Identity'}
              {step === 'password' && 'Create New Password'}
              {step === 'success' && 'All Done!'}
            </CardTitle>
            <CardDescription className="text-gray-600">
              {step === 'otp' && 'Enter the verification code sent to your email'}
              {step === 'password' && 'Choose a strong password for your account'}
              {step === 'success' && 'Your password has been reset successfully'}
            </CardDescription>
          </CardHeader>

          {step === 'otp' && renderOTPStep()}
          {step === 'password' && renderPasswordStep()}
          {step === 'success' && renderSuccessStep()}
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
