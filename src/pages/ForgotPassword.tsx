import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/context/AppContext";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";

const formSchema = z.object({
  email: z.string().email("Please enter a valid email address")
});

const ForgotPassword = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentUser } = useAppContext();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: ""
    }
  });

  if (currentUser) {
    navigate("/dashboard");
    return null;
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('verify-reset-otp', {
        body: { 
          email: values.email.toLowerCase(),
          action: 'generate'
        },
      });

      if (error) {
        console.error('Password reset error:', error);
        toast({
          title: "Error",
          description: "There was a problem sending reset instructions. Please try again.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      setEmailSent(true);
      toast({
        title: "Reset code sent",
        description: "If an account exists with this email, you'll receive a verification code.",
        variant: "default",
      });
    } catch (error) {
      console.error('Password reset error:', error);
      toast({
        title: "Error",
        description: "There was a problem sending reset instructions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueToReset = () => {
    const email = form.getValues("email");
    navigate(`/reset-password?email=${encodeURIComponent(email)}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-indigo-50">
      <div className="w-full max-w-md p-4">
        <Card className="backdrop-blur-sm bg-white/80 border border-white/20 shadow-xl animate-fade-in">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-[#9b87f5] flex items-center justify-center shadow-lg transform hover:scale-105 transition-duration-300">
                <Mail className="h-8 w-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-gray-800">Reset Password</CardTitle>
            <CardDescription className="text-gray-600">
              Enter your email to receive a verification code
            </CardDescription>
          </CardHeader>

          {!emailSent ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="animate-fade-in">
                <CardContent className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              placeholder="Enter your email"
                              disabled={isLoading}
                              className="pl-10 bg-white/50 focus:bg-white transition-colors"
                              aria-label="Email address"
                              data-testid="input-email"
                            />
                          </FormControl>
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
                    data-testid="button-send-code"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending Code...
                      </>
                    ) : (
                      "Send Verification Code"
                    )}
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full flex items-center justify-center"
                    onClick={() => navigate("/login")}
                    type="button"
                    data-testid="button-back-login"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Login
                  </Button>
                </CardFooter>
              </form>
            </Form>
          ) : (
            <div className="animate-fade-in">
              <CardContent className="space-y-4 pt-6">
                <div className="text-center p-4 bg-green-50/50 rounded-lg border border-green-100">
                  <p className="text-green-800 mb-2 font-medium">Verification code sent to:</p>
                  <p className="font-semibold text-lg text-green-700">{form.getValues("email")}</p>
                </div>
                <p className="text-sm text-gray-600 text-center">
                  Please check your email for the 6-digit verification code.
                  The code will expire in 15 minutes.
                </p>
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button 
                  className="w-full bg-[#9b87f5] hover:bg-[#8b77e5] transition-colors"
                  onClick={handleContinueToReset}
                  data-testid="button-continue-reset"
                >
                  Continue to Reset Password
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full flex items-center justify-center"
                  onClick={() => navigate("/login")}
                  data-testid="button-back-login-sent"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </Button>
              </CardFooter>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
